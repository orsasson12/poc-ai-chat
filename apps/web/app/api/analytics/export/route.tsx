import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSessionContext } from "@/lib/auth/session";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { AnalyticsReport } from "@/lib/analytics/pdf-report";

// Node runtime required: @react-pdf/renderer depends on Node streams / Buffer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rangeParam = request.nextUrl.searchParams.get("range") ?? "30";
  const days = Math.max(1, Math.min(90, Number.parseInt(rangeParam, 10) || 30));

  const session = await getSessionContext();
  const tenantId = session?.tenant.id ?? "mock";
  const businessName = session?.tenant.name ?? "BizAssist";

  const overview = await getAnalyticsOverview(tenantId, days);

  const buffer = await renderToBuffer(
    <AnalyticsReport
      overview={overview}
      businessName={businessName}
      generatedAt={new Date().toLocaleString()}
    />,
  );

  // `buffer` is a Node Buffer; Response body wants a Uint8Array-like.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bizassist-analytics-${days}d.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
