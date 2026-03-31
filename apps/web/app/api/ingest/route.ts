import { NextRequest } from "next/server";
import { z } from "zod";

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

  return Response.json({ id: crypto.randomUUID(), status: "pending", message: "Ingestion job queued" });
}

const deleteSchema = z.object({ knowledgeItemId: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  return Response.json({ success: true, message: "Knowledge item deleted" });
}
