import { NextResponse } from "next/server";
import { encryptSecret } from "@/integrations/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_BASE_URL || url.origin;
  const configUrl = new URL("/app/config", origin);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const cookie = request.headers.get("cookie") ?? "";
  const cookieState = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("foco_google_state="))
    ?.slice("foco_google_state=".length);
  if (!state || !code || !cookieState || state !== cookieState) {
    configUrl.searchParams.set("google", "estado");
    return NextResponse.redirect(configUrl);
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
    configUrl.searchParams.set("google", "config");
    return NextResponse.redirect(configUrl);
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", origin));
  const { data: member } = await supabase.from("team_members").select("team_id, role").eq("user_id", auth.user.id).maybeSingle();
  if (!member || member.role !== "owner") return NextResponse.redirect(configUrl);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    configUrl.searchParams.set("google", "token");
    return NextResponse.redirect(configUrl);
  }
  const tokens = (await tokenResponse.json()) as { refresh_token?: string; access_token?: string };
  if (!tokens.refresh_token) {
    configUrl.searchParams.set("google", "token");
    return NextResponse.redirect(configUrl);
  }
  const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token ?? ""}` },
  });
  const profileBody = profile.ok ? ((await profile.json()) as { email?: string }) : {};
  const admin = createAdminClient();
  const { data: secret, error: secretError } = await admin
    .from("google_oauth_secrets")
    .insert({ team_id: member.team_id, ciphertext: encryptSecret(tokens.refresh_token, encryptionKey) })
    .select("id")
    .single();
  if (secretError || !secret) {
    configUrl.searchParams.set("google", "salvar");
    return NextResponse.redirect(configUrl);
  }
  const { error } = await admin.from("google_oauth_connections").upsert(
    {
      team_id: member.team_id,
      user_id: auth.user.id,
      google_email: profileBody.email || auth.user.email || "google",
      refresh_token_secret_ref: secret.id,
      personal_space_id: `spaces/users/${auth.user.id}`,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "team_id" },
  );
  if (error) {
    configUrl.searchParams.set("google", "salvar");
    return NextResponse.redirect(configUrl);
  }
  const response = NextResponse.redirect(configUrl);
  response.cookies.set("foco_google_state", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
