export const PROJECT_STATUSES = ["fila", "ativo", "pausado", "concluido", "desistido"] as const;
export const VISIBILITIES = ["privado", "compartilhado"] as const;
export const BOARD_FLAGS = ["no_prazo", "atrasado", "travado"] as const;
export const STEP_STATUSES = ["pendente", "atual", "feito", "pulado"] as const;
export const CHECKIN_KINDS = ["diario_manha", "diario_noite", "alerta_parado", "semanal"] as const;
export const CHECKIN_ANSWERS = ["fiz", "nao_fiz", "travado", "texto"] as const;
export const WHATSAPP_STATUSES = ["disconnected", "qr", "open", "close"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type BoardFlag = (typeof BOARD_FLAGS)[number];
export type StepStatus = (typeof STEP_STATUSES)[number];
export type CheckinKind = (typeof CHECKIN_KINDS)[number];
export type CheckinAnswer = (typeof CHECKIN_ANSWERS)[number];
export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

export const ACTIVE_PROJECT_CAP = 3;
export const STEP_MINUTES = [15, 20, 25, 30] as const;

export type StepDraft = {
  title: string;
  doneWhen: string;
  minutes: number;
};
