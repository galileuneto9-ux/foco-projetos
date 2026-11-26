import { ResetForm } from "@/components/auth-forms";
import { PublicShell } from "@/components/public-shell";

export default function ForgotPage() {
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
