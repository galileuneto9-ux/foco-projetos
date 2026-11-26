"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/server/session";
import { dbError } from "@/server/errors";

function refresh() {
  revalidatePath("/app");
  revalidatePath("/app/hoje");
  revalidatePath("/app/tarefas");
  revalidatePath("/app/time");
  revalidatePath("/app/historico");
}

export async function createLooseTask(title: string) {
  const clean = title.trim().slice(0, 160);
  if (clean.length === 0) return { ok: false as const, message: "Dê um nome à tarefa." };
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { data: last } = await supabase
    .from("tasks")
    .select("position")
    .is("project_id", null)
    .is("parent_task_id", null)
    .eq("owner_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      team_id: member.team_id,
      project_id: null,
      owner_id: user.id,
      assignee_id: user.id,
      title: clean,
      status: "aberta",
      priority: "medio",
      visibility: "privado",
      position: (last?.position ?? -1) + 1,
    })
    .select("id, position")
    .single();
  if (error || !data) return { ok: false as const, message: dbError(error, "Não foi possível criar a tarefa.") };
  refresh();
  return { ok: true as const, id: data.id as string, position: data.position as number };
}

export async function createProjectTask(projectId: string, title = "Nova tarefa") {
  const clean = title.trim().slice(0, 160) || "Nova tarefa";
  const { supabase, user, member } = await requireMember();
  if (!member) return { ok: false as const, message: "Sem time." };
  const { data: last } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", projectId)
    .is("parent_task_id", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      team_id: member.team_id,
      project_id: projectId,
      owner_id: user.id,
      assignee_id: user.id,
      title: clean,
      status: "aberta",
      position: (last?.position ?? -1) + 1,
    })
    .select("id, position")
    .single();
  if (error || !data) return { ok: false as const, message: dbError(error, "Não foi possível criar a tarefa.") };
  refresh();
  revalidatePath(`/app/projetos/${projectId}`);
  return { ok: true as const, id: data.id as string, position: data.position as number };
}

export async function toggleTask(id: string, done: boolean) {
  const { supabase } = await requireMember();
  if (done) {
    const { error } = await supabase.rpc("complete_task", { p_task: id });
    if (error) return { ok: false as const, message: dbError(error, "Não foi possível concluir.") };
  } else {
    const { error } = await supabase.from("tasks").update({ status: "aberta", completed_at: null }).eq("id", id);
    if (error) return { ok: false as const, message: dbError(error, "Não foi possível reabrir.") };
  }
  refresh();
  return { ok: true as const };
}

export async function renameTask(id: string, title: string) {
  const clean = title.trim().slice(0, 160);
  if (!clean) return { ok: false as const, message: "A tarefa precisa de um nome." };
  const { supabase } = await requireMember();
  const { error } = await supabase.from("tasks").update({ title: clean }).eq("id", id);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível renomear.") };
  refresh();
  return { ok: true as const };
}

export async function insertSibling(afterId: string) {
  const { supabase } = await requireMember();
  const { data, error } = await supabase.rpc("insert_task_after", { p_after: afterId, p_title: "Nova tarefa" });
  if (error || !data) return { ok: false as const, message: dbError(error, "Não foi possível criar a tarefa.") };
  refresh();
  return { ok: true as const, id: data as string };
}

export async function indentTaskAction(id: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("indent_task", { p_task: id });
  if (error) return { ok: false as const, message: dbError(error, "Não dá para aninhar mais.") };
  refresh();
  return { ok: true as const };
}

export async function outdentTaskAction(id: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("outdent_task", { p_task: id });
  if (error) return { ok: false as const, message: dbError(error, "Esta tarefa já está no primeiro nível.") };
  refresh();
  return { ok: true as const };
}

export async function moveTaskAction(id: string, direction: -1 | 1) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("move_task", { p_task: id, p_direction: direction });
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível reordenar.") };
  refresh();
  return { ok: true as const };
}

export async function deleteTask(id: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { ok: false as const, message: dbError(error, "Não foi possível apagar.") };
  refresh();
  return { ok: true as const };
}
