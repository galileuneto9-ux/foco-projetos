import { progressCopy } from "@/domain/focus";

export function ProgressBlock({
  done,
  total,
  milestoneOn,
  compact = false,
}: {
  done: number;
  total: number;
  milestoneOn: string | null;
  compact?: boolean;
}) {
  const progress = progressCopy({ done, total, milestoneOn });
  return (
    <div className={compact ? "grid gap-1" : "grid gap-1"}>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
        </div>
        <span aria-hidden className="text-sm text-primary">
          ⚑
        </span>
      </div>
      <p className={progress.delivered ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}>
        {progress.line}
        {progress.remaining ? ` · ${progress.remaining}` : ""}
      </p>
    </div>
  );
}
