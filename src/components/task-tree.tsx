"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { visualOrder, type Priority, type TaskNode, type TaskVisibility } from "@/domain/redesign";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLooseTask,
  createProjectTask,
  deleteTask,
  indentTaskAction,
  insertSibling,
  moveTaskAction,
  outdentTaskAction,
  renameTask,
  toggleTask,
  updateLooseTask,
} from "@/server/actions/tasks";

export function TaskTree({
  tasks,
  projectId,
  canEdit,
}: {
  tasks: TaskNode[];
  projectId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [snapshot, setSnapshot] = useState(signature(tasks));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const incoming = signature(tasks);
  if (incoming !== snapshot) {
    setSnapshot(incoming);
    setItems(tasks);
  }
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`task-title-${focusId}`)?.focus();
  }, [focusId]);

  const ordered = visualOrder(items);

  async function onKey(event: React.KeyboardEvent<HTMLInputElement>, task: TaskNode) {
    if (!canEdit) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const title = event.currentTarget.value;
      const saved = await renameTask(task.id, title);
      if (!saved.ok) {
        setMessage(saved.message);
        return;
      }
      const created = await insertSibling(task.id);
      if (!created.ok) {
        setMessage(created.message);
        return;
      }
      setItems((current) => [
        ...current.map((item) => (item.id === task.id ? { ...item, title } : item)),
        { id: created.id, parentId: task.parentId, position: task.position + 1, status: "aberta", title: "Nova tarefa" },
      ]);
      setFocusId(created.id);
      router.refresh();
    }
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const result = await indentTaskAction(task.id);
      setMessage(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    }
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      const result = await outdentTaskAction(task.id);
      setMessage(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.altKey) {
      event.preventDefault();
      const result = await moveTaskAction(task.id, event.key === "ArrowUp" ? -1 : 1);
      setMessage(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    }
    if (event.key === "Backspace" && event.currentTarget.value === "") {
      event.preventDefault();
      const index = ordered.findIndex((item) => item.id === task.id);
      const previous = ordered[index - 1];
      const result = await deleteTask(task.id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setItems((current) => current.filter((item) => item.id !== task.id && item.parentId !== task.id));
      if (previous) setFocusId(previous.id);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-2">
      <ol className="grid">
        {ordered.map((task) => (
          <li key={task.id} className="grid gap-2 py-1" style={{ paddingLeft: task.parentId ? 24 : 0 }}>
            <div className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={task.status === "feita"}
              disabled={!canEdit || task.status === "pulada"}
              aria-label={`Concluir ${task.title}`}
              onChange={async (event) => {
                const done = event.target.checked;
                setItems((current) => current.map((item) => (item.id === task.id ? { ...item, status: done ? "feita" : "aberta" } : item)));
                const result = await toggleTask(task.id, done);
                if (!result.ok) setMessage(result.message);
                else router.refresh();
              }}
            />
            <input
              id={`task-title-${task.id}`}
              className="min-h-11 w-full bg-transparent outline-none"
              defaultValue={task.title}
              disabled={!canEdit}
              aria-label={`Título de ${task.title}`}
              onBlur={async (event) => {
                if (!canEdit || event.target.value === task.title) return;
                const result = await renameTask(task.id, event.target.value);
                if (!result.ok) setMessage(result.message);
              }}
              onKeyDown={(event) => onKey(event, task)}
            />
            </div>
            {task.visibility === "privado" || task.visibility === "compartilhado" ? (
              <LooseSettings
                task={task}
                disabled={!canEdit || !task.canTune}
                onError={setMessage}
                onSaved={(priority, visibility) => {
                  setItems((current) => current.map((item) => (item.id === task.id ? { ...item, priority, visibility } : item)));
                  router.refresh();
                }}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {canEdit && projectId ? (
        <button
          type="button"
          className="min-h-11 text-left text-sm text-suave"
          onClick={async () => {
            const result = await createProjectTask(projectId);
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            setItems((current) => [
              ...current,
              {
                id: result.id,
                parentId: null,
                position: result.position,
                status: "aberta",
                title: "Nova tarefa",
              },
            ]);
            setFocusId(result.id);
            router.refresh();
          }}
        >
          Nova tarefa
        </button>
      ) : null}
      {message ? <p className="text-sm text-suave">{message}</p> : null}
    </div>
  );
}

export function TaskCheck({ id, done, disabled }: { id: string; done: boolean; disabled: boolean }) {
  const router = useRouter();
  return (
    <input
      type="checkbox"
      className="h-5 w-5"
      checked={done}
      disabled={disabled}
      aria-label="Concluir tarefa"
      onChange={async (event) => {
        await toggleTask(id, event.target.checked);
        router.refresh();
      }}
    />
  );
}

const selectClass = "min-h-11 rounded-xl border border-border bg-card px-3";

export function LooseTaskForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medio");
  const [visibility, setVisibility] = useState<TaskVisibility>("privado");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mb-4 grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await createLooseTask({ title, priority, visibility });
        setPending(false);
        if (!result.ok) {
          setMessage({ text: result.message, ok: false });
          return;
        }
        setTitle("");
        setPriority("medio");
        setVisibility("privado");
        setMessage({ text: "Tarefa criada.", ok: true });
        router.refresh();
      }}
    >
      <Field label="Nova tarefa" htmlFor="loose-title">
        <Input id="loose-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="O que você quer terminar?" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prioridade" htmlFor="loose-priority">
          <PrioritySelect id="loose-priority" value={priority} onChange={setPriority} />
        </Field>
        <Field label="Quem vê" htmlFor="loose-visibility" hint="Compartilhada entra no placar do time. Privada fica só com você.">
          <VisibilitySelect id="loose-visibility" value={visibility} onChange={setVisibility} />
        </Field>
      </div>
      {message ? <p className={message.ok ? "text-sm text-suave" : "text-sm text-destructive"}>{message.text}</p> : null}
      <Button type="submit" disabled={pending}>
        Nova tarefa
      </Button>
    </form>
  );
}

function LooseSettings({
  task,
  disabled,
  onError,
  onSaved,
}: {
  task: TaskNode;
  disabled: boolean;
  onError: (message: string) => void;
  onSaved: (priority: Priority, visibility: TaskVisibility) => void;
}) {
  const priority = task.priority === "importante" || task.priority === "baixo" ? task.priority : "medio";
  const visibility = task.visibility === "compartilhado" ? "compartilhado" : "privado";
  return (
    <div className="flex flex-wrap gap-2">
      <PrioritySelect
        id={`priority-${task.id}`}
        value={priority}
        disabled={disabled}
        labelledByTitle={task.title}
        onChange={async (next) => {
          const result = await updateLooseTask(task.id, { priority: next, visibility });
          if (!result.ok) onError(result.message);
          else onSaved(next, visibility);
        }}
      />
      <VisibilitySelect
        id={`visibility-${task.id}`}
        value={visibility}
        disabled={disabled}
        labelledByTitle={task.title}
        onChange={async (next) => {
          const result = await updateLooseTask(task.id, { priority, visibility: next });
          if (!result.ok) onError(result.message);
          else onSaved(priority, next);
        }}
      />
    </div>
  );
}

function PrioritySelect({
  id,
  value,
  onChange,
  disabled,
  labelledByTitle,
}: {
  id: string;
  value: Priority;
  onChange: (value: Priority) => void;
  disabled?: boolean;
  labelledByTitle?: string;
}) {
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      disabled={disabled}
      aria-label={labelledByTitle ? `Prioridade de ${labelledByTitle}` : "Prioridade"}
      onChange={(event) => onChange(event.target.value as Priority)}
    >
      <option value="importante">Importante</option>
      <option value="medio">Médio</option>
      <option value="baixo">Baixo</option>
    </select>
  );
}

function VisibilitySelect({
  id,
  value,
  onChange,
  disabled,
  labelledByTitle,
}: {
  id: string;
  value: TaskVisibility;
  onChange: (value: TaskVisibility) => void;
  disabled?: boolean;
  labelledByTitle?: string;
}) {
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      disabled={disabled}
      aria-label={labelledByTitle ? `Visibilidade de ${labelledByTitle}` : "Quem vê"}
      onChange={(event) => onChange(event.target.value as TaskVisibility)}
    >
      <option value="privado">Privada</option>
      <option value="compartilhado">Compartilhada com o time</option>
    </select>
  );
}

function signature(tasks: TaskNode[]) {
  return tasks
    .map((task) => `${task.id}:${task.parentId}:${task.position}:${task.status}:${task.title}:${task.priority ?? ""}:${task.visibility ?? ""}:${task.canTune ? 1 : 0}`)
    .join("|");
}
