const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type SaoPauloParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  date: string;
};

export function saoPauloParts(now: Date): SaoPauloParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((part) => [part.type, part.value]));
  const year = parts.year ?? "0000";
  const month = parts.month ?? "01";
  const day = parts.day ?? "01";
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0"),
    weekday: WEEKDAY[parts.weekday ?? ""] ?? 0,
    date: `${year}-${month}-${day}`,
  };
}

export function todayInSaoPaulo(now = new Date()): string {
  return saoPauloParts(now).date;
}

export function weekStartSaoPaulo(now: Date): string {
  const parts = saoPauloParts(now);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const delta = parts.weekday === 0 ? 6 : parts.weekday - 1;
  utc.setUTCDate(utc.getUTCDate() - delta);
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${month}-${day}`;
}

export function previousWeekStart(now: Date): string {
  const start = weekStartSaoPaulo(now);
  const [year, month, day] = start.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 7);
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${m}-${d}`;
}

export function isWithinSlot(now: Date, timeHHmm: string, windowMinutes = 20): boolean {
  const match = /^(\d{2}):(\d{2})/.exec(timeHHmm);
  if (!match) return false;
  const parts = saoPauloParts(now);
  const slot = Number(match[1]) * 60 + Number(match[2]);
  const current = parts.hour * 60 + parts.minute;
  return current >= slot && current < slot + windowMinutes;
}

export function formatDatePt(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTodayLabel(now = new Date()): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
