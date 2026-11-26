import { WeeklyForm } from "@/components/checkin-form";
import { weekStartSaoPaulo } from "@/domain/time";
import { requireMember } from "@/server/session";

export default async function WeeklyPage() {
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const week = weekStartSaoPaulo(new Date());
  const { data } = await supabase
    .from("checkins")
    .select("answer_text")
    .eq("user_id", user.id)
    .eq("kind", "semanal")
    .eq("for_date", week)
    .maybeSingle();
  const text = data?.answer_text ?? "";
  const andou = text.match(/Andou:\s*([\s\S]*?)(?:\nTravou:|$)/)?.[1]?.trim() ?? "";
  const travou = text.match(/Travou:\s*([\s\S]*)$/)?.[1]?.trim() ?? "";
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-serif text-3xl">Check-in</h1>
        <p className="text-sm text-muted-foreground">Um minuto. O resumo vai para quem criou o time.</p>
      </div>
      <WeeklyForm andou={andou} travou={travou} />
    </div>
  );
}
