import type { CalendarEventInput } from "@/integrations/calendar/types";

export class FakeCalendar {
  readonly events: CalendarEventInput[] = [];

  async createEvent(input: CalendarEventInput) {
    this.events.push(input);
    return { ok: true, eventId: `fake-cal-${this.events.length}` };
  }
}
