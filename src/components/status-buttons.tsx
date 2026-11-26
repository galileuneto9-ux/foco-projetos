"use client";

import { useState } from "react";
import { activateProject, setProjectStatus } from "@/server/actions/projects";
import { Button } from "@/components/ui/button";

export function StatusButtons({ projectId, status }: { projectId: string; status: string }) {
  const [message, setMessage] = useState<string | null>(null);
  async function run(task: Promise<{ ok: boolean; message?: string }>) {
    const result = await task;
    setMessage(result.message ?? (result.ok ? "Atualizado." : "Não foi possível."));
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "fila" || status === "pausado" ? (
          <Button type="button" onClick={() => run(activateProject(projectId))}>
            Subir para ativo
          </Button>
        ) : null}
        {status === "ativo" ? (
          <Button type="button" variant="outline" onClick={() => run(setProjectStatus(projectId, "pausado"))}>
            Pausar
          </Button>
        ) : null}
        {status === "ativo" || status === "pausado" ? (
          <Button type="button" variant="outline" onClick={() => run(setProjectStatus(projectId, "fila"))}>
            Devolver à fila
          </Button>
        ) : null}
        {status === "ativo" ? (
          <Button type="button" variant="secondary" onClick={() => run(setProjectStatus(projectId, "concluido"))}>
            Concluir
          </Button>
        ) : null}
        {status !== "desistido" && status !== "concluido" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!window.confirm("Desistir deste projeto? Ele sai da lista ativa.")) return;
              void run(setProjectStatus(projectId, "desistido"));
            }}
          >
            Desistir
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
