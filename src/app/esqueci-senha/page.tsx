import Link from "next/link";
import { ResetForm } from "@/components/auth-forms";
import { PublicShell } from "@/components/public-shell";
import { PASSWORD_RESET_ENABLED } from "@/server/access";

export default function ForgotPage() {
  if (!PASSWORD_RESET_ENABLED) {
    return (
      <PublicShell>
        <h1 className="font-serif text-3xl">Recuperar senha</h1>
        <p className="mt-3 text-muted-foreground">A recuperação por e-mail está desligada. Peça outra senha a quem criou o time.</p>
        <p className="mt-6">
          <Link href="/login" className="underline">
            Entrar
          </Link>
        </p>
      </PublicShell>
    );
  }
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Nova senha</h1>
      <p className="mt-2 text-sm text-muted-foreground">Enviamos um link para o e-mail, se ele estiver cadastrado.</p>
      <div className="mt-6">
        <ResetForm />
      </div>
    </PublicShell>
  );
}
