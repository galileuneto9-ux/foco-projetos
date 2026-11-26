import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Defina DATABASE_URL para os testes de RLS contra o Postgres local.");
}

const ownerA = "11111111-1111-4111-8111-111111111111";
const memberA = "22222222-2222-4222-8222-222222222222";
const ownerB = "33333333-3333-4333-8333-333333333333";
const memberB = "44444444-4444-4444-8444-444444444444";

const pool = new pg.Pool({ connectionString: databaseUrl });

const ids: {
  teamA: string;
  teamB: string;
  privateA: string;
  sharedA: string;
  privateMember: string;
  sharedB: string;
  stepShared: string;
  stepPrivate: string;
} = {
  teamA: "",
  teamB: "",
  privateA: "",
  sharedA: "",
  privateMember: "",
  sharedB: "",
  stepShared: "",
  stepPrivate: "",
};

async function setClaims(client: pg.PoolClient, userId: string | null, role: string) {
  if (!userId) return;
  const claims = JSON.stringify({ sub: userId, role });
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("select set_config('request.jwt.claim.role', $1, true)", [role]);
}

async function withRole(
  userId: string | null,
  role: "authenticated" | "anon" | "service_role",
  fn: (client: pg.PoolClient) => Promise<void>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setClaims(client, userId, role);
    await client.query(`set local role ${role}`);
    await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function tryQuery(client: pg.PoolClient, sql: string, params: unknown[] = []) {
  await client.query("savepoint sp");
  try {
    const result = await client.query(sql, params);
    await client.query("release savepoint sp");
    return { ok: true as const, rows: result.rows, rowCount: result.rowCount ?? 0 };
  } catch (error) {
    await client.query("rollback to savepoint sp");
    const pgError = error as { code?: string; message?: string };
    return { ok: false as const, code: pgError.code ?? "", message: pgError.message ?? "" };
  }
}

beforeAll(async () => {
  const admin = await pool.connect();
  try {
    await admin.query("drop schema if exists public cascade");
    await admin.query("drop schema if exists auth cascade");
    await admin.query("create schema public");
    await admin.query("grant all on schema public to public");
    const root = path.resolve(__dirname, "../..");
    for (const file of [
      "tests/rls/prelude.sql",
      "supabase/migrations/20261126120000_schema.sql",
      "supabase/migrations/20261126120100_rls.sql",
      "supabase/migrations/20261126180000_foco_ux.sql",
    ]) {
      await admin.query(readFileSync(path.join(root, file), "utf8"));
    }
    await admin.query("insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)", [
      ownerA,
      "ana@example.com",
      memberA,
      "bia@example.com",
      ownerB,
      "bruno@example.com",
      memberB,
      "caio@example.com",
    ]);
  } finally {
    admin.release();
  }

  async function createTeam(userId: string, name: string, display: string) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await setClaims(client, userId, "authenticated");
      await client.query("set local role authenticated");
      const result = await client.query("select public.create_team($1, $2) as id", [name, display]);
      await client.query("commit");
      return result.rows[0].id as string;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ids.teamA = await createTeam(ownerA, "Time A", "Ana");
  ids.teamB = await createTeam(ownerB, "Time B", "Bruno");

  const fixture = await pool.connect();
  try {
    await fixture.query(
      "insert into public.team_members (team_id, user_id, role, display_name) values ($1, $2, 'member', 'Bia'), ($3, $4, 'member', 'Caio')",
      [ids.teamA, memberA, ids.teamB, memberB],
    );
    const projects = await fixture.query(
      `insert into public.projects (team_id, owner_id, title, status, visibility, next_milestone, next_milestone_on, position)
       values
         ($1, $2, 'Privado da Ana', 'ativo', 'privado', null, null, 1),
         ($1, $2, 'Compartilhado da Ana', 'ativo', 'compartilhado', 'Entregar roteiro', '2026-11-01', 2),
         ($1, $3, 'Privado da Bia', 'ativo', 'privado', null, null, 1),
         ($4, $5, 'Compartilhado do Bruno', 'ativo', 'compartilhado', 'Marco B', '2026-12-01', 1)
       returning id, title`,
      [ids.teamA, ownerA, memberA, ids.teamB, ownerB],
    );
    const byTitle = Object.fromEntries(projects.rows.map((row) => [row.title, row.id]));
    ids.privateA = byTitle["Privado da Ana"];
    ids.sharedA = byTitle["Compartilhado da Ana"];
    ids.privateMember = byTitle["Privado da Bia"];
    ids.sharedB = byTitle["Compartilhado do Bruno"];
    const steps = await fixture.query(
      `insert into public.project_steps (team_id, project_id, title, done_when, minutes, status, position)
       values
         ($1, $2, 'Passo privado', 'Arquivo salvo', 20, 'atual', 1),
         ($1, $3, 'Passo compartilhado', 'Roteiro publicado', 25, 'atual', 1)
       returning id, project_id`,
      [ids.teamA, ids.privateA, ids.sharedA],
    );
    ids.stepPrivate = steps.rows.find((row) => row.project_id === ids.privateA).id;
    ids.stepShared = steps.rows.find((row) => row.project_id === ids.sharedA).id;
    await fixture.query(
      `insert into public.project_notes (team_id, project_id, author_id, body)
       values ($1, $2, $3, 'Nota privada'), ($1, $4, $3, 'Nota do compartilhado')`,
      [ids.teamA, ids.privateA, ownerA, ids.sharedA],
    );
    await fixture.query(
      `insert into public.checkins (team_id, user_id, kind, for_date, project_id, channel, prompt, status, answer, answer_text)
       values
         ($1, $2, 'diario_noite', '2026-11-27', $3, 'app', 'check privado', 'respondido', 'fiz', null),
         ($1, $4, 'diario_noite', '2026-11-27', $5, 'app', 'check da bia', 'respondido', 'nao_fiz', null),
         ($1, $4, 'semanal', '2026-11-23', null, 'app', 'semanal', 'respondido', 'texto', 'Andou: fechei. Travou: nada')`,
      [ids.teamA, ownerA, ids.privateA, memberA, ids.privateMember],
    );
    await fixture.query(
      `insert into public.deliveries (team_id, user_id, project_id, title)
       values ($1, $2, $3, 'Entrega privada'), ($1, $2, $4, 'Entrega compartilhada'), ($1, $5, $6, 'Entrega da Bia')`,
      [ids.teamA, ownerA, ids.privateA, ids.sharedA, memberA, ids.privateMember],
    );
    await fixture.query("insert into public.weekly_summaries (team_id, week_start, body) values ($1, '2026-11-23', 'Resumo do time A')", [
      ids.teamA,
    ]);
    await fixture.query(
      `insert into public.ai_runs (team_id, user_id, project_id, provider, status)
       values ($1, $2, $3, 'fake', 'ok'), ($1, $4, $5, 'fake', 'ok')`,
      [ids.teamA, ownerA, ids.privateA, memberA, ids.privateMember],
    );
    const checkin = await fixture.query("select id from public.checkins where user_id = $1 and kind = 'diario_noite'", [memberA]);
    await fixture.query(
      `insert into public.nudge_log (team_id, user_id, checkin_id, channel, ok)
       values ($1, $2, $3, 'app', true)`,
      [ids.teamA, memberA, checkin.rows[0].id],
    );
    await fixture.query(
      `insert into public.whatsapp_connection (team_id, evolution_instance, status)
       values ($1, 'foco-a', 'open')`,
      [ids.teamA],
    );
    await fixture.query(
      `insert into public.google_oauth_connections (team_id, user_id, google_email, refresh_token_secret_ref, personal_space_id)
       values ($1, $2, 'ana@gmail.com', 'secret-row', 'spaces/ana')`,
      [ids.teamA, ownerA],
    );
    await fixture.query("insert into public.google_oauth_secrets (team_id, ciphertext) values ($1, 'ciphertext')", [ids.teamA]);
    await fixture.query("insert into public.webhook_receipts (id, team_id) values ('msg-1', $1)", [ids.teamA]);
  } finally {
    fixture.release();
  }
});

afterAll(async () => {
  await pool.end();
});

test("anon não lê tabela de negócio", async () => {
  await withRole(null, "anon", async (client) => {
    const result = await tryQuery(client, "select * from public.projects");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("42501");
  });
});

test("membro não lê privado, passos nem notas de outra pessoa; lê o compartilhado sem o passo", async () => {
  await withRole(memberA, "authenticated", async (client) => {
    const projects = await client.query("select id, title from public.projects order by title");
    const titles = projects.rows.map((row) => row.title);
    expect(titles).toContain("Compartilhado da Ana");
    expect(titles).toContain("Privado da Bia");
    expect(titles).not.toContain("Privado da Ana");
    expect(titles).not.toContain("Compartilhado do Bruno");

    const steps = await client.query("select id from public.project_steps");
    expect(steps.rowCount).toBe(0);
    const notes = await client.query("select id from public.project_notes");
    expect(notes.rowCount).toBe(0);

    const hidden = await tryQuery(client, "update public.projects set visibility = 'privado' where id = $1", [ids.sharedA]);
    expect(hidden.ok).toBe(true);
    if (hidden.ok) expect(hidden.rowCount).toBe(0);
  });
});

test("voltar para privado some para o colega", async () => {
  await withRole(ownerA, "authenticated", async (client) => {
    await client.query("update public.projects set visibility = 'privado' where id = $1", [ids.sharedA]);
    await client.query("set local role authenticated");
    await setClaims(client, memberA, "authenticated");
    const seen = await client.query("select id from public.projects where id = $1", [ids.sharedA]);
    expect(seen.rowCount).toBe(0);
  });
});

test("owner do time não lê projeto privado, passo, nota nem check diário do colega", async () => {
  await withRole(ownerA, "authenticated", async (client) => {
    const privateMember = await client.query("select id from public.projects where id = $1", [ids.privateMember]);
    expect(privateMember.rowCount).toBe(0);
    const daily = await client.query(
      "select id from public.checkins where user_id = $1 and kind = 'diario_noite'",
      [memberA],
    );
    expect(daily.rowCount).toBe(0);
    const weekly = await client.query("select answer_text from public.checkins where user_id = $1 and kind = 'semanal'", [
      memberA,
    ]);
    expect(weekly.rowCount).toBe(1);
    const summary = await client.query("select body from public.weekly_summaries");
    expect(summary.rows[0]?.body).toBe("Resumo do time A");
    const sharedDelivery = await client.query("select title from public.deliveries order by title");
    const deliveryTitles = sharedDelivery.rows.map((row) => row.title);
    expect(deliveryTitles).toContain("Entrega compartilhada");
    expect(deliveryTitles).toContain("Entrega privada");
    expect(deliveryTitles).not.toContain("Entrega da Bia");
  });
});

test("membro não lê o resumo nem o check diário alheio", async () => {
  await withRole(memberA, "authenticated", async (client) => {
    const summary = await client.query("select id from public.weekly_summaries");
    expect(summary.rowCount).toBe(0);
    const daily = await client.query("select id from public.checkins where user_id = $1", [ownerA]);
    expect(daily.rowCount).toBe(0);
    const ownWeekly = await client.query("select id from public.checkins where user_id = $1 and kind = 'semanal'", [memberA]);
    expect(ownWeekly.rowCount).toBe(1);
  });
});

test("time B não lê nada do time A", async () => {
  await withRole(ownerB, "authenticated", async (client) => {
    const projects = await client.query("select title from public.projects");
    expect(projects.rows.map((row) => row.title)).toEqual(["Compartilhado do Bruno"]);
    const members = await client.query("select display_name from public.team_members order by display_name");
    expect(members.rows.map((row) => row.display_name)).toEqual(["Bruno", "Caio"]);
    const checks = await client.query("select id from public.checkins");
    expect(checks.rowCount).toBe(0);
    const summary = await client.query("select id from public.weekly_summaries");
    expect(summary.rowCount).toBe(0);
  });
  await withRole(memberB, "authenticated", async (client) => {
    const projects = await client.query("select id from public.projects where team_id = $1", [ids.teamA]);
    expect(projects.rowCount).toBe(0);
  });
});

test("teto de 3 recusa o quarto ativo e libera depois de pausar", async () => {
  await withRole(ownerA, "authenticated", async (client) => {
    const third = await client.query(
      "insert into public.projects (team_id, owner_id, title, status, position) values ($1, $2, 'Terceiro', 'fila', 3) returning id",
      [ids.teamA, ownerA],
    );
    const fourth = await client.query(
      "insert into public.projects (team_id, owner_id, title, status, position) values ($1, $2, 'Quarto', 'fila', 4) returning id",
      [ids.teamA, ownerA],
    );
    const ok = await tryQuery(client, "select public.activate_project($1)", [third.rows[0].id]);
    expect(ok.ok).toBe(true);
    const blocked = await tryQuery(client, "select public.activate_project($1)", [fourth.rows[0].id]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/TETO_ATIVOS/);
    await client.query("update public.projects set status = 'pausado' where id = $1", [ids.privateA]);
    const freed = await tryQuery(client, "select public.activate_project($1)", [fourth.rows[0].id]);
    expect(freed.ok).toBe(true);
  });
});

test("minutos fora de 5–25 e dois passos atuais são recusados", async () => {
  await withRole(ownerA, "authenticated", async (client) => {
    const minutes = await tryQuery(
      client,
      "insert into public.project_steps (team_id, project_id, title, done_when, minutes, position) values ($1, $2, 'Curto', 'Pronto', 4, 2)",
      [ids.teamA, ids.privateA],
    );
    expect(minutes.ok).toBe(false);
    if (!minutes.ok) expect(minutes.code).toBe("23514");
    const secondCurrent = await tryQuery(
      client,
      "insert into public.project_steps (team_id, project_id, title, done_when, minutes, status, position) values ($1, $2, 'Outro atual', 'Pronto', 20, 'atual', 3)",
      [ids.teamA, ids.privateA],
    );
    expect(secondCurrent.ok).toBe(false);
    if (!secondCurrent.ok) expect(secondCurrent.code).toBe("23505");
  });
});

test("não aponta passo para projeto de outro time nem troca o team_id", async () => {
  await withRole(ownerA, "authenticated", async (client) => {
    const cross = await tryQuery(
      client,
      "insert into public.project_steps (team_id, project_id, title, done_when, minutes, position) values ($1, $2, 'Cruzado', 'Pronto', 20, 1)",
      [ids.teamA, ids.sharedB],
    );
    expect(cross.ok).toBe(false);
    const moved = await tryQuery(client, "update public.projects set team_id = $1 where id = $2", [ids.teamB, ids.privateA]);
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.message).toMatch(/TEAM_IMMUTABLE/);
  });
});

