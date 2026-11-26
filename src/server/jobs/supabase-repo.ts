import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckinAnswer, CheckinKind, WhatsappStatus } from "@/domain/types";
import type {
  ActiveWork,
  CheckinRow,
  EnsureCheckinInput,
  JobRepository,
  MemberChannel,
  TeamSchedule,
} from "@/server/jobs/repository";

type Admin = SupabaseClient;

function fail(scope: string, error: { code?: string } | null): never {
  console.error(scope, error?.code ?? "unknown");
  throw new Error(scope);
}

function mapMember(row: {
  team_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  notify_whatsapp: boolean;
  notify_google_chat: boolean;
  whatsapp_e164: string | null;
  whatsapp_opted_in_at: string | null;
  google_chat_space_id: string | null;
}): MemberChannel {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    notifyWhatsapp: row.notify_whatsapp,
    notifyGoogleChat: row.notify_google_chat,
    whatsappE164: row.whatsapp_e164,
    whatsappOptedInAt: row.whatsapp_opted_in_at,
    googleChatSpaceId: row.google_chat_space_id,
  };
}

function mapCheckin(row: {
  id: string;
  team_id: string;
  user_id: string;
  kind: CheckinKind;
  for_date: string;
  project_id: string | null;
  status: string;
  answer: string | null;
  answer_text: string | null;
  prompt: string;
}): CheckinRow {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    kind: row.kind,
    forDate: row.for_date,
    projectId: row.project_id,
    status: row.status,
    answer: row.answer,
    answerText: row.answer_text,
    prompt: row.prompt,
  };
}

export class SupabaseJobRepo implements JobRepository {
  constructor(private readonly admin: Admin) {}

