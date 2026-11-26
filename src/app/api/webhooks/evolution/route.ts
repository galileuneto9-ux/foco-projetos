import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseJobRepo } from "@/server/jobs/supabase-repo";
import { handleEvolutionWebhook } from "@/server/webhooks/evolution";

export async function POST(request: Request) {
  try {
    return await handleEvolutionWebhook(request, {
      secret: process.env.EVOLUTION_WEBHOOK_SECRET ?? null,
      repo: new SupabaseJobRepo(createAdminClient()),
      now: new Date(),
    });
  } catch {
    console.error("webhook_evolution_failed");
    return Response.json({ error: "Não foi possível registrar a resposta." }, { status: 500 });
  }
}
