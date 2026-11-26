import { describe, expect, test } from "vitest";
import {
  addDays,
  focusProjectId,
  indentTask,
  memberStatusLine,
  nextOpenTask,
  outdentTask,
  panelCounts,
  pointsFor,
  scoreboard,
  sharedPoints,
  toggleDoesNotCascade,
  visualOrder,
  type TaskNode,
} from "@/domain/redesign";

const node = (id: string, position: number, parentId: string | null = null, status: TaskNode["status"] = "aberta"): TaskNode => ({
  id,
  parentId,
  position,
  status,
  title: id,
});

describe("pontos e painel", () => {
  test("escala cheia para projeto e avulsa, fração para tarefa de projeto", () => {
    expect(pointsFor("projeto", "importante")).toBe(30);
    expect(pointsFor("avulsa", "medio")).toBe(20);
    expect(pointsFor("avulsa", "baixo")).toBe(10);
    expect(pointsFor("tarefa_de_projeto", "importante")).toBe(3);
    expect(pointsFor("tarefa_de_projeto", "medio")).toBe(2);
    expect(pointsFor("tarefa_de_projeto", "baixo")).toBe(1);
    for (const kind of ["projeto", "avulsa", "tarefa_de_projeto"] as const) {
      for (const priority of ["importante", "medio", "baixo"] as const) {
        expect(pointsFor(kind, priority)).toBeGreaterThan(0);
      }
    }
  });

  test("contadores se sobrepõem e a vencer inclui o sétimo dia", () => {
    const today = "2026-11-26";
    const counts = panelCounts(
      [
        { status: "aberta", due: today },
        { status: "em_andamento", due: addDays(today, 6) },
        { status: "aberta", due: "2026-11-20" },
        { status: "aberta", due: null },
        { status: "feita", due: "2026-11-01" },
      ],
      today,
    );
    expect(counts).toEqual({ iniciadas: 4, aVencer: 2, vencidas: 1 });
  });

  test("placar ignora privado, outra semana e ordena por pontos e nome", () => {
    const totals = sharedPoints(
      [
        { userId: "a", points: 30, visibility: "privado", weekStart: "2026-11-23" },
        { userId: "a", points: 20, visibility: "compartilhado", weekStart: "2026-11-23" },
        { userId: "b", points: 10, visibility: "compartilhado", weekStart: "2026-11-16" },
        { userId: "c", points: 20, visibility: "compartilhado", weekStart: "2026-11-23" },
      ],
      "2026-11-23",
    );
    expect(totals.get("a")).toBe(20);
    expect(totals.has("b")).toBe(false);
    expect(
      scoreboard([
        { userId: "c", name: "Caio", points: 20 },
        { userId: "a", name: "Ana", points: 20 },
        { userId: "d", name: "Bia", points: 0 },
      ]).map((row) => row.name),
    ).toEqual(["Ana", "Caio", "Bia"]);
  });

  test("status do time só descreve o que foi passado", () => {
    expect(memberStatusLine([], "2026-11-26")).toBe("Disponível");
    expect(memberStatusLine([{ status: "aberta", due: "2026-11-26" }], "2026-11-26")).toBe("1 a vencer");
    expect(
      memberStatusLine(
        [
          { status: "aberta", due: null },
          { status: "em_andamento", due: null },
        ],
        "2026-11-26",
      ),
    ).toBe("2 em andamento");
    expect(memberStatusLine([{ status: "feita", due: "2026-11-01" }], "2026-11-26")).toBe("Disponível");
  });
});

describe("subtarefas", () => {
  test("a ordem visual entra no pai e depois nos filhos", () => {
    const order = visualOrder([node("b", 1), node("a", 0), node("a1", 0, "a"), node("b1", 0, "b")]).map((task) => task.id);
    expect(order).toEqual(["a", "a1", "b", "b1"]);
    expect(nextOpenTask([node("a", 0, null, "feita"), node("a1", 0, "a", "aberta"), node("b", 1)])?.id).toBe("a1");
  });

  test("tab aninha um nível e recusa o terceiro; shift+tab volta", () => {
    const tasks = [node("a", 0), node("b", 1), node("c", 2), node("b1", 0, "b")];
    expect(indentTask(tasks, "c")).toEqual({ ok: true, parentId: "b", position: 1 });
    expect(indentTask(tasks, "b").ok).toBe(false);
    expect(indentTask(tasks, "a").ok).toBe(false);
    expect(indentTask(tasks, "b1").ok).toBe(false);
    expect(outdentTask(tasks, "b1")).toEqual({ ok: true, position: 2 });
    expect(outdentTask(tasks, "a").ok).toBe(false);
  });

  test("checkbox do pai não mexe no filho e o do filho não mexe no pai", () => {
    expect(toggleDoesNotCascade("aberta", "aberta", "parent")).toEqual({ parent: "feita", child: "aberta" });
    expect(toggleDoesNotCascade("aberta", "aberta", "child")).toEqual({ parent: "aberta", child: "feita" });
  });

  test("o passo de hoje sai de projeto ativo, não de tarefa avulsa", () => {
    const id = focusProjectId(
      [
        { id: "fila", position: 0, status: "fila" },
        { id: "dois", position: 2, status: "ativo" },
        { id: "um", position: 1, status: "ativo" },
      ],
      [
        { projectId: null, status: "em_andamento" },
        { projectId: "dois", status: "em_andamento" },
      ],
    );
    expect(id).toBe("dois");
    expect(focusProjectId([{ id: "um", position: 1, status: "ativo" }], [])).toBe("um");
  });
});
