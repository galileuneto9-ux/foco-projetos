import { ACTIVE_PROJECT_CAP, type BoardFlag, type StepDraft } from "@/domain/types";

export const CAP_MESSAGE =
  "Você já tem 3 projetos ativos. Pause, conclua ou devolva um à fila antes de ativar outro.";

export function canActivate(activeCount: number): { ok: true } | { ok: false; message: string } {
  if (activeCount >= ACTIVE_PROJECT_CAP) {
    return { ok: false, message: CAP_MESSAGE };
  }
  return { ok: true };
}

export function effectiveBoardFlag(input: {
  boardFlag: BoardFlag;
  status: string;
  nextMilestoneOn: string | null;
  today: string;
}): BoardFlag {
  if (input.boardFlag === "travado") return "travado";
  if (input.status === "ativo" && input.nextMilestoneOn && input.nextMilestoneOn < input.today) {
    return "atrasado";
  }
  return input.boardFlag === "atrasado" ? "no_prazo" : input.boardFlag;
}

export function isStalled(input: {
  status: string;
  lastProgressAt: string | null;
  activatedAt: string | null;
  now: Date;
  stallDays: number;
}): boolean {
  if (input.status !== "ativo") return false;
  const reference = input.lastProgressAt ?? input.activatedAt;
  if (!reference) return true;
  const elapsed = input.now.getTime() - new Date(reference).getTime();
  return elapsed >= input.stallDays * 24 * 60 * 60 * 1000;
}

export function normalizeConfirmedSteps(steps: StepDraft[]): StepDraft[] {
  return steps.map((step) => {
    const title = step.title.trim();
    const doneWhen = step.doneWhen.trim();
    if (title.length < 1 || title.length > 160) {
      throw new Error("Título do passo inválido.");
    }
    if (doneWhen.length < 1 || doneWhen.length > 400) {
      throw new Error("Descreva quando o passo está pronto.");
    }
    if (!Number.isInteger(step.minutes) || step.minutes < 15 || step.minutes > 30) {
      throw new Error("O passo precisa ter entre 15 e 30 minutos.");
    }
    return { title, doneWhen, minutes: step.minutes };
  });
}

export function assertStepMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 30) {
    throw new Error("O passo precisa ter entre 15 e 30 minutos.");
  }
}
