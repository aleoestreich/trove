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

## Commands

- `npm run dev`: dev server, reachable from a phone on the same Wi-Fi
- `npm test`: Vitest
- `npm run build`: typecheck (app and server) + production build

Run `npm test` and `npm run build` before pushing.

## Conventions

- **Money** is integer cents (`Cents`) in BRL. Foreign amounts keep their
  original value in `foreign`. Never use floats for money.
- **Data** goes through the `Repository` interface (`src/data/repository.ts`).
  The domain types mirror Pluggy (Item → Account → Transaction).
- **Text** shown in the UI lives in `src/i18n/messages.ts`, in both `en` and
  `pt-BR` (Brazilian Portuguese). Never hardcode UI strings. Format money and
  dates with the helpers in `src/lib/money.ts` and `src/lib/dates.ts`, which
  follow the active language.
- **Target devices:** Samsung Galaxy S25+ and Galaxy A17. Check layouts at
  360px and 412px wide, in both languages and in light and dark mode.
- **Colours** come from the tokens in `src/index.css`, never raw hex in
  components.
- **Login:** the deployed site is private (Auth0 + `middleware.ts`, see
  `docs/auth0-setup.md`). Server code lives in `middleware.ts`, `api/` and
  `server/` and is typechecked with `tsconfig.server.json` (NodeNext). Vercel
  runs these files unbundled as Node.js ES modules, so relative imports must end
  in `.js` (e.g. `./config.js`); the typecheck enforces it. It must fail
  closed: if a setting is missing, refuse the request. Who may sign in is
  managed only in Auth0 (its user list, sign-ups disabled). Never hardcode
  emails, user IDs or secrets in code, docs or config; secrets are Vercel
  environment variables.
- **Real data:** `/api/finance` reads Pluggy live (`server/pluggy/`, setup in
  `docs/pluggy-setup.md`). Pluggy credentials and item IDs are Vercel
  environment variables only. Access must stay on Pluggy's free path for
  individuals (the "Access your data" tutorial, via Meu Pluggy); never suggest
  connecting banks directly through Pluggy Connect or a paid plan. The mapping
  to Trove's model lives in
  `server/pluggy/map.ts`; shared types come from `src/data/types.ts` and
  `src/data/categories.ts`, which must stay free of browser-only imports.
  Never log or return amounts, descriptions or credentials in errors or
  diagnostics.
