import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertSeedAllowed } from "../src/server/seed-guard";

const people = [
  { email: "ana.owner.a@localhost.test", name: "Ana", team: "Time A", role: "owner" as const },
  { email: "bia.member.a@localhost.test", name: "Bia", team: "Time A", role: "member" as const },
  { email: "bruno.owner.b@localhost.test", name: "Bruno", team: "Time B", role: "owner" as const },
  { email: "caio.member.b@localhost.test", name: "Caio", team: "Time B", role: "member" as const },
];

function password() {
  return `Aa1-${randomBytes(18).toString("base64url")}`;
}

async function main() {
  const allowed = assertSeedAllowed(process.env);
  if (!allowed.ok) {
    console.error(allowed.message);
    process.exit(1);
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created: { email: string; password: string; role: string; team: string }[] = [];
  const ids = new Map<string, string>();
  for (const person of people) {
    const secret = password();
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: secret,
      email_confirm: true,
      user_metadata: { display_name: person.name },
    });
    if (error || !data.user) {
      console.error(`Não criei ${person.email}. Se a conta já existe, o seed não roda de novo.`);
      process.exit(1);
    }
    ids.set(person.email, data.user.id);
    created.push({ email: person.email, password: secret, role: person.role, team: person.team });
  }
  const teams = new Map<string, string>();
  for (const person of people.filter((item) => item.role === "owner")) {
    const { data, error } = await admin
      .from("teams")
      .insert({ name: person.team, created_by: ids.get(person.email) })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Não criei o time.");
      process.exit(1);
    }
    teams.set(person.team, data.id);
  }
  for (const person of people) {
    const { error } = await admin.from("team_members").insert({
      team_id: teams.get(person.team),
      user_id: ids.get(person.email),
      role: person.role,
      display_name: person.name,
    });
    if (error) {
      console.error("Não criei o membro.");
      process.exit(1);
    }
  }
  console.log("Seed local criado. Senhas mostradas uma vez, não gravadas em arquivo:");
  for (const row of created) {
    console.log(`${row.team} ${row.role} ${row.email} ${row.password}`);
  }
}

main();
