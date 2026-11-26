export type CalendarEventInput = {
  teamId: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
};

export type CalendarProvider = {
  createEvent(input: CalendarEventInput): Promise<{ ok: boolean; eventId?: string; errorCode?: string }>;
};
