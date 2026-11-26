import { buildEveningMessage, buildMorningMessage, buildStallMessage, buildTeamNotice } from "@/domain/messages";
import { isStalled } from "@/domain/rules";
import { buildWeeklySummary } from "@/domain/summary";
import { isWithinSlot, previousWeekStart, saoPauloParts, todayInSaoPaulo, weekStartSaoPaulo } from "@/domain/time";
import { scheduleEveningCalendar, scheduleMorningCalendar } from "@/server/jobs/calendar-schedule";
import { formatWeekDeliveries } from "@/domain/focus";
import { deliverGoogleChat, deliverWhatsapp } from "@/server/jobs/deliver";
import { emptyJobResult, type ActiveWork, type JobDeps, type JobResult, type MemberChannel } from "@/server/jobs/repository";

function mine(work: ActiveWork[], member: MemberChannel) {
  return work.filter((item) => item.userId === member.userId).slice(0, 3);
}

export async function runMorningJob(deps: JobDeps): Promise<JobResult> {
  const result = emptyJobResult();
  const forDate = todayInSaoPaulo(deps.now);
  const appUrl = `${deps.appUrl.replace(/\/$/, "")}/app`;
  for (const team of await deps.repo.listTeams()) {
    if (!deps.ignoreSchedule && !isWithinSlot(deps.now, team.morningHour)) continue;
    const [members, work, status] = await Promise.all([
      deps.repo.listMembers(team.id),
      deps.repo.listActiveWork(team.id),
      deps.repo.whatsappStatus(team.id),
    ]);
    const sentInRun = { count: 0 };
    for (const member of members) {
      const lines = mine(work, member);
      if (lines.length === 0) continue;
      const text = buildMorningMessage(
        lines.map((line) => ({
          projectTitle: line.projectTitle,
          stepTitle: line.stepTitle,
          doneWhen: line.doneWhen,
          minutes: line.minutes,
        })),
        appUrl,
      );
      let checkinId = "";
      for (const line of lines) {
        const ensured = await deps.repo.ensureCheckin({
          teamId: team.id,
          userId: member.userId,
          kind: "diario_manha",
          forDate,
          projectId: line.projectId,
          channel: "app",
          prompt: text,
        });
        checkinId = ensured.id;
      }
      await deliverWhatsapp({
        deps,
        result,
        member,
        status,
        kind: "diario_manha",
        forDate,
        checkinId,
        text,
        sentInRun,
      });
    }
    await scheduleMorningCalendar({ deps, teamId: team.id, members, work, forDate });
  }
  return result;
}

export async function runEveningJob(deps: JobDeps): Promise<JobResult> {
  const result = emptyJobResult();
  const forDate = todayInSaoPaulo(deps.now);
  const appUrl = `${deps.appUrl.replace(/\/$/, "")}/app`;
  const text = buildEveningMessage(appUrl);
  for (const team of await deps.repo.listTeams()) {
    if (!deps.ignoreSchedule && !isWithinSlot(deps.now, team.eveningHour)) continue;
    const [members, work, status] = await Promise.all([
      deps.repo.listMembers(team.id),
      deps.repo.listActiveWork(team.id),
      deps.repo.whatsappStatus(team.id),
    ]);
    const sentInRun = { count: 0 };
    for (const member of members) {
      const lines = mine(work, member);
      if (lines.length === 0) continue;
      const projectId = lines.length === 1 ? lines[0].projectId : null;
      const ensured = await deps.repo.ensureCheckin({
        teamId: team.id,
        userId: member.userId,
        kind: "diario_noite",
        forDate,
        projectId,
        channel: "app",
        prompt: text,
      });
      await deliverWhatsapp({
        deps,
        result,
        member,
        status,
        kind: "diario_noite",
        forDate,
        checkinId: ensured.id,
        text,
        sentInRun,
      });
    }
    await scheduleEveningCalendar({ deps, teamId: team.id, members, work, forDate });
  }
  return result;
}

