# Foco nos Projetos

App pessoal para terminar o que começou: no máximo 3 projetos ativos, o resto na fila, e um quadro do time só com o que for compartilhado. A cobrança do passo vai no WhatsApp (1:1) e no app. O Google Chat leva só aviso do time, com link, sem o texto do passo.

Uso próprio do Galileu e do time. Não é produto à venda. Não promete resultado. Por enquanto a entrada é só por convite: não há cadastro aberto. Quem cria o time convida pelo app, e a pessoa define a senha em `/convite`.

## O que entra

1. **Meu foco.** Ideia nova nasce na fila, privada. Ativar o 4º projeto é recusado até outro sair. "Quebrar em passos" sugere passos de 15–30 minutos; nada é gravado sem confirmar. Sem chave de IA, os passos entram na mão.
2. **Quadro do time.** Só projetos `compartilhado`, com dono, bandeira, próximo marco e data. Passos, notas e check-in diário não aparecem.
3. **Cobrança e check-in.** Manhã, fim do dia, alerta de parado e check-in semanal. Resposta `1` / `2` / `3` no webhook do WhatsApp. Resumo semanal só para quem criou o time.

## Stack

Next.js (App Router, TypeScript), Supabase (Auth, Postgres, RLS), Vercel (app + Cron). A Evolution API, o WhatsApp Web, não roda na Vercel: precisa de um processo sempre ligado, com volume para a sessão. O app só chama a API e recebe o webhook.

## Rodar local

```bash
npm ci
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
# do projeto Supabase. O restante pode ficar vazio: os provedores caem no fake.
npm run dev
```

Abra `http://localhost:3000`.

No painel do Supabase, a senha mínima fica em 10 caracteres. O `supabase/config.toml` descreve o mesmo para o CLI local. O convite confirma o e-mail no servidor, sem SMTP.

## Acesso só por convite

`/cadastro` responde "Acesso só por convite" e não cria conta. Login, aceite de convite e o convite dentro do app continuam.

Um link de recuperação gerado pela Admin API (`generate_link`, `type=recovery`) deve voltar para `{APP_BASE_URL}/auth/callback?type=recovery`. O callback troca a sessão (`code` ou `token_hash`) e manda para `/nova-senha`, onde a pessoa define a senha. Sem sessão, essa página volta ao login. Isso não reativa o cadastro nem a tela "Esqueci a senha".

A tela "Esqueci a senha" está oculta: o envio depende de SMTP, que ainda não está configurado. A ação também recusa o envio enquanto `PASSWORD_RESET_ENABLED` for `false` em `src/server/access.ts`.

Para reativar a recuperação por e-mail:

1. No Supabase, em Authentication → Emails → SMTP Settings, preencha host, porta, usuário, senha e remetente. Envie o e-mail de teste do painel.
2. Em `src/server/access.ts`, mude `PASSWORD_RESET_ENABLED` para `true`.
3. O link "Esqueci a senha" volta no login e `/esqueci-senha` volta a chamar `resetPasswordForEmail`, com retorno em `/auth/callback?next=/login`.

Aplique as migrations no projeto hospedado (SQL editor ou CLI):

```bash
supabase link --project-ref SEU_REF
supabase db push
```

Arquivos, nesta ordem:

- `supabase/migrations/20261126120000_schema.sql`
- `supabase/migrations/20261126120100_rls.sql`
- `supabase/migrations/20261126180000_foco_ux.sql`
- `supabase/migrations/20261126193000_limpa_prefixos_passos.sql`
- `supabase/migrations/20261126200000_tarefas_e_placar.sql`

Não há seed de produção. `supabase/seed.sql` está vazio de propósito.

## Variáveis de ambiente

Copie `.env.example`. Ele não tem valores. Segredo não entra no git, no log nem em `NEXT_PUBLIC_*`.

| Variável | Onde | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador e servidor | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador e servidor | chave anon, protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor | convite, cron, webhook, resumo |
| `APP_BASE_URL` | só servidor | links nas mensagens. Ex.: `https://seu-app.vercel.app` |
| `CRON_SECRET` | só servidor | `Authorization: Bearer` dos crons |
| `WHATSAPP_PROVIDER` | só servidor | `fake` (padrão) ou `evolution` |
| `EVOLUTION_API_URL` | só servidor | base da Evolution, quando o provedor for `evolution` |
| `EVOLUTION_API_KEY` | só servidor | chave da Evolution |
| `EVOLUTION_INSTANCE` | só servidor | nome da instância. Padrão `foco` |
| `EVOLUTION_WEBHOOK_SECRET` | só servidor | header `apikey` do webhook |
| `GOOGLE_CHAT_PROVIDER` | só servidor | `fake` (padrão) ou `google` |
| `GOOGLE_OAUTH_CLIENT_ID` | só servidor | OAuth do Google Chat |
| `GOOGLE_OAUTH_CLIENT_SECRET` | só servidor | OAuth do Google Chat |
| `GOOGLE_OAUTH_REDIRECT_URI` | só servidor | `{APP_BASE_URL}/api/google/callback` |
| `TOKEN_ENCRYPTION_KEY` | só servidor | 32 bytes em base64, cifra o refresh token |
| `CALENDAR_PROVIDER` | só servidor | `fake` (padrão) ou `google`. O google usa o mesmo OAuth, com o escopo `calendar.events` |
| `ACTION_LINK_SECRET` | só servidor | HMAC dos links de um toque (Concluí, Fiz, Não fiz, Travado) |
| `AI_PROVIDER` | só servidor | `fake` (padrão) ou `openai` |
| `AI_API_KEY` | só servidor | chave do provedor. Sem chave, o passo é manual |
| `AI_API_BASE_URL` | só servidor | padrão `https://api.openai.com/v1` |
| `AI_MODEL` | só servidor | padrão `gpt-4.1-mini` |
| `ALLOW_SEED` | só máquina local | tem que ser `1` para o seed de desenvolvimento |

