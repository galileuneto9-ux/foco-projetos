import { z } from "zod";
import type { StepDraft } from "@/domain/types";

const modelStepsSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        doneWhen: z.string().trim().min(1).max(400),
        minutes: z.number().int().min(5).max(25),
      }),
    )
    .min(1)
    .max(8),
});

export function parseModelSteps(payload: unknown): StepDraft[] {
  const parsed = modelStepsSchema.parse(payload);
  return parsed.steps.map((step) => ({
    title: step.title.trim(),
    doneWhen: step.doneWhen.trim(),
    minutes: step.minutes,
  }));
}
