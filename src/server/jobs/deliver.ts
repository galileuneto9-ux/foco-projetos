import type { CheckinKind } from "@/domain/types";
import type { JobDeps, JobResult, MemberChannel } from "@/server/jobs/repository";

export function canSendWhatsapp(status: string | null, member: MemberChannel): boolean {
  return status === "open" && member.notifyWhatsapp && Boolean(member.whatsappE164) && Boolean(member.whatsappOptedInAt);
}

export function canSendGoogleChat(connected: boolean, member: MemberChannel): boolean {
  return connected && member.notifyGoogleChat && Boolean(member.googleChatSpaceId);
}

export async function deliverWhatsapp(input: {
  deps: JobDeps;
  result: JobResult;
  member: MemberChannel;
  status: string | null;
  kind: CheckinKind;
  forDate: string;
  checkinId: string;
  text: string;
  sentInRun: { count: number };
}): Promise<void> {
  const { deps, result, member } = input;
  if (!canSendWhatsapp(input.status, member)) {
    result.inApp += 1;
    return;
  }
  if (await deps.repo.hasSuccessfulNudge({ userId: member.userId, kind: input.kind, forDate: input.forDate, channel: "whatsapp" })) {
    result.skippedDuplicate += 1;
    return;
  }
  if (input.sentInRun.count > 0) {
    await (deps.sleep ?? (async () => {}))(deps.gapMs ?? 3000);
  }
  input.sentInRun.count += 1;
  const sent = await deps.whatsapp.sendText({ to: member.whatsappE164 ?? "", text: input.text });
  await deps.repo.logNudge({
    teamId: member.teamId,
    userId: member.userId,
    checkinId: input.checkinId,
    channel: "whatsapp",
    ok: sent.ok,
    providerMessageId: sent.messageId,
    errorCode: sent.errorCode,
  });
  if (sent.ok) result.sentWhatsapp += 1;
  else result.inApp += 1;
}

export async function deliverGoogleChat(input: {
  deps: JobDeps;
  result: JobResult;
  member: MemberChannel;
  connected: boolean;
  kind: CheckinKind;
  forDate: string;
  checkinId: string;
  text: string;
}): Promise<void> {
  if (!canSendGoogleChat(input.connected, input.member)) return;
  if (
    await input.deps.repo.hasSuccessfulNudge({
      userId: input.member.userId,
      kind: input.kind,
      forDate: input.forDate,
      channel: "google_chat",
    })
  ) {
    input.result.skippedDuplicate += 1;
    return;
  }
  const sent = await input.deps.googleChat.sendMessage({
    spaceId: input.member.googleChatSpaceId ?? "",
    text: input.text,
  });
  await input.deps.repo.logNudge({
    teamId: input.member.teamId,
    userId: input.member.userId,
    checkinId: input.checkinId,
    channel: "google_chat",
    ok: sent.ok,
    providerMessageId: sent.messageId,
    errorCode: sent.errorCode,
  });
  if (sent.ok) input.result.sentGoogleChat += 1;
}
