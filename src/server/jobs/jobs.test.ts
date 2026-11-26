import { describe, expect, it } from "vitest";
import { FakeGoogleChat, RecordingWhatsapp } from "@/integrations/google-chat/fake";
import { MemoryRepo } from "@/server/jobs/memory-repo";
import { runEveningJob, runMorningJob, runStallJob, runSummaryJob, runWeeklyJob } from "@/server/jobs/run";
import { recordDailyAnswer } from "@/server/checkins/record-answer";
import type { JobDeps } from "@/server/jobs/repository";

const MORNING = new Date("2026-11-27T11:00:00.000Z");
const EVENING = new Date("2026-11-27T21:00:00.000Z");
const STALL = new Date("2026-11-27T11:30:00.000Z");
const FRIDAY_16 = new Date("2026-11-27T19:00:00.000Z");
const MONDAY_8 = new Date("2026-11-30T11:00:00.000Z");

function baseRepo() {
  const repo = new MemoryRepo();
  repo.teams.push({
    id: "team-a",
    stallDays: 5,
    morningHour: "08:00",
    eveningHour: "18:00",
    weeklyCheckinWeekday: 5,
    weeklyCheckinHour: "16:00",
  });
  repo.members.push({
    teamId: "team-a",
    userId: "owner",
    role: "owner",
    displayName: "Ana",
    notifyWhatsapp: true,
    notifyGoogleChat: true,
    whatsappE164: "5511988887777",
    whatsappOptedInAt: "2026-11-01T00:00:00.000Z",
    googleChatSpaceId: "spaces/ana",
  });
  repo.connections.set("team-a", "open");
  repo.google.add("team-a");
  repo.work.push({
    teamId: "team-a",
    userId: "owner",
    projectId: "proj-1",
    projectTitle: "Roteiro",
    visibility: "privado",
    lastProgressAt: MORNING.toISOString(),
    activatedAt: MORNING.toISOString(),
    stepId: "step-1",
    stepTitle: "SEGREDO-PASSO",
    doneWhen: "Quando o roteiro estiver salvo.",
    minutes: 20,
  });
  return repo;
}

function deps(repo: MemoryRepo, now: Date, extras?: Partial<JobDeps>) {
  const whatsapp = new RecordingWhatsapp();
  const googleChat = new FakeGoogleChat();
  const sleeps: number[] = [];
  const job: JobDeps = {
    repo,
    whatsapp,
    googleChat,
    now,
    appUrl: "https://foco.example",
    gapMs: 3000,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...extras,
  };
  return { job, whatsapp, googleChat, sleeps };
}

