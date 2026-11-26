"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { weeklyCheckinSchema } from "@/domain/schemas";
import { refreshWeeklySummary, saveWeeklyCheckin } from "@/server/actions/checkins";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function WeeklyForm({ andou, travou }: { andou: string; travou: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(weeklyCheckinSchema), defaultValues: { andou, travou } });
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => setMessage((await saveWeeklyCheckin(values)).message))}>
      <Field label="O que andou?" htmlFor="andou" error={form.formState.errors.andou?.message}>
        <Textarea id="andou" maxLength={400} {...form.register("andou")} />
      </Field>
      <Field label="O que travou?" htmlFor="travou" error={form.formState.errors.travou?.message}>
        <Textarea id="travou" maxLength={400} {...form.register("travou")} />
      </Field>
      {message ? <p className="text-sm text-primary">{message}</p> : null}
      <Button type="submit">Guardar check-in</Button>
    </form>
  );
}

export function RefreshSummaryButton() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" onClick={async () => setMessage((await refreshWeeklySummary()).message)}>
        Atualizar resumo desta semana
      </Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
