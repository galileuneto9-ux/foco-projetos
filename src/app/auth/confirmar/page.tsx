import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export default function ConfirmPage() {
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Confirme o e-mail</h1>
      <p className="mt-3 text-muted-foreground">Abra o link que enviamos. Depois disso a conta entra no time que você nomeou.</p>
      <p className="mt-6">
        <Link href="/login" className="underline">
          Ir para o login
        </Link>
      </p>
    </PublicShell>
  );
}
