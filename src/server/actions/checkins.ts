"use server";

import { revalidatePath } from "next/cache";
import { parseWhatsappAnswer } from "@/domain/phone";
import { weeklyCheckinSchema } from "@/domain/schemas";
import { formatWeeklyAnswer, buildWeeklySummary } from "@/domain/summary";
import { todayInSaoPaulo, weekStartSaoPaulo } from "@/domain/time";
import { recordDailyAnswer } from "@/server/checkins/record-answer";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseJobRepo } from "@/server/jobs/supabase-repo";
import { requireMember } from "@/server/session";

export async function answerDaily(answerRaw: string) {
  const answer = parseWhatsappAnswer(answerRaw);
  if (!answer) return { ok: false as const, message: "Responda com fiz, não fiz ou travado." };
  const { member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, message: "O check no app precisa da chave de serviço no servidor." };
  }
  const repo = new SupabaseJobRepo(admin);
  const mapped = {
    teamId: member.team_id,
    userId: member.user_id,
    role: member.role as "owner" | "member",
    displayName: member.display_name,
    notifyWhatsapp: member.notify_whatsapp,
    notifyGoogleChat: member.notify_google_chat,
    whatsappE164: member.whatsapp_e164,
    whatsappOptedInAt: member.whatsapp_opted_in_at,
    googleChatSpaceId: member.google_chat_space_id,
  };
  const result = await recordDailyAnswer(repo, { member: mapped, forDate: todayInSaoPaulo(), answer });
  revalidatePath("/app");
  if (result.alreadyAnswered) return { ok: true as const, message: "Você já respondeu o check de hoje." };
  if (result.offersStepCompletion) return { ok: true as const, message: "Anotado: fiz. Confirme a conclusão do passo abaixo." };
  if (result.markedStuck) return { ok: true as const, message: "Anotado: travado." };
  return { ok: true as const, message: "Anotado: não fiz hoje." };
}

export async function saveWeeklyCheckin(input: unknown) {
  const parsed = weeklyCheckinSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira o texto." };
  if (!parsed.data.andou && !parsed.data.travou) {
    return { ok: false as const, message: "Conte o que andou ou o que travou." };
  }
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const forDate = weekStartSaoPaulo(new Date());
  const answerText = formatWeeklyAnswer(parsed.data.andou, parsed.data.travou);
  const existing = await supabase
    .from("checkins")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "semanal")
    .eq("for_date", forDate)
    .is("project_id", null)
    .maybeSingle();
  if (existing.error) return { ok: false as const, message: "Não foi possível ler o check-in." };
  if (existing.data) {
    const { error } = await supabase
      .from("checkins")
      .update({ status: "respondido", answer: "texto", answer_text: answerText, answered_at: new Date().toISOString() })
      .eq("id", existing.data.id);
    if (error) return { ok: false as const, message: "Não foi possível salvar o check-in." };
  } else {
    const { error } = await supabase.from("checkins").insert({
      team_id: member.team_id,
      user_id: user.id,
      kind: "semanal",
      for_date: forDate,
      project_id: null,
      channel: "app",
      prompt: "Check-in semanal",
      status: "respondido",
      answer: "texto",
      answer_text: answerText,
      answered_at: new Date().toISOString(),
    });
    if (error) return { ok: false as const, message: "Não foi possível salvar o check-in." };
  }
  if (parsed.data.andou.trim()) {
    await supabase
      .from("projects")
      .update({ last_progress_at: new Date().toISOString() })
      .eq("owner_id", user.id)
      .eq("status", "ativo");
  }
  revalidatePath("/app/checkin/semanal");
  return { ok: true as const, message: "Check-in guardado." };
}

export async function refreshWeeklySummary() {
  const { supabase, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "O resumo fica com quem criou o time." };
  const weekStart = weekStartSaoPaulo(new Date());
  const { data: members } = await supabase.from("team_members").select("user_id, display_name").eq("team_id", member.team_id);
  const { data: checkins } = await supabase
    .from("checkins")
    .select("user_id, status, answer_text")
    .eq("team_id", member.team_id)
    .eq("kind", "semanal")
    .eq("for_date", weekStart);
  const body = buildWeeklySummary({
    weekStart,
    members: (members ?? []).map((row) => ({ userId: row.user_id, displayName: row.display_name })),
    checkins: (checkins ?? []).map((row) => ({
      userId: row.user_id,
      status: row.status,
      answerText: row.answer_text,
    })),
  });
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, message: "Gerar o resumo precisa da chave de serviço no servidor." };
  }
  const { error } = await admin.from("weekly_summaries").upsert(
    { team_id: member.team_id, week_start: weekStart, body, generated_at: new Date().toISOString() },
    { onConflict: "team_id,week_start" },
  );
  if (error) return { ok: false as const, message: "Não foi possível guardar o resumo." };
  revalidatePath("/app/time/resumo");
  return { ok: true as const, message: "Resumo atualizado." };
}
