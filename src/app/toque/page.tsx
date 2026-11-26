import { commitTouch, inspectTouch } from "@/server/actions/touch";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  concluir: "Concluí",
  fiz: "Fiz",
  nao_fiz: "Não fiz",
  travado: "Travado",
};

export default async function TouchPage({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string }> }) {
  const params = await searchParams;
  if ("ok" in params && params.ok === "1") {
    return (
      <PublicShell>
        <h1 className="font-serif text-3xl">Registrado</h1>
        <p className="mt-3 text-muted-foreground">Pode fechar esta página.</p>
      </PublicShell>
    );
  }
  const t = params.t;
  const view = await inspectTouch(t ?? "");
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Confirmar</h1>
      {view.state === "ready" ? (
        <form action={commitTouch} className="mt-6 grid gap-3">
          <p>Registrar: {LABELS[view.action] ?? view.action}</p>
          <input type="hidden" name="token" value={t ?? ""} />
          <Button type="submit">Confirmar</Button>
        </form>
      ) : (
        <p className="mt-4 text-muted-foreground">
          {view.state === "used" ? "Este link já foi usado." : view.state === "expired" ? "Este link venceu." : "Link inválido."}
        </p>
      )}
    </PublicShell>
  );
}
