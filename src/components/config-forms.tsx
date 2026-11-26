"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { channelSchema, inviteSchema, teamSettingsSchema } from "@/domain/schemas";
import { WEEKDAY_LABEL } from "@/lib/labels";
import {
  connectGoogleFake,
  inviteMember,
  removeMember,
  requestWhatsappQr,
  simulateWhatsappOpen,
  updateChannel,
  updateTeamSettings,
} from "@/server/actions/team";
import { signOut } from "@/server/actions/auth";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-sm text-primary">{text}</p>;
}

export function ChannelForm({
  values,
}: {
  values: {
    displayName: string;
    notifyWhatsapp: boolean;
    notifyGoogleChat: boolean;
    phone: string;
    optIn: boolean;
  };
}) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(channelSchema), defaultValues: values });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (input) => {
        const result = await updateChannel(input);
        setMessage(result.message);
      })}
    >
      <Field label="Como você aparece" htmlFor="displayName">
        <Input id="displayName" {...form.register("displayName")} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("notifyWhatsapp")} />
        Receber cobrança no WhatsApp
      </label>
      <Field label="Celular" htmlFor="phone" hint="Só o número, com DDD. Ex.: 11 98888-7777">
        <Input id="phone" inputMode="tel" {...form.register("phone")} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("optIn")} />
        Autorizo receber as cobranças deste time neste número
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("notifyGoogleChat")} />
        Receber avisos do time no Google Chat
      </label>
      <p className="text-xs text-muted-foreground">
        O aviso do time chega em nome de quem criou o time, sem o texto do seu passo. A resposta fica neste app.
      </p>
      <Message text={message} />
      <Button type="submit">Salvar cobrança</Button>
    </form>
  );
}

export function TeamHoursForm({
  values,
}: {
  values: {
    morningHour: string;
    eveningHour: string;
    stallDays: number;
    weeklyCheckinWeekday: number;
    weeklyCheckinHour: string;
  };
}) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(teamSettingsSchema), defaultValues: values });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (input) => setMessage((await updateTeamSettings(input)).message))}
    >
      <Field label="Manhã" htmlFor="morningHour">
        <Input id="morningHour" type="time" {...form.register("morningHour")} />
      </Field>
      <Field label="Fim do dia" htmlFor="eveningHour">
        <Input id="eveningHour" type="time" {...form.register("eveningHour")} />
      </Field>
      <Field label="Dias parado" htmlFor="stallDays">
        <Input id="stallDays" type="number" min={1} max={30} {...form.register("stallDays")} />
      </Field>
      <Field label="Dia do check-in" htmlFor="weekly">
        <select id="weekly" className="min-h-11 w-full rounded-xl border border-border bg-card px-3" {...form.register("weeklyCheckinWeekday")}>
          {WEEKDAY_LABEL.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Hora do check-in" htmlFor="weeklyHour">
        <Input id="weeklyHour" type="time" {...form.register("weeklyCheckinHour")} />
      </Field>
      <Message text={message} />
      <Button type="submit" variant="secondary">
        Salvar horários
      </Button>
    </form>
  );
}

export function InviteForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { email: "" } });
  return (
    <form
      className="grid gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await inviteMember(values);
        setMessage(result.message);
        setLink("link" in result ? result.link ?? null : null);
      })}
    >
      <Field label="E-mail de quem entra" htmlFor="invite-email">
        <Input id="invite-email" type="email" {...form.register("email")} />
      </Field>
      <Button type="submit">Convidar</Button>
      <Message text={message} />
      {link ? (
        <p className="break-all rounded-xl bg-muted p-3 text-sm">
          {link}
        </p>
      ) : null}
    </form>
  );
}

export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={async () => {
        if (!window.confirm(`Remover ${name} do time?`)) return;
        await removeMember(userId);
      }}
    >
      Remover
    </Button>
  );
}

export function WhatsappPanel({ status, fake }: { status: string; fake: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Status: <strong>{status === "open" ? "conectado" : status === "qr" ? "aguardando QR" : status === "close" ? "desconectado" : "sem sessão"}</strong>
      </p>
      <p className="text-xs text-muted-foreground">
        Esta conexão usa o WhatsApp Web por uma API não oficial e pode bloquear o número. Use um chip secundário, não o pessoal nem o do trabalho.
      </p>
      <Button
        type="button"
        onClick={async () => {
          const result = await requestWhatsappQr();
          setMessage(result.ok ? result.message : result.message);
          setQr(result.ok ? result.qrDataUrl : null);
        }}
      >
        {status === "open" ? "Ver sessão" : "Pedir QR"}
      </Button>
      {qr ? (
        // QR vem em data URL gerado na hora; o otimizador de imagem não se aplica.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR para conectar o WhatsApp" className="h-56 w-56 rounded-xl border border-border bg-white p-2" />
      ) : null}
      {fake ? (
        <Button
          type="button"
          variant="outline"
          onClick={async () => setMessage((await simulateWhatsappOpen()).message)}
        >
          Simular aparelho conectado
        </Button>
      ) : null}
      <Message text={message} />
    </div>
  );
}

export function GoogleFakeForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage((await connectGoogleFake(email)).message);
      }}
    >
      <Field label="E-mail Google" htmlFor="google-email">
        <Input id="google-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Button type="submit" variant="secondary">
        Simular conexão do Google Chat
      </Button>
      <Message text={message} />
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        Sair
      </Button>
    </form>
  );
}