export async function runStallJob(deps: JobDeps): Promise<JobResult> {
  const result = emptyJobResult();
  const forDate = todayInSaoPaulo(deps.now);
  const appUrl = `${deps.appUrl.replace(/\/$/, "")}/app`;
  if (!deps.ignoreSchedule && !isWithinSlot(deps.now, "08:30")) return result;
  for (const team of await deps.repo.listTeams()) {
    const [members, work, status] = await Promise.all([
      deps.repo.listMembers(team.id),
      deps.repo.listActiveWork(team.id),
      deps.repo.whatsappStatus(team.id),
    ]);
    const sentInRun = { count: 0 };
    for (const member of members) {
      const stalled = mine(work, member).filter((item) =>
        isStalled({
          status: "ativo",
          lastProgressAt: item.lastProgressAt,
          activatedAt: item.activatedAt,
          now: deps.now,
          stallDays: team.stallDays,
        }),
      );
      if (stalled.length === 0) continue;
      const text = buildStallMessage(
        stalled.map((item) => item.projectTitle),
        team.stallDays,
        appUrl,
      );
      let checkinId = "";
      for (const item of stalled) {
        const ensured = await deps.repo.ensureCheckin({
          teamId: team.id,
          userId: member.userId,
          kind: "alerta_parado",
          forDate,
          projectId: item.projectId,
          channel: "app",
          prompt: text,
        });
        checkinId = ensured.id;
      }
      await deliverWhatsapp({
        deps,
        result,
        member,
        status,
        kind: "alerta_parado",
        forDate,
        checkinId,
        text,
        sentInRun,
      });
    }
  }
  return result;
}

export async function runWeeklyJob(deps: JobDeps): Promise<JobResult> {
  const result = emptyJobResult();
  const parts = saoPauloParts(deps.now);
  const forDate = weekStartSaoPaulo(deps.now);
  const appUrl = `${deps.appUrl.replace(/\/$/, "")}/app/checkin/semanal`;
  const text = buildTeamNotice({ kind: "semanal", appUrl });
  for (const team of await deps.repo.listTeams()) {
    const due =
      deps.ignoreSchedule ||
      (parts.weekday === team.weeklyCheckinWeekday && isWithinSlot(deps.now, team.weeklyCheckinHour));
    if (!due) continue;
    const [members, status, connected] = await Promise.all([
      deps.repo.listMembers(team.id),
      deps.repo.whatsappStatus(team.id),
      deps.repo.googleConnected(team.id),
    ]);
    const sentInRun = { count: 0 };
    for (const member of members) {
      const ensured = await deps.repo.ensureCheckin({
        teamId: team.id,
        userId: member.userId,
        kind: "semanal",
        forDate,
        projectId: null,
        channel: "app",
        prompt: text,
      });
      await deliverWhatsapp({
        deps,
        result,
        member,
        status,
        kind: "semanal",
        forDate,
        checkinId: ensured.id,
        text,
        sentInRun,
      });
      await deliverGoogleChat({
        deps,
        result,
        member,
        connected,
        kind: "semanal",
        forDate,
        checkinId: ensured.id,
        text,
      });
    }
  }
  return result;
}

export async function runSummaryJob(deps: JobDeps): Promise<JobResult> {
  const result = emptyJobResult();
  const parts = saoPauloParts(deps.now);
  if (!deps.ignoreSchedule && (parts.weekday !== 1 || !isWithinSlot(deps.now, "08:00"))) return result;
  const weekStart = previousWeekStart(deps.now);
  const appUrl = `${deps.appUrl.replace(/\/$/, "")}/app/time/resumo`;
  const text = buildTeamNotice({ kind: "resumo", appUrl });
  for (const team of await deps.repo.listTeams()) {
    if (await deps.repo.getWeeklySummary(team.id, weekStart)) {
      result.skippedDuplicate += 1;
      continue;
    }
    await deps.repo.expireUnanswered(team.id, weekStart);
    const [members, checkins, connected] = await Promise.all([
      deps.repo.listMembers(team.id),
      deps.repo.listWeeklyCheckins(team.id, weekStart),
      deps.repo.googleConnected(team.id),
    ]);
    const deliveries = await deps.repo.listWeekDeliveries(team.id, weekStart);
    const deliveryText = formatWeekDeliveries(deliveries);
    const body = [
      buildWeeklySummary({
        weekStart,
        members: members.map((member) => ({ userId: member.userId, displayName: member.displayName })),
        checkins: checkins.map((checkin) => ({
          userId: checkin.userId,
          status: checkin.status,
          answerText: checkin.answerText,
        })),
      }),
      deliveryText,
    ]
      .filter(Boolean)
      .join("\n\n");
    await deps.repo.saveWeeklySummary(team.id, weekStart, body);
    const owner = members.find((member) => member.role === "owner");
    if (owner?.notifyGoogleChat && owner.googleChatSpaceId && connected) {
      const sent = await deps.googleChat.sendMessage({ spaceId: owner.googleChatSpaceId, text });
      if (sent.ok) result.sentGoogleChat += 1;
    }
  }
  return result;
}
