import type { StepDraft } from "@/domain/types";
import { formatDatePt, saoPauloParts, weekStartSaoPaulo } from "@/domain/time";

export function shapeStepTitle(raw: string): string {
  const stripped = raw
    .replace(/^(esclarecer o resultado de|fazer o miolo de|revisar e fechar)\s*:\s*/i, "")
    .replace(/[.!?;:]+$/g, "")
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return "Fazer o próximo passo";
  const [first, ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

export function observableDoneWhen(title: string): string {
  const clean = title.replace(/[.]+$/g, "").trim();
  const text = `Dá para mostrar isto pronto, sem reabrir: ${clean.toLowerCase()}.`;
  if (text.includes(title)) return "Dá para mostrar o resultado a outra pessoa em uma frase.";
  return text;
}

export function minutesForStep(index: number): number {
  return index === 0 ? 8 : 20;
}

export function tinyStep(fromTitle: string): StepDraft {
  const title = shapeStepTitle(fromTitle.startsWith("Começar") ? fromTitle : `Começar ${fromTitle}`);
  return {
    title,
    doneWhen: "Os 5 minutos acabaram e há uma linha escrita.",
    minutes: 5,
  };
}

export function wordCount(title: string): number {
  return title.trim().split(/\s+/).filter(Boolean).length;
}

export function formatDayMonth(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function progressCopy(input: { done: number; total: number; milestoneOn: string | null }): {
  delivered: boolean;
  line: string;
  remaining: string;
  ratio: number;
} {
  if (input.total > 0 && input.done >= input.total) {
    return { delivered: true, line: "Entregue", remaining: "", ratio: 1 };
  }
  if (input.total === 0) {
    return { delivered: false, line: "Sem passos ainda", remaining: "", ratio: 0 };
  }
  const current = Math.min(input.done + 1, input.total);
  const date = input.milestoneOn ? ` · termina ${formatDayMonth(input.milestoneOn)}` : "";
  const left = input.total - input.done;
  return {
    delivered: false,
    line: `passo ${current} de ${input.total}${date}`,
    remaining: `faltam ${left} ${left === 1 ? "passo" : "passos"}`,
    ratio: input.done / input.total,
  };
}

export type Urgency = "verde" | "amarelo" | "vermelho";

export function weekEndSaoPaulo(now: Date): string {
  const start = weekStartSaoPaulo(now);
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 6);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${m}-${d}`;
}

export function boardUrgency(input: {
  flag: "no_prazo" | "atrasado" | "travado";
  milestoneOn: string | null;
  today: string;
  weekEnd: string;
}): Urgency {
  if (input.flag === "travado" || input.flag === "atrasado") return "vermelho";
  if (input.milestoneOn && input.milestoneOn >= input.today && input.milestoneOn <= input.weekEnd) return "amarelo";
  return "verde";
}

export function urgencyRank(urgency: Urgency): number {
  if (urgency === "vermelho") return 0;
  if (urgency === "amarelo") return 1;
  return 2;
}

export function dueToCharge<T extends { chargeOn: string | null; visibility: string }>(items: T[], today: string): T[] {
  return items
    .filter((item) => item.visibility === "compartilhado" && item.chargeOn !== null && item.chargeOn <= today)
    .slice(0, 3);
}

export function showEveningCheck(now: Date): boolean {
  return saoPauloParts(now).hour >= 16;
}

export function eventWindow(date: string, start: string): { startIso: string; endIso: string } {
  const [hour, minute] = start.split(":").map(Number);
  const endMinute = minute + 15;
  const endHour = hour + Math.floor(endMinute / 60);
  const end = `${String(endHour).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
  return {
    startIso: `${date}T${start}:00-03:00`,
    endIso: `${date}T${end}:00-03:00`,
  };
}

export function morningCalendarText(input: { stepUrl: string; doneUrl: string; charges: string[] }): string {
  const items = input.charges.slice(0, 3);
  const chargeLine = items.length > 0 ? `Cobrar hoje: ${items.join("; ")}` : "Cobrar hoje: nada vencido.";
  return [`Passo: ${input.stepUrl}`, `Concluí: ${input.doneUrl}`, chargeLine].join("\n");
}

export function eveningCalendarText(links: { fiz: string; naoFiz: string; travado: string }): string {
  return [`Fiz: ${links.fiz}`, `Não fiz: ${links.naoFiz}`, `Travado: ${links.travado}`].join("\n");
}

export function buildChargeMessage(input: { ownerName: string; projectTitle: string; milestone: string; when: string }): string {
  const marco = input.milestone || input.projectTitle;
  return `Oi ${input.ownerName}. O marco «${marco}» (${input.projectTitle}) está para ${formatDatePt(input.when)}. Consegue dar um passo hoje?`;
}

export function formatWeekDeliveries(items: { ownerName: string; title: string; on: string }[]): string {
  if (items.length === 0) return "";
  const lines = items.map((item) => `- ${item.ownerName} · ${item.title} · ${formatDayMonth(item.on)}`);
  return ["Entregas da semana", ...lines].join("\n");
}

export function googleEventBody(input: { summary: string; description: string; startIso: string; endIso: string }) {
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: "America/Sao_Paulo" },
    end: { dateTime: input.endIso, timeZone: "America/Sao_Paulo" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
  };
}
