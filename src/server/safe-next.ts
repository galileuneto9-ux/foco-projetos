const FALLBACK = "/app";
export const RECOVERY_PATH = "/nova-senha";

export function callbackNextPath(type: string | null | undefined, next: string | null | undefined, origin: string): string {
  if (type === "recovery") return RECOVERY_PATH;
  return safeNextPath(next, origin);
}

export function safeNextPath(next: string | null | undefined, origin: string, fallback = FALLBACK): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (next.includes("\\")) return fallback;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