test("membro não convida, não remove e não lê conexão; owner lê o status", async () => {
  await withRole(memberA, "authenticated", async (client) => {
    const invite = await tryQuery(
      client,
      "insert into public.team_invites (team_id, email, token_hash, invited_by, expires_at) values ($1, 'nova@example.com', 'hash-m', $2, now() + interval '1 day')",
      [ids.teamA, memberA],
    );
    expect(invite.ok).toBe(false);
    const removed = await client.query("delete from public.team_members where user_id = $1", [ownerA]);
    expect(removed.rowCount).toBe(0);
    const whatsapp = await client.query("select status from public.whatsapp_connection");
    expect(whatsapp.rowCount).toBe(0);
    const google = await client.query("select google_email from public.google_oauth_connections");
    expect(google.rowCount).toBe(0);
    const secret = await tryQuery(client, "select ciphertext from public.google_oauth_secrets");
    expect(secret.ok).toBe(false);
  });
  await withRole(ownerA, "authenticated", async (client) => {
    const whatsapp = await client.query("select status from public.whatsapp_connection");
    expect(whatsapp.rows[0]?.status).toBe("open");
    const selfDelete = await client.query("delete from public.team_members where user_id = $1 returning user_id", [ownerA]);
    expect(selfDelete.rowCount).toBe(0);
    const team = await tryQuery(client, "update public.teams set name = 'Time A revisado' where id = $1", [ids.teamA]);
    expect(team.ok).toBe(true);
  });
});

