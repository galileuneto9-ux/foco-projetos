export const LINK_EXPIRED_MESSAGE = "Este link já foi usado ou expirou. Peça um novo a quem te convidou.";

export function signupErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "over_email_send_rate_limit" || message.includes("over_email_send_rate_limit")) {
    return "Limite de envio de e-mail atingido. Tente mais tarde.";
  }
  return "Não foi possível criar a conta. Tente outro e-mail.";
}

export function teamFormDefaults(metadata: { display_name?: unknown; team_name?: unknown } | null | undefined): {
  displayName: string;
  teamName: string;
} {
  const displayName = typeof metadata?.display_name === "string" ? metadata.display_name : "";
  const teamName = typeof metadata?.team_name === "string" ? metadata.team_name : "";
  return { displayName, teamName };
}

export function teamFromMetadata(metadata: { display_name?: unknown; team_name?: unknown } | null | undefined): {
  displayName: string;
  teamName: string;
} | null {
  const { displayName, teamName } = teamFormDefaults(metadata);
  const name = displayName.trim();
  const team = teamName.trim();
  if (name.length < 2 || team.length < 2) return null;
  return { displayName: name, teamName: team };
}
