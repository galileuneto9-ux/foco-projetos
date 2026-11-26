"use server";

import { revalidatePath } from "next/cache";
import { buildChargeMessage } from "@/domain/focus";
import { requireMember } from "@/server/session";

export async function prepareCharge(projectId: string) {
  const { supabase, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, next_milestone, charge_on, owner_id, visibility")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.visibility !== "compartilhado") {
    return { ok: false as const, message: "Só dá para cobrar um projeto compartilhado." };
  }
  const { data: owner } = await supabase.from("team_members").select("display_name, google_chat_space_id").eq("user_id", project.owner_id).maybeSingle();
  const text = buildChargeMessage({
    ownerName: owner?.display_name ?? "você",
    projectTitle: project.title,
    milestone: project.next_milestone ?? "",
    when: project.charge_on ?? new Date().toISOString().slice(0, 10),
  });
  if ((process.env.GOOGLE_CHAT_PROVIDER || "fake") === "google" && owner?.google_chat_space_id) {
    const { createJobDeps } = await import("@/server/jobs/deps");
    await createJobDeps().googleChat.sendMessage({ spaceId: owner.google_chat_space_id, text });
  }
  return { ok: true as const, text, message: "Mensagem pronta para copiar." };
}

export async function markCharged(projectId: string, nextOn: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOn)) return { ok: false as const, message: "Escolha a próxima data." };
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { error: chargeError } = await supabase.from("project_charges").insert({
    team_id: member.team_id,
    project_id: projectId,
    user_id: user.id,
    next_on: nextOn,
  });
  if (chargeError) return { ok: false as const, message: "Não foi possível registrar." };
  const { error } = await supabase.from("projects").update({ charge_on: nextOn }).eq("id", projectId);
  if (error) return { ok: false as const, message: "A cobrança entrou, mas a data não mudou." };
  revalidatePath("/app/time");
  return { ok: true as const, message: "Cobrança registrada." };
}