describe("cobrança", () => {
  it("manda uma mensagem de manhã com o passo e não repete no mesmo dia", async () => {
    const repo = baseRepo();
    const first = deps(repo, MORNING);
    const result = await runMorningJob(first.job);
    expect(result.sentWhatsapp).toBe(1);
    expect(first.whatsapp.sent).toHaveLength(1);
    expect(first.whatsapp.sent[0]?.text).toContain("SEGREDO-PASSO");
    expect(first.googleChat.sent).toHaveLength(0);
    const second = deps(repo, MORNING);
    second.job.whatsapp = first.whatsapp;
    const again = await runMorningJob(second.job);
    expect(again.sentWhatsapp).toBe(0);
    expect(again.skippedDuplicate).toBe(1);
    expect(first.whatsapp.sent).toHaveLength(1);
  });

  it("não dispara no WhatsApp com a sessão fechada e deixa o check no app", async () => {
    const repo = baseRepo();
    repo.connections.set("team-a", "close");
    const { job, whatsapp } = deps(repo, MORNING);
    const result = await runMorningJob(job);
    expect(result.sentWhatsapp).toBe(0);
    expect(whatsapp.sent).toHaveLength(0);
    expect(repo.checkins.some((row) => row.kind === "diario_manha")).toBe(true);
    expect(result.inApp).toBe(1);
  });

  it("não envia sem opt-in", async () => {
    const repo = baseRepo();
    repo.members[0]!.whatsappOptedInAt = null;
    const { job, whatsapp } = deps(repo, MORNING);
    const result = await runMorningJob(job);
    expect(result.sentWhatsapp).toBe(0);
    expect(whatsapp.sent).toHaveLength(0);
  });

  it("espera entre destinatários", async () => {
    const repo = baseRepo();
    repo.members.push({
      ...repo.members[0]!,
      userId: "member",
      role: "member",
      displayName: "Bia",
      whatsappE164: "5511977776666",
      googleChatSpaceId: "spaces/bia",
    });
    repo.work.push({ ...repo.work[0]!, userId: "member", projectId: "proj-2", stepTitle: "Outro passo" });
    const { job, whatsapp, sleeps } = deps(repo, MORNING);
    await runMorningJob(job);
    expect(whatsapp.sent).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
  });

  it("não manda de manhã fora do horário do time", async () => {
    const repo = baseRepo();
    const { job, whatsapp } = deps(repo, new Date("2026-11-27T12:00:00.000Z"));
    const result = await runMorningJob(job);
    expect(result.sentWhatsapp).toBe(0);
    expect(whatsapp.sent).toHaveLength(0);
  });

  it("check da noite pede 1/2/3 e não vai para o Google Chat", async () => {
    const repo = baseRepo();
    const { job, whatsapp, googleChat } = deps(repo, EVENING);
    await runEveningJob(job);
    expect(whatsapp.sent[0]?.text).toContain("1 — Fiz");
    expect(whatsapp.sent[0]?.text).not.toContain("SEGREDO-PASSO");
    expect(googleChat.sent).toHaveLength(0);
  });

  it("gera um alerta de parado e o progresso recente cancela", async () => {
    const repo = baseRepo();
    repo.work[0]!.lastProgressAt = new Date(STALL.getTime() - 6 * 86400000).toISOString();
    const first = deps(repo, STALL);
    await runStallJob(first.job);
    expect(first.whatsapp.sent).toHaveLength(1);
    const second = deps(repo, STALL);
    second.job.whatsapp = first.whatsapp;
    await runStallJob(second.job);
    expect(first.whatsapp.sent).toHaveLength(1);

    const fresh = baseRepo();
    fresh.work[0]!.lastProgressAt = STALL.toISOString();
    const quiet = deps(fresh, STALL);
    await runStallJob(quiet.job);
    expect(quiet.whatsapp.sent).toHaveLength(0);
  });

  it("aviso semanal no Google Chat leva só o link", async () => {
    const repo = baseRepo();
    const { job, googleChat, whatsapp } = deps(repo, FRIDAY_16);
    await runWeeklyJob(job);
    expect(googleChat.sent).toHaveLength(1);
    expect(googleChat.sent[0]?.text).toContain("/app/checkin/semanal");
    expect(googleChat.sent[0]?.text).not.toContain("SEGREDO-PASSO");
    expect(whatsapp.sent[0]?.text).not.toContain("SEGREDO-PASSO");
  });

  it("resumo semanal lista respostas e quem falta, sem o passo privado", async () => {
    const repo = baseRepo();
    repo.members.push({
      ...repo.members[0]!,
      userId: "member",
      role: "member",
      displayName: "Bia",
      notifyGoogleChat: false,
      googleChatSpaceId: null,
    });
    repo.checkins.push({
      id: "weekly-ana",
      teamId: "team-a",
      userId: "owner",
      kind: "semanal",
      forDate: "2026-11-23",
      projectId: null,
      status: "respondido",
      answer: "texto",
      answerText: "Andou: fechei o roteiro. Travou: jurídico",
      prompt: "check-in",
    });
    const { job, googleChat } = deps(repo, MONDAY_8);
    await runSummaryJob(job);
    const body = await repo.getWeeklySummary("team-a", "2026-11-23");
    expect(body).toContain("fechei o roteiro");
    expect(body).toContain("Bia: ainda não respondeu");
    expect(body).not.toContain("SEGREDO-PASSO");
    expect(googleChat.sent[0]?.text).not.toContain("SEGREDO-PASSO");
    expect(googleChat.sent[0]?.text).not.toContain("fechei o roteiro");
    const again = deps(repo, MONDAY_8);
    const second = await runSummaryJob(again.job);
    expect(second.skippedDuplicate).toBe(1);
    expect(again.googleChat.sent).toHaveLength(0);
  });
});

describe("resposta no app", () => {
  it("registra o check sem canal externo e oferece concluir o passo", async () => {
    const repo = baseRepo();
    repo.members[0]!.notifyWhatsapp = false;
    const first = await recordDailyAnswer(repo, {
      member: repo.members[0]!,
      forDate: "2026-11-27",
      answer: "fiz",
    });
    expect(first.alreadyAnswered).toBe(false);
    expect(first.offersStepCompletion).toBe(true);
    expect(repo.stuck.size).toBe(0);
    const second = await recordDailyAnswer(repo, {
      member: repo.members[0]!,
      forDate: "2026-11-27",
      answer: "fiz",
    });
    expect(second.alreadyAnswered).toBe(true);
    expect(repo.checkins.filter((row) => row.kind === "diario_noite")).toHaveLength(1);
  });
});
