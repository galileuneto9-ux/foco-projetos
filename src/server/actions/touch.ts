"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayInSaoPaulo } from "@/domain/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashActionToken, readActionLink, type LinkAction } from "@/server/action-links";

export async function inspectTouch(token: string): Promise<{ state: "ready"; action: LinkAction } | { state: "used" | "expired" | "invalid" }> {
  const secret = process.env.ACTION_LINK_SECRET ?? "";
  const payload = readActionLink(token, secret);
  if (!secret) return { state: "invalid" };
  if (!payload) return expiredOrInvalid(token);
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("action_links").select("used_at, expires_at").eq("token_hash", hashActionToken(token)).maybeSingle();
    if (!data) return { state: "invalid" };
    if (data.used_at) return { state: "used" };
    if (new Date(data.expires_at).getTime() < Date.now()) return { state: "expired" };
    return { state: "ready", action: payload.action };
  } catch {
    return { state: "invalid" };
  }
}

function expiredOrInvalid(token: string): { state: "expired" | "invalid" } {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0]) return { state: "invalid" };
  try {
    const body = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { exp?: number };
    if (body.exp && body.exp * 1000 < Date.now()) return { state: "expired" };
  } catch {
    return { state: "invalid" };
  }
  return { state: "invalid" };
}

export async function commitTouch(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const secret = process.env.ACTION_LINK_SECRET ?? "";
  const payload = readActionLink(token, secret);
  if (!payload || !secret) redirect("/toque?t=");
  const admin = createAdminClient();
  const hash = hashActionToken(token);
  const { data: claimed } = await admin
    .from("action_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) redirect(`/toque?t=${encodeURIComponent(token)}`);
  if (payload.action === "concluir" && payload.stepId) {
    const { data: step } = await admin.from("project_steps").select("id, title, project_id, team_id, status").eq("id", payload.stepId).maybeSingle();
    const { data: project } = step
      ? await admin.from("projects").select("owner_id").eq("id", step.project_id).maybeSingle()
      : { data: null };
    if (step && project?.owner_id === payload.userId && (step.status === "atual" || step.status === "pendente")) {
      await admin.from("project_steps").update({ status: "feito", completed_at: new Date().toISOString() }).eq("id", step.id);
      await admin.from("deliveries").insert({
        team_id: step.team_id,
        user_id: payload.userId,
        project_id: step.project_id,
        step_id: step.id,
        title: step.title,
      });
      await admin.from("projects").update({ last_progress_at: new Date().toISOString() }).eq("id", step.project_id);
      const { data: next } = await admin
        .from("project_steps")
        .select("id")
        .eq("project_id", step.project_id)
        .eq("status", "pendente")
        .order("position")
        .limit(1)
        .maybeSingle();
      if (next) await admin.from("project_steps").update({ status: "atual" }).eq("id", next.id);
    }
  }
  if (payload.action === "fiz" || payload.action === "nao_fiz" || payload.action === "travado") {
    const { SupabaseJobRepo } = await import("@/server/jobs/supabase-repo");
    const { recordDailyAnswer } = await import("@/server/checkins/record-answer");
    const repo = new SupabaseJobRepo(admin);
    const { data: member } = await admin.from("team_members").select("*").eq("user_id", payload.userId).eq("team_id", payload.teamId).maybeSingle();
    if (member) {
      await recordDailyAnswer(repo, {
        member: {
          teamId: member.team_id,
          userId: member.user_id,
          role: member.role,
          displayName: member.display_name,
          notifyWhatsapp: member.notify_whatsapp,
          notifyGoogleChat: member.notify_google_chat,
          whatsappE164: member.whatsapp_e164,
          whatsappOptedInAt: member.whatsapp_opted_in_at,
          googleChatSpaceId: member.google_chat_space_id,
        },
        forDate: todayInSaoPaulo(),
        answer: payload.action,
      });
    }
  }
  if (payload.action === "travado" && payload.projectId) {
    await admin.from("projects").update({ board_flag: "travado" }).eq("id", payload.projectId).eq("owner_id", payload.userId);
  }
  revalidatePath("/app");
  redirect("/toque?ok=1");
}
