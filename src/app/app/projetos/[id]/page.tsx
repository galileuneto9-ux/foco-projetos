import Link from "next/link";
import { notFound } from "next/navigation";
import { progressCopy } from "@/domain/focus";
import type { TaskNode } from "@/domain/redesign";
import { BreakSteps, FlagButtons, ManualStepForm, NoteForm, ProjectEditor } from "@/components/project-forms";
import { PriorityTag } from "@/components/priority-tag";
import { ProgressBlock } from "@/components/progress-bar";
import { StatusButtons } from "@/components/status-buttons";
import { TaskTree } from "@/components/task-tree";
import { requireMember } from "@/server/session";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const canEdit = project.owner_id === user.id;
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id, title, done_when, minutes, status, position, parent_task_id")
    .eq("project_id", id)
    .order("position");
  const tasks = (taskRows ?? []) as {
    id: string;
    title: string;
    done_when: string | null;
    minutes: number | null;
    status: string;
    position: number;
    parent_task_id: string | null;
  }[];
  const nodes: TaskNode[] = tasks.map((task) => ({
    id: task.id,
    parentId: task.parent_task_id,
    position: task.position,
    status: task.status as TaskNode["status"],
    title: task.title,
  }));
  const { data: notes } = canEdit
    ? await supabase.from("project_notes").select("id, body, created_at").eq("project_id", id).order("created_at", { ascending: false })
    : { data: [] };
  const done = tasks.filter((task) => task.status === "feita" || task.status === "pulada").length;
  const progress = progressCopy({ done, total: tasks.length, milestoneOn: project.next_milestone_on });
  const priority = project.priority === "importante" || project.priority === "baixo" ? project.priority : "medio";
  return (
    <div className="grid gap-6">
      <Link href="/app/fila" className="text-sm underline">
        Voltar
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-4xl">{progress.delivered ? "Entregue" : project.title}</h1>
        <PriorityTag priority={priority} />
      </div>
      <p className="text-sm text-suave">{project.due_date ? `Prazo ${String(project.due_date).slice(8, 10)}/${String(project.due_date).slice(5, 7)}` : "sem prazo"}</p>
      <ProgressBlock done={done} total={tasks.length} milestoneOn={project.next_milestone_on} />
      {canEdit ? <StatusButtons projectId={project.id} status={project.status} /> : null}
      {canEdit ? <FlagButtons projectId={project.id} flag={project.board_flag} /> : null}
      {canEdit ? (
        <ProjectEditor
          projectId={project.id}
          values={{
            title: project.title,
            brief: project.brief ?? "",
            visibility: project.visibility,
            priority,
            dueDate: project.due_date ?? "",
            nextMilestone: project.next_milestone ?? "",
            nextMilestoneOn: project.next_milestone_on ?? "",
            chargeOn: project.charge_on ?? "",
          }}
        />
      ) : null}
      <section className="grid gap-3 rounded-2xl border border-borda bg-creme p-4">
        <h2 className="font-serif text-2xl">Tarefas</h2>
        <TaskTree tasks={nodes} projectId={project.id} canEdit={canEdit} />
        {canEdit ? (
          <>
            <BreakSteps projectId={project.id} />
            <ManualStepForm projectId={project.id} />
          </>
        ) : (
          <p className="text-sm text-suave">Você acompanha este projeto. A lista não é sua para editar.</p>
        )}
      </section>
      {canEdit ? (
        <section className="grid gap-3">
          <h2 className="font-serif text-2xl">Notas</h2>
          {(notes ?? []).map((note) => (
            <p key={note.id} className="rounded-xl bg-muted p-3 text-sm">
              {note.body}
            </p>
          ))}
          <NoteForm projectId={project.id} />
        </section>
      ) : null}
    </div>
  );
}
