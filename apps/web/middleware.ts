import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isMockMode } from "@/lib/env";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  if (isMockMode()) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
