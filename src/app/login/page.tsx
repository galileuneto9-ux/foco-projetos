import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";
import { PublicShell } from "@/components/public-shell";
import { PASSWORD_RESET_ENABLED } from "@/server/access";
import { LINK_EXPIRED_MESSAGE } from "@/server/auth-messages";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ aviso?: string; erro?: string }> }) {
  const params = await searchParams;
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Entrar</h1>
      {params.erro === "link_expirado" ? (
        <p className="mt-3 text-sm text-destructive">{LINK_EXPIRED_MESSAGE}</p>
      ) : null}
      {params.aviso === "config" ? (
        <p className="mt-3 text-sm text-destructive">O servidor ainda não tem a URL e a chave pública do Supabase.</p>
      ) : null}
      <div className="mt-6">
        <LoginForm />
      </div>
      {PASSWORD_RESET_ENABLED ? (
        <p className="mt-4 text-sm">
          <Link href="/esqueci-senha" className="underline">
            Esqueci a senha
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">O acesso é só por convite.</p>
      )}
    </PublicShell>
  );
}
