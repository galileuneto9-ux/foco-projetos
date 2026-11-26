import { PublicShell } from "@/components/public-shell";

export default function PrivacyPage() {
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Privacidade</h1>
      <p className="mt-3 rounded-xl bg-[#f8e4d8] px-3 py-2 text-sm">Texto inicial. Precisa de revisão humana (LGPD) antes de uso com dados reais.</p>
      <div className="mt-4 grid gap-3 text-sm leading-relaxed text-muted-foreground">
        <p>Coletamos nome, e-mail, conteúdo dos projetos e check-ins, e telefone só se houver opt-in de WhatsApp.</p>
        <p>Projeto privado, passos, notas e check-in diário ficam com a pessoa dona. O quadro do time mostra só título, dono, bandeira, marco e data do que for compartilhado.</p>
        <p>A cobrança com o texto do passo vai no WhatsApp da própria pessoa, nunca num aviso do Google Chat. Pedido de exportação ou exclusão do time é manual nesta versão.</p>
      </div>
    </PublicShell>
  );
}
