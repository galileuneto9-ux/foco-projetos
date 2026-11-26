import { NewPasswordForm } from "@/components/new-password-form";
import { PublicShell } from "@/components/public-shell";
import { requireUser } from "@/server/session";

export default async function NewPasswordPage() {
  await requireUser();
  return (
    <PublicShell>
      <h1 className="font-serif text-3xl">Nova senha</h1>
      <p className="mt-2 text-sm text-muted-foreground">Defina a senha desta conta. Depois você entra no app.</p>
      <div className="mt-6">
        <NewPasswordForm />
      </div>
    </PublicShell>
  );
}
