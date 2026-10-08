# Trove

Mobile-first personal finance app (React + TypeScript + Vite) that aggregates
Brazilian bank accounts. Phase 1 runs on demo data; see `PLAN.md` for the
roadmap and `README.md` for how to run it.

## Git and pull requests

- **Branch names:** `type/short-description`, in kebab-case. Types:
  - `feature/`: new functionality (`feature/pluggy-integration`)
  - `fix/`: bug fixes (`fix/installment-rounding`)
  - `chore/`: tooling, dependencies, docs, config (`chore/update-deps`)
  - `refactor/`: code changes with no behaviour change (`refactor/split-dashboard`)

- **One branch per feature:** start each new feature (or fix) on its own
  branch from the latest `main`. Open a PR into `main` and merge it there. Don't
  stack new work on another feature's branch, and never reuse a branch whose PR
  is merged.
- **PRs:** fill in every section of `pull_request_template.md`, keeping its
  headings.
- **Writing tone:** titles, descriptions, commit messages, docs, READMEs and
  comments are impersonal and technical. Describe the system and the change
  ("Sync never overwrites stored categories"), not a person ("the owner",
  "you", "your").
- **No real financial data in the repo or on GitHub.** Real merchants,
  amounts, balances, account names and screenshots are shared only to show a
  bug. Never copy them into PR titles or descriptions, commit messages, code,
  comments, tests, fixtures or docs. Describe the problem in general terms and
  use made-up examples ("LOJA EXEMPLO 04/10", R$ 150,00).

## Commands

- `npm run dev`: dev server, reachable from a phone on the same Wi-Fi
- `npm test`: Vitest
- `npm run build`: typecheck (app and server) + production build

Run `npm test` and `npm run build` before pushing.

## Conventions

- **Money** is integer cents (`Cents`) in BRL. Foreign amounts keep their
  original value in `foreign`. Never use floats for money.
- **Data** goes through the `Repository` interface (`src/data/repository.ts`).
  The domain types mirror Pluggy (Item → Account → Transaction). Every change
  made in the app is an `Edit` (`src/data/edits.ts`): the app applies it at
  once with `applyEdit`, and the server applies the same rules in SQL
  (`server/db/categories.ts`); keep the two in step, with tests on both.
- **Categories** are stored in the database (seeded once from
  `src/data/categoryCatalog.ts`, with the Portuguese names). A transaction has a
  category and subcategory (or none), a `transfer` kind (own transfer or card
  bill payment, which never have a category) and a `hidden` flag. Hidden
  transactions are left out of every total, chart, average, category
  breakdown and installments total (balances, net worth and card bills still
  include them: those are the bank's figures). Category colours are the `--cat-*`
  tokens; icons come from `src/assets/icons/` through `Icon`/`CategoryIcon`.
- **Text:** the app is Brazilian Portuguese (pt-BR) only, with no language
  switch. UI text lives in `src/i18n/messages.ts`; never hardcode UI strings,
  and never show the server's own error text (map its error code to a message).
  Format money and dates with the helpers in `src/lib/money.ts` and
  `src/lib/dates.ts`.
- **Target devices:** Samsung Galaxy S25+ and Galaxy A17. Check layouts at
  360px and 412px wide, in light and dark mode.
- **Colours** come from the tokens in `src/index.css`, never raw hex in
  components.
- **Login:** the deployed site is private (Auth0 + `middleware.ts`, see
  `docs/auth0-setup.md`). Server code lives in `middleware.ts`, `api/` and
  `server/` and is typechecked with `tsconfig.server.json` (NodeNext). Vercel
  runs these files unbundled as Node.js ES modules, so relative imports must end
  in `.js` (e.g. `./config.js`); the typecheck enforces it. It must fail
  closed: if a setting is missing, refuse the request. Each file in `api/` is
  one Vercel Function, and the Hobby plan allows 12 per deployment, the login
  middleware included (10 in use): group new routes into an existing file
  (with `vercel.json` rewrites when the public paths must stay) instead of
  adding files. Who may sign in is
  managed only in Auth0 (its user list, sign-ups disabled). Never hardcode
  emails, user IDs or secrets in code, docs or config; secrets are Vercel
  environment variables.
- **Real data:** every screen reads Trove's database (Neon, `server/db/`,
  setup in `docs/neon-setup.md`); it only changes on Sync, a background job
  (`server/db/syncJobs.ts`) that fetches one connection at a time from Pluggy
  (`server/db/sync.ts`), upserts on Pluggy's IDs so it is idempotent, and
  never overwrites a stored category, subcategory or hidden flag. The
  database URL is a Vercel environment variable only (`DATABASE_URL` or
  `TROVE_DATABASE_DATABASE_URL`); schema changes go in `db/migrations/` and
  `db/schema.sql`. Pluggy itself: `server/pluggy/`, setup in
  `docs/pluggy-setup.md`. Pluggy credentials and item IDs are Vercel
  environment variables only. Access must stay on Pluggy's free path for
  individuals (the "Access your data" tutorial, via Meu Pluggy); never suggest
  connecting banks directly or a paid plan. Pluggy Connect is only opened
  restricted to the MeuPluggy connector (the server looks it up and refuses if
  it's missing). The webhook (`/api/webhooks/pluggy`) is the only route the
  login middleware lets through; it must check its shared secret. The mapping
  to Trove's model lives in
  `server/pluggy/map.ts`; shared types come from `src/data/types.ts` and
  `src/data/categories.ts`, which must stay free of browser-only imports.
  Never log or return amounts, descriptions or credentials in errors or
  diagnostics.
- **Only Sync reaches Pluggy.** Every page and every route reads Trove's
  database; the Sync job is the only code that fetches data from Meu Pluggy.
  The one other Pluggy call is the Connect token (`/api/connect-token`), which
  opens Pluggy Connect to link the account and returns no data. A test
  (`server/pluggy/onlySync.test.ts`) fails if another file creates a Pluggy
  client.
