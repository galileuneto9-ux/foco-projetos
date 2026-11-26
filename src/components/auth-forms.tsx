"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { acceptInviteSchema, loginSchema, signupSchema } from "@/domain/schemas";
import { acceptInvite, createTeam, requestPasswordReset, signIn, signUp } from "@/server/actions/auth";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded-xl bg-accent px-3 py-2 text-sm text-primary">{text}</p>;
}

export function LoginForm() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await signIn(values);
        if (result && !result.ok) setMessage(result.message);
      })}
    >
      <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <Message text={message} />
      <Button type="submit" size="block" disabled={form.formState.isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}

export function SignupForm() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: "", teamName: "", email: "", password: "" },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await signUp(values);
        if (result && !result.ok) setMessage(result.message);
        if (result && result.ok) setMessage(result.message);
      })}
    >
      <Field label="Seu nome" htmlFor="displayName" error={form.formState.errors.displayName?.message}>
        <Input id="displayName" autoComplete="name" {...form.register("displayName")} />
      </Field>
      <Field label="Nome do time" htmlFor="teamName" error={form.formState.errors.teamName?.message}>
        <Input id="teamName" {...form.register("teamName")} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={form.formState.errors.password?.message} hint="Pelo menos 10 caracteres.">
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Message text={message} />
      <Button type="submit" size="block" disabled={form.formState.isSubmitting}>
        Criar conta
      </Button>
    </form>
  );
}

export function ResetForm() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(loginSchema.pick({ email: true })), defaultValues: { email: "" } });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await requestPasswordReset(values);
        setMessage(result.message);
      })}
    >
      <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Message text={message} />
      <Button type="submit" size="block">
        Enviar link
      </Button>
    </form>
  );
}

export function CreateTeamForm({ displayName, teamName }: { displayName: string; teamName: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ defaultValues: { displayName, teamName } });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await createTeam(values);
        if (result && !result.ok) setMessage(result.message);
      })}
    >
      <Field label="Seu nome" htmlFor="displayName">
        <Input id="displayName" {...form.register("displayName")} />
      </Field>
      <Field label="Nome do time" htmlFor="teamName">
        <Input id="teamName" {...form.register("teamName")} />
      </Field>
      <Message text={message} />
      <Button type="submit" size="block">
        Criar time
      </Button>
    </form>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { token, displayName: "", password: "", confirm: "" },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await acceptInvite(values);
        if (result && !result.ok) setMessage(result.message);
      })}
    >
      <input type="hidden" {...form.register("token")} />
      <Field label="Seu nome" htmlFor="displayName" error={form.formState.errors.displayName?.message}>
        <Input id="displayName" {...form.register("displayName")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={form.formState.errors.password?.message} hint="Pelo menos 10 caracteres.">
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirmar senha" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Message text={message} />
      <Button type="submit" size="block">
        Entrar no time
      </Button>
    </form>
  );
}
