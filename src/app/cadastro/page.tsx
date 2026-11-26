import Link from "next/link";
import { SignupForm } from "@/components/auth-forms";
import { PublicShell } from "@/components/public-shell";
import { INVITE_ONLY_MESSAGE, OPEN_SIGNUP } from "@/server/access";

export default function SignupPage() {
  if (!OPEN_SIGNUP) {
    return (
      <PublicShell>
        <h1 className="font-serif text-3xl">{INVITE_ONLY_MESSAGE}</h1>
        <p className="mt-3 text-muted-foreground">Peça um convite a quem criou o time. A entrada é pelo link que essa pessoa enviar.</p>
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
      <h1 className="font-serif text-3xl">Criar conta</h1>
      <p className="mt-2 text-sm text-muted-foreground">O e-mail precisa ser confirmado antes de entrar.</p>
      <div className="mt-6">
        <SignupForm />
      </div>
      <p className="mt-4 text-sm">
        Já tem conta? <Link href="/login" className="underline">Entrar</Link>
      </p>
    </PublicShell>
  );
}
