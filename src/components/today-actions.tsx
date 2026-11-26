"use client";

import { useState } from "react";
import { completeStep, markStuck, skipStep } from "@/server/actions/projects";
import { answerDaily } from "@/server/actions/checkins";
import { Button } from "@/components/ui/button";

export function TodayActions({ stepId, projectId }: { stepId: string; projectId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          onClick={async () => {
            const result = await completeStep(stepId);
            setMessage(result.ok ? "Passo concluído." : result.message);
          }}
        >
          Concluí
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            const result = await skipStep(stepId);
            setMessage(result.ok ? "Passo pulado." : result.message);
          }}
        >
          Pular
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            const result = await markStuck(projectId);
            setMessage(result.ok ? "Marcado como travado." : result.message);
          }}
        >
          Travado
        </Button>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function DailyCheck({ pending }: { pending: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  if (!pending && !message) return null;
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      <p className="font-medium">Check do fim do dia</p>
      <p className="text-sm text-muted-foreground">Você fez o passo de hoje?</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["1", "Fiz"],
          ["2", "Não fiz"],
          ["3", "Travado"],
        ].map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            onClick={async () => {
              const result = await answerDaily(value);
              setMessage(result.message);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
