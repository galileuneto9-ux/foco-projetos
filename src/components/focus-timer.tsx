"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function FocusTimer() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const finished = seconds === 0;

  useEffect(() => {
    if (seconds === null || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => (value === null ? value : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  const label =
    seconds === null ? "" : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="grid gap-2">
      {seconds === null ? (
        <Button type="button" size="block" onClick={() => setSeconds(5 * 60)}>
          Começar 5 min
        </Button>
      ) : (
        <p className="text-center font-serif text-4xl tabular-nums" aria-live="polite">
          {label}
        </p>
      )}
      {finished ? (
        <Button type="button" variant="outline" onClick={() => setSeconds(10 * 60)}>
          +10 min
        </Button>
      ) : null}
    </div>
  );
}
