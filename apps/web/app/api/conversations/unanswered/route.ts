import { hasDatabase } from "@/lib/env";
import { getApiSession } from "@/lib/auth/session";
import * as queries from "@/lib/db/queries";

export async function GET() {
  if (!hasDatabase()) {
    return Response.json({
      questions: [
        { question: "How much does teeth whitening cost?", messageId: "msg_mock_1", conversationId: "conv_003", createdAt: new Date().toISOString() },
        { question: "Do you offer braces for adults?", messageId: "msg_mock_2", conversationId: "conv_005", createdAt: new Date().toISOString() },
      ],
    });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const questions = await queries.getUnansweredQuestions(session.tenantId);

  return Response.json({
    questions: questions.map((q) => ({
      ...q,
      createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
    })),
  });
}
