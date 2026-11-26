import { NextResponse } from "next/server";
import { createJobDeps } from "@/server/jobs/deps";
import { runMorningJob } from "@/server/jobs/run";
import { assertCronRequest } from "@/server/secrets";

export const maxDuration = 60;

async function handle(request: Request) {
  if (!assertCronRequest(request).ok) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const result = await runMorningJob(createJobDeps());
    return NextResponse.json(result);
  } catch {
    console.error("cron_manha_failed");
    return NextResponse.json({ error: "Não foi possível rodar a cobrança." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
