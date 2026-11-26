import type { BoardFlag, ProjectStatus } from "@/domain/types";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  fila: "Na fila",
  ativo: "Ativo",
  pausado: "Pausado",
  concluido: "Concluído",
  desistido: "Desistido",
};

export const FLAG_LABEL: Record<BoardFlag, string> = {
  no_prazo: "No prazo",
  atrasado: "Atrasado",
  travado: "Travado",
};

export const WEEKDAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
