export type MorningLine = {
  projectTitle: string;
  stepTitle: string | null;
  doneWhen: string | null;
  minutes: number | null;
};

export function buildMorningMessage(lines: MorningLine[], appUrl: string): string {
  const body = lines.slice(0, 3).map((line, index) => {
    if (!line.stepTitle) {
      return `${index + 1}. ${line.projectTitle}: ainda sem passo definido.`;
    }
    const minutes = line.minutes ? ` (${line.minutes} min)` : "";
    const done = line.doneWhen ? ` Pronto quando: ${line.doneWhen}` : "";
    return `${index + 1}. ${line.stepTitle}${minutes}.${done}`;
  });
  return ["Bom dia. Seus passos de hoje:", ...body, `Abrir: ${appUrl}`].join("\n");
}

export function buildEveningMessage(appUrl: string): string {
  return [
    "Fim do dia. Você fez o passo de hoje?",
    "Responda com um número:",
    "1 — Fiz",
    "2 — Não fiz hoje",
    "3 — Estou travado",
    `Ou responda no app: ${appUrl}`,
  ].join("\n");
}

export function buildStallMessage(projectTitles: string[], stallDays: number, appUrl: string): string {
  const names = projectTitles.slice(0, 3).join(", ");
  return `Sem movimento há ${stallDays} dias: ${names}. ${appUrl}`;
}

export function buildTeamNotice(input: { kind: "semanal" | "resumo"; appUrl: string }): string {
  if (input.kind === "resumo") {
    return `O resumo da semana está pronto. Abra: ${input.appUrl}`;
  }
  return `Hora do check-in semanal, em um minuto. Responda no app: ${input.appUrl}`;
}
