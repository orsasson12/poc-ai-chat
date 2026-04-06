import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { scrapeUrl } from "@/lib/knowledge/scrape-url";
import { processKnowledgeItem } from "@/lib/knowledge/process";

const ingestSchema = z.object({
  assistantId: z.string().uuid(),
  type: z.enum(["document", "url", "manual_qa", "structured"]),
  title: z.string().min(1).max(512),
  content: z.string().optional(),
  url: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = ingestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ id: crypto.randomUUID(), status: "pending", message: "Mock mode — ingestion queued" });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve tenant from the assistant (supports admin managing customer assistants)
  const assistant = await queries.getAssistantById(parsed.data.assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }

  // For URL type: fetch and extract content from the page
  let content = parsed.data.content;
  let title = parsed.data.title;

  if (parsed.data.type === "url" && parsed.data.url) {
    try {
      const scraped = await scrapeUrl(parsed.data.url);
      content = scraped.content;
      title = scraped.title || title;
    } catch (err) {
      // Create item in error state so user sees what happened
      const item = await queries.createKnowledgeItem({
        tenantId: assistant.tenantId,
        assistantId: assistant.id,
        type: parsed.data.type,
        title,
        sourceUrl: parsed.data.url,
      });
      await queries.updateKnowledgeItemStatus(item.id, assistant.tenantId, "error");
      return Response.json(
        { id: item.id, status: "error", message: `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 422 },
      );
    }
  }

  const item = await queries.createKnowledgeItem({
    tenantId: assistant.tenantId,
    assistantId: assistant.id,
    type: parsed.data.type,
    title,
    content,
    sourceUrl: parsed.data.url,
  });

  // Process content: chunk, embed, store — then set active
  if (content) {
    try {
      await processKnowledgeItem(item.id, assistant.tenantId);
    } catch {
      // Processing failed but item is created — status set to "error" by processKnowledgeItem
    }
  }

  const updated = await queries.getKnowledgeItemById(item.id);
  return Response.json({ id: item.id, status: updated?.status ?? "pending", message: "Knowledge item created" });
}

const patchSchema = z.object({
  knowledgeItemId: z.string().uuid(),
  status: z.enum(["pending", "active", "paused", "error"]),
});

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve tenant from the knowledge item itself
  const item = await queries.getKnowledgeItemById(parsed.data.knowledgeItemId);
  if (!item) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.updateKnowledgeItemStatus(item.id, item.tenantId, parsed.data.status);

  return Response.json({ success: true });
}

const deleteSchema = z.object({ knowledgeItemId: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ success: true, message: "Mock mode — item deleted" });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve tenant from the knowledge item itself
  const item = await queries.getKnowledgeItemById(parsed.data.knowledgeItemId);
  if (!item) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.deleteKnowledgeItem(item.id, item.tenantId);

  return Response.json({ success: true, message: "Knowledge item deleted" });
}
