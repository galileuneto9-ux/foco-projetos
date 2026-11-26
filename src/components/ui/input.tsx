import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        className,
      )}
      {...props}
    />
  );
}
