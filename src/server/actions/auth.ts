"use server";

import { redirect } from "next/navigation";
import { acceptInviteSchema, loginSchema, signupSchema } from "@/domain/schemas";
import { INVITE_ONLY_MESSAGE, OPEN_SIGNUP, PASSWORD_RESET_ENABLED } from "@/server/access";
import { signupErrorMessage } from "@/server/auth-messages";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/server/errors";

function appUrl() {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}

export async function signUp(input: unknown) {
  if (!OPEN_SIGNUP) return { ok: false as const, message: INVITE_ONLY_MESSAGE };
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback`,
      data: { team_name: parsed.data.teamName, display_name: parsed.data.displayName },
    },
  });
  if (error) return { ok: false as const, message: signupErrorMessage(error) };
  if (data.session) {
    const created = await supabase.rpc("create_team", {
      p_name: parsed.data.teamName,
      p_display_name: parsed.data.displayName,
    });
    if (created.error) return { ok: false as const, message: dbError(created.error, "Conta criada, mas o time não entrou.") };
    redirect("/app");
  }
  return { ok: true as const, message: "Enviamos um e-mail de confirmação. Abra o link para entrar." };
}

export async function signIn(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false as const, message: "E-mail ou senha incorretos, ou a conta ainda não foi confirmada." };
  redirect("/app");
}

export async function requestPasswordReset(input: unknown) {
  if (!PASSWORD_RESET_ENABLED) {
    return { ok: false as const, message: "A recuperação de senha por e-mail está desligada." };
  }
  const email = typeof input === "object" && input && "email" in input ? String(input.email) : "";
  const parsed = loginSchema.shape.email.safeParse(email);
  if (!parsed.success) return { ok: false as const, message: "Informe um e-mail válido." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${appUrl()}/auth/callback?next=/login` });
  return { ok: true as const, message: "Se o e-mail existir, enviamos o link para criar uma senha nova." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createTeam(input: unknown) {
  const name = typeof input === "object" && input && "teamName" in input ? String(input.teamName) : "";
  const display = typeof input === "object" && input && "displayName" in input ? String(input.displayName) : "";
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_team", { p_name: name.trim(), p_display_name: display.trim() });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível criar o time.") };
  redirect("/app");
}

export async function acceptInvite(input: unknown) {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const { createHash } = await import("node:crypto");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, message: "O convite precisa da chave de serviço no servidor." };
  }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const { data: invite } = await admin
    .from("team_invites")
    .select("id, team_id, email, expires_at, accepted_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!invite || invite.accepted_at || new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false as const, message: "Este convite não vale mais. Peça outro." };
  }
  const created = await admin.auth.admin.createUser({
    email: invite.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName },
  });
  if (created.error || !created.data.user) {
    const already = created.error?.message?.toLowerCase().includes("already") || created.error?.status === 422;
    return {
      ok: false as const,
      message: already
        ? "Convite para quem já tem conta fica fora desta versão."
        : "Não foi possível criar a conta.",
    };
  }
  const { error: memberError } = await admin.from("team_members").insert({
    team_id: invite.team_id,
    user_id: created.data.user.id,
    role: "member",
    display_name: parsed.data.displayName,
  });
  if (memberError) return { ok: false as const, message: "A conta entrou, mas o time não. Fale com quem convidou." };
  await admin.from("team_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  const supabase = await createClient();
  const { error: signError } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password: parsed.data.password,
  });
  if (signError) redirect("/login");
  redirect("/app");
}
