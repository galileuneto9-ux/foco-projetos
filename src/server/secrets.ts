import { timingSafeEqual } from "node:crypto";

export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function assertCronRequest(request: Request, secret = process.env.CRON_SECRET ?? null): { ok: true } | { ok: false } {
  const header = request.headers.get("authorization");
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!secretsMatch(token, secret)) return { ok: false };
  return { ok: true };
}
