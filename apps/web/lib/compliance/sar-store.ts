import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";

export interface SarRequestInput {
  tenantId: string;
  type: "export" | "delete" | "tenant_export";
  subjectEmail?: string | null;
  subjectIdentifier?: string | null;
  requestedBy?: string | null;
  notes?: string | null;
}

export interface SarRequestRecord {
  id: string;
  tenantId: string;
  type: string;
  subjectEmail: string | null;
  subjectIdentifier: string | null;
  status: string;
  requestedBy: string | null;
  requestedAt: string;
  completedAt: string | null;
  resultPath: string | null;
  errorMsg: string | null;
  notes: string | null;
}

function rowToRecord(row: typeof s.sarRequests.$inferSelect): SarRequestRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    subjectEmail: row.subjectEmail,
    subjectIdentifier: row.subjectIdentifier,
    status: row.status,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    resultPath: row.resultPath,
    errorMsg: row.errorMsg,
    notes: row.notes,
  };
}

export async function createSarRequest(input: SarRequestInput): Promise<SarRequestRecord | null> {
  if (!hasDatabase()) return null;
  const d = getDb();
  if (!d) return null;

  const [row] = await d
    .insert(s.sarRequests)
    .values({
      tenantId: input.tenantId,
      type: input.type,
      subjectEmail: input.subjectEmail ?? null,
      subjectIdentifier: input.subjectIdentifier ?? null,
      requestedBy: input.requestedBy ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return rowToRecord(row);
}

export async function markSarRequestCompleted(
  id: string,
  tenantId: string,
  resultPath: string | null = null,
): Promise<void> {
  if (!hasDatabase()) return;
  const d = getDb();
  if (!d) return;

  await d
    .update(s.sarRequests)
    .set({ status: "completed", completedAt: new Date(), resultPath })
    .where(and(eq(s.sarRequests.id, id), eq(s.sarRequests.tenantId, tenantId)));
}

export async function markSarRequestFailed(
  id: string,
  tenantId: string,
  errorMsg: string,
): Promise<void> {
  if (!hasDatabase()) return;
  const d = getDb();
  if (!d) return;

  await d
    .update(s.sarRequests)
    .set({ status: "failed", completedAt: new Date(), errorMsg })
    .where(and(eq(s.sarRequests.id, id), eq(s.sarRequests.tenantId, tenantId)));
}

export async function listSarRequests(tenantId: string): Promise<SarRequestRecord[]> {
  if (!hasDatabase()) return [];
  const d = getDb();
  if (!d) return [];

  const rows = await d
    .select()
    .from(s.sarRequests)
    .where(eq(s.sarRequests.tenantId, tenantId))
    .orderBy(desc(s.sarRequests.requestedAt))
    .limit(200);

  return rows.map(rowToRecord);
}
