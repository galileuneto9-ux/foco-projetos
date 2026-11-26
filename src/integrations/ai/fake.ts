import type { StepDraft } from "@/domain/types";

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function breakBriefIntoSteps(brief: string): StepDraft[] {
  const cleaned = brief.trim().replace(/[ \t]+/g, " ");
  if (!cleaned) return [];

  const sentences = cleaned
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const parts =
    sentences.length >= 2
      ? sentences.slice(0, 8)
      : [
          `Esclarecer o resultado de: ${clip(cleaned, 80)}`,
          `Fazer o miolo de: ${clip(cleaned, 80)}`,
          `Revisar e fechar: ${clip(cleaned, 80)}`,
        ];

  return parts.map((part, index) => {
    const title = clip(part.replace(/[.!?;]+$/g, ""), 160);
    const doneWhen = `Quando «${clip(part, 120)}» estiver feito e você conseguir mostrar o resultado.`;
    return {
      title,
      doneWhen: clip(doneWhen, 400),
      minutes: [15, 20, 25, 30][index % 4] ?? 20,
    };
  });
}
