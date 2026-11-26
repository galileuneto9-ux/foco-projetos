const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function assertSeedAllowed(env: Record<string, string | undefined>): { ok: true } | { ok: false; message: string } {
  if (env.ALLOW_SEED !== "1") {
    return { ok: false, message: "Recusado: o seed só roda com ALLOW_SEED=1." };
  }
  const raw = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host)) {
    return { ok: false, message: "Recusado: a URL do Supabase não é local." };
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Recusado: falta a chave de serviço do Supabase." };
  }
  return { ok: true };
}
