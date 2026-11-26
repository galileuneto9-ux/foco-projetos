import Link from "next/link";
import { effectiveBoardFlag } from "@/domain/rules";
import { formatDatePt, todayInSaoPaulo } from "@/domain/time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FLAG_LABEL } from "@/lib/labels";
import type { BoardFlag } from "@/domain/types";
import { requireMember } from "@/server/session";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ dono?: string; bandeira?: string }>;
}) {
  const params = await searchParams;
  const { supabase, member } = await requireMember();
  if (!member) return null;
  const today = todayInSaoPaulo();
  const { data: members } = await supabase.from("team_members").select("user_id, display_name").eq("team_id", member.team_id);
  const names = new Map((members ?? []).map((row) => [row.user_id, row.display_name]));
  let query = supabase
    .from("projects")
    .select("id, title, owner_id, board_flag, status, next_milestone, next_milestone_on, visibility")
    .eq("team_id", member.team_id)
    .eq("visibility", "compartilhado")
    .order("title");
  if (params.dono) query = query.eq("owner_id", params.dono);
  const { data: projects } = await query;
  const cards = (projects ?? [])
    .map((project) => ({
      ...project,
      flag: effectiveBoardFlag({
        boardFlag: project.board_flag,
        status: project.status,
        nextMilestoneOn: project.next_milestone_on,
        today,
      }),
    }))
    .filter((project) => !params.bandeira || project.flag === params.bandeira);

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
      <form className="grid grid-cols-2 gap-2" method="get">
        <label className="grid gap-1 text-sm">
          Dono
          <select name="dono" defaultValue={params.dono ?? ""} className="min-h-11 rounded-xl border border-border bg-card px-2">
            <option value="">Todos</option>
            {(members ?? []).map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Bandeira
          <select name="bandeira" defaultValue={params.bandeira ?? ""} className="min-h-11 rounded-xl border border-border bg-card px-2">
            <option value="">Todas</option>
            <option value="no_prazo">No prazo</option>
            <option value="atrasado">Atrasado</option>
            <option value="travado">Travado</option>
          </select>
        </label>
        <button type="submit" className="col-span-2 min-h-11 rounded-xl bg-muted">
          Filtrar
        </button>
      </form>
      {cards.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum projeto compartilhado com esse filtro.</p> : null}
      {cards.map((project) => (
        <Card key={project.id} className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-2xl">{project.title}</h2>
            <Badge tone={project.flag === "atrasado" ? "late" : project.flag === "travado" ? "stuck" : "ok"}>
              {FLAG_LABEL[project.flag as BoardFlag]}
            </Badge>
          </div>
          <p className="text-sm">{names.get(project.owner_id) ?? "Alguém do time"}</p>
          <p className="text-sm text-muted-foreground">{project.next_milestone || "Sem marco"}</p>
          <p className="text-sm">{project.next_milestone_on ? formatDatePt(project.next_milestone_on) : "Sem data"}</p>
        </Card>
      ))}
    </div>
  );
}
