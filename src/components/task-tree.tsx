"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { visualOrder, type TaskNode } from "@/domain/redesign";
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
          <li key={task.id} className="flex min-h-11 items-center gap-2" style={{ paddingLeft: task.parentId ? 24 : 0 }}>
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
          </li>
        ))}
      </ol>
      {canEdit ? (
        <button
          type="button"
          className="min-h-11 text-left text-sm text-suave"
          onClick={async () => {
            const result = projectId ? await createProjectTask(projectId) : await createLooseTask("Nova tarefa");
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            setItems((current) => [
              ...current,
              {
                id: result.id,
                parentId: null,
                position: "position" in result ? result.position : current.length,
                status: "aberta",
                title: "Nova tarefa",
              },
            ]);
            setFocusId(result.id);
            if (projectId) router.refresh();
            else router.push("/app/tarefas");
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

function signature(tasks: TaskNode[]) {
  return tasks.map((task) => `${task.id}:${task.parentId}:${task.position}:${task.status}:${task.title}`).join("|");
}
