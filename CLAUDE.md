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

  Create a new branch from `main` for each piece of work. Don't reuse a
  branch whose PR is merged.
- **PRs:** fill in every section of `pull_request_template.md`, keeping its
  headings.

## Commands

- `npm run dev`: dev server, reachable from a phone on the same Wi-Fi
- `npm test`: Vitest
- `npm run build`: typecheck + production build

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
