import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callbackNextPath } from "@/server/safe-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = callbackNextPath(type, url.searchParams.get("next"), url.origin);
  if (code || (tokenHash && type === "recovery")) {
    const supabase = await createClient();
    const exchanged = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash ?? "" });
    if (exchanged.error) {
      return NextResponse.redirect(new URL("/login?erro=link_expirado", url.origin));
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
