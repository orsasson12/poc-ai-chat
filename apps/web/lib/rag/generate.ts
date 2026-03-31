import { hasOpenAI } from "@/lib/env";
import { getOpenAIClient, chooseModel } from "@/lib/llm/providers";
import { buildSystemPrompt } from "@/lib/llm/prompts";
import { mockChatResponse } from "@/lib/mock/providers";
import type { RetrievedChunk } from "./retrieve";

interface GenerateOptions {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  chunks: RetrievedChunk[];
  assistantName: string;
  businessName: string;
  tone: string;
  fallbackMsg: string;
  tenantId: string;
}

export async function generateResponse(
  options: GenerateOptions
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  if (!hasOpenAI()) {
    const response = mockChatResponse();
    return new ReadableStream({
      async start(controller) {
        for (let i = 0; i < response.length; i++) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: response[i] })}\n\n`));
          await new Promise((r) => setTimeout(r, 20));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
  }

  const openai = getOpenAIClient()!;
  const model = chooseModel(options.message.length, options.chunks.length);

  const systemPrompt = buildSystemPrompt({
    assistantName: options.assistantName,
    businessName: options.businessName,
    tone: options.tone,
    fallbackMsg: options.fallbackMsg,
    tenantId: options.tenantId,
    chunks: options.chunks,
  });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...options.history.slice(-8).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: options.message },
  ];

  const stream = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    stream: true,
    max_tokens: 1024,
  });

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
