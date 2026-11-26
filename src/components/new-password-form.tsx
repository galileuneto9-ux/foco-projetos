"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { newPasswordSchema } from "@/domain/schemas";
import { updatePassword } from "@/server/actions/auth";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await updatePassword(values);
        if (result && !result.ok) setMessage(result.message);
      })}
    >
      <Field label="Nova senha" htmlFor="password" error={form.formState.errors.password?.message} hint="Pelo menos 10 caracteres.">
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirmar senha" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Button type="submit" size="block" disabled={form.formState.isSubmitting}>
        Salvar senha
      </Button>
    </form>
  );
}
