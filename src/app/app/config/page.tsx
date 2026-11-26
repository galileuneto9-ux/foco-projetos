import Link from "next/link";
import { ChannelForm, GoogleFakeForm, InviteForm, RemoveMemberButton, SignOutButton, TeamHoursForm, WhatsappPanel } from "@/components/config-forms";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/server/session";

export default async function ConfigPage() {
  const { supabase, member } = await requireMember();
  if (!member) return null;
  const { data: team } = await supabase.from("teams").select("*").eq("id", member.team_id).single();
  const { data: people } = await supabase.from("team_members").select("user_id, display_name, role").eq("team_id", member.team_id);
  const { data: connection } = member.role === "owner"
    ? await supabase.from("whatsapp_connection").select("status").eq("team_id", member.team_id).maybeSingle()
    : { data: null };
  const { data: google } = member.role === "owner"
    ? await supabase.from("google_oauth_connections").select("google_email").eq("team_id", member.team_id).maybeSingle()
    : { data: null };
  const fakeWhatsapp = (process.env.WHATSAPP_PROVIDER || "fake") !== "evolution";
  const fakeGoogle = (process.env.GOOGLE_CHAT_PROVIDER || "fake") !== "google";
  return (
    <div className="grid gap-5">
      <h1 className="font-serif text-3xl">Mais</h1>
      <Card className="grid gap-3">
        <h2 className="font-serif text-2xl">Cobrança</h2>
        <ChannelForm
          values={{
            displayName: member.display_name,
            notifyWhatsapp: member.notify_whatsapp,
            notifyGoogleChat: member.notify_google_chat,
            phone: member.whatsapp_e164 ?? "",
            optIn: Boolean(member.whatsapp_opted_in_at),
          }}
        />
        <Link href="/app/checkin/semanal" className="text-sm underline">
          Check-in da semana
        </Link>
      </Card>
      {member.role === "owner" && team ? (
        <Card className="grid gap-3">
          <h2 className="font-serif text-2xl">Horários do time</h2>
          <TeamHoursForm
            values={{
              morningHour: String(team.morning_hour).slice(0, 5),
              eveningHour: String(team.evening_hour).slice(0, 5),
              stallDays: team.stall_days,
              weeklyCheckinWeekday: team.weekly_checkin_weekday,
              weeklyCheckinHour: String(team.weekly_checkin_hour).slice(0, 5),
            }}
          />
        </Card>
      ) : null}
      {member.role === "owner" ? (
        <Card className="grid gap-3">
          <h2 className="font-serif text-2xl">WhatsApp do time</h2>
          <WhatsappPanel status={connection?.status ?? "disconnected"} fake={fakeWhatsapp} />
        </Card>
      ) : null}
      {member.role === "owner" ? (
        <Card className="grid gap-3">
          <h2 className="font-serif text-2xl">Google Chat</h2>
          <p className="text-sm text-muted-foreground">
            {google?.google_email ? `Conectado como ${google.google_email}.` : "Ainda sem conexão."} Os avisos do time saem em seu nome, só com o link.
          </p>
          {fakeGoogle ? <GoogleFakeForm /> : <a className="underline" href="/api/google/start">Conectar com Google</a>}
        </Card>
      ) : null}
      <Card className="grid gap-3">
        <h2 className="font-serif text-2xl">Equipe</h2>
        <ul className="grid gap-2">
          {(people ?? []).map((person) => (
            <li key={person.user_id} className="flex items-center justify-between gap-2">
              <span>
                {person.display_name} <span className="text-sm text-muted-foreground">{person.role === "owner" ? "cria o time" : "membro"}</span>
              </span>
              {member.role === "owner" && person.role !== "owner" ? (
                <RemoveMemberButton userId={person.user_id} name={person.display_name} />
              ) : null}
            </li>
          ))}
        </ul>
        {member.role === "owner" ? <InviteForm /> : <p className="text-sm text-muted-foreground">Quem cria o time é quem convida.</p>}
      </Card>
      <div className="flex gap-4 text-sm">
        <Link href="/termos" className="underline">Termos</Link>
        <Link href="/privacidade" className="underline">Privacidade</Link>
      </div>
      <SignOutButton />
    </div>
  );
}
