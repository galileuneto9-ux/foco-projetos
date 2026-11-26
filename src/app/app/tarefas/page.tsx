import Link from "next/link";
import { addDays } from "@/domain/redesign";
import type { TaskNode } from "@/domain/redesign";
import { todayInSaoPaulo } from "@/domain/time";
import { LooseTaskForm, TaskCheck, TaskTree } from "@/components/task-tree";
import { requireMember } from "@/server/session";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  position: number;
  owner_id: string;
  assignee_id: string;
  priority: "importante" | "medio" | "baixo" | null;
  visibility: "privado" | "compartilhado" | null;
  projects: { id: string; title: string; owner_id: string } | null;
};

const FILTERS = [
  ["", "Todas"],
  ["iniciadas", "Iniciadas"],
  ["a_vencer", "A vencer"],
  ["vencidas", "Vencidas"],
  ["feitas", "Feitas"],
  ["avulsas", "Avulsas"],
] as const;

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const params = await searchParams;
  const filtro = params.filtro ?? "";
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const { data } = await supabase
    .from("tasks")
    .select("id, title, status, due_date, project_id, parent_task_id, position, owner_id, assignee_id, priority, visibility, projects(id, title, owner_id)")
    .order("position");
  const mine = ((data ?? []) as unknown as TaskRow[]).filter(
    (task) => task.owner_id === user.id || task.assignee_id === user.id || task.projects?.owner_id === user.id,
  );
  const visible = mine.filter((task) => matches(task, filtro, today));
  const loose = visible
    .filter((task) => !task.project_id)
    .map(
      (task): TaskNode => ({
        id: task.id,
        parentId: task.parent_task_id,
        position: task.position,
        status: task.status as TaskNode["status"],
        title: task.title,
        priority: task.priority === "importante" || task.priority === "baixo" ? task.priority : "medio",
        visibility: task.visibility === "compartilhado" ? "compartilhado" : "privado",
        canTune: task.owner_id === user.id,
      }),
    );
  const projectTasks = visible.filter((task) => task.project_id);

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-serif text-4xl">Tarefas</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => {
          const href = value ? `/app/tarefas?filtro=${value}` : "/app/tarefas";
          const active = filtro === value;
          return (
            <Link
              key={label}
              href={href}
              className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${active ? "bg-oliva text-creme" : "bg-creme text-tinta"}`}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <section className="rounded-2xl border border-borda bg-creme p-4">
        <h2 className="font-serif text-2xl">Avulsas</h2>
        <p className="mb-3 text-sm text-suave">Não entram na fila nem no teto de 3 projetos.</p>
        <LooseTaskForm />
        <TaskTree tasks={loose} projectId={null} canEdit />
      </section>
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">De projetos</h2>
        {projectTasks.length === 0 ? <p className="text-sm text-suave">Nenhuma tarefa de projeto nesse filtro.</p> : null}
        {projectTasks.map((task) => {
          const canEdit = task.owner_id === user.id || task.projects?.owner_id === user.id || task.assignee_id === user.id;
          return (
            <div key={task.id} className="flex min-h-11 items-center gap-3 rounded-xl bg-creme px-3" style={{ marginLeft: task.parent_task_id ? 24 : 0 }}>
              <TaskCheck id={task.id} done={task.status === "feita"} disabled={!canEdit || task.status === "pulada"} />
              <Link href={`/app/projetos/${task.project_id}`} className="min-w-0 flex-1 truncate">
                {task.title}
                <span className="text-suave"> · {task.projects?.title ?? "Projeto"}</span>
              </Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function matches(task: TaskRow, filtro: string, today: string) {
  const open = task.status === "aberta" || task.status === "em_andamento";
  if (filtro === "iniciadas") return open;
  if (filtro === "a_vencer") return open && Boolean(task.due_date && task.due_date >= today && task.due_date <= addDays(today, 6));
  if (filtro === "vencidas") return open && Boolean(task.due_date && task.due_date < today);
  if (filtro === "feitas") return task.status === "feita";
  if (filtro === "avulsas") return !task.project_id;
  return true;
}
