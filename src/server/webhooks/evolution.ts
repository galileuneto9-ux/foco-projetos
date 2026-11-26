import { createHash } from "node:crypto";
import { phoneFromJid, parseWhatsappAnswer } from "@/domain/phone";
import { todayInSaoPaulo } from "@/domain/time";
import { secretsMatch } from "@/server/secrets";
import { recordDailyAnswer } from "@/server/checkins/record-answer";
import type { JobRepository } from "@/server/jobs/repository";
import type { WhatsappStatus } from "@/domain/types";

const STALE_MS = 15 * 60 * 1000;

export type IncomingMessage = {
  event: "message" | "connection" | "qr" | "other";
  instance: string | null;
  messageId: string | null;
  fromMe: boolean;
  remoteJid: string | null;
  text: string | null;
  timestampMs: number | null;
  connectionStatus: WhatsappStatus | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readText(message: Record<string, unknown> | null): string | null {
  if (!message) return null;
  if (typeof message.conversation === "string") return message.conversation;
  const extended = asRecord(message.extendedTextMessage);
  if (typeof extended?.text === "string") return extended.text;
  const ephemeral = asRecord(message.ephemeralMessage);
  const inner = asRecord(ephemeral?.message);
  if (typeof inner?.conversation === "string") return inner.conversation;
  return null;
}

function mapConnection(state: string | null): WhatsappStatus | null {
  if (state === "open") return "open";
  if (state === "close") return "close";
  if (state === "connecting") return "qr";
  return null;
}

export function parseEvolutionPayload(body: unknown): IncomingMessage | null {
  const root = asRecord(body);
  if (!root) return null;
  const event = String(root.event ?? "").toLowerCase().replace(/_/g, ".");
  const instance = typeof root.instance === "string" ? root.instance : null;
  const data = Array.isArray(root.data) ? asRecord(root.data[0]) : asRecord(root.data);
  if (event.includes("messages.upsert") || event === "messages.upsert") {
    const key = asRecord(data?.key);
    const timestampRaw = data?.messageTimestamp ?? root.date_time;
    const timestampMs =
      typeof timestampRaw === "number"
        ? timestampRaw > 10_000_000_000
          ? timestampRaw
          : timestampRaw * 1000
        : typeof timestampRaw === "string" && /^\d+$/.test(timestampRaw)
          ? Number(timestampRaw) * 1000
          : null;
    return {
      event: "message",
      instance,
      messageId: typeof key?.id === "string" ? key.id : null,
      fromMe: key?.fromMe === true,
      remoteJid: typeof key?.remoteJid === "string" ? key.remoteJid : null,
      text: readText(asRecord(data?.message)),
      timestampMs,
      connectionStatus: null,
    };
  }
  if (event.includes("connection.update")) {
    const state = typeof data?.state === "string" ? data.state : typeof data?.status === "string" ? data.status : null;
    return {
      event: "connection",
      instance,
      messageId: null,
      fromMe: false,
      remoteJid: null,
      text: null,
      timestampMs: null,
      connectionStatus: mapConnection(state),
    };
  }
  if (event.includes("qrcode.updated")) {
    return {
      event: "qr",
      instance,
      messageId: null,
      fromMe: false,
      remoteJid: null,
      text: null,
      timestampMs: null,
      connectionStatus: "qr",
    };
  }
  return {
    event: "other",
    instance,
    messageId: null,
    fromMe: false,
    remoteJid: null,
    text: null,
    timestampMs: null,
    connectionStatus: null,
  };
}

function messageIdentity(message: IncomingMessage): string | null {
  if (message.messageId) return message.messageId;
  if (!message.remoteJid || !message.text) return null;
  return createHash("sha256")
    .update(`${message.remoteJid}|${message.timestampMs ?? ""}|${message.text}`)
    .digest("hex");
}

export async function handleEvolutionWebhook(
  request: Request,
  deps: { secret: string | null; repo: JobRepository; now: Date },
): Promise<Response> {
  const provided = request.headers.get("apikey") ?? request.headers.get("x-webhook-secret");
  if (!secretsMatch(provided, deps.secret)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const message = parseEvolutionPayload(body);
  if (!message || message.event === "other") {
    return Response.json({ ignored: true });
  }
  if (message.event === "connection" && message.instance && message.connectionStatus) {
    await deps.repo.setWhatsappStatusByInstance(message.instance, message.connectionStatus);
    return Response.json({ ok: true });
  }
  if (message.event === "qr" && message.instance) {
    await deps.repo.setWhatsappStatusByInstance(message.instance, "qr");
    return Response.json({ ok: true });
  }
  if (message.event !== "message") return Response.json({ ignored: true });
  if (message.fromMe || !message.remoteJid || message.remoteJid.endsWith("@g.us")) {
    return Response.json({ ignored: true });
  }
  if (message.timestampMs !== null && deps.now.getTime() - message.timestampMs > STALE_MS) {
    return Response.json({ ignored: true, reason: "stale" }, { status: 409 });
  }
  const identity = messageIdentity(message);
  if (!identity) return Response.json({ ignored: true });
  const phone = phoneFromJid(message.remoteJid);
  const member = phone ? await deps.repo.findMemberByPhone(phone) : null;
  const fresh = await deps.repo.rememberWebhook(identity, member?.teamId ?? null);
  if (!fresh) return Response.json({ ignored: true, reason: "replay" });
  if (!member || !phone) return Response.json({ ignored: true });
  const answer = message.text ? parseWhatsappAnswer(message.text) : null;
  if (!answer) return Response.json({ ignored: true });
  const recorded = await recordDailyAnswer(deps.repo, {
    member,
    forDate: todayInSaoPaulo(deps.now),
    answer,
  });
  if (recorded.alreadyAnswered) return Response.json({ ok: true, duplicate: true });
  return Response.json({
    ok: true,
    answer,
    offer: recorded.offersStepCompletion ? "concluir_passo" : null,
    markedStuck: recorded.markedStuck,
  });
}
