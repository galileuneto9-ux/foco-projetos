import { cn } from "@/lib/utils";

const tones = {
  ok: "bg-accent text-primary",
  late: "bg-[#f8e4d8] text-[#8a3d24]",
  stuck: "bg-[#f3e7c8] text-[#6d4e12]",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({
  tone = "muted",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}
