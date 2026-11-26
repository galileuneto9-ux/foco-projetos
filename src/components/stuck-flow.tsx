"use client";

import { useState } from "react";
import { acceptTinyStep, proposeTinyStep } from "@/server/actions/projects";
import type { StepDraft } from "@/domain/types";
import { Button } from "@/components/ui/button";

export function StuckFlow({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StepDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" onClick={() => { setOpen(true); setDraft(null); }}>
        Travado
      </Button>
      {open ? <p className="text-sm">Parece grande demais?</p> : null}
      {open && !draft ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const result = await proposeTinyStep(projectId);
              if (!result.ok) {
                setMessage(result.message);
                return;
              }
              setDraft(result.step);
            }}
          >
            Sim
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Não
          </Button>
        </div>
      ) : null}
      {draft ? (
        <div className="rounded-xl border border-border p-3 text-sm">
          <p className="font-medium">{draft.title}</p>
          <p className="text-muted-foreground">{draft.minutes} min · {draft.doneWhen}</p>
          <Button
            type="button"
            className="mt-2"
            onClick={async () => {
              const result = await acceptTinyStep(projectId, draft);
              setMessage(result.message);
              if (result.ok) {
                setDraft(null);
                setOpen(false);
              }
            }}
          >
            Trocar o passo atual
          </Button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
