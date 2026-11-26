import Link from "next/link";
import { SignupForm } from "@/components/auth-forms";
import { PublicShell } from "@/components/public-shell";

export default function SignupPage() {
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
