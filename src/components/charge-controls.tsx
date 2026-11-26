"use client";

import { useState } from "react";
import { markCharged, prepareCharge } from "@/server/actions/charges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChargeControls({ projectId }: { projectId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [nextOn, setNextOn] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            const result = await prepareCharge(projectId);
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            setText(result.text);
            await navigator.clipboard.writeText(result.text).catch(() => undefined);
            setMessage(result.message);
          }}
        >
          Cobrar
        </Button>
        <Input type="date" aria-label="Próxima data" value={nextOn} onChange={(event) => setNextOn(event.target.value)} />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => setMessage((await markCharged(projectId, nextOn)).message)}
        >
          Cobrei
        </Button>
      </div>
      {text ? <p className="text-sm">{text}</p> : null}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
      }}
    >
      {done ? "Copiado" : label}
    </Button>
  );
}
