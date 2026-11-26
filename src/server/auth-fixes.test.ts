import { describe, expect, it } from "vitest";
import { GET } from "@/app/auth/callback/route";
import { requestPasswordReset, signUp } from "@/server/actions/auth";
import { INVITE_ONLY_MESSAGE, OPEN_SIGNUP, PASSWORD_RESET_ENABLED } from "@/server/access";
import { signupErrorMessage, teamFormDefaults, teamFromMetadata } from "@/server/auth-messages";
import { newPasswordSchema } from "@/domain/schemas";
import { callbackNextPath, safeNextPath } from "@/server/safe-next";
import { securityHeaders } from "@/server/security-headers";
import nextConfig from "../../next.config";

const ORIGIN = "https://foco.example";

describe("redirect depois do login", () => {
  it("só aceita caminho relativo interno", () => {
    expect(safeNextPath("/app", ORIGIN)).toBe("/app");
    expect(safeNextPath("/nova-senha", ORIGIN)).toBe("/nova-senha");
    expect(safeNextPath("/login?ok=1", ORIGIN)).toBe("/login?ok=1");
    expect(safeNextPath("https://evil.example", ORIGIN)).toBe("/app");
    expect(safeNextPath("//evil.example", ORIGIN)).toBe("/app");
    expect(safeNextPath("/\\evil.example", ORIGIN)).toBe("/app");
    expect(safeNextPath("\\\\evil.example", ORIGIN)).toBe("/app");
    expect(safeNextPath(null, ORIGIN)).toBe("/app");
  });

  it("a rota de callback não segue next externo", async () => {
    const cases = ["https://evil.example", "//evil.example", "/\\evil.example"];
    for (const next of cases) {
      const response = await GET(new Request(`${ORIGIN}/auth/callback?next=${encodeURIComponent(next)}`));
      expect(response.headers.get("location")).toBe(`${ORIGIN}/app`);
    }
    const ok = await GET(new Request(`${ORIGIN}/auth/callback?next=${encodeURIComponent("/login")}`));
    expect(ok.headers.get("location")).toBe(`${ORIGIN}/login`);
    const recovery = await GET(
      new Request(`${ORIGIN}/auth/callback?type=recovery&next=${encodeURIComponent("https://evil.example")}`),
    );
    expect(recovery.headers.get("location")).toBe(`${ORIGIN}/nova-senha`);
    const recoveryBypass = await GET(
      new Request(`${ORIGIN}/auth/callback?type=recovery&next=${encodeURIComponent("//evil.example")}`),
    );
    expect(recoveryBypass.headers.get("location")).toBe(`${ORIGIN}/nova-senha`);
  });
});

describe("acesso só por convite", () => {
  it("recusa cadastro aberto e não oferece recuperação por e-mail", async () => {
    expect(OPEN_SIGNUP).toBe(false);
    expect(PASSWORD_RESET_ENABLED).toBe(false);
    const signup = await signUp({
      displayName: "Ana",
      teamName: "Time",
      email: "ana@example.com",
      password: "uma-senha-boa",
    });
    expect(signup).toEqual({ ok: false, message: INVITE_ONLY_MESSAGE });
    const reset = await requestPasswordReset({ email: "ana@example.com" });
    expect(reset.ok).toBe(false);
    if (!reset.ok) expect(reset.message).toMatch(/desligada/);
  });
});

describe("cadastro", () => {
  it("explica o limite de envio de e-mail", () => {
    expect(signupErrorMessage({ code: "over_email_send_rate_limit", message: "rate limit" })).toMatch(/Limite de envio/);
    expect(signupErrorMessage({ code: "over_email_send_rate_limit", message: "rate limit" })).toMatch(/mais tarde/);
    expect(signupErrorMessage({ message: "over_email_send_rate_limit" })).toMatch(/Limite de envio/);
    expect(signupErrorMessage({ code: "user_already_exists", message: "já existe" })).toMatch(/Tente outro e-mail/);
  });

  it("separa o nome da pessoa e o nome do time gravados no cadastro", () => {
    expect(teamFormDefaults({ display_name: "Ana", team_name: "Atendimento" })).toEqual({
      displayName: "Ana",
      teamName: "Atendimento",
    });
    expect(teamFromMetadata({ display_name: "Ana", team_name: "Atendimento" })).toEqual({
      displayName: "Ana",
      teamName: "Atendimento",
    });
    expect(teamFromMetadata({ display_name: "Ana" })).toBeNull();
  });
});

describe("nova senha depois do recovery", () => {
  it("manda o recovery para /nova-senha e recusa senha curta ou diferente", () => {
    expect(callbackNextPath("recovery", "https://evil.example", ORIGIN)).toBe("/nova-senha");
    expect(callbackNextPath("recovery", "//evil.example", ORIGIN)).toBe("/nova-senha");
    expect(callbackNextPath("recovery", "/\\evil.example", ORIGIN)).toBe("/nova-senha");
    expect(callbackNextPath(null, "/nova-senha", ORIGIN)).toBe("/nova-senha");
    expect(callbackNextPath(null, "https://evil.example", ORIGIN)).toBe("/app");
    expect(newPasswordSchema.safeParse({ password: "curta", confirm: "curta" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "uma-senha-boa", confirm: "outra-senha" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "uma-senha-boa", confirm: "uma-senha-boa" }).success).toBe(true);
    expect(OPEN_SIGNUP).toBe(false);
    expect(PASSWORD_RESET_ENABLED).toBe(false);
  });
});

describe("headers de segurança", () => {
  it("publica CSP, nosniff e referrer pelo next.config", async () => {
    const headers = securityHeaders();
    const csp = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
    expect(headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
    expect(headers).toContainEqual({ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" });
    const fromConfig = await nextConfig.headers?.();
    expect(fromConfig?.[0]?.headers).toEqual(headers);
    expect(fromConfig?.[0]?.source).toBe("/:path*");
  });
});
