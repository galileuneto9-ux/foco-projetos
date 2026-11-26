"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { normalizeBrazilPhone } from "@/domain/phone";
import { channelSchema, inviteSchema, teamSettingsSchema } from "@/domain/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError } from "@/server/errors";
import { requireMember } from "@/server/session";

function originFrom(headers: Headers) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function updateTeamSettings(input: unknown) {
  const parsed = teamSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os horários." };
  const { supabase, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "Só quem criou o time altera os horários." };
  const { error } = await supabase
    .from("teams")
    .update({
      morning_hour: parsed.data.morningHour,
      evening_hour: parsed.data.eveningHour,
      stall_days: parsed.data.stallDays,
      weekly_checkin_weekday: parsed.data.weeklyCheckinWeekday,
      weekly_checkin_hour: parsed.data.weeklyCheckinHour,
    })
    .eq("id", member.team_id);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível salvar os horários.") };
  revalidatePath("/app/config");
  return { ok: true as const, message: "Horários salvos. O cron da Vercel precisa cobrir o horário novo." };
}

export async function updateChannel(input: unknown) {
  const parsed = channelSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const phone = parsed.data.phone ? normalizeBrazilPhone(parsed.data.phone) : null;
  if (parsed.data.notifyWhatsapp && (!phone || !parsed.data.optIn)) {
    return { ok: false as const, message: "Para receber no WhatsApp, informe o número e confirme o opt-in." };
  }
  if (parsed.data.phone && !phone) return { ok: false as const, message: "Use um celular do Brasil, com DDD." };
  const { supabase, user } = await requireMember();
  const { error } = await supabase
    .from("team_members")
    .update({
      display_name: parsed.data.displayName,
      notify_whatsapp: parsed.data.notifyWhatsapp,
      notify_google_chat: parsed.data.notifyGoogleChat,
      whatsapp_e164: phone,
      whatsapp_opted_in_at: parsed.data.optIn && phone ? new Date().toISOString() : null,
    })
    .eq("user_id", user.id);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível salvar.") };
  revalidatePath("/app/config");
  return { ok: true as const, message: "Preferências salvas." };
}

export async function inviteMember(input: unknown) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira o e-mail." };
  const { supabase, user, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "Só quem criou o time convida." };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.from("team_invites").insert({
    team_id: member.team_id,
    email: parsed.data.email.toLowerCase(),
    token_hash: tokenHash,
    invited_by: user.id,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível criar o convite.") };
  const { headers } = await import("next/headers");
  const link = `${originFrom(await headers())}/convite?token=${token}`;
  revalidatePath("/app/config");
  return { ok: true as const, message: "Convite criado. Copie o link e envie para a pessoa. Ele vale 7 dias.", link };
}

export async function removeMember(userId: string) {
  const { supabase, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "Só quem criou o time remove gente." };
  if (userId === member.user_id) return { ok: false as const, message: "Quem criou o time não sai por aqui." };
  const { error } = await supabase.from("team_members").delete().eq("team_id", member.team_id).eq("user_id", userId);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível remover.") };
  revalidatePath("/app/config");
  return { ok: true as const, message: "Pessoa removida do time." };
}

export async function requestWhatsappQr() {
  const { supabase, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "Só quem criou o time conecta o WhatsApp." };
  const instance = process.env.EVOLUTION_INSTANCE || "foco";
  const { data: current } = await supabase.from("whatsapp_connection").select("status").eq("team_id", member.team_id).maybeSingle();
  if (current?.status === "open") {
    return { ok: true as const, status: "open" as const, qrDataUrl: null, message: "WhatsApp já está conectado. A sessão persistida não pede QR de novo." };
  }
  if ((process.env.WHATSAPP_PROVIDER || "fake") === "evolution") {
    const base = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY;
    if (!base || !key) return { ok: false as const, message: "Faltam URL e chave da Evolution." };
    const response = await fetch(`${base.replace(/\/$/, "")}/instance/connect/${instance}`, { headers: { apikey: key } });
    if (!response.ok) return { ok: false as const, message: "A Evolution não devolveu o QR." };
    const body = (await response.json()) as { base64?: string; code?: string };
    const qrDataUrl = body.base64
      ? body.base64.startsWith("data:")
        ? body.base64
        : `data:image/png;base64,${body.base64}`
      : null;
    await supabase.from("whatsapp_connection").upsert(
      { team_id: member.team_id, evolution_instance: instance, status: "qr", last_qr_at: new Date().toISOString(), provider: "evolution_baileys" },
      { onConflict: "team_id" },
    );
    revalidatePath("/app/config");
    return { ok: true as const, status: "qr" as const, qrDataUrl, message: "Aponte a câmera em Aparelhos conectados. Use um chip secundário." };
  }
  const qrDataUrl = await QRCode.toDataURL(`foco-dev-qr:${instance}`, { margin: 1, width: 280 });
  await supabase.from("whatsapp_connection").upsert(
    {
      team_id: member.team_id,
      evolution_instance: instance,
      status: "qr",
      last_qr_at: new Date().toISOString(),
      provider: "fake",
      recommended_secondary_sim: true,
    },
    { onConflict: "team_id" },
  );
  revalidatePath("/app/config");
  return { ok: true as const, status: "qr" as const, qrDataUrl, message: "QR de desenvolvimento. Nada foi enviado a um WhatsApp real." };
}

export async function simulateWhatsappOpen() {
  if ((process.env.WHATSAPP_PROVIDER || "fake") === "evolution") {
    return { ok: false as const, message: "A simulação só existe quando o provedor é fake." };
  }
  const { supabase, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "Só quem criou o time conecta o WhatsApp." };
  const instance = process.env.EVOLUTION_INSTANCE || "foco";
  const { error } = await supabase.from("whatsapp_connection").upsert(
    { team_id: member.team_id, evolution_instance: instance, status: "open", provider: "fake", last_error: null },
    { onConflict: "team_id" },
  );
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível simular a conexão.") };
  revalidatePath("/app/config");
  return { ok: true as const, message: "Status aberto. Um reinício com essa linha gravada não pede QR de novo." };
}

export async function connectGoogleFake(email: string) {
  if ((process.env.GOOGLE_CHAT_PROVIDER || "fake") === "google") {
    return { ok: false as const, message: "Use o botão de OAuth do Google." };
  }
  const { supabase, user, member } = await requireMember();
  if (!member || member.role !== "owner") return { ok: false as const, message: "Só quem criou o time conecta o Google Chat." };
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return { ok: false as const, message: "Informe o e-mail Google." };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, message: "Conectar precisa da chave de serviço no servidor." };
  }
  const { data: secret, error: secretError } = await admin
    .from("google_oauth_secrets")
    .insert({ team_id: member.team_id, ciphertext: "fake" })
    .select("id")
    .single();
  if (secretError || !secret) return { ok: false as const, message: "Não foi possível guardar a referência." };
  const { error } = await supabase.from("google_oauth_connections").upsert(
    {
      team_id: member.team_id,
      user_id: user.id,
      google_email: trimmed,
      refresh_token_secret_ref: secret.id,
      personal_space_id: `spaces/fake-${member.team_id}`,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "team_id" },
  );
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível conectar.") };
  if (!member.google_chat_space_id) {
    await supabase.from("team_members").update({ google_chat_space_id: `spaces/fake-${user.id}` }).eq("user_id", user.id);
  }
  revalidatePath("/app/config");
  return { ok: true as const, message: "Google Chat simulado. Os avisos do time saem sem o texto do passo." };
}
