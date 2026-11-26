import { RefreshSummaryButton } from "@/components/checkin-form";
import { requireMember } from "@/server/session";

export default async function SummaryPage() {
  const { supabase, member } = await requireMember();
  if (!member) return null;
  if (member.role !== "owner") {
    return (
      <div className="grid gap-3">
        <h1 className="font-serif text-3xl">Resumo</h1>
        <p>O resumo da semana fica com quem criou o time.</p>
      </div>
    );
  }
  const { data: summaries } = await supabase
    .from("weekly_summaries")
    .select("week_start, body, generated_at")
    .eq("team_id", member.team_id)
    .order("week_start", { ascending: false })
    .limit(4);
  return (
    <div className="grid gap-5">
      <h1 className="font-serif text-3xl">Resumo</h1>
      <RefreshSummaryButton />
      {(summaries ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há resumo.</p> : null}
      {(summaries ?? []).map((summary) => (
        <pre key={summary.week_start} className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 font-sans text-sm">
          {summary.body}
        </pre>
      ))}
    </div>
  );
}
