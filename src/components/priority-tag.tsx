const STYLE = {
  importante: "bg-oliva-suave text-oliva",
  medio: "bg-ocre-suave text-ocre",
  baixo: "bg-baixo-suave text-suave",
} as const;

const LABEL = {
  importante: "Importante",
  medio: "Médio",
  baixo: "Baixo",
} as const;

export function PriorityTag({ priority }: { priority: keyof typeof LABEL }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STYLE[priority]}`}>{LABEL[priority]}</span>;
}