Provedor vazio significa fake. O fake não chama rede.

Para gerar a chave de cifra:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Rotas de cron e webhook

Fuso America/Sao_Paulo, sem horário de verão (UTC−3). O `vercel.json` dispara no equivalente UTC dos horários padrão. O job ainda confere o horário gravado no time: se você mudar a hora, ajuste o cron para o UTC correspondente, senão aquele time não entra na janela.

| Rota | Agenda UTC | Horário em Brasília | Função |
|---|---|---|---|
| `GET /api/cron/manha` | `0 11 * * *` | 08:00 | passo do dia no WhatsApp, se a sessão estiver `open` e houver opt-in |
| `GET /api/cron/noite` | `0 21 * * *` | 18:00 | check 1 / 2 / 3 |
| `GET /api/cron/parado` | `30 11 * * *` | 08:30 | alerta de projeto ativo sem progresso |
| `GET /api/cron/semanal` | `0 19 * * 5` | sexta 16:00 | pedido de check-in, link, sem passo privado |
| `GET /api/cron/resumo` | `0 11 * * 1` | segunda 08:00 | resumo da semana anterior para quem criou o time |
| `POST /api/webhooks/evolution` | webhook | — | `MESSAGES_UPSERT`, `CONNECTION_UPDATE`, `QRCODE_UPDATED` |

Header do cron: `Authorization: Bearer $CRON_SECRET`. Sem o segredo, a rota responde 401.

Header do webhook: `apikey: $EVOLUTION_WEBHOOK_SECRET` (ou `x-webhook-secret`). Mensagem própria, grupo, número sem opt-in e carimbo com mais de 15 minutos são ignorados. A mesma mensagem não gera dois check-ins.

O Google Chat desta versão não tem webhook. A pessoa responde no app.

`GET /api/google/start` e `GET /api/google/callback` fazem o OAuth do owner, escopos `chat.messages.create` e `chat.spaces.create`. O refresh token fica cifrado em `google_oauth_secrets`, tabela sem policy para o cliente.

## Testes

```bash
npm test
```

Cobre o teto de 3, a quebra de passos fake, a cobrança e o check-in com adaptador fake, o webhook 1/2/3, o QR fake com volume persistido e a recusa do seed fora de URL local.

RLS, contra um Postgres com os papéis do Supabase (`anon`, `authenticated`, `service_role` e `auth.uid()`):

```bash
# exemplo local; escolha uma senha só para este Postgres
sudo -u postgres psql -c "create user foco_test with password 'uma-senha-local' superuser"
sudo -u postgres psql -c "create database foco_rls owner foco_test"
DATABASE_URL=postgresql://foco_test:uma-senha-local@127.0.0.1:5432/foco_rls npm run test:rls
```

O teste recria o schema, aplica o prelude e as migrations, e prova: dois times isolados; membro não lê projeto privado, nota nem check diário de outra pessoa; a tarefa de um projeto compartilhado fica visível e a nota continua só de quem escreveu; voltar para privado some; quem criou o time lê o check semanal e o resumo, e não lê o privado do colega; anon não acessa; o 4º projeto ativo é recusado; tarefa avulsa não entra nesse teto; pontos não são apagados nem duplicados e o placar do colega não inclui o privado.

```bash
npm run scan-secrets
```

## Seed só de desenvolvimento

```bash
ALLOW_SEED=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run seed:dev
```

Recusa se `ALLOW_SEED` não for `1` ou se a URL não for localhost / 127.0.0.1. Cria o time A e o time B, cada um com uma pessoa owner e uma member. A senha é aleatória, impressa uma vez no terminal, e não vai para arquivo versionado.

## Deploy na Vercel

1. Importe o repositório. O `vercel.json` já declara os crons.
2. Copie as variáveis da tabela acima para Production e Preview. Não marque segredo como `NEXT_PUBLIC`.
3. `APP_BASE_URL` é a URL pública do app.
4. Em Authentication do Supabase, a URL do site e o redirect incluem `https://SEU_APP/auth/callback`.
5. O primeiro deploy pode ir com os provedores fake. WhatsApp real só depois da Evolution estar no ar.

A Evolution não sobe neste deploy. Opções, quando houver autorização de gasto: Oracle Cloud Always Free, uma máquina em casa, ou um host pequeno sempre ligado (Fly.io, Railway, Render). Volume persistente para a sessão. Se o volume se perder, o QR precisa ser lido de novo. O cron só envia com status `open` e opt-in. Sem isso, o check continua no app.

Intervalo de 3 segundos entre um destinatário e o próximo. Sem disparo em massa.

## Segurança que o código já faz

- RLS em todas as tabelas de negócio. `anon` sem grant.
- Senha mínima de 10 caracteres. Sem senha padrão no código.
- Webhook e cron exigem segredo. Comparação em tempo constante. Segredo vazio não passa.
- O texto do passo não entra no aviso do Google Chat nem no resumo enviado por lá. O resumo completo fica na tela de quem criou o time.
- Proteção contra senha vazada depende do plano do Supabase. Se o plano não tiver, o risco fica aceito nesta versão.
- Convite para e-mail que já tem conta fica de fora: a pessoa vê uma mensagem clara.
- Exportar ou apagar os dados do time, nesta versão, é manual.

## Fora desta versão

Venda, Slack, Cloud API oficial do WhatsApp, Baileys dentro do app, vários times por pessoa, convite para e-mail já cadastrado, anexo, e qualquer texto de tratamento.
