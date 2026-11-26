export type WhatsappReply = "fiz" | "nao_fiz" | "travado";

export function normalizeBrazilPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  if (!/^55\d{10,11}$/.test(withCountry)) return null;
  return withCountry;
}

export function phoneFromJid(jid: string): string | null {
  if (jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  const local = jid.split("@")[0] ?? "";
  return normalizeBrazilPhone(local);
}

export function parseWhatsappAnswer(text: string): WhatsappReply | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (normalized === "1" || normalized === "fiz") return "fiz";
  if (normalized === "2" || normalized === "nao fiz" || normalized === "nao fiz hoje") return "nao_fiz";
  if (normalized === "3" || normalized === "travado" || normalized === "estou travado") return "travado";
  return null;
}
