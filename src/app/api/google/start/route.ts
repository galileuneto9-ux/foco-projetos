import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GOOGLE_SCOPES } from "@/server/google-scopes";

export async function GET(request: Request) {
  const origin = process.env.APP_BASE_URL || new URL(request.url).origin;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", origin));
  const { data: member } = await supabase.from("team_members").select("role").eq("user_id", data.user.id).maybeSingle();
  if (member?.role !== "owner") return NextResponse.redirect(new URL("/app/config", origin));
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri || (process.env.GOOGLE_CHAT_PROVIDER || "fake") !== "google") {
    return NextResponse.redirect(new URL("/app/config", origin));
  }
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("state", state);
  const response = NextResponse.redirect(url);
  response.cookies.set("foco_google_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
