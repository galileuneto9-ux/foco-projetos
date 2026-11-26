import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/server/jobs/memory-repo";
import { handleEvolutionWebhook, parseEvolutionPayload } from "@/server/webhooks/evolution";

const NOW = new Date("2026-11-27T21:05:00.000Z");

function repo() {
  const memory = new MemoryRepo();
  memory.teams.push({
    id: "team-a",
    stallDays: 5,
    morningHour: "08:00",
    eveningHour: "18:00",
    weeklyCheckinWeekday: 5,
    weeklyCheckinHour: "16:00",
  });
  memory.members.push({
    teamId: "team-a",
    userId: "owner",
    role: "owner",
    displayName: "Ana",
    notifyWhatsapp: true,
    notifyGoogleChat: false,
    whatsappE164: "5511988887777",
    whatsappOptedInAt: "2026-11-01T00:00:00.000Z",
    googleChatSpaceId: null,
  });
  memory.work.push({
    teamId: "team-a",
    userId: "owner",
    projectId: "proj-1",
    projectTitle: "Roteiro",
    visibility: "privado",
    lastProgressAt: null,
    activatedAt: NOW.toISOString(),
    stepId: "step-1",
    stepTitle: "SEGREDO-PASSO",
    doneWhen: "Arquivo salvo.",
    minutes: 20,
  });
  memory.instances.set("team-a", "foco");
  memory.connections.set("team-a", "open");
  return memory;
}

function request(body: unknown, secret = "segredo-teste") {
  return new Request("https://foco.example/api/webhooks/evolution", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: secret },
    body: JSON.stringify(body),
  });
}

function upsert(text: string, id = "MSG1", extra?: Record<string, unknown>) {
  return {
    event: "messages.upsert",
    instance: "foco",
    data: {
      key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id },
      message: { conversation: text },
      messageTimestamp: Math.floor(NOW.getTime() / 1000),
      ...extra,
    },
  };
}

describe("webhook 1/2/3", () => {
  it("rejeita segredo ausente ou errado", async () => {
    const memory = repo();
    const missing = await handleEvolutionWebhook(request(upsert("1"), ""), {
      secret: "segredo-teste",
      repo: memory,
      now: NOW,
    });
    expect(missing.status).toBe(401);
    const wrong = await handleEvolutionWebhook(
      new Request("https://foco.example/api/webhooks/evolution", {
        method: "POST",
        headers: { apikey: "outro", "content-type": "application/json" },
        body: JSON.stringify(upsert("1")),
      }),
      { secret: "segredo-teste", repo: memory, now: NOW },
    );
    expect(wrong.status).toBe(401);
    expect(memory.checkins).toHaveLength(0);
  });

  it("registra 1 e fiz, oferece concluir e não duplica", async () => {
    const memory = repo();
    const first = await handleEvolutionWebhook(request(upsert("1", "MSG1")), {
      secret: "segredo-teste",
      repo: memory,
      now: NOW,
    });
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ ok: true, answer: "fiz", offer: "concluir_passo" });
    expect(memory.checkins).toHaveLength(1);
    expect(memory.checkins[0]?.answer).toBe("fiz");
    expect(memory.work[0]?.lastProgressAt).not.toBeNull();

    const replay = await handleEvolutionWebhook(request(upsert("1", "MSG1")), {
      secret: "segredo-teste",
      repo: memory,
      now: NOW,
    });
    await expect(replay.json()).resolves.toMatchObject({ reason: "replay" });
    expect(memory.checkins).toHaveLength(1);

    const again = await handleEvolutionWebhook(request(upsert("fiz", "MSG2")), {
      secret: "segredo-teste",
      repo: memory,
      now: NOW,
    });
    await expect(again.json()).resolves.toMatchObject({ duplicate: true });
    expect(memory.checkins).toHaveLength(1);
  });

  it("aceita não fiz e travado", async () => {
    const nao = repo();
    const response = await handleEvolutionWebhook(request(upsert("não fiz", "A")), {
      secret: "segredo-teste",
      repo: nao,
      now: NOW,
    });
    await expect(response.json()).resolves.toMatchObject({ answer: "nao_fiz" });

    const stuck = repo();
    const marked = await handleEvolutionWebhook(request(upsert("3", "B")), {
      secret: "segredo-teste",
      repo: stuck,
      now: NOW,
    });
    await expect(marked.json()).resolves.toMatchObject({ answer: "travado", markedStuck: true });
    expect(stuck.stuck.has("proj-1")).toBe(true);
  });

  it("ignora número sem opt-in, mensagem própria e grupo", async () => {
    const memory = repo();
    memory.members[0]!.whatsappOptedInAt = null;
    const ignored = await handleEvolutionWebhook(request(upsert("1", "OPT")), {
      secret: "segredo-teste",
      repo: memory,
      now: NOW,
    });
    await expect(ignored.json()).resolves.toMatchObject({ ignored: true });
    expect(memory.checkins).toHaveLength(0);

    const own = repo();
    const fromMe = upsert("1", "ME");
    (fromMe.data.key as { fromMe: boolean }).fromMe = true;
    await handleEvolutionWebhook(request(fromMe), { secret: "segredo-teste", repo: own, now: NOW });
    expect(own.checkins).toHaveLength(0);

    const group = repo();
    const payload = upsert("1", "GRP");
    payload.data.key.remoteJid = "123@g.us";
    await handleEvolutionWebhook(request(payload), { secret: "segredo-teste", repo: group, now: NOW });
    expect(group.checkins).toHaveLength(0);
  });

  it("recusa carimbo velho e atualiza a conexão", async () => {
    const memory = repo();
    const stale = upsert("1", "OLD");
    stale.data.messageTimestamp = Math.floor(NOW.getTime() / 1000) - 3600;
    const response = await handleEvolutionWebhook(request(stale), {
      secret: "segredo-teste",
      repo: memory,
      now: NOW,
    });
    expect(response.status).toBe(409);
    expect(memory.checkins).toHaveLength(0);

    const parsed = parseEvolutionPayload({
      event: "CONNECTION_UPDATE",
      instance: "foco",
      data: { state: "close" },
    });
    expect(parsed?.connectionStatus).toBe("close");
    await handleEvolutionWebhook(
      request({ event: "connection.update", instance: "foco", data: { state: "close" } }),
      { secret: "segredo-teste", repo: memory, now: NOW },
    );
    expect(memory.connections.get("team-a")).toBe("close");
  });
});
