import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <PublicShell>
      <h1 className="font-serif text-4xl leading-tight">Terminar o que você começou.</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        No máximo três projetos andando. O resto espera na fila. O time vê só o que você escolher compartilhar.
      </p>
      <div className="mt-8 grid gap-3">
        <Button asChild size="block">
          <Link href="/login">Entrar</Link>
        </Button>
        <Button asChild size="block" variant="outline">
          <Link href="/cadastro">Criar conta</Link>
        </Button>
      </div>
      <p className="mt-10 flex gap-4 text-sm text-muted-foreground">
        <Link href="/termos" className="underline">Termos</Link>
        <Link href="/privacidade" className="underline">Privacidade</Link>
      </p>
    </PublicShell>
  );
}