test("link de um toque e projeto privado não aparecem para o colega", async () => {
  const admin = await pool.connect();
  let linkId = "";
  try {
    const inserted = await admin.query(
      `insert into public.action_links (team_id, user_id, project_id, action, token_hash, expires_at)
       values ($1, $2, $3, 'concluir', 'hash-ux', now() + interval '1 day') returning id`,
      [ids.teamA, ownerA, ids.privateA],
    );
    linkId = inserted.rows[0].id as string;
    await admin.query("update public.projects set charge_on = '2026-12-03' where id = $1", [ids.privateA]);
    await admin.query("update public.projects set charge_on = '2026-12-01' where id = $1", [ids.sharedA]);
  } finally {
    admin.release();
  }
  await withRole(memberA, "authenticated", async (client) => {
    const links = await client.query("select id from public.action_links");
    expect(links.rowCount).toBe(0);
    const hidden = await client.query("select id from public.projects where id = $1", [ids.privateA]);
    expect(hidden.rowCount).toBe(0);
    const shared = await client.query("select charge_on from public.projects where id = $1", [ids.sharedA]);
    expect(shared.rows[0]?.charge_on).toBeTruthy();
    const insertLink = await tryQuery(
      client,
      "insert into public.action_links (team_id, user_id, action, token_hash, expires_at) values ($1, $2, 'fiz', 'hash-membro', now() + interval '1 hour')",
      [ids.teamA, memberA],
    );
    expect(insertLink.ok).toBe(false);
  });
  await withRole(ownerB, "authenticated", async (client) => {
    const shared = await client.query("select id from public.projects where id = $1", [ids.sharedA]);
    expect(shared.rowCount).toBe(0);
  });
  await pool.query("delete from public.action_links where id = $1", [linkId]);
  await pool.query("update public.projects set charge_on = null where id in ($1, $2)", [ids.privateA, ids.sharedA]);
});

