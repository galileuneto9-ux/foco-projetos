function connectSources(): string[] {
  const sources = ["'self'", "https://*.supabase.co", "wss://*.supabase.co"];
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return sources;
  try {
    const url = new URL(raw);
    sources.push(url.origin, `wss://${url.host}`);
  } catch {
    return sources;
  }
  return sources;
}

export function securityHeaders(): { key: string; value: string }[] {
  const scriptSrc = process.env.NODE_ENV === "production" ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    `connect-src ${connectSources().join(" ")}`,
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
