import type { WhatsappReply } from "@/domain/phone";
import type { JobRepository, MemberChannel } from "@/server/jobs/repository";

export type AnswerResult = {
  alreadyAnswered: boolean;
  offersStepCompletion: boolean;
  markedStuck: boolean;
  checkinId: string | null;
};

export async function recordDailyAnswer(
  repo: JobRepository,
  input: { member: MemberChannel; forDate: string; answer: WhatsappReply },
): Promise<AnswerResult> {
  const work = (await repo.listActiveWork(input.member.teamId)).filter((item) => item.userId === input.member.userId);
  const projectId = work.length === 1 ? work[0].projectId : null;
  let checkin = await repo.findCheckin({
    userId: input.member.userId,
    kind: "diario_noite",
    forDate: input.forDate,
    projectId,
  });
  if (!checkin && projectId === null) {
    checkin = await repo.findCheckin({
      userId: input.member.userId,
      kind: "diario_noite",
      forDate: input.forDate,
      projectId: null,
    });
  }
  if (checkin?.status === "respondido") {
    return { alreadyAnswered: true, offersStepCompletion: false, markedStuck: false, checkinId: checkin.id };
  }
  if (!checkin) {
    const created = await repo.ensureCheckin({
      teamId: input.member.teamId,
      userId: input.member.userId,
      kind: "diario_noite",
      forDate: input.forDate,
      projectId,
      channel: "app",
      prompt: "Check do fim do dia",
    });
    checkin = await repo.findCheckin({
      userId: input.member.userId,
      kind: "diario_noite",
      forDate: input.forDate,
      projectId,
    });
    if (!checkin) {
      return { alreadyAnswered: false, offersStepCompletion: false, markedStuck: false, checkinId: created.id };
    }
  }
  const answered = await repo.answerCheckin({ checkinId: checkin.id, answer: input.answer });
  if (answered.alreadyAnswered) {
    return { alreadyAnswered: true, offersStepCompletion: false, markedStuck: false, checkinId: checkin.id };
  }
  if (input.answer === "fiz") {
    const ids = checkin.projectId ? [checkin.projectId] : work.map((item) => item.projectId);
    await repo.touchProgress(ids);
    return { alreadyAnswered: false, offersStepCompletion: true, markedStuck: false, checkinId: checkin.id };
  }
  if (input.answer === "travado") {
    const target = checkin.projectId ?? (work.length === 1 ? work[0].projectId : null);
    if (target) {
      await repo.markStuck(target);
      return { alreadyAnswered: false, offersStepCompletion: false, markedStuck: true, checkinId: checkin.id };
    }
  }
  return { alreadyAnswered: false, offersStepCompletion: false, markedStuck: false, checkinId: checkin.id };
}
