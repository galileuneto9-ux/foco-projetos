import Link from "next/link";
import { notFound } from "next/navigation";
import { progressCopy } from "@/domain/focus";
import { BreakSteps, FlagButtons, ManualStepForm, NoteForm, ProjectEditor, StepActions } from "@/components/project-forms";
import { ProgressBlock } from "@/components/progress-bar";
import { StatusButtons } from "@/components/status-buttons";
import { requireMember } from "@/server/session";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project || project.owner_id !== user.id) notFound();
  const { data: steps } = await supabase
    .from("project_steps")
    .select("id, title, done_when, minutes, status, position")
    .eq("project_id", id)
    .order("position");
  const { data: notes } = await supabase.from("project_notes").select("id, body, created_at").eq("project_id", id).order("created_at", { ascending: false });
  const done = (steps ?? []).filter((step) => step.status === "feito" || step.status === "pulado").length;
  const progress = progressCopy({ done, total: (steps ?? []).length, milestoneOn: project.next_milestone_on });
  return (
    <div className="grid gap-6">
      <Link href="/app/fila" className="text-sm underline">
        Voltar
      </Link>
      <h1 className="font-serif text-3xl">{progress.delivered ? "Entregue" : project.title}</h1>
      <ProgressBlock done={done} total={(steps ?? []).length} milestoneOn={project.next_milestone_on} />
      <StatusButtons projectId={project.id} status={project.status} />
      <FlagButtons projectId={project.id} flag={project.board_flag} />
      <ProjectEditor
        projectId={project.id}
        values={{
          title: project.title,
          brief: project.brief ?? "",
          visibility: project.visibility,
          nextMilestone: project.next_milestone ?? "",
          nextMilestoneOn: project.next_milestone_on ?? "",
          chargeOn: project.charge_on ?? "",
        }}
      />
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Passos</h2>
        {(steps ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Ainda sem passos.</p> : null}
        <ol className="grid gap-2">
          {(steps ?? []).map((step) => (
            <li key={step.id} className="rounded-xl border border-border bg-card p-3">
              <p className="font-medium">
                {step.title} <span className="text-sm text-muted-foreground">· {step.status} · {step.minutes} min</span>
              </p>
              <p className="text-sm text-muted-foreground">Pronto quando: {step.done_when}</p>
              {step.status === "pendente" || step.status === "atual" ? (
                <StepActions projectId={project.id} stepId={step.id} isCurrent={step.status === "atual"} />
              ) : null}
            </li>
          ))}
        </ol>
        <BreakSteps projectId={project.id} />
        <ManualStepForm projectId={project.id} />
      </section>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Notas</h2>
        {(notes ?? []).map((note) => (
          <p key={note.id} className="rounded-xl bg-muted p-3 text-sm">
            {note.body}
          </p>
        ))}
        <NoteForm projectId={project.id} />
      </section>
    </div>
  );
}
