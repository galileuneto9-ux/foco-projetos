import { NextResponse } from "next/server";
import { createJobDeps } from "@/server/jobs/deps";
import { runSummaryJob } from "@/server/jobs/run";
import { assertCronRequest } from "@/server/secrets";

export const maxDuration = 60;

async function handle(request: Request) {
  if (!assertCronRequest(request).ok) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const result = await runSummaryJob(createJobDeps());
    return NextResponse.json(result);
  } catch {
    console.error("cron_resumo_failed");
    return NextResponse.json({ error: "Não foi possível montar o resumo." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
