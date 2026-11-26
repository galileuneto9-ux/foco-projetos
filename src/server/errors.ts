import { CAP_MESSAGE } from "@/domain/rules";

export function dbError(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
  const message = error?.message ?? "";
  if (message.includes("TETO_ATIVOS")) return CAP_MESSAGE;
  if (message.includes("JA_TEM_TIME")) return "Você já está em um time.";
  if (message.includes("NOME_INVALIDO")) return "Confira o nome.";
  if (message.toLowerCase().includes("minutes") || message.includes("15 e 30")) {
    return "O passo precisa ter entre 5 e 25 minutos.";
  }
  console.error("db_error", error?.code ?? "unknown");
  return fallback;
}
