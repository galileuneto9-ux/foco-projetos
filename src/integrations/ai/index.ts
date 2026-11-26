import { breakBriefIntoSteps } from "@/integrations/ai/fake";
import { parseModelSteps } from "@/integrations/ai/parse";
import type { StepDraft } from "@/domain/types";

export type StepBreaker = {
  provider: string;
  breakIntoSteps(brief: string): Promise<StepDraft[]>;
};

export function resolveStepBreaker(env: NodeJS.ProcessEnv = process.env): StepBreaker {
  const name = (env.AI_PROVIDER || "fake").toLowerCase();
  if (name === "openai" || name === "compatible") {
    if (!env.AI_API_KEY) {
      return {
        provider: "manual",
        async breakIntoSteps() {
          throw new Error("SEM_CHAVE");
        },
      };
    }
    return new OpenAiStepBreaker({
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_API_BASE_URL || "https://api.openai.com/v1",
      model: env.AI_MODEL || "gpt-4.1-mini",
    });
  }
  return {
    provider: "fake",
    async breakIntoSteps(brief: string) {
      return breakBriefIntoSteps(brief);
    },
  };
}

class OpenAiStepBreaker implements StepBreaker {
  readonly provider = "openai";

  constructor(
    private readonly config: {
      apiKey: string;
      baseUrl: string;
      model: string;
    },
  ) {}

  async breakIntoSteps(brief: string): Promise<StepDraft[]> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Quebre a ideia em passos de 15 a 30 minutos. Responda só JSON: {\"steps\":[{\"title\",\"doneWhen\",\"minutes\"}]}. doneWhen é observável. No máximo 8 passos. Português do Brasil.",
          },
          { role: "user", content: brief },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error("IA_FALHOU");
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("IA_FALHOU");
    const steps = parseModelSteps(JSON.parse(content));
    return steps;
  }
}
