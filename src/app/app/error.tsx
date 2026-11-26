"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid gap-3 py-8">
      <p>Não foi possível carregar esta tela.</p>
      <button type="button" className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground" onClick={reset}>
        Tentar de novo
      </button>
    </div>
  );
}