  async listTeams(): Promise<TeamSchedule[]> {
    const { data, error } = await this.admin
      .from("teams")
      .select("id, stall_days, morning_hour, evening_hour, weekly_checkin_weekday, weekly_checkin_hour");
    if (error) fail("teams", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      stallDays: row.stall_days,
      morningHour: String(row.morning_hour).slice(0, 5),
      eveningHour: String(row.evening_hour).slice(0, 5),
      weeklyCheckinWeekday: row.weekly_checkin_weekday,
      weeklyCheckinHour: String(row.weekly_checkin_hour).slice(0, 5),
    }));
  }

  async listMembers(teamId: string) {
    const { data, error } = await this.admin.from("team_members").select("*").eq("team_id", teamId);
    if (error) fail("members", error);
    return (data ?? []).map(mapMember);
  }

  async listActiveWork(teamId: string): Promise<ActiveWork[]> {
    const { data: projects, error } = await this.admin
      .from("projects")
      .select("id, team_id, owner_id, title, visibility, last_progress_at, activated_at")
      .eq("team_id", teamId)
      .eq("status", "ativo");
    if (error) fail("projects", error);
    const ids = (projects ?? []).map((project) => project.id);
    const stepsByProject = new Map<string, { id: string; title: string; done_when: string; minutes: number }>();
    if (ids.length > 0) {
      const { data: steps, error: stepError } = await this.admin
        .from("project_steps")
        .select("id, project_id, title, done_when, minutes")
        .in("project_id", ids)
        .eq("status", "atual");
      if (stepError) fail("steps", stepError);
      for (const step of steps ?? []) stepsByProject.set(step.project_id, step);
    }
    return (projects ?? []).map((project) => {
      const step = stepsByProject.get(project.id);
      return {
        teamId: project.team_id,
        userId: project.owner_id,
        projectId: project.id,
        projectTitle: project.title,
        visibility: project.visibility,
        lastProgressAt: project.last_progress_at,
        activatedAt: project.activated_at,
        stepId: step?.id ?? null,
        stepTitle: step?.title ?? null,
        doneWhen: step?.done_when ?? null,
        minutes: step?.minutes ?? null,
      };
    });
  }

  async whatsappStatus(teamId: string): Promise<WhatsappStatus | null> {
    const { data, error } = await this.admin.from("whatsapp_connection").select("status").eq("team_id", teamId).maybeSingle();
    if (error) fail("whatsapp", error);
    return (data?.status as WhatsappStatus | undefined) ?? null;
  }

  async googleConnected(teamId: string) {
    const { data, error } = await this.admin.from("google_oauth_connections").select("id").eq("team_id", teamId).maybeSingle();
    if (error) fail("google", error);
    return Boolean(data);
  }

  async findCheckin(input: { userId: string; kind: CheckinKind; forDate: string; projectId: string | null }) {
    let query = this.admin
      .from("checkins")
      .select("id, team_id, user_id, kind, for_date, project_id, status, answer, answer_text, prompt")
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .eq("for_date", input.forDate);
    query = input.projectId ? query.eq("project_id", input.projectId) : query.is("project_id", null);
    const { data, error } = await query.maybeSingle();
    if (error) fail("checkin", error);
    return data ? mapCheckin(data) : null;
  }

  async ensureCheckin(input: EnsureCheckinInput) {
    const existing = await this.findCheckin(input);
    if (existing) return { id: existing.id, created: false };
    const { data, error } = await this.admin
      .from("checkins")
      .insert({
        team_id: input.teamId,
        user_id: input.userId,
        kind: input.kind,
        for_date: input.forDate,
        project_id: input.projectId,
        channel: input.channel,
        prompt: input.prompt,
        status: "enviado",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") {
      const again = await this.findCheckin(input);
      if (again) return { id: again.id, created: false };
    }
    if (error || !data) fail("checkin_insert", error);
    return { id: data.id, created: true };
  }

  async hasSuccessfulNudge(input: { userId: string; kind: CheckinKind; forDate: string; channel: "whatsapp" | "google_chat" }) {
    const { data: checkins, error } = await this.admin
      .from("checkins")
      .select("id")
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .eq("for_date", input.forDate);
    if (error) fail("nudge_checkins", error);
    const ids = (checkins ?? []).map((row) => row.id);
    if (ids.length === 0) return false;
    const { data, error: nudgeError } = await this.admin
      .from("nudge_log")
      .select("id")
      .in("checkin_id", ids)
      .eq("channel", input.channel)
      .eq("ok", true)
      .limit(1);
    if (nudgeError) fail("nudge", nudgeError);
    return (data ?? []).length > 0;
  }

  async logNudge(input: {
    teamId: string;
    userId: string;
    checkinId: string;
    channel: "whatsapp" | "google_chat" | "app";
    ok: boolean;
    providerMessageId?: string | null;
    errorCode?: string | null;
  }) {
    const { error } = await this.admin.from("nudge_log").insert({
      team_id: input.teamId,
      user_id: input.userId,
      checkin_id: input.checkinId,
      channel: input.channel,
      ok: input.ok,
      provider_message_id: input.providerMessageId ?? null,
      error_code: input.errorCode ?? null,
    });
    if (error) fail("nudge_insert", error);
  }

  async markStuck(projectId: string) {
    const { error } = await this.admin.from("projects").update({ board_flag: "travado" }).eq("id", projectId);
    if (error) fail("stuck", error);
  }

  async touchProgress(projectIds: string[]) {
    if (projectIds.length === 0) return;
    const { error } = await this.admin
      .from("projects")
      .update({ last_progress_at: new Date().toISOString() })
      .in("id", projectIds);
    if (error) fail("progress", error);
  }

  async findMemberByPhone(e164: string) {
    const { data, error } = await this.admin
      .from("team_members")
      .select("*")
      .eq("whatsapp_e164", e164)
      .not("whatsapp_opted_in_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) fail("phone", error);
    return data ? mapMember(data) : null;
  }

  async answerCheckin(input: { checkinId: string; answer: CheckinAnswer; answerText?: string | null }) {
    const { data: current, error: readError } = await this.admin
      .from("checkins")
      .select("status")
      .eq("id", input.checkinId)
      .maybeSingle();
    if (readError || !current) fail("checkin_read", readError);
    if (current.status === "respondido") return { alreadyAnswered: true };
    const { error } = await this.admin
      .from("checkins")
      .update({
        status: "respondido",
        answer: input.answer,
        answer_text: input.answerText ?? null,
        answered_at: new Date().toISOString(),
      })
      .eq("id", input.checkinId)
      .eq("status", "enviado");
    if (error) fail("checkin_answer", error);
    return { alreadyAnswered: false };
  }

  async rememberWebhook(messageId: string, teamId: string | null) {
    const { error } = await this.admin.from("webhook_receipts").insert({ id: messageId, team_id: teamId });
    if (error?.code === "23505") return false;
    if (error) fail("webhook", error);
    return true;
  }

  async listWeeklyCheckins(teamId: string, weekStart: string) {
    const { data, error } = await this.admin
      .from("checkins")
      .select("id, team_id, user_id, kind, for_date, project_id, status, answer, answer_text, prompt")
      .eq("team_id", teamId)
      .eq("kind", "semanal")
      .eq("for_date", weekStart);
    if (error) fail("weekly", error);
    return (data ?? []).map(mapCheckin);
  }

  async expireUnanswered(teamId: string, weekStart: string) {
    const { error } = await this.admin
      .from("checkins")
      .update({ status: "expirado" })
      .eq("team_id", teamId)
      .eq("kind", "semanal")
      .eq("for_date", weekStart)
      .eq("status", "enviado");
    if (error) fail("expire", error);
  }

  async saveWeeklySummary(teamId: string, weekStart: string, body: string) {
    const { error } = await this.admin.from("weekly_summaries").upsert(
      { team_id: teamId, week_start: weekStart, body, generated_at: new Date().toISOString() },
      { onConflict: "team_id,week_start" },
    );
    if (error) fail("summary", error);
  }

  async getWeeklySummary(teamId: string, weekStart: string) {
    const { data, error } = await this.admin
      .from("weekly_summaries")
      .select("body")
      .eq("team_id", teamId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (error) fail("summary_read", error);
    return data?.body ?? null;
  }

  async setWhatsappStatusByInstance(instance: string, status: WhatsappStatus) {
    const { error } = await this.admin
      .from("whatsapp_connection")
      .update({ status, last_error: null, updated_at: new Date().toISOString() })
      .eq("evolution_instance", instance);
    if (error) fail("whatsapp_status", error);
  }
}
