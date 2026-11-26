import { formatDatePt } from "@/domain/time";

export function formatWeeklyAnswer(andou: string, travou: string): string {
  return `Andou: ${andou.trim()}\nTravou: ${travou.trim()}`;
}

export function buildWeeklySummary(input: {
  weekStart: string;
  members: { userId: string; displayName: string }[];
  checkins: { userId: string; status: string; answerText: string | null }[];
}): string {
  const lines = input.members.map((member) => {
    const checkin = input.checkins.find((item) => item.userId === member.userId && item.status === "respondido");
    if (!checkin?.answerText?.trim()) {
      return `- ${member.displayName}: ainda não respondeu`;
    }
    const text = checkin.answerText.replace(/\s+/g, " ").trim();
    return `- ${member.displayName}: ${text}`;
  });
  return [`Semana de ${formatDatePt(input.weekStart)}`, ...lines].join("\n");
}
