import { NextRequest } from "next/server";
import { z } from "zod";
import { hasDatabase } from "@/lib/env";
import { getApiSession } from "@/lib/auth/session";
import * as queries from "@/lib/db/queries";
import { scrapeUrl } from "@/lib/knowledge/scrape-url";
import { calculateNextRefresh, waitForDomainSlot, markDomainScraped, isAllowedByRobots } from "@/lib/knowledge/refresh/scheduler";
import { detectChanges } from "@/lib/knowledge/refresh/diff";

/**
 * POST — Trigger a manual refresh for a specific knowledge item.
 * Also used by the cron worker for scheduled refreshes.
 */
const refreshSchema = z.object({
  knowledgeItemId: z.string().uuid(),
  force: z.boolean().optional(), // skip robots.txt check
});

export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ status: "mock", message: "Mock mode — no refresh" });
  }

  // Check if this is a cron trigger (internal) or manual (authenticated)
  const cronSecret = request.headers.get("x-cron-secret");
  const isCron = cronSecret === process.env.CRON_SECRET;

  if (!isCron) {
    const session = await getApiSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const item = await queries.getKnowledgeItemById(parsed.data.knowledgeItemId);
  if (!item || item.type !== "url" || !item.sourceUrl) {
    return Response.json({ error: "Item not found or not a URL type" }, { status: 404 });
  }

  // Mark as refreshing
  await queries.updateRefreshStatus(item.id, item.tenantId, { refreshStatus: "refreshing" });

  try {
    // Check robots.txt (unless forced)
    if (!parsed.data.force) {
      const allowed = await isAllowedByRobots(item.sourceUrl);
      if (!allowed) {
        await queries.updateRefreshStatus(item.id, item.tenantId, {
          refreshStatus: "error",
          lastRefreshError: "Blocked by robots.txt",
        });
        return Response.json({ status: "blocked", reason: "robots.txt" });
      }
    }

    // Rate limit per domain
    await waitForDomainSlot(item.sourceUrl);

    // Scrape
    const scraped = await scrapeUrl(item.sourceUrl);
    markDomainScraped(item.sourceUrl);

    // Compute hash
    const crypto = await import("crypto");
    const newHash = crypto.createHash("sha256").update(scraped.content).digest("hex");

    // Quick check: has anything changed?
    if (newHash === item.contentHash) {
      const nextRefresh = calculateNextRefresh(item.refreshSchedule as "manual" | "daily" | "weekly" | "monthly");
      await queries.updateRefreshStatus(item.id, item.tenantId, {
        refreshStatus: "ok",
        lastRefreshedAt: new Date(),
        nextRefreshAt: nextRefresh,
        lastRefreshError: null,
      });
      return Response.json({ status: "unchanged", contentHash: newHash });
    }

    // Content changed — run diff
    const diff = detectChanges(item.content ?? "", scraped.content);

    // Create change log entry
    const changeEntry = await queries.createChangeEntry({
      tenantId: item.tenantId,
      knowledgeItemId: item.id,
      severity: diff.severity,
      newContentHash: newHash,
      oldContentHash: item.contentHash,
      newContent: scraped.content,
      newTitle: scraped.title !== item.title ? scraped.title : null,
      diffSummary: diff.summary,
      sectionsAdded: diff.added,
      sectionsRemoved: diff.removed,
      sectionsModified: diff.modified,
      diffDetails: diff.details,
    });

    // Auto-approve minor changes, queue major for review
    if (diff.severity === "minor") {
      await queries.updateChangeApproval(changeEntry.id, item.tenantId, {
        approval: "auto_approved",
      });

      // Apply the change immediately (missions 4 handles re-embedding)
      await queries.updateKnowledgeItemStatus(item.id, item.tenantId, "processing");
      // Re-process will be triggered by the processKnowledgeItem pipeline

      const nextRefresh = calculateNextRefresh(item.refreshSchedule as "manual" | "daily" | "weekly" | "monthly");
      await queries.updateRefreshStatus(item.id, item.tenantId, {
        refreshStatus: "ok",
        lastRefreshedAt: new Date(),
        nextRefreshAt: nextRefresh,
        lastRefreshError: null,
        contentHash: newHash,
        versionCount: (item.versionCount ?? 1) + 1,
        pendingChangeId: null,
      });

      return Response.json({ status: "auto_approved", severity: "minor", changeId: changeEntry.id });
    }

    // Major change → queue for review
    const nextRefresh = calculateNextRefresh(item.refreshSchedule as "manual" | "daily" | "weekly" | "monthly");
    await queries.updateRefreshStatus(item.id, item.tenantId, {
      refreshStatus: "pending",
      lastRefreshedAt: new Date(),
      nextRefreshAt: nextRefresh,
      lastRefreshError: null,
      pendingChangeId: changeEntry.id,
    });

    return Response.json({ status: "pending_review", severity: "major", changeId: changeEntry.id });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Refresh failed";

    // Check if it's a 404 or similar — flag as source unavailable
    const isUnavailable = errorMsg.includes("404") || errorMsg.includes("not found") || errorMsg.includes("ENOTFOUND");

    await queries.updateRefreshStatus(item.id, item.tenantId, {
      refreshStatus: isUnavailable ? "source_unavailable" : "error",
      lastRefreshError: errorMsg,
      lastRefreshedAt: new Date(),
    });

    return Response.json({ status: "error", error: errorMsg }, { status: 500 });
  }
}

/**
 * GET — Cron endpoint: find all items due for refresh and trigger them.
 * Called by a cron job every hour.
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasDatabase()) {
    return Response.json({ processed: 0 });
  }

  const dueItems = await queries.getItemsDueForRefresh(20); // process 20 at a time
  const results: { id: string; status: string }[] = [];

  for (const item of dueItems) {
    try {
      // Call our own POST endpoint logic inline
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const res = await fetch(`${appUrl}/api/knowledge/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({ knowledgeItemId: item.id }),
      });
      const data = await res.json();
      results.push({ id: item.id, status: data.status });
    } catch {
      results.push({ id: item.id, status: "error" });
    }
  }

  return Response.json({ processed: results.length, results });
}
