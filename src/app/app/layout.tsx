import { BottomNav } from "@/components/bottom-nav";
import { CreateTeamForm } from "@/components/auth-forms";
import { teamFormDefaults } from "@/server/auth-messages";
import { requireMember } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, member, team } = await requireMember();
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
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <header className="flex items-baseline justify-between px-4 pt-5">
        <p className="font-serif text-2xl text-primary">Foco</p>
        <p className="text-sm text-muted-foreground">{team.name}</p>
      </header>
      <main className="px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
