import type { CheckinAnswer, CheckinKind, WhatsappStatus } from "@/domain/types";

export type TeamSchedule = {
  id: string;
  stallDays: number;
  morningHour: string;
  eveningHour: string;
  weeklyCheckinWeekday: number;
  weeklyCheckinHour: string;
};

export type MemberChannel = {
  teamId: string;
  userId: string;
  role: "owner" | "member";
  displayName: string;
  notifyWhatsapp: boolean;
  notifyGoogleChat: boolean;
  whatsappE164: string | null;
  whatsappOptedInAt: string | null;
  googleChatSpaceId: string | null;
};

export type ActiveWork = {
  teamId: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  visibility: "privado" | "compartilhado";
  lastProgressAt: string | null;
  activatedAt: string | null;
  stepId: string | null;
  stepTitle: string | null;
  doneWhen: string | null;
  minutes: number | null;
};

export type CheckinRow = {
  id: string;
  teamId: string;
  userId: string;
  kind: CheckinKind;
  forDate: string;
  projectId: string | null;
  status: string;
  answer: string | null;
  answerText: string | null;
  prompt: string;
};

export type EnsureCheckinInput = {
  teamId: string;
  userId: string;
  kind: CheckinKind;
  forDate: string;
  projectId: string | null;
  channel: "app" | "whatsapp" | "google_chat";
  prompt: string;
};

export interface JobRepository {
  listTeams(): Promise<TeamSchedule[]>;
  listMembers(teamId: string): Promise<MemberChannel[]>;
  listActiveWork(teamId: string): Promise<ActiveWork[]>;
  whatsappStatus(teamId: string): Promise<WhatsappStatus | null>;
  googleConnected(teamId: string): Promise<boolean>;
  ensureCheckin(input: EnsureCheckinInput): Promise<{ id: string; created: boolean }>;
  findCheckin(input: { userId: string; kind: CheckinKind; forDate: string; projectId: string | null }): Promise<CheckinRow | null>;
  hasSuccessfulNudge(input: { userId: string; kind: CheckinKind; forDate: string; channel: "whatsapp" | "google_chat" }): Promise<boolean>;
  logNudge(input: {
    teamId: string;
    userId: string;
    checkinId: string;
    channel: "whatsapp" | "google_chat" | "app";
    ok: boolean;
    providerMessageId?: string | null;
    errorCode?: string | null;
  }): Promise<void>;
  markStuck(projectId: string): Promise<void>;
  touchProgress(projectIds: string[]): Promise<void>;
  findMemberByPhone(e164: string): Promise<MemberChannel | null>;
  answerCheckin(input: { checkinId: string; answer: CheckinAnswer; answerText?: string | null }): Promise<{ alreadyAnswered: boolean }>;
  rememberWebhook(messageId: string, teamId: string | null): Promise<boolean>;
  listWeeklyCheckins(teamId: string, weekStart: string): Promise<CheckinRow[]>;
  expireUnanswered(teamId: string, weekStart: string): Promise<void>;
  saveWeeklySummary(teamId: string, weekStart: string, body: string): Promise<void>;
  getWeeklySummary(teamId: string, weekStart: string): Promise<string | null>;
  setWhatsappStatusByInstance(instance: string, status: WhatsappStatus): Promise<void>;
}

export type TextSender = {
  sendText(input: { to: string; text: string }): Promise<{ ok: boolean; messageId?: string; errorCode?: string }>;
};

export type SpaceSender = {
  sendMessage(input: { spaceId: string; text: string }): Promise<{ ok: boolean; messageId?: string; errorCode?: string }>;
};

export type JobDeps = {
  repo: JobRepository;
  whatsapp: TextSender;
  googleChat: SpaceSender;
  now: Date;
  appUrl: string;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
  ignoreSchedule?: boolean;
};

export type JobResult = {
  sentWhatsapp: number;
  sentGoogleChat: number;
  inApp: number;
  skippedDuplicate: number;
};

export function emptyJobResult(): JobResult {
  return { sentWhatsapp: 0, sentGoogleChat: 0, inApp: 0, skippedDuplicate: 0 };
}
