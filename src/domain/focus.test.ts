import { describe, expect, it } from "vitest";
import {
  boardUrgency,
  buildChargeMessage,
  dueToCharge,
  eventWindow,
  formatWeekDeliveries,
  googleEventBody,
  morningCalendarText,
  progressCopy,
  showEveningCheck,
  tinyStep,
} from "@/domain/focus";
import { consumeStoredLink, inspectStoredLink, issueActionLink, type StoredLink } from "@/server/action-links";
import { GOOGLE_SCOPES } from "@/server/google-scopes";
import { FakeCalendar } from "@/integrations/calendar/fake";
import { MemoryRepo } from "@/server/jobs/memory-repo";
import { runEveningJob, runMorningJob } from "@/server/jobs/run";
import { FakeGoogleChat, RecordingWhatsapp } from "@/integrations/google-chat/fake";

const SECRET = "segredo-de-teste";
const NOW = new Date("2026-11-27T15:00:00.000Z");

describe("foco do dia", () => {
  it("mostra o check só depois das 16h em São Paulo", () => {
    expect(showEveningCheck(new Date("2026-11-27T18:30:00.000Z"))).toBe(false);
    expect(showEveningCheck(new Date("2026-11-27T19:00:00.000Z"))).toBe(true);
  });

  it("conta o progresso e marca entregue no último passo", () => {
    expect(progressCopy({ done: 1, total: 5, milestoneOn: "2026-12-10" }).line).toBe("passo 2 de 5 · termina 10/12");
    expect(progressCopy({ done: 1, total: 5, milestoneOn: null }).remaining).toBe("faltam 4 passos");
    expect(progressCopy({ done: 5, total: 5, milestoneOn: "2026-12-10" }).delivered).toBe(true);
  });

  it("propõe um passo de 5 minutos sem repetir um prefixo longo", () => {
    const step = tinyStep("Fazer o miolo de: escrever o roteiro inteiro do atendimento");
    expect(step.minutes).toBe(5);
    expect(step.title.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(step.title.toLowerCase()).not.toMatch(/miolo|esclarecer o resultado|revisar e fechar/);
    expect(step.title.startsWith("Começar")).toBe(true);
  });

  it("cobra no máximo 3 projetos compartilhados vencidos", () => {
    const items = [
      { id: "privado", visibility: "privado", chargeOn: "2026-11-01" },
      { id: "a", visibility: "compartilhado", chargeOn: "2026-11-01" },
      { id: "b", visibility: "compartilhado", chargeOn: "2026-11-27" },
      { id: "c", visibility: "compartilhado", chargeOn: "2026-11-20" },
      { id: "d", visibility: "compartilhado", chargeOn: "2026-11-02" },
      { id: "futuro", visibility: "compartilhado", chargeOn: "2026-12-01" },
    ];
    const due = dueToCharge(items, "2026-11-27");
    expect(due).toHaveLength(3);
    expect(due.map((item) => item.id)).not.toContain("privado");
    expect(due.map((item) => item.id)).not.toContain("futuro");
  });

  it("pinta atrasado de vermelho e esta semana de amarelo", () => {
    expect(boardUrgency({ flag: "atrasado", milestoneOn: "2026-11-01", today: "2026-11-27", weekEnd: "2026-11-29" })).toBe("vermelho");
    expect(boardUrgency({ flag: "travado", milestoneOn: "2026-12-20", today: "2026-11-27", weekEnd: "2026-11-29" })).toBe("vermelho");
    expect(boardUrgency({ flag: "no_prazo", milestoneOn: "2026-11-28", today: "2026-11-27", weekEnd: "2026-11-29" })).toBe("amarelo");
    expect(boardUrgency({ flag: "no_prazo", milestoneOn: "2026-12-20", today: "2026-11-27", weekEnd: "2026-11-29" })).toBe("verde");
  });

  it("monta o texto da agenda com alerta de 0 min e até 3 cobranças", () => {
    const window = eventWindow("2026-11-27", "08:00");
    expect(window).toEqual({ startIso: "2026-11-27T08:00:00-03:00", endIso: "2026-11-27T08:15:00-03:00" });
    const description = morningCalendarText({
      stepUrl: "https://foco.example/app/projetos/1",
      doneUrl: "https://foco.example/toque?t=concluir",
      charges: ["Ana · Roteiro", "Bia · Lista", "Caio · Ata", "Extra · Fora"],
    });
    expect(description).toContain("Concluí: https://foco.example/toque?t=concluir");
    expect(description).toContain("Cobrar hoje: Ana · Roteiro; Bia · Lista; Caio · Ata");
    expect(description).not.toContain("Extra");
    const body = googleEventBody({ summary: "Escrever roteiro", description, ...window });
    expect(body.reminders.overrides[0]).toEqual({ method: "popup", minutes: 0 });
    expect(buildChargeMessage({ ownerName: "Ana", projectTitle: "Roteiro", milestone: "Ensaio", when: "2026-12-03" })).toContain("Ana");
    expect(formatWeekDeliveries([{ ownerName: "Ana", title: "Roteiro", on: "2026-11-27" }])).toContain("Entregas da semana");
  });
});

describe("link de um toque", () => {
  it("mostra no GET e só gasta no POST, uma vez, em 24h", () => {
    const issued = issueActionLink(
      { userId: "ana", teamId: "time", projectId: "p", stepId: "s", action: "concluir" },
      SECRET,
      NOW.getTime(),
    );
    const store: StoredLink[] = [{ hash: issued.hash, payload: issued.payload, usedAt: null }];
    expect(inspectStoredLink(store, issued.token, SECRET, NOW.getTime())).toBe("ready");
    expect(store[0]?.usedAt).toBeNull();
    expect(consumeStoredLink(store, issued.token, SECRET, NOW.getTime())).toBe("ok");
    expect(store[0]?.usedAt).toBeTruthy();
    expect(consumeStoredLink(store, issued.token, SECRET, NOW.getTime())).toBe("used");
    const expired = issueActionLink(
      { userId: "ana", teamId: "time", projectId: null, stepId: null, action: "fiz" },
      SECRET,
      NOW.getTime() - 25 * 60 * 60 * 1000,
    );
    const oldStore: StoredLink[] = [{ hash: expired.hash, payload: expired.payload, usedAt: null }];
    expect(inspectStoredLink(oldStore, expired.token, SECRET, NOW.getTime())).toBe("expired");
    const tampered = `${issued.token.slice(0, -2)}aa`;
    expect(inspectStoredLink(store, tampered, SECRET, NOW.getTime())).toBe("invalid");
  });
});

describe("agenda no cron", () => {
  it("cria o evento da manhã e o das 18h sem repetir no mesmo dia", async () => {
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
      notifyWhatsapp: false,
      notifyGoogleChat: false,
      whatsappE164: null,
      whatsappOptedInAt: null,
      googleChatSpaceId: null,
    });
    repo.work.push({
      teamId: "team-a",
      userId: "owner",
      projectId: "proj-1",
      projectTitle: "Roteiro",
      visibility: "privado",
      lastProgressAt: null,
      activatedAt: null,
      stepId: "step-1",
      stepTitle: "Escrever roteiro",
      doneWhen: "Arquivo salvo.",
      minutes: 8,
    });
    repo.dueCharges.push({ teamId: "team-a", ownerName: "Bia", milestone: "Lista", chargeOn: "2026-11-27" });
    const calendar = new FakeCalendar();
    const issue = async ({ action }: { action: string }) => `https://foco.example/toque?t=${action}`;
    const morning = {
      repo,
      whatsapp: new RecordingWhatsapp(),
      googleChat: new FakeGoogleChat(),
      now: new Date("2026-11-27T11:00:00.000Z"),
      appUrl: "https://foco.example/app",
      ignoreSchedule: true,
      calendar,
      issueLink: { issue },
    };
    await runMorningJob(morning);
    await runMorningJob(morning);
    expect(calendar.events).toHaveLength(1);
    expect(calendar.events[0]?.summary).toBe("Escrever roteiro");
    expect(calendar.events[0]?.description).toContain("Concluí:");
    expect(calendar.events[0]?.description).toContain("Cobrar hoje: Bia · Lista");
    expect(calendar.events[0]?.endIso).toBe("2026-11-27T08:15:00-03:00");
    const eveningCalendar = new FakeCalendar();
    await runEveningJob({ ...morning, calendar: eveningCalendar, now: new Date("2026-11-27T21:00:00.000Z") });
    expect(eveningCalendar.events[0]?.startIso).toBe("2026-11-27T18:00:00-03:00");
    expect(eveningCalendar.events[0]?.description).toContain("Fiz:");
    expect(eveningCalendar.events[0]?.description).toContain("Travado:");
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/calendar.events");
  });
});
