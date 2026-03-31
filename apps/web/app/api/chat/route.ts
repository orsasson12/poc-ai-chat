import { NextRequest } from "next/server";
import { z } from "zod";
import { mockChatResponse } from "@/lib/mock/providers";

const chatRequestSchema = z.object({
  assistantId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(8),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const response = mockChatResponse();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < response.length; i++) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: response[i] })}\n\n`));
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 25));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
