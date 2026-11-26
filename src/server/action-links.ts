import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const LINK_ACTIONS = ["concluir", "fiz", "nao_fiz", "travado"] as const;
export type LinkAction = (typeof LINK_ACTIONS)[number];

export type LinkPayload = {
  userId: string;
  teamId: string;
  projectId: string | null;
  stepId: string | null;
  action: LinkAction;
  exp: number;
};

export type StoredLink = {
  hash: string;
  payload: LinkPayload;
  usedAt: string | null;
};

const TTL_SECONDS = 24 * 60 * 60;

export function signActionLink(payload: LinkPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function hashActionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readActionLink(token: string, secret: string, nowMs = Date.now()): LinkPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig || !secret) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LinkPayload;
    if (!LINK_ACTIONS.includes(payload.action)) return null;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp * 1000 < nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueActionLink(input: Omit<LinkPayload, "exp">, secret: string, nowMs = Date.now()): { token: string; hash: string; payload: LinkPayload } {
  const payload: LinkPayload = { ...input, exp: Math.floor(nowMs / 1000) + TTL_SECONDS };
  const token = signActionLink(payload, secret);
  return { token, hash: hashActionToken(token), payload };
}

export function inspectStoredLink(store: StoredLink[], token: string, secret: string, nowMs = Date.now()): "ready" | "used" | "expired" | "invalid" {
  const payload = token.split(".").length === 2 ? token : "";
  const verified = payload ? readActionLink(token, secret, nowMs) : null;
  if (!verified) {
    const unsigned = token.split(".");
    if (unsigned.length === 2) {
      try {
        const body = JSON.parse(Buffer.from(unsigned[0], "base64url").toString("utf8")) as LinkPayload;
        if (body.exp * 1000 < nowMs) return "expired";
      } catch {
        return "invalid";
      }
    }
    return "invalid";
  }
  const row = store.find((item) => item.hash === hashActionToken(token));
  if (!row) return "invalid";
  if (row.usedAt) return "used";
  return "ready";
}

export function consumeStoredLink(store: StoredLink[], token: string, secret: string, nowMs = Date.now()): "ok" | "used" | "expired" | "invalid" {
  const state = inspectStoredLink(store, token, secret, nowMs);
  if (state !== "ready") return state;
  const row = store.find((item) => item.hash === hashActionToken(token));
  if (!row || row.usedAt) return "used";
  row.usedAt = new Date(nowMs).toISOString();
  return "ok";
}
