import type { CheckinAnswer, CheckinKind, WhatsappStatus } from "@/domain/types";
import type {
  ActiveWork,
  CheckinRow,
  EnsureCheckinInput,
  JobRepository,
  MemberChannel,
  TeamSchedule,
} from "@/server/jobs/repository";

type Nudge = {
  userId: string;
  kind: CheckinKind;
  forDate: string;
  channel: string;
  ok: boolean;
  text?: string;
};

export class MemoryRepo implements JobRepository {
  teams: TeamSchedule[] = [];
  members: MemberChannel[] = [];
  work: ActiveWork[] = [];
  connections = new Map<string, WhatsappStatus>();
  instances = new Map<string, string>();
  google = new Set<string>();
  checkins: CheckinRow[] = [];
  nudges: Nudge[] = [];
  summaries = new Map<string, string>();
  webhooks = new Set<string>();
  stuck = new Set<string>();
  dueCharges: { teamId: string; ownerName: string; milestone: string; chargeOn: string }[] = [];
  weekDeliveries: { teamId: string; weekStart: string; ownerName: string; title: string; on: string }[] = [];
  calendarKeys = new Set<string>();

  async listTeams() {
    return this.teams;
  }

  async listMembers(teamId: string) {
    return this.members.filter((member) => member.teamId === teamId);
  }

  async listActiveWork(teamId: string) {
    return this.work.filter((item) => item.teamId === teamId);
  }

  async whatsappStatus(teamId: string) {
    return this.connections.get(teamId) ?? null;
  }

  async googleConnected(teamId: string) {
    return this.google.has(teamId);
  }

  async ensureCheckin(input: EnsureCheckinInput) {
    const existing = await this.findCheckin(input);
    if (existing) return { id: existing.id, created: false };
    const row: CheckinRow = {
      id: `chk_${this.checkins.length + 1}`,
      teamId: input.teamId,
      userId: input.userId,
      kind: input.kind,
      forDate: input.forDate,
      projectId: input.projectId,
      status: "enviado",
      answer: null,
      answerText: null,
      prompt: input.prompt,
    };
    this.checkins.push(row);
    return { id: row.id, created: true };
  }

  async findCheckin(input: { userId: string; kind: CheckinKind; forDate: string; projectId: string | null }) {
    return (
      this.checkins.find(
        (row) =>
          row.userId === input.userId &&
          row.kind === input.kind &&
          row.forDate === input.forDate &&
          row.projectId === input.projectId,
      ) ?? null
    );
  }

  async hasSuccessfulNudge(input: { userId: string; kind: CheckinKind; forDate: string; channel: "whatsapp" | "google_chat" }) {
    return this.nudges.some(
      (nudge) =>
        nudge.ok &&
        nudge.userId === input.userId &&
        nudge.kind === input.kind &&
        nudge.forDate === input.forDate &&
        nudge.channel === input.channel,
    );
  }

  async logNudge(input: {
    teamId: string;
    userId: string;
    checkinId: string;
    channel: "whatsapp" | "google_chat" | "app";
    ok: boolean;
  }) {
    const checkin = this.checkins.find((row) => row.id === input.checkinId);
    if (!checkin) return;
    this.nudges.push({
      userId: input.userId,
      kind: checkin.kind,
      forDate: checkin.forDate,
      channel: input.channel,
      ok: input.ok,
    });
    if (input.ok && input.channel !== "app") {
      checkin.status = checkin.status === "respondido" ? checkin.status : "enviado";
    }
  }

  async markStuck(projectId: string) {
    this.stuck.add(projectId);
  }

  async touchProgress(projectIds: string[]) {
    const now = new Date().toISOString();
    for (const item of this.work) {
      if (projectIds.includes(item.projectId)) item.lastProgressAt = now;
    }
  }

  async findMemberByPhone(e164: string) {
    return (
      this.members.find((member) => member.whatsappE164 === e164 && member.whatsappOptedInAt) ?? null
    );
  }

  async answerCheckin(input: { checkinId: string; answer: CheckinAnswer; answerText?: string | null }) {
    const checkin = this.checkins.find((row) => row.id === input.checkinId);
    if (!checkin) throw new Error("CHECKIN_AUSENTE");
    if (checkin.status === "respondido") return { alreadyAnswered: true };
    checkin.status = "respondido";
    checkin.answer = input.answer;
    checkin.answerText = input.answerText ?? null;
    return { alreadyAnswered: false };
  }

  async rememberWebhook(messageId: string) {
    if (this.webhooks.has(messageId)) return false;
    this.webhooks.add(messageId);
    return true;
  }

  async listWeeklyCheckins(teamId: string, weekStart: string) {
    return this.checkins.filter((row) => row.teamId === teamId && row.kind === "semanal" && row.forDate === weekStart);
  }

  async expireUnanswered(teamId: string, weekStart: string) {
    for (const row of this.checkins) {
      if (row.teamId === teamId && row.kind === "semanal" && row.forDate === weekStart && row.status === "enviado") {
        row.status = "expirado";
      }
    }
  }

  async saveWeeklySummary(teamId: string, weekStart: string, body: string) {
    this.summaries.set(`${teamId}:${weekStart}`, body);
  }

  async getWeeklySummary(teamId: string, weekStart: string) {
    return this.summaries.get(`${teamId}:${weekStart}`) ?? null;
  }

  async setWhatsappStatusByInstance(instance: string, status: WhatsappStatus) {
    for (const [teamId, name] of this.instances) {
      if (name === instance) this.connections.set(teamId, status);
    }
  }

  async listDueCharges(teamId: string, today: string) {
    return this.dueCharges
      .filter((item) => item.teamId === teamId && item.chargeOn <= today)
      .slice(0, 3)
      .map(({ ownerName, milestone }) => ({ ownerName, milestone }));
  }

  async listWeekDeliveries(teamId: string, weekStart: string) {
    return this.weekDeliveries
      .filter((item) => item.teamId === teamId && item.weekStart === weekStart)
      .map(({ ownerName, title, on }) => ({ ownerName, title, on }));
  }

  async claimCalendarSlot(userId: string, kind: "manha" | "noite", forDate: string) {
    const key = `${userId}:${kind}:${forDate}`;
    if (this.calendarKeys.has(key)) return false;
    this.calendarKeys.add(key);
    return true;
  }
}
