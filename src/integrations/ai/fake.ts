import { minutesForStep, observableDoneWhen, shapeStepTitle } from "@/domain/focus";
import type { StepDraft } from "@/domain/types";

export function breakBriefIntoSteps(brief: string): StepDraft[] {
  const cleaned = brief.trim().replace(/[ \t]+/g, " ");
  if (!cleaned) return [];
  const sentences = cleaned
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const parts = sentences.length >= 2 ? sentences.slice(0, 6) : [cleaned, "Revisar o que ficou", "Fechar e mostrar"];
  return parts.map((part, index) => {
    const title = shapeStepTitle(part);
    return {
      title,
      doneWhen: observableDoneWhen(title),
      minutes: minutesForStep(index),
    };
  });
}
