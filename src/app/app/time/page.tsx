import Link from "next/link";
import { effectiveBoardFlag } from "@/domain/rules";
import { boardUrgency, dueToCharge, formatDayMonth, formatWeekDeliveries, urgencyRank, weekEndSaoPaulo } from "@/domain/focus";
import { todayInSaoPaulo, weekStartSaoPaulo } from "@/domain/time";
import { ChargeControls, CopyTextButton } from "@/components/charge-controls";
import { ProgressBlock } from "@/components/progress-bar";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/server/session";
import { loadTeamColumn } from "@/server/team-snapshot";
import { TeamColumn } from "@/components/team-column";
import type { BoardFlag } from "@/domain/types";
import type { Urgency } from "@/domain/focus";

const URGENCY_LABEL: Record<Urgency, string> = {
  verde: "No prazo",
  amarelo: "Nesta semana",
  vermelho: "Atrasado",
};

const URGENCY_CLASS: Record<Urgency, string> = {
  verde: "border-l-4 border-l-oliva bg-oliva-suave",
  amarelo: "border-l-4 border-l-ocre bg-ocre-suave",
  vermelho: "border-l-4 border-l-argila bg-argila-suave",
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ dono?: string; bandeira?: string }>;
}) {
  const params = await searchParams;
  const { supabase, member } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const now = new Date();
  const weekEnd = weekEndSaoPaulo(now);
  const weekStart = weekStartSaoPaulo(now);
  const { data: members } = await supabase.from("team_members").select("user_id, display_name").eq("team_id", member.team_id);
  const names = new Map((members ?? []).map((row) => [row.user_id, row.display_name]));
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, owner_id, board_flag, status, next_milestone, next_milestone_on, charge_on, visibility")
    .eq("team_id", member.team_id)
    .eq("visibility", "compartilhado");
  const ids = (projects ?? []).map((project) => project.id);
  const { data: steps } = ids.length
    ? await supabase.from("tasks").select("project_id, status").in("project_id", ids)
    : { data: [] };
  const counts = new Map<string, { done: number; total: number }>();
  for (const step of steps ?? []) {
    const current = counts.get(step.project_id) ?? { done: 0, total: 0 };
    current.total += 1;
    if (step.status === "feita" || step.status === "pulada") current.done += 1;
    counts.set(step.project_id, current);
  }
  const board = await loadTeamColumn(supabase, member.team_id, today);
  const cards = (projects ?? [])
    .map((project) => {
      const flag = effectiveBoardFlag({
        boardFlag: project.board_flag as BoardFlag,
        status: project.status,
        nextMilestoneOn: project.next_milestone_on,
        today,
      });
      const urgency = boardUrgency({ flag, milestoneOn: project.next_milestone_on, today, weekEnd });
      return { ...project, flag, urgency, ...(counts.get(project.id) ?? { done: 0, total: 0 }) };
    })
    .filter((project) => !params.dono || project.owner_id === params.dono)
    .filter((project) => !params.bandeira || project.urgency === params.bandeira)
    .sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency) || String(a.charge_on ?? "9").localeCompare(String(b.charge_on ?? "9")));
  const charges = dueToCharge(
    (projects ?? []).map((project) => ({
      ...project,
      chargeOn: project.charge_on,
      visibility: project.visibility,
    })),
    today,
  );
  const { data: deliveries } = ids.length
    ? await supabase
        .from("deliveries")
        .select("title, user_id, completed_at, project_id")
        .in("project_id", ids)
        .gte("completed_at", `${weekStart}T00:00:00.000Z`)
    : { data: [] };
  const deliveryLines = (deliveries ?? []).map((row) => ({
    ownerName: names.get(row.user_id) ?? "Alguém",
    title: row.title,
    on: String(row.completed_at).slice(0, 10),
  }));
  const summary = formatWeekDeliveries(deliveryLines);

  function chip(href: string, label: string, active: boolean) {
    return (
      <Link
        href={href}
        className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-serif text-3xl">Time</h1>
        {member.role === "owner" ? (
          <Link href="/app/time/resumo" className="text-sm underline">
            Resumo
          </Link>
        ) : null}
      </div>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Cobrar hoje</h2>
        {charges.length === 0 ? <p className="text-sm text-muted-foreground">Nada vencido hoje.</p> : null}
        {charges.map((project) => (
          <Card key={project.id} className="grid gap-2">
            <p className="font-medium">{names.get(project.owner_id) ?? "Alguém"}</p>
            <p className="text-sm text-muted-foreground">{project.next_milestone || project.title}</p>
            <ChargeControls projectId={project.id} />
          </Card>
        ))}
      </section>
      <div className="flex flex-wrap gap-2">
        {chip("/app/time", "Todos", !params.dono && !params.bandeira)}
        {(members ?? []).map((person) =>
          chip(`/app/time?dono=${person.user_id}`, person.display_name.slice(0, 1).toUpperCase(), params.dono === person.user_id),
        )}
        {chip("/app/time?bandeira=verde", "No prazo", params.bandeira === "verde")}
        {chip("/app/time?bandeira=amarelo", "Nesta semana", params.bandeira === "amarelo")}
        {chip("/app/time?bandeira=vermelho", "Atrasado", params.bandeira === "vermelho")}
      </div>
      {cards.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum projeto compartilhado com esse filtro.</p> : null}
      {cards.map((project) => (
        <Card key={project.id} className={`grid gap-2 ${URGENCY_CLASS[project.urgency]}`}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-2xl">{project.title}</h2>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {(names.get(project.owner_id) ?? "?").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <p className="text-sm">{URGENCY_LABEL[project.urgency]}</p>
          <p className="text-sm text-muted-foreground">{project.next_milestone || "Sem marco"}</p>
          {project.charge_on ? <p className="text-sm">Cobrar em {formatDayMonth(project.charge_on)}</p> : null}
          <ProgressBlock done={project.done} total={project.total} milestoneOn={project.next_milestone_on} compact />
        </Card>
      ))}
      <section className="grid gap-2 min-[1100px]:hidden">
        <TeamColumn people={board.people} ranked={board.ranked} />
      </section>
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">Tarefas avulsas</h2>
        {board.loose.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa avulsa compartilhada.</p> : null}
        {board.loose.map((task) => (
          <p key={task.id} className="text-sm">
            {task.title}
          </p>
        ))}
      </section>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Entregas da semana</h2>
        {deliveryLines.length === 0 ? <p className="text-sm text-muted-foreground">Nada concluído nesta semana.</p> : null}
        {deliveryLines.map((item, index) => (
          <p key={`${item.title}-${index}`} className="text-sm">
            {item.ownerName} · {item.title} · {formatDayMonth(item.on)}
          </p>
        ))}
        {summary ? <CopyTextButton text={summary} label="Copiar resumo" /> : null}
      </section>
    </div>
  );
}
