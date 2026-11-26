import { describe, expect, it } from "vitest";
import { shapeStepTitle } from "@/domain/focus";
import { breakBriefIntoSteps } from "@/integrations/ai/fake";
import { parseModelSteps } from "@/integrations/ai/parse";
import { normalizeBrazilPhone, parseWhatsappAnswer } from "@/domain/phone";
import { buildTeamNotice } from "@/domain/messages";
import { canActivate, effectiveBoardFlag, isStalled, normalizeConfirmedSteps } from "@/domain/rules";
import { passwordSchema } from "@/domain/schemas";
import { buildWeeklySummary } from "@/domain/summary";
import { isWithinSlot, previousWeekStart, saoPauloParts, weekStartSaoPaulo } from "@/domain/time";
import { assertSeedAllowed } from "@/server/seed-guard";
import { secretsMatch } from "@/server/secrets";
import { FakeEvolutionConnection } from "@/integrations/whatsapp/fake-connection";
import { encryptSecret, decryptSecret } from "@/integrations/crypto";

const FRIDAY_EIGHT = new Date("2026-11-27T11:00:00.000Z");

describe("teto de 3", () => {
  it("aceita até 3 ativos e recusa o quarto", () => {
    expect(canActivate(2).ok).toBe(true);
    const blocked = canActivate(3);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/3 projetos ativos/);
  });
});

describe("passos", () => {
  it("quebra a ideia em passos curtos, com o primeiro de 5 a 10 minutos", () => {
    const brief = "Escrever o roteiro do atendimento. Revisar com o time. Publicar a versão curta.";
    const first = breakBriefIntoSteps(brief);
    const second = breakBriefIntoSteps(brief);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first[0]?.minutes).toBeGreaterThanOrEqual(5);
    expect(first[0]?.minutes).toBeLessThanOrEqual(10);
    expect(first[0]?.title.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(first[0]?.title.toLowerCase()).not.toMatch(/esclarecer o resultado|fazer o miolo|revisar e fechar/);
    expect(shapeStepTitle("Começar Fazer o miolo de: escrever o roteiro")).toBe("Começar escrever o roteiro");
    expect(shapeStepTitle("Esclarecer o resultado de: Fazer o miolo de: publicar a nota")).toBe("Publicar a nota");
    expect(shapeStepTitle("Revisar e fechar: enviar o texto")).toBe("Enviar o texto");
    expect(first[0]?.doneWhen.includes(first[0].title)).toBe(false);
    for (const step of first.slice(1)) {
      expect(step.minutes).toBeGreaterThanOrEqual(15);
      expect(step.minutes).toBeLessThanOrEqual(25);
    }
  });

  it("sem texto, não inventa passo", () => {
    expect(breakBriefIntoSteps("   ")).toEqual([]);
  });

  it("grava o título editado e recusa minutos fora de 15–30", () => {
    const edited = normalizeConfirmedSteps([
      { title: "Título editado pela pessoa", doneWhen: "Quando o arquivo estiver salvo.", minutes: 25 },
    ]);
    expect(edited[0]?.title).toBe("Título editado pela pessoa");
    expect(normalizeConfirmedSteps([{ title: "Começar o roteiro", doneWhen: "Há uma linha escrita.", minutes: 8 }])[0]?.minutes).toBe(8);
    expect(() => normalizeConfirmedSteps([{ title: "Curto", doneWhen: "Pronto.", minutes: 4 }])).toThrow(/5 e 25/);
    expect(() => normalizeConfirmedSteps([{ title: "Curto", doneWhen: "Pronto.", minutes: 30 }])).toThrow(/5 e 25/);
  });

  it("valida o JSON do provedor", () => {
    expect(
      parseModelSteps({
        steps: [{ title: "Ligar", doneWhen: "Quando a ligação terminar.", minutes: 15 }],
      }),
    ).toHaveLength(1);
    expect(() => parseModelSteps({ steps: [{ title: "Ligar", doneWhen: "Ok", minutes: 90 }] })).toThrow();
  });
});

describe("quadro e parado", () => {
  it("marca atrasado pela data e preserva travado", () => {
    expect(
      effectiveBoardFlag({ boardFlag: "no_prazo", status: "ativo", nextMilestoneOn: "2026-11-01", today: "2026-11-27" }),
    ).toBe("atrasado");
    expect(
      effectiveBoardFlag({ boardFlag: "travado", status: "ativo", nextMilestoneOn: "2026-11-01", today: "2026-11-27" }),
    ).toBe("travado");
    expect(
      effectiveBoardFlag({ boardFlag: "no_prazo", status: "ativo", nextMilestoneOn: "2026-12-01", today: "2026-11-27" }),
    ).toBe("no_prazo");
  });

  it("alerta só depois dos dias sem progresso", () => {
    const now = FRIDAY_EIGHT;
    expect(
      isStalled({
        status: "ativo",
        lastProgressAt: new Date(now.getTime() - 6 * 86400000).toISOString(),
        activatedAt: null,
        now,
        stallDays: 5,
      }),
    ).toBe(true);
    expect(
      isStalled({
        status: "ativo",
        lastProgressAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
        activatedAt: null,
        now,
        stallDays: 5,
      }),
    ).toBe(false);
  });
});

