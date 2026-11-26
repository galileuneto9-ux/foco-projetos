export type TaskStatus = "aberta" | "em_andamento" | "feita" | "pulada";
export type Priority = "importante" | "medio" | "baixo";

export type TaskNode = {
  id: string;
  parentId: string | null;
  position: number;
  status: TaskStatus;
  title: string;
};

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${m}-${d}`;
}

export function panelCounts(tasks: { status: string; due: string | null }[], today: string) {
  const open = tasks.filter((task) => task.status === "aberta" || task.status === "em_andamento");
  const limit = addDays(today, 6);
  return {
    iniciadas: open.length,
    aVencer: open.filter((task) => task.due && task.due >= today && task.due <= limit).length,
    vencidas: open.filter((task) => task.due && task.due < today).length,
  };
}

export function visualOrder(tasks: TaskNode[]): TaskNode[] {
  const roots = tasks.filter((task) => !task.parentId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const ordered: TaskNode[] = [];
  for (const root of roots) {
    ordered.push(root);
    ordered.push(
      ...tasks
        .filter((task) => task.parentId === root.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    );
  }
  return ordered;
}

export function nextOpenTask(tasks: TaskNode[]): TaskNode | null {
  return visualOrder(tasks).find((task) => task.status === "aberta" || task.status === "em_andamento") ?? null;
}

export function pointsFor(kind: "avulsa" | "projeto" | "tarefa_de_projeto", priority: Priority): number {
  const scale = { importante: 30, medio: 20, baixo: 10 } as const;
  const full = scale[priority];
  return kind === "tarefa_de_projeto" ? full / 10 : full;
}

export function indentTask(tasks: TaskNode[], id: string): { ok: true; parentId: string; position: number } | { ok: false } {
  const task = tasks.find((item) => item.id === id);
  if (!task || task.parentId) return { ok: false };
  if (tasks.some((item) => item.parentId === id)) return { ok: false };
  const previous = tasks
    .filter((item) => item.parentId === null && item.position < task.position)
    .sort((a, b) => b.position - a.position)[0];
  if (!previous) return { ok: false };
  const childPositions = tasks.filter((item) => item.parentId === previous.id).map((item) => item.position);
  const position = childPositions.length ? Math.max(...childPositions) + 1 : 0;
  return { ok: true, parentId: previous.id, position };
}

export function outdentTask(tasks: TaskNode[], id: string): { ok: true; position: number } | { ok: false } {
  const task = tasks.find((item) => item.id === id);
  if (!task?.parentId) return { ok: false };
  const parent = tasks.find((item) => item.id === task.parentId);
  if (!parent) return { ok: false };
  return { ok: true, position: parent.position + 1 };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return letters || "?";
}

export function memberStatusLine(tasks: { due: string | null; status: string }[], today: string): string {
  const open = tasks.filter((task) => task.status === "aberta" || task.status === "em_andamento");
  if (open.length === 0) return "Disponível";
  const overdue = open.filter((task) => task.due && task.due < today).length;
  if (overdue === 1) return "1 vencida";
  if (overdue > 1) return `${overdue} vencidas`;
  const soon = open.filter((task) => task.due && task.due >= today && task.due <= addDays(today, 6)).length;
  if (soon === 1) return "1 a vencer";
  if (soon > 1) return `${soon} a vencer`;
  return open.length === 1 ? "1 em andamento" : `${open.length} em andamento`;
}

export function sharedPoints(
  events: { userId: string; points: number; visibility: string; weekStart: string }[],
  week: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (event.visibility !== "compartilhado" || event.weekStart !== week || event.points <= 0) continue;
    totals.set(event.userId, (totals.get(event.userId) ?? 0) + event.points);
  }
  return totals;
}

export function scoreboard<T extends { name: string; points: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "pt"));
}

export function focusProjectId(
  projects: { id: string; position: number; status: string }[],
  tasks: { projectId: string | null; status: string }[],
): string | null {
  const active = projects.filter((project) => project.status === "ativo").sort((a, b) => a.position - b.position);
  const current = active.find((project) => tasks.some((task) => task.projectId === project.id && task.status === "em_andamento"));
  return (current ?? active[0])?.id ?? null;
}

export function toggleDoesNotCascade(parentStatus: TaskStatus, childStatus: TaskStatus, toggled: "parent" | "child"): {
  parent: TaskStatus;
  child: TaskStatus;
} {
  if (toggled === "parent") return { parent: parentStatus === "feita" ? "aberta" : "feita", child: childStatus };
  return { parent: parentStatus, child: childStatus === "feita" ? "aberta" : "feita" };
}
