import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { parseStructuredCSV } from "@/lib/knowledge/card-schemas";
import { processKnowledgeItem } from "@/lib/knowledge/process";

const csvIngestSchema = z.object({
  assistantId: z.string().uuid(),
  csv: z.string().min(1, "CSV content is required"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = csvIngestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { assistantId, csv } = parsed.data;
  const { cards, errors } = parseStructuredCSV(csv);

  if (cards.length === 0) {
    return Response.json(
      {
        error: "No valid items found in CSV",
        parseErrors: errors,
      },
      { status: 422 },
    );
  }

  if (!hasDatabase()) {
    return Response.json({
      created: cards.length,
      errors,
      items: cards.map((c) => ({
        id: crypto.randomUUID(),
        name: c.name,
        cardType: c.cardType,
        status: "pending",
      })),
      message: "Mock mode — items queued",
    });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }

  const results: { id: string; name: string; cardType: string; status: string }[] = [];

  for (const card of cards) {
    const item = await queries.createKnowledgeItem({
      tenantId: assistant.tenantId,
      assistantId: assistant.id,
      type: "structured",
      title: card.name,
      content: card.content,
      sourceUrl: card.sourceUrl ?? undefined,
      metadata: {
        imageUrl: card.imageUrl,
        cardType: card.cardType,
        fields: card.fields,
      },
    });

    // Process: chunk, embed, store
    try {
      await processKnowledgeItem(item.id, assistant.tenantId);
    } catch {
      // status set to "error" by processKnowledgeItem
    }

    const updated = await queries.getKnowledgeItemById(item.id);
    results.push({
      id: item.id,
      name: card.name,
      cardType: card.cardType,
      status: updated?.status ?? "pending",
    });
  }

  return Response.json({
    created: results.length,
    errors,
    items: results,
    message: `${results.length} structured items imported`,
  });
}
