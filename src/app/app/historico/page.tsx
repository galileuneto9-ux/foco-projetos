import { formatDatePt } from "@/domain/time";
import { requireMember } from "@/server/session";

export default async function HistoryPage() {
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const { data: deliveries } = await supabase
    .from("deliveries")
    .select("id, title, completed_at, project_id")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false });
  const projectIds = [...new Set((deliveries ?? []).map((row) => row.project_id))];
  const { data: projects } = projectIds.length
    ? await supabase.from("projects").select("id, title").in("id", projectIds)
    : { data: [] };
  const titles = new Map((projects ?? []).map((project) => [project.id, project.title]));
  const groups = new Map<string, { id: string; title: string; project: string }[]>();
  for (const delivery of deliveries ?? []) {
    const day = String(delivery.completed_at).slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push({ id: delivery.id, title: delivery.title, project: titles.get(delivery.project_id) ?? "Projeto" });
    groups.set(day, list);
  }
  return (
    <div className="grid gap-5">
      <h1 className="font-serif text-3xl">Histórico</h1>
      {groups.size === 0 ? <p className="text-sm text-muted-foreground">Quando um passo for concluído, ele aparece aqui.</p> : null}
      {[...groups.entries()].map(([day, items]) => (
        <section key={day} className="grid gap-2">
          <h2 className="text-sm text-muted-foreground">{formatDatePt(day)}</h2>
          {items.map((item) => (
            <p key={item.id}>
              <span className="font-medium">{item.title}</span>
              <span className="text-muted-foreground"> · {item.project}</span>
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