test("membro não conclui passo de outra pessoa e o service role enxerga o privado", async () => {
  await withRole(memberA, "authenticated", async (client) => {
    const complete = await tryQuery(client, "select public.complete_step($1)", [ids.stepPrivate]);
    expect(complete.ok).toBe(false);
    if (!complete.ok) expect(complete.message).toMatch(/FORBIDDEN/);
  });
  await withRole(null, "service_role", async (client) => {
    const hidden = await client.query("select title from public.projects where id = $1", [ids.privateMember]);
    expect(hidden.rows[0]?.title).toBe("Privado da Bia");
  });
});

test("owner do projeto conclui o passo, gera entrega e promove o próximo", async () => {
  await withRole(ownerA, "authenticated", async (client) => {
    await client.query(
      "insert into public.project_steps (team_id, project_id, title, done_when, minutes, status, position) values ($1, $2, 'Depois', 'Revisado', 15, 'pendente', 2)",
      [ids.teamA, ids.privateA],
    );
    const done = await tryQuery(client, "select public.complete_step($1)", [ids.stepPrivate]);
    expect(done.ok).toBe(true);
    const delivery = await client.query("select title from public.deliveries where step_id = $1", [ids.stepPrivate]);
    expect(delivery.rows[0]?.title).toBe("Passo privado");
    const next = await client.query("select title, status from public.project_steps where project_id = $1 and status = 'atual'", [
      ids.privateA,
    ]);
    expect(next.rows[0]?.title).toBe("Depois");
    const progress = await client.query("select last_progress_at from public.projects where id = $1", [ids.privateA]);
    expect(progress.rows[0]?.last_progress_at).toBeTruthy();
  });
});
