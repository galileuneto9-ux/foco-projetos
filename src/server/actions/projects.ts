"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { manualStepSchema, noteSchema, projectSchema, quickIdeaSchema } from "@/domain/schemas";
import { normalizeConfirmedSteps } from "@/domain/rules";
import type { StepDraft } from "@/domain/types";
import { resolveStepBreaker } from "@/integrations/ai";
import { dbError } from "@/server/errors";
import { requireMember } from "@/server/session";

async function nextPosition(supabase: Awaited<ReturnType<typeof requireMember>>["supabase"], userId: string) {
  const { data } = await supabase
    .from("projects")
    .select("position")
    .eq("owner_id", userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? 0) + 1;
}

export async function createQuickIdea(input: unknown) {
  const parsed = quickIdeaSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira o nome." };
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Crie o time antes." };
  const { error } = await supabase.from("projects").insert({
    team_id: member.team_id,
    owner_id: user.id,
    title: parsed.data.title,
    status: "fila",
    visibility: "privado",
    position: await nextPosition(supabase, user.id),
  });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível guardar a ideia.") };
  revalidatePath("/app/fila");
  return { ok: true as const, message: "A ideia entrou na fila." };
}

export async function createProject(input: unknown) {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Crie o time antes." };
  const { data, error } = await supabase
    .from("projects")
    .insert({
      team_id: member.team_id,
      owner_id: user.id,
      title: parsed.data.title,
      brief: parsed.data.brief || null,
      visibility: parsed.data.visibility,
      next_milestone: parsed.data.nextMilestone || null,
      next_milestone_on: parsed.data.nextMilestoneOn || null,
      status: "fila",
      position: await nextPosition(supabase, user.id),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, message: dbError(error, "Não foi possível criar o projeto.") };
  redirect(`/app/projetos/${data.id}`);
}

export async function updateProject(projectId: string, input: unknown) {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("projects")
    .update({
      title: parsed.data.title,
      brief: parsed.data.brief || null,
      visibility: parsed.data.visibility,
      next_milestone: parsed.data.nextMilestone || null,
      next_milestone_on: parsed.data.nextMilestoneOn || null,
    })
    .eq("id", projectId);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível salvar.") };
  revalidatePath(`/app/projetos/${projectId}`);
  revalidatePath("/app/time");
  return { ok: true as const, message: "Projeto salvo." };
}

export async function activateProject(projectId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("activate_project", { p_project: projectId });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível ativar.") };
  revalidatePath("/app");
  revalidatePath("/app/fila");
  return { ok: true as const, message: "Projeto ativo." };
}

export async function setProjectStatus(projectId: string, status: "fila" | "pausado" | "concluido" | "desistido") {
  const { supabase } = await requireMember();
  const { error } = await supabase.from("projects").update({ status }).eq("id", projectId);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível atualizar.") };
  revalidatePath("/app");
  revalidatePath("/app/fila");
  revalidatePath("/app/time");
  return { ok: true as const };
}

export async function markStuck(projectId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.from("projects").update({ board_flag: "travado" }).eq("id", projectId);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível marcar.") };
  revalidatePath("/app");
  revalidatePath("/app/time");
  return { ok: true as const };
}

export async function markOnTrack(projectId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.from("projects").update({ board_flag: "no_prazo" }).eq("id", projectId);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível atualizar.") };
  revalidatePath("/app/time");
  return { ok: true as const };
}

export async function suggestSteps(projectId: string) {
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { data: project } = await supabase.from("projects").select("id, brief, title").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false as const, message: "Projeto não encontrado." };
  const brief = String(project.brief ?? "").trim();
  if (!brief) return { ok: false as const, message: "Escreva a ideia solta antes de quebrar em passos." };
  const breaker = resolveStepBreaker();
  if (breaker.provider === "manual") {
    return { ok: false as const, message: "Sem chave de IA. Adicione os passos na mão." };
  }
  try {
    const steps = await breaker.breakIntoSteps(brief);
    await supabase.from("ai_runs").insert({
      team_id: member.team_id,
      user_id: user.id,
      project_id: projectId,
      provider: breaker.provider,
      input_chars: brief.length,
      output_steps: steps.length,
      status: "ok",
    });
    return { ok: true as const, steps };
  } catch {
    await supabase.from("ai_runs").insert({
      team_id: member.team_id,
      user_id: user.id,
      project_id: projectId,
      provider: breaker.provider,
      input_chars: brief.length,
      status: "falhou",
    });
    return { ok: false as const, message: "Não consegui quebrar agora. Adicione os passos na mão." };
  }
}

export async function saveSteps(projectId: string, steps: StepDraft[]) {
  let normalized: StepDraft[];
  try {
    normalized = normalizeConfirmedSteps(steps);
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Confira os passos." };
  }
  if (normalized.length === 0) return { ok: false as const, message: "Nenhum passo para gravar." };
  const { supabase, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { data: project } = await supabase.from("projects").select("id, team_id").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false as const, message: "Projeto não encontrado." };
  const { data: current } = await supabase
    .from("project_steps")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "atual")
    .maybeSingle();
  const { data: last } = await supabase
    .from("project_steps")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (last?.position ?? 0) + 1;
  const rows = normalized.map((step, index) => ({
    team_id: project.team_id,
    project_id: projectId,
    title: step.title,
    done_when: step.doneWhen,
    minutes: step.minutes,
    status: !current && index === 0 ? "atual" : "pendente",
    position: position++,
  }));
  const { error } = await supabase.from("project_steps").insert(rows);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível gravar os passos.") };
  revalidatePath(`/app/projetos/${projectId}`);
  revalidatePath("/app");
  return { ok: true as const, message: "Passos gravados." };
}

export async function addManualStep(projectId: string, input: unknown) {
  const parsed = manualStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira o passo." };
  return saveSteps(projectId, [
    { title: parsed.data.title, doneWhen: parsed.data.doneWhen, minutes: parsed.data.minutes },
  ]);
}

export async function setCurrentStep(stepId: string, projectId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("set_current_step", { p_step: stepId });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível definir o passo.") };
  revalidatePath("/app");
  revalidatePath(`/app/projetos/${projectId}`);
  return { ok: true as const };
}

export async function completeStep(stepId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("complete_step", { p_step: stepId });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível concluir.") };
  revalidatePath("/app");
  revalidatePath("/app/historico");
  return { ok: true as const };
}

export async function skipStep(stepId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("skip_step", { p_step: stepId });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível pular.") };
  revalidatePath("/app");
  return { ok: true as const };
}

export async function addNote(projectId: string, input: unknown) {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Confira a nota." };
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { error } = await supabase.from("project_notes").insert({
    team_id: member.team_id,
    project_id: projectId,
    author_id: user.id,
    body: parsed.data.body,
  });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível guardar a nota.") };
  revalidatePath(`/app/projetos/${projectId}`);
  return { ok: true as const, message: "Nota guardada. Só você vê." };
}
