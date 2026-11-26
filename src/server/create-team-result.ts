import { dbError } from "@/server/errors";

export function createTeamResult(input: {
  alreadyMember: boolean;
  error: { message?: string; code?: string } | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.alreadyMember || input.error?.message?.includes("JA_TEM_TIME")) {
    return { ok: true };
  }
  if (input.error) {
    return { ok: false, message: dbError(input.error, "Não foi possível criar o time.") };
  }
  return { ok: true };
}
