"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { manualStepSchema, noteSchema, projectSchema, quickIdeaSchema } from "@/domain/schemas";
import type { StepDraft } from "@/domain/types";
import {
  addManualStep,
  addNote,
  createProject,
  createQuickIdea,
  markOnTrack,
  markStuck,
  saveSteps,
  setCurrentStep,
  suggestSteps,
  updateProject,
} from "@/server/actions/projects";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-sm text-primary">{text}</p>;
}

export function QuickIdeaForm() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(quickIdeaSchema), defaultValues: { title: "" } });
  return (
    <form
      className="grid gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await createQuickIdea(values);
        setMessage(result.message);
        if (result.ok) form.reset();
      })}
    >
      <Field label="Ideia nova" htmlFor="idea" error={form.formState.errors.title?.message} hint="Entra na fila. Não fica ativa sozinha.">
        <Input id="idea" placeholder="O que você quer terminar?" {...form.register("title")} />
      </Field>
      <Button type="submit" variant="secondary">
        Guardar na fila
      </Button>
      <Message text={message} />
    </form>
  );
}

export function ProjectEditor({
  projectId,
  values,
}: {
  projectId?: string;
  values: {
    title: string;
    brief: string;
    visibility: "privado" | "compartilhado";
    nextMilestone: string;
    nextMilestoneOn: string;
    chargeOn: string;
    priority: "importante" | "medio" | "baixo";
    dueDate: string;
  };
}) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(projectSchema), defaultValues: values });
  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (input) => {
        const result = projectId ? await updateProject(projectId, input) : await createProject(input);
        if (result && !result.ok) setMessage(result.message);
        if (result && result.ok) setMessage(result.message);
      })}
    >
      <Field label="Título" htmlFor="title" error={form.formState.errors.title?.message}>
        <Input id="title" {...form.register("title")} />
      </Field>
      <Field label="Ideia solta" htmlFor="brief" error={form.formState.errors.brief?.message}>
        <Textarea id="brief" {...form.register("brief")} />
      </Field>
      <Field label="Prioridade" htmlFor="priority">
        <select id="priority" className="min-h-11 w-full rounded-xl border border-border bg-card px-3" {...form.register("priority")}>
          <option value="importante">Importante</option>
          <option value="medio">Médio</option>
          <option value="baixo">Baixo</option>
        </select>
      </Field>
      <Field label="Prazo" htmlFor="dueDate" hint="Se ficar vazio, o projeto aparece como sem prazo.">
        <Input id="dueDate" type="date" {...form.register("dueDate")} />
      </Field>
      <Field label="Quem vê" htmlFor="visibility">
        <select id="visibility" className="min-h-11 w-full rounded-xl border border-border bg-card px-3" {...form.register("visibility")}>
          <option value="privado">Privado</option>
          <option value="compartilhado">Compartilhado com o time</option>
        </select>
      </Field>
      <Field label="Próximo marco" htmlFor="nextMilestone" hint="É isto que o quadro do time mostra, se estiver compartilhado.">
        <Input id="nextMilestone" {...form.register("nextMilestone")} />
      </Field>
      <Field label="Data do marco" htmlFor="nextMilestoneOn">
        <Input id="nextMilestoneOn" type="date" {...form.register("nextMilestoneOn")} />
      </Field>
      <Field label="Cobrar em" htmlFor="chargeOn" hint="No quadro, só aparece se o projeto estiver compartilhado.">
        <Input id="chargeOn" type="date" {...form.register("chargeOn")} />
      </Field>
      <Message text={message} />
      <Button type="submit" size="block">
        Salvar
      </Button>
    </form>
  );
}

export function BreakSteps({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<StepDraft[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="grid gap-3">
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          setPending(true);
          const result = await suggestSteps(projectId);
          setPending(false);
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          setSteps(result.steps);
          setMessage("Nada foi gravado ainda. Edite e confirme.");
        }}
        disabled={pending}
      >
        Quebrar em passos
      </Button>
      {steps ? (
        <div className="grid gap-3">
          {steps.map((step, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-border p-3">
              <Input
                aria-label={`Título do passo ${index + 1}`}
                value={step.title}
                onChange={(event) =>
                  setSteps(steps.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)))
                }
              />
              <Textarea
                aria-label={`Pronto quando ${index + 1}`}
                value={step.doneWhen}
                onChange={(event) =>
                  setSteps(steps.map((item, itemIndex) => (itemIndex === index ? { ...item, doneWhen: event.target.value } : item)))
                }
              />
              <Input
                aria-label={`Minutos ${index + 1}`}
                type="number"
                min={5}
                max={25}
                value={step.minutes}
                onChange={(event) =>
                  setSteps(
                    steps.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, minutes: Number(event.target.value) } : item,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            onClick={async () => {
              const result = await saveSteps(projectId, steps);
              setMessage(result.message);
              if (result.ok) setSteps(null);
            }}
          >
            Confirmar passos
          </Button>
        </div>
      ) : null}
      <Message text={message} />
    </div>
  );
}

export function ManualStepForm({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(manualStepSchema),
    defaultValues: { title: "", doneWhen: "", minutes: 20 },
  });
  return (
    <form
      className="grid gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await addManualStep(projectId, values);
        setMessage(result.message);
        if (result.ok) form.reset({ title: "", doneWhen: "", minutes: 20 });
      })}
    >
      <Field label="Passo na mão" htmlFor="step-title" error={form.formState.errors.title?.message}>
        <Input id="step-title" {...form.register("title")} />
      </Field>
      <Field label="Pronto quando" htmlFor="done" error={form.formState.errors.doneWhen?.message}>
        <Textarea id="done" {...form.register("doneWhen")} />
      </Field>
      <Field label="Minutos" htmlFor="minutes" error={form.formState.errors.minutes?.message}>
        <Input id="minutes" type="number" min={5} max={25} {...form.register("minutes")} />
      </Field>
      <Button type="submit" variant="outline">
        Adicionar passo
      </Button>
      <Message text={message} />
    </form>
  );
}

export function StepActions({ projectId, stepId, isCurrent }: { projectId: string; stepId: string; isCurrent: boolean }) {
  if (isCurrent) return null;
  return (
    <Button type="button" variant="ghost" onClick={() => setCurrentStep(stepId, projectId)}>
      Definir como passo atual
    </Button>
  );
}

export function NoteForm({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(noteSchema), defaultValues: { body: "" } });
  return (
    <form
      className="grid gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await addNote(projectId, values);
        setMessage(result.message);
        if (result.ok) form.reset();
      })}
    >
      <Field label="Nota privada" htmlFor="note" error={form.formState.errors.body?.message}>
        <Textarea id="note" {...form.register("body")} />
      </Field>
      <Button type="submit" variant="outline">
        Guardar nota
      </Button>
      <Message text={message} />
    </form>
  );
}

export function FlagButtons({ projectId, flag }: { projectId: string; flag: string }) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant={flag === "travado" ? "default" : "outline"} onClick={() => markStuck(projectId)}>
        Estou travado
      </Button>
      {flag === "travado" ? (
        <Button type="button" variant="ghost" onClick={() => markOnTrack(projectId)}>
          Voltar ao prazo
        </Button>
      ) : null}
    </div>
  );
}
