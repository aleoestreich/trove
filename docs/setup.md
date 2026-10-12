# Setting up Trove from zero

One path, in order, from an empty account to a private Trove on a phone that
shows real bank data. Each step names the guide with the details; this page
only says what to do and in which order.

| Step | Where | Time | Details |
|---|---|---|---|
| 1. Run it locally | a computer | 5 min | [README](../README.md#run) |
| 2. Create the Vercel project | Vercel | 5 min | below |
| 3. Add the login | Vercel + Auth0 | 15 min | [auth0-setup.md](auth0-setup.md) |
| 4. Add the database | Neon + Vercel | 10 min | [neon-setup.md](neon-setup.md) |
| 5. Connect the banks | Meu Pluggy + Pluggy + Vercel | 20 min | [pluggy-setup.md](pluggy-setup.md) |
| 6. First sync and checks | Trove | 5 min | below |
| 7. Install on the phone | the phone | 2 min | below |

Every service used is on its free plan. Bank data comes only through **Meu
Pluggy**, Pluggy's free path for individuals; direct bank connections in
Pluggy are a paid product and are never used.

> Menu names in Vercel, Auth0, Neon and Pluggy change from time to time; a
> label that doesn't match exactly has a close equivalent.

## Before starting

Accounts needed (all free):
- **GitHub**, holding the `trove` repository (a fork or a copy).
- **Vercel** (Hobby plan), signed in with that GitHub account.
- **Neon**, for the database (or created from Vercel, step 4).
- **Auth0**, created through Vercel's Auth0 integration (step 3).
- **Meu Pluggy**, the app where the banks are connected, plus Pluggy API
  credentials from its "Access your data" tutorial (step 5).

On the computer: **Node.js 24** and **git**.

Secrets (the Pluggy client secret, the database connection string, Auth0's
secrets) are typed only into Vercel's environment variables, never into code,
commits, issues or chats.

## 1. Run it locally

```bash
git clone https://github.com/<owner>/trove.git
cd trove
npm install
npm test
npm run dev
```

The app opens on demo data, with no login and no database: the quickest way
to see that everything installed. `npm run build` checks the types (app and
server) and builds what Vercel will build.

## 2. Create the Vercel project

1. Vercel → **Add New…** → **Project** → import the `trove` repository.
2. Vercel detects **Vite**; keep the defaults (build `npm run build`, output
   `dist`). **Settings → Build and Deployment → Node.js Version**: **24.x**.
3. **Deploy.**
4. Note the production address under **Domains** (e.g. `trove-abc.vercel.app`).
   The guides call it `YOUR_SITE`.

Every page of this first deployment answers "Login is not configured…": the
site refuses everything until the login exists (it fails closed). That's
expected.

From now on, merging into `main` deploys to production, and a new or changed
environment variable only applies after a new deployment (**Deployments** →
latest → **⋯** → **Redeploy**).

## 3. Add the login (Auth0)

1. In the Vercel project → **Integrations** (Marketplace) → **Auth0** → add
   it to the `trove` project. It creates an Auth0 tenant and application and
   sets `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` and
   `AUTH0_SECRET` in the project. Nothing else needs adding by hand.
2. In Auth0, follow [auth0-setup.md](auth0-setup.md) steps 1–4:
   - one user, **Disable Sign Ups** on, no social logins;
   - the callback and logout addresses with `YOUR_SITE`, Regular Web
     Application, Client Secret (Post);
   - a second factor (passkey or one-time code), recommended;
   - Portuguese (Brazil) as the login page's language.
3. Redeploy.

**Check:** `https://YOUR_SITE` in a private window shows Auth0's login page,
with no "Sign up" link. After signing in, Trove opens on demo data.

## 4. Add the database (Neon)

Follow [neon-setup.md](neon-setup.md) steps 1–3:

1. Create a Neon project on the free plan, in the region nearest to Vercel's
   function region.
2. In Neon's **SQL Editor**, run the whole of
   [`db/schema.sql`](../db/schema.sql). On a new database this is the only
   file to run: it already contains every migration in `db/migrations/`.
3. Add the pooled connection string to Vercel as `DATABASE_URL`
   (Production), then redeploy. Creating the database from Vercel (**Storage
   → Neon**) sets it instead.

The default categories are created, with their Portuguese names, the first
time the app reads the database.

**Check:** after signing in, Trove still shows demo data and no "out of date"
message: the banks come next.

## 5. Connect the banks (Meu Pluggy)

Follow [pluggy-setup.md](pluggy-setup.md) steps 1–4:

1. In the **Meu Pluggy** app, connect each bank (Nubank, Itaú, Inter, Wise…).
2. From Pluggy's **"Access your data"** tutorial, get the API **Client ID**
   and **Client Secret**. A step asking to choose or pay for a plan is not the
   free path.
3. In Vercel, add `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` and
   `PLUGGY_WEBHOOK_SECRET` (a long random value), marked **Sensitive**.
   Redeploy.
4. In Trove: **Contas** → **Conectar seus bancos** → **Conectar Meu
   Pluggy**. Pluggy Connect opens with Meu Pluggy only; sign in and approve.
   Trove shows the connection's item ID: **Copiar**.
5. In Vercel, add `PLUGGY_ITEM_IDS` = that ID. Redeploy.
6. Optional: register the webhook (step 5 of the Pluggy guide). Trove works
   without it.

## 6. First sync and checks

1. Open Trove and tap **Sincronizar**. Each connection syncs in turn, in the
   background; the bar shows progress. The first sync reads everything since
   January 2025 (older history if the bank provides it, through the advanced
   sync's "Tudo").
2. The real accounts replace the demo data, and the "Dados de exemplo" label
   goes away.
3. Check by eye ([pluggy-setup.md](pluggy-setup.md#6-check) step 6): card
   bills and limits match the banks' apps, installments read "3/10",
   transfers between own accounts and card bill payments count as neither
   income nor expenses.
4. Then, in the app:
   - **Categorias:** categories are shared by every device; recategorize or
     hide anything Pluggy guessed wrong (a sync never undoes it).
   - **Visão geral → Equilíbrio do mês → Organizar categorias:** put the
     expense categories in Essencial or Estilo de vida.
   - **Previsão do fim do mês → 13º e férias**, only with a CLT job:
     turn it on and add the planned vacations.
   - **Visão geral → Personalizar** (the sliders icon on phones): the
     order of the cards and which ones show, shared by every device.
   - **Contas:** FGTS and previdência privada balances can be tracked by
     hand, if wanted.

**Security check:** in a private window,
`https://YOUR_SITE/api/finance` and `https://YOUR_SITE/manifest.webmanifest`
both lead to the login page, never to data.

## 7. Install on the phone

On the Galaxy (Samsung Internet): open `https://YOUR_SITE`, sign in, then
menu (☰) → **Add page to** → **Home screen**. In Chrome: ⋮ → **Add to Home
screen**. A session lasts 7 days.

## Environment variables

All in Vercel → the `trove` project → **Settings → Environment Variables**,
for **Production**. Without a required one, the routes that need it refuse
(fail closed) instead of running half-configured.

| Variable | Set by | Required | Without it |
|---|---|---|---|
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` | the Auth0 integration (step 3) | yes | every page: "Login is not configured…" |
| `DATABASE_URL` (or `TROVE_DATABASE_DATABASE_URL` from Vercel Storage) | by hand or Vercel Storage (step 4) | yes | demo data; the data routes answer `503` |
| `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` | by hand (step 5) | yes | "Conectar Meu Pluggy" asks for them; Sync can't run |
| `PLUGGY_ITEM_IDS` | by hand (step 5) | yes | nothing to sync |
| `PLUGGY_WEBHOOK_SECRET` | by hand (step 5) | only for the webhook | webhook calls are refused (`503`) |

`AUTH0_MANAGEMENT_API_*` and Storage's `…_UNPOOLED` / `…_PG*` variables may
exist; Trove doesn't use them.

## Keeping it up to date

- **Code:** changes go through a pull request into `main`; merging deploys.
- **Database changes:** a pull request that adds a file to `db/migrations/`
  says so under "Changes outside the codebase". Run that file in Neon's SQL
  Editor before (or right after) merging; until then pages report "the
  database tables are out of date". Each migration can safely run twice.
- **A bank stops syncing:** reconnect it in the Meu Pluggy app; the Pluggy
  guide's troubleshooting lists the sync errors.
- **A secret leaks:** change it at its source (Auth0, Neon's role password,
  Pluggy's credentials), update the Vercel variable and redeploy.
