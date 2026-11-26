import Link from "next/link";
import { effectiveBoardFlag } from "@/domain/rules";
import { formatTodayLabel, todayInSaoPaulo } from "@/domain/time";
import { DailyCheck, TodayActions } from "@/components/today-actions";
import { QuickIdeaForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FLAG_LABEL } from "@/lib/labels";
import { requireMember } from "@/server/session";

export default async function TodayPage() {
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, board_flag, next_milestone_on")
    .eq("owner_id", user.id)
    .eq("status", "ativo")
    .order("position")
    .limit(3);
  const ids = (projects ?? []).map((project) => project.id);
  const { data: steps } = ids.length
    ? await supabase
        .from("project_steps")
        .select("id, project_id, title, done_when, minutes")
        .in("project_id", ids)
        .eq("status", "atual")
    : { data: [] };
  const { data: evening } = await supabase
    .from("checkins")
    .select("status")
    .eq("user_id", user.id)
    .eq("kind", "diario_noite")
    .eq("for_date", today)
    .maybeSingle();
  const stepByProject = new Map((steps ?? []).map((step) => [step.project_id, step]));
  const pendingCheck = (projects ?? []).length > 0 && evening?.status !== "respondido";

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-serif text-3xl">Hoje</h1>
        <p className="text-sm text-muted-foreground">{formatTodayLabel()}</p>
      </div>
      <DailyCheck pending={pendingCheck} />
      {(projects ?? []).length === 0 ? (
        <Card>
          <p>Nenhum projeto ativo. A fila guarda o que ainda não é a vez.</p>
          <Link href="/app/fila" className="mt-3 inline-block text-sm underline">
            Ver a fila
          </Link>
        </Card>
      ) : (
        (projects ?? []).map((project) => {
          const step = stepByProject.get(project.id);
          const flag = effectiveBoardFlag({
            boardFlag: project.board_flag,
            status: project.status,
            nextMilestoneOn: project.next_milestone_on,
            today,
          });
          return (
            <Card key={project.id} className="grid gap-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-2xl leading-tight">{step?.title ?? project.title}</h2>
                <Badge tone={flag === "atrasado" ? "late" : flag === "travado" ? "stuck" : "ok"}>{FLAG_LABEL[flag]}</Badge>
              </div>
              {step ? (
                <>
                  <p className="text-sm text-muted-foreground">Pronto quando: {step.done_when}</p>
                  <p className="text-sm">{step.minutes} min</p>
                  <TodayActions stepId={step.id} projectId={project.id} />
                </>
              ) : (
                <Link href={`/app/projetos/${project.id}`} className="min-h-11 text-sm underline">
                  Definir o próximo passo
                </Link>
              )}
            </Card>
          );
        })
      )}
      <QuickIdeaForm />
    </div>
  );
}
