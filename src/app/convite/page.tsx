import { AcceptInviteForm } from "@/components/auth-forms";
import { PublicShell } from "@/components/public-shell";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Entrar no time</h1>
      <p className="mt-2 text-sm text-muted-foreground">Escolha sua senha. Quem já tem conta não entra por convite nesta versão.</p>
      <div className="mt-6">{token ? <AcceptInviteForm token={token} /> : <p>Falta o convite neste link.</p>}</div>
    </PublicShell>
  );
}
