import Link from "next/link";
import { isStalled } from "@/domain/rules";
import { progressCopy, showEveningCheck } from "@/domain/focus";
import { formatTodayLabel, todayInSaoPaulo } from "@/domain/time";
import { DailyCheck, TodayActions } from "@/components/today-actions";
import { FocusTimer } from "@/components/focus-timer";
import { ProgressBlock } from "@/components/progress-bar";
import { StuckFlow } from "@/components/stuck-flow";
import { QuickIdeaForm } from "@/components/project-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/server/session";

type StepRow = {
  id: string;
  project_id: string;
  title: string;
  done_when: string;
  minutes: number;
  status: string;
};

export default async function TodayPage() {
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const now = new Date();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, board_flag, next_milestone_on, last_progress_at, activated_at")
    .eq("owner_id", user.id)
    .eq("status", "ativo")
    .order("position")
    .limit(3);
  const ids = (projects ?? []).map((project) => project.id);
  const { data: steps } = ids.length
    ? await supabase
        .from("project_steps")
        .select("id, project_id, title, done_when, minutes, status, position")
        .in("project_id", ids)
        .order("position")
    : { data: [] as StepRow[] };
  const { data: evening } = await supabase
    .from("checkins")
    .select("status")
    .eq("user_id", user.id)
    .eq("kind", "diario_noite")
    .eq("for_date", today)
    .maybeSingle();
  const byProject = new Map<string, StepRow[]>();
  for (const step of (steps ?? []) as StepRow[]) {
    const list = byProject.get(step.project_id) ?? [];
    list.push(step);
    byProject.set(step.project_id, list);
  }
  const pendingCheck = (projects ?? []).length > 0 && evening?.status !== "respondido" && showEveningCheck(now);
  const stalled = (projects ?? []).some((project) =>
    isStalled({
      status: project.status,
      lastProgressAt: project.last_progress_at,
      activatedAt: project.activated_at,
      now,
      stallDays: 5,
    }),
  );
  const [hero, ...rest] = projects ?? [];

  function stats(projectId: string) {
    const list = byProject.get(projectId) ?? [];
    const done = list.filter((step) => step.status === "feito" || step.status === "pulado").length;
    const current = list.find((step) => step.status === "atual") ?? null;
    return { list, done, current, total: list.length };
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-serif text-3xl">Hoje</h1>
        <p className="text-sm text-muted-foreground">{formatTodayLabel()}</p>
      </div>
      {!hero ? (
        <Card>
          <p>Nenhum projeto ativo. A fila guarda o que ainda não é a vez.</p>
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
              <p className="text-sm text-muted-foreground">{view.current.title}</p>
            ) : progress.delivered ? (
              <p className="text-sm font-semibold text-primary">Entregue</p>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/app/projetos/${project.id}`}>Quebrar em passos</Link>
              </Button>
            )}
          </Card>
        );
      })}
      {stalled ? <p className="text-sm text-muted-foreground">Sem movimento há 5 dias.</p> : null}
      {pendingCheck ? <DailyCheck pending /> : null}
      <QuickIdeaForm />
    </div>
  );
}

function Hero({
  project,
  current,
  done,
  total,
}: {
  project: { id: string; title: string; next_milestone_on: string | null };
  current: StepRow | null;
  done: number;
  total: number;
}) {
  const progress = progressCopy({ done, total, milestoneOn: project.next_milestone_on });
  return (
    <Card className="grid gap-4">
      <ProgressBlock done={done} total={total} milestoneOn={project.next_milestone_on} />
      {progress.delivered ? (
        <h2 className="font-serif text-4xl text-primary">Entregue</h2>
      ) : current ? (
        <>
          <h2 className="font-serif text-4xl leading-tight">{current.title}</h2>
          <p className="text-sm">
            <span className="text-muted-foreground">Pronto quando: </span>
            {current.done_when}
          </p>
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