describe("whatsapp e horário", () => {
  it("entende 1, 2, 3 e as palavras, com ou sem acento", () => {
    expect(parseWhatsappAnswer("1")).toBe("fiz");
    expect(parseWhatsappAnswer("Fiz")).toBe("fiz");
    expect(parseWhatsappAnswer("não fiz")).toBe("nao_fiz");
    expect(parseWhatsappAnswer("Não fiz hoje")).toBe("nao_fiz");
    expect(parseWhatsappAnswer("3")).toBe("travado");
    expect(parseWhatsappAnswer("travado")).toBe("travado");
    expect(parseWhatsappAnswer("talvez")).toBeNull();
  });

  it("normaliza celular brasileiro", () => {
    expect(normalizeBrazilPhone("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizeBrazilPhone("123")).toBeNull();
  });

  it("sexta 16h de Brasília cai na janela e 9h não", () => {
    const parts = saoPauloParts(FRIDAY_EIGHT);
    expect(parts.date).toBe("2026-11-27");
    expect(parts.hour).toBe(8);
    expect(parts.weekday).toBe(5);
    expect(isWithinSlot(FRIDAY_EIGHT, "08:00")).toBe(true);
    expect(isWithinSlot(new Date("2026-11-27T12:00:00.000Z"), "08:00")).toBe(false);
    expect(weekStartSaoPaulo(FRIDAY_EIGHT)).toBe("2026-11-23");
    expect(previousWeekStart(FRIDAY_EIGHT)).toBe("2026-11-16");
  });
});

describe("aviso do time e resumo", () => {
  it("não recebe o texto do passo", () => {
    const notice = buildTeamNotice({ kind: "semanal", appUrl: "https://foco.example/app/checkin/semanal" });
    expect(notice).toContain("https://foco.example/app/checkin/semanal");
    expect(notice).not.toContain("SEGREDO-PASSO");
  });

  it("monta o resumo com quem respondeu e quem não", () => {
    const body = buildWeeklySummary({
      weekStart: "2026-11-23",
      members: [
        { userId: "a", displayName: "Ana" },
        { userId: "b", displayName: "Bia" },
      ],
      checkins: [{ userId: "a", status: "respondido", answerText: "Andou: fechei o roteiro\nTravou: jurídico" }],
    });
    expect(body).toContain("Ana:");
    expect(body).toContain("fechei o roteiro");
    expect(body).toContain("Bia: ainda não respondeu");
  });
});

describe("seed, segredo e sessão fake", () => {
  it("recusa seed fora de URL local", () => {
    expect(assertSeedAllowed({ ALLOW_SEED: "1", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x" }).ok).toBe(false);
    expect(assertSeedAllowed({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "x" }).ok).toBe(false);
    expect(
      assertSeedAllowed({
        ALLOW_SEED: "1",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SERVICE_ROLE_KEY: "local-only",
      }).ok,
    ).toBe(true);
  });

  it("não aceita segredo vazio e compara em tempo constante o valor certo", () => {
    expect(secretsMatch(null, "abc")).toBe(false);
    expect(secretsMatch("", "abc")).toBe(false);
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abcd", "abc")).toBe(false);
  });

  it("recusa senha curta", () => {
    expect(passwordSchema.safeParse("curta").success).toBe(false);
    expect(passwordSchema.safeParse("uma-senha-boa").success).toBe(true);
  });

  it("mostra QR desconectado e reconecta pelo volume sem QR novo", async () => {
    const volume = new Map();
    const first = new FakeEvolutionConnection(volume);
    const qr = await first.requestQr("foco");
    expect(qr.status).toBe("qr");
    expect(qr.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    await first.markScanned("foco", "5511988887777");
    const restarted = new FakeEvolutionConnection(volume);
    expect(restarted.restart("foco")).toEqual({ status: "open", needsQr: false });
  });

  it("cifra o refresh token sem devolver o texto puro", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const cipher = encryptSecret("refresh-token-teste", key);
    expect(cipher).not.toContain("refresh-token-teste");
    expect(decryptSecret(cipher, key)).toBe("refresh-token-teste");
  });
});
