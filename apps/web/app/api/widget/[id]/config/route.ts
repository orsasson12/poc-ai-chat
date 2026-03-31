import { NextRequest } from "next/server";
import { getMockWidgetConfig } from "@/lib/mock/providers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const config = getMockWidgetConfig();

  return Response.json(config, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
