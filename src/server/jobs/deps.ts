import { googleEventBody } from "@/domain/focus";
import { decryptSecret } from "@/integrations/crypto";
import { FakeCalendar } from "@/integrations/calendar/fake";
import type { CalendarProvider } from "@/integrations/calendar/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueActionLink } from "@/server/action-links";
import { SupabaseJobRepo } from "@/server/jobs/supabase-repo";
import type { JobDeps, LinkIssuer, SpaceSender, TextSender } from "@/server/jobs/repository";

function whatsappSender(admin: ReturnType<typeof createAdminClient>): TextSender {
  return {
    async sendText({ to, text }) {
      if ((process.env.WHATSAPP_PROVIDER || "fake") !== "evolution") {
        return { ok: true, messageId: "fake" };
      }
      const base = process.env.EVOLUTION_API_URL;
      const key = process.env.EVOLUTION_API_KEY;
      if (!base || !key) return { ok: false, errorCode: "SEM_CONFIG" };
      const { data: member } = await admin.from("team_members").select("team_id").eq("whatsapp_e164", to).maybeSingle();
      if (!member) return { ok: false, errorCode: "SEM_OPTIN" };
      const { data: connection } = await admin
        .from("whatsapp_connection")
        .select("evolution_instance, status")
        .eq("team_id", member.team_id)
        .maybeSingle();
      if (!connection || connection.status !== "open") return { ok: false, errorCode: "OFFLINE" };
      const response = await fetch(`${base.replace(/\/$/, "")}/message/sendText/${connection.evolution_instance}`, {
        method: "POST",
        headers: { apikey: key, "content-type": "application/json" },
        body: JSON.stringify({ number: to, text }),
      });
      if (!response.ok) return { ok: false, errorCode: `HTTP_${response.status}` };
      const body = (await response.json().catch(() => ({}))) as { key?: { id?: string } };
      return { ok: true, messageId: body.key?.id };
    },
  };
}

function googleSender(admin: ReturnType<typeof createAdminClient>): SpaceSender {
  return {
    async sendMessage({ spaceId, text }) {
      if ((process.env.GOOGLE_CHAT_PROVIDER || "fake") !== "google") {
        return { ok: true, messageId: "fake" };
      }
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!clientId || !clientSecret || !key) return { ok: false, errorCode: "SEM_CONFIG" };
      const { data: member } = await admin.from("team_members").select("team_id").eq("google_chat_space_id", spaceId).maybeSingle();
      const teamId = member?.team_id;
      if (!teamId) return { ok: false, errorCode: "SEM_ESPACO" };
      const { data: connection } = await admin
        .from("google_oauth_connections")
        .select("refresh_token_secret_ref")
        .eq("team_id", teamId)
        .maybeSingle();
      if (!connection) return { ok: false, errorCode: "SEM_OAUTH" };
      const { data: secret } = await admin
        .from("google_oauth_secrets")
        .select("ciphertext")
        .eq("id", connection.refresh_token_secret_ref)
        .maybeSingle();
      if (!secret) return { ok: false, errorCode: "SEM_TOKEN" };
      const { decryptSecret } = await import("@/integrations/crypto");
      const refreshToken = decryptSecret(secret.ciphertext, key);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenResponse.ok) return { ok: false, errorCode: "TOKEN_RECUSADO" };
      const tokenBody = (await tokenResponse.json()) as { access_token?: string };
      if (!tokenBody.access_token) return { ok: false, errorCode: "SEM_ACCESS" };
      const sent = await fetch(`https://chat.googleapis.com/v1/${spaceId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!sent.ok) return { ok: false, errorCode: `HTTP_${sent.status}` };
      const sentBody = (await sent.json().catch(() => ({}))) as { name?: string };
      return { ok: true, messageId: sentBody.name };
    },
  };
}

async function googleAccessToken(admin: ReturnType<typeof createAdminClient>, teamId: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !key) return null;
  const { data: connection } = await admin
    .from("google_oauth_connections")
    .select("refresh_token_secret_ref")
    .eq("team_id", teamId)
    .maybeSingle();
  if (!connection) return null;
  const { data: secret } = await admin
    .from("google_oauth_secrets")
    .select("ciphertext")
    .eq("id", connection.refresh_token_secret_ref)
    .maybeSingle();
  if (!secret || secret.ciphertext === "fake") return null;
  const refreshToken = decryptSecret(secret.ciphertext, key);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenResponse.ok) return null;
  const body = (await tokenResponse.json()) as { access_token?: string };
  return body.access_token ?? null;
}

function calendarProvider(admin: ReturnType<typeof createAdminClient>): CalendarProvider {
  if ((process.env.CALENDAR_PROVIDER || "fake") !== "google") return new FakeCalendar();
  return {
    async createEvent(input) {
      const token = await googleAccessToken(admin, input.teamId);
      if (!token) return { ok: false, errorCode: "SEM_TOKEN" };
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(googleEventBody(input)),
      });
      if (!response.ok) return { ok: false, errorCode: `HTTP_${response.status}` };
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      return { ok: true, eventId: body.id };
    },
  };
}

function linkIssuer(admin: ReturnType<typeof createAdminClient>): LinkIssuer {
  return {
    async issue(input) {
      const secret = process.env.ACTION_LINK_SECRET;
      const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
      if (!secret) return `${base}/app`;
      const issued = issueActionLink(input, secret);
      const { error } = await admin.from("action_links").insert({
        team_id: input.teamId,
        user_id: input.userId,
        project_id: input.projectId,
        step_id: input.stepId,
        action: input.action,
        token_hash: issued.hash,
        expires_at: new Date(issued.payload.exp * 1000).toISOString(),
      });
      if (error) return `${base}/app`;
      return `${base}/toque?t=${encodeURIComponent(issued.token)}`;
    },
  };
}

export function createJobDeps(now = new Date()): JobDeps {
  const admin = createAdminClient();
  return {
    repo: new SupabaseJobRepo(admin),
    whatsapp: whatsappSender(admin),
    googleChat: googleSender(admin),
    calendar: calendarProvider(admin),
    issueLink: linkIssuer(admin),
    now,
    appUrl: process.env.APP_BASE_URL || "http://localhost:3000",
    gapMs: 3000,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
