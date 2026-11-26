import Link from "next/link";
import { progressCopy, showEveningCheck } from "@/domain/focus";
import { focusProjectId, nextOpenTask, panelCounts, type TaskNode } from "@/domain/redesign";
import { todayInSaoPaulo } from "@/domain/time";
import { DailyCheck, TodayActions } from "@/components/today-actions";
import { PriorityTag } from "@/components/priority-tag";
import { ProgressBlock } from "@/components/progress-bar";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/server/session";

type TaskRow = {
  id: string;
  project_id: string | null;
  parent_task_id: string | null;
  title: string;
  done_when: string | null;
  status: string;
  position: number;
  due_date: string | null;
  owner_id: string;
  assignee_id: string;
  projects: { owner_id: string; priority: string; due_date: string | null; title: string; status: string; position: number; next_milestone_on: string | null } | null;
};

export default async function PainelPage() {
  const { supabase, user, member, team } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id, project_id, parent_task_id, title, done_when, status, position, due_date, owner_id, assignee_id, projects(owner_id, priority, due_date, title, status, position, next_milestone_on)");
  const tasks = ((taskRows ?? []) as unknown as TaskRow[]).filter(isMine(user.id));
  const counts = panelCounts(
    tasks.map((task) => ({ status: task.status, due: task.due_date })),
    today,
  );
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, priority, due_date, position, next_milestone_on, owner_id")
    .eq("owner_id", user.id)
    .in("status", ["ativo", "fila"])
    .order("position");
  const active = (projects ?? []).filter((project) => project.status === "ativo");
  const queue = (projects ?? []).filter((project) => project.status === "fila").slice(0, 3);
  const focusId = focusProjectId(
    (projects ?? []).map((project) => ({ id: project.id, position: project.position, status: project.status })),
    tasks.map((task) => ({ projectId: task.project_id, status: task.status })),
  );
  const focus = active.find((project) => project.id === focusId) ?? null;
  const focusTasks = tasks.filter((task) => task.project_id === focus?.id);
  const current = nextOpenTask(focusTasks.map(toNode));
  const done = focusTasks.filter((task) => task.status === "feita" || task.status === "pulada").length;
  const { data: evening } = await supabase
    .from("checkins")
    .select("status")
    .eq("user_id", user.id)
    .eq("kind", "diario_noite")
    .eq("for_date", today)
    .maybeSingle();
  const pendingCheck = active.length > 0 && evening?.status !== "respondido" && showEveningCheck(new Date());

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl">Painel</h1>
        <p className="text-sm text-suave">{team?.name}</p>
      </div>
      {pendingCheck ? <DailyCheck pending /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Counter href="/app/tarefas?filtro=iniciadas" label="Iniciadas" value={counts.iniciadas} className="text-oliva" />
        <Counter href="/app/tarefas?filtro=a_vencer" label="A vencer" value={counts.aVencer} className="text-ocre" />
        <Counter href="/app/tarefas?filtro=vencidas" label="Vencidas" value={counts.vencidas} className="text-argila" />
      </div>
      <Card className="grid gap-3">
        {!focus || !current ? (
          <>
            <p>Nenhum passo de projeto ativo</p>
            <div className="flex gap-4 text-sm">
              <Link href="/app/fila" className="underline">
                Fila
              </Link>
              <Link href="/app/tarefas" className="underline">
                Tarefas
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-suave">{focus.title}</p>
            <h2 className="font-serif text-3xl leading-tight">{current.title}</h2>
            {currentDoneWhen(focusTasks, current.id) ? (
              <p className="text-sm">
                <span className="text-suave">Pronto quando: </span>
                {currentDoneWhen(focusTasks, current.id)}
              </p>
            ) : null}
            <TodayActions stepId={current.id} projectId={focus.id} />
            <ProgressBlock done={done} total={focusTasks.length} milestoneOn={focus.next_milestone_on} />
          </>
        )}
      </Card>
      <div className="grid gap-3">
        {[...active, ...queue].map((project) => {
          const list = tasks.filter((task) => task.project_id === project.id);
          const finished = list.filter((task) => task.status === "feita" || task.status === "pulada").length;
          const progress = progressCopy({ done: finished, total: list.length, milestoneOn: project.next_milestone_on });
          const priority = project.priority === "importante" || project.priority === "baixo" ? project.priority : "medio";
          return (
            <Link key={project.id} href={`/app/projetos/${project.id}`} className="rounded-2xl border border-borda bg-creme p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{project.title}</p>
                <PriorityTag priority={priority} />
              </div>
              <p className="mt-1 text-sm text-suave">{project.due_date ? formatDue(project.due_date) : "sem prazo"}</p>
              <div className="mt-3">
                <ProgressBlock done={finished} total={list.length} milestoneOn={project.next_milestone_on} compact />
                {progress.delivered ? <p className="text-sm font-semibold text-oliva">Entregue</p> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Counter({ href, label, value, className }: { href: string; label: string; value: number; className: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-borda bg-creme p-4">
      <p className="text-sm text-suave">{label}</p>
      <p className={`font-serif text-5xl ${className}`}>{value}</p>
    </Link>
  );
}

function isMine(userId: string) {
  return (task: TaskRow) => task.owner_id === userId || task.assignee_id === userId || task.projects?.owner_id === userId;
}

function toNode(task: TaskRow): TaskNode {
  return {
    id: task.id,
    parentId: task.parent_task_id,
    position: task.position,
    status: task.status as TaskNode["status"],
    title: task.title,
  };
}

function currentDoneWhen(tasks: TaskRow[], id: string) {
  return tasks.find((task) => task.id === id)?.done_when ?? "";
}

function formatDue(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}
