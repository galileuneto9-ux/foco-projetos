import { PublicShell } from "@/components/public-shell";

export default function TermsPage() {
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Termos de uso</h1>
      <p className="mt-3 rounded-xl bg-[#f8e4d8] px-3 py-2 text-sm">Texto inicial. Precisa de revisão humana antes de uso com dados reais.</p>
      <div className="mt-4 grid gap-3 text-sm leading-relaxed text-muted-foreground">
        <p>O Foco é uma ferramenta pessoal para organizar poucos projetos e um quadro do time. Não é produto à venda e não promete resultado.</p>
        <p>A conexão de WhatsApp desta versão usa uma API não oficial. Isso pode violar os termos do WhatsApp e bloquear o número. Use um chip secundário.</p>
        <p>Quem cria o time convida as outras pessoas. Cada um escolhe o que fica privado e o que o time vê.</p>
      </div>
    </PublicShell>
  );
}
