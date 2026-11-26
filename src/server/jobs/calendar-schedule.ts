import {
  eveningCalendarText,
  eventWindow,
  morningCalendarText,
} from "@/domain/focus";
import type { ActiveWork, JobDeps, MemberChannel } from "@/server/jobs/repository";

export async function scheduleMorningCalendar(input: {
  deps: JobDeps;
  teamId: string;
  members: MemberChannel[];
  work: ActiveWork[];
  forDate: string;
}) {
  const { deps, teamId, forDate } = input;
  if (!deps.calendar || !deps.issueLink) return;
  const owner = input.members.find((member) => member.role === "owner");
  if (!owner) return;
  const step = input.work.find((item) => item.userId === owner.userId && item.stepTitle);
  if (!step?.stepId) return;
  const claimed = await deps.repo.claimCalendarSlot(owner.userId, "manha", forDate);
  if (!claimed) return;
  const doneUrl = await deps.issueLink.issue({
    teamId,
    userId: owner.userId,
    projectId: step.projectId,
    stepId: step.stepId,
    action: "concluir",
  });
  const charges = (await deps.repo.listDueCharges(teamId, forDate)).slice(0, 3).map((item) => `${item.ownerName} · ${item.milestone}`);
  const window = eventWindow(forDate, "08:00");
  await deps.calendar.createEvent({
    teamId,
    summary: step.stepTitle ?? step.projectTitle,
    description: morningCalendarText({
      stepUrl: `${deps.appUrl.replace(/\/$/, "")}/projetos/${step.projectId}`,
      doneUrl,
      charges,
    }),
    ...window,
  });
}

export async function scheduleEveningCalendar(input: {
  deps: JobDeps;
  teamId: string;
  members: MemberChannel[];
  work: ActiveWork[];
  forDate: string;
}) {
  const { deps, teamId, forDate } = input;
  if (!deps.calendar || !deps.issueLink) return;
  const owner = input.members.find((member) => member.role === "owner");
  if (!owner) return;
  const step = input.work.find((item) => item.userId === owner.userId);
  const claimed = await deps.repo.claimCalendarSlot(owner.userId, "noite", forDate);
  if (!claimed) return;
  const base = {
    teamId,
    userId: owner.userId,
    projectId: step?.projectId ?? null,
    stepId: step?.stepId ?? null,
  };
  const [fiz, naoFiz, travado] = await Promise.all([
    deps.issueLink.issue({ ...base, action: "fiz" }),
    deps.issueLink.issue({ ...base, action: "nao_fiz" }),
    deps.issueLink.issue({ ...base, action: "travado" }),
  ]);
  const window = eventWindow(forDate, "18:00");
  await deps.calendar.createEvent({
    teamId,
    summary: "Check do fim do dia",
    description: eveningCalendarText({ fiz, naoFiz, travado }),
    ...window,
  });
}
