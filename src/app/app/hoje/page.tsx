import Link from "next/link";
import { isStalled } from "@/domain/rules";
import { progressCopy, showEveningCheck } from "@/domain/focus";
import { focusProjectId, nextOpenTask, type TaskNode } from "@/domain/redesign";
import { formatTodayLabel, todayInSaoPaulo } from "@/domain/time";
import { DailyCheck, TodayActions } from "@/components/today-actions";
import { FocusTimer } from "@/components/focus-timer";
import { ProgressBlock } from "@/components/progress-bar";
import { StuckFlow } from "@/components/stuck-flow";
import { QuickIdeaForm } from "@/components/project-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/server/session";

type TaskRow = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  done_when: string | null;
  status: string;
  position: number;
};

export default async function HojePage() {
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const now = new Date();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, board_flag, next_milestone_on, last_progress_at, activated_at, position")
    .eq("owner_id", user.id)
    .eq("status", "ativo")
    .order("position");
  const ids = (projects ?? []).map((project) => project.id);
  const { data: taskRows } = ids.length
    ? await supabase
        .from("tasks")
        .select("id, project_id, parent_task_id, title, done_when, status, position")
        .in("project_id", ids)
        .order("position")
    : { data: [] as TaskRow[] };
  const tasks = (taskRows ?? []) as TaskRow[];
  const { data: evening } = await supabase
    .from("checkins")
    .select("status")
    .eq("user_id", user.id)
    .eq("kind", "diario_noite")
    .eq("for_date", today)
    .maybeSingle();
  const byProject = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const list = byProject.get(task.project_id) ?? [];
    list.push(task);
    byProject.set(task.project_id, list);
  }
  const focusId = focusProjectId(
    (projects ?? []).map((project) => ({ id: project.id, position: project.position, status: project.status })),
    tasks.map((task) => ({ projectId: task.project_id, status: task.status })),
  );
  const ordered = [...(projects ?? [])].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : a.position - b.position));
  const pendingCheck = ordered.length > 0 && evening?.status !== "respondido" && showEveningCheck(now);
  const stalled = ordered.some((project) =>
    isStalled({
      status: project.status,
      lastProgressAt: project.last_progress_at,
      activatedAt: project.activated_at,
      now,
      stallDays: 5,
    }),
  );
  const [hero, ...rest] = ordered;

  function stats(projectId: string) {
    const list = byProject.get(projectId) ?? [];
    const nodes: TaskNode[] = list.map((task) => ({
      id: task.id,
      parentId: task.parent_task_id,
      position: task.position,
      status: task.status as TaskNode["status"],
      title: task.title,
    }));
    const done = list.filter((task) => task.status === "feita" || task.status === "pulada").length;
    return { list, done, current: nextOpenTask(nodes), total: list.length };
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-serif text-4xl">Hoje</h1>
        <p className="text-sm text-suave">{formatTodayLabel()}</p>
      </div>
      {pendingCheck ? <DailyCheck pending /> : null}
      {!hero ? (
        <Card>
          <p>Nenhum passo de projeto ativo</p>
          <Link href="/app/fila" className="mt-3 inline-block text-sm underline">
            Ver a fila
          </Link>
        </Card>
      ) : (
        <Hero project={hero} {...stats(hero.id)} />
      )}
      {rest.map((project) => {
        const view = stats(project.id);
        const progress = progressCopy({ done: view.done, total: view.total, milestoneOn: project.next_milestone_on });
        return (
          <Card key={project.id} className="grid gap-2 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{project.title}</p>
              <div className="w-24">
                <ProgressBlock done={view.done} total={view.total} milestoneOn={project.next_milestone_on} compact />
              </div>
            </div>
            {view.current ? (
              <p className="text-sm text-suave">{view.current.title}</p>
            ) : progress.delivered ? (
              <p className="text-sm font-semibold text-oliva">Entregue</p>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/app/projetos/${project.id}`}>Quebrar em passos</Link>
              </Button>
            )}
          </Card>
        );
      })}
      {stalled ? <p className="text-sm text-suave">Sem movimento há 5 dias.</p> : null}
      <QuickIdeaForm />
    </div>
  );
}

function Hero({
  project,
  current,
  done,
  total,
  list,
}: {
  project: { id: string; title: string; next_milestone_on: string | null };
  current: TaskNode | null;
  done: number;
  total: number;
  list: TaskRow[];
}) {
  const progress = progressCopy({ done, total, milestoneOn: project.next_milestone_on });
  const doneWhen = list.find((task) => task.id === current?.id)?.done_when;
  return (
    <Card className="grid gap-4">
      <ProgressBlock done={done} total={total} milestoneOn={project.next_milestone_on} />
      {progress.delivered ? (
        <h2 className="font-serif text-4xl text-oliva">Entregue</h2>
      ) : current ? (
        <>
          <h2 className="font-serif text-4xl leading-tight">{current.title}</h2>
          {doneWhen ? (
            <p className="text-sm">
              <span className="text-suave">Pronto quando: </span>
              {doneWhen}
            </p>
          ) : null}
          <FocusTimer />
          <TodayActions stepId={current.id} projectId={project.id} />
          <StuckFlow projectId={project.id} />
        </>
      ) : (
        <>
          <h2 className="font-serif text-3xl">{project.title}</h2>
          <Button asChild>
            <Link href={`/app/projetos/${project.id}`}>Quebrar em passos</Link>
          </Button>
        </>
      )}
    </Card>
  );
}
