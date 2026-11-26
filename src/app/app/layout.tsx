import { AppShell } from "@/components/app-shell";
import { CreateTeamForm } from "@/components/auth-forms";
import { TeamColumn } from "@/components/team-column";
import { todayInSaoPaulo } from "@/domain/time";
import { teamFormDefaults } from "@/server/auth-messages";
import { requireMember } from "@/server/session";
import { loadTeamColumn } from "@/server/team-snapshot";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase, member, team } = await requireMember();
  if (!member || !team) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-serif text-3xl">Criar o time</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sua conta ainda não está em um time.</p>
        <div className="mt-6">
          <CreateTeamForm {...teamFormDefaults(user.user_metadata)} />
        </div>
      </main>
    );
  }
  const board = await loadTeamColumn(supabase, member.team_id, todayInSaoPaulo());
  return (
    <AppShell name={member.display_name} team={<TeamColumn people={board.people} ranked={board.ranked} />}>
      {children}
    </AppShell>
  );
}
