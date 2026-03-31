import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  return Response.json({ received: true });
}
