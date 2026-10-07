# Trove

Personal finance app that aggregates Brazilian bank accounts, credit cards,
income and expenses. Mobile-first; installable on Android.

**Status:** the deployed site is private (Auth0 login) and reads its data from
a Postgres database filled from Meu Pluggy on Sync. Local development runs on
demo data. Roadmap: [PLAN.md](PLAN.md).

## Run

```bash
npm install
npm run dev
```

The dev server is at the URL Vite prints (http://localhost:5173).

### On an Android phone (tested at Galaxy S25+ size)

1. Put the computer and the phone on the same Wi-Fi network.
2. Run `npm run dev`. Vite prints a **Network** URL, such as
   `http://192.168.0.12:5173`.
3. Open that URL on the phone.
4. Add it to the home screen:
   - **Samsung Internet:** menu (☰) → **Add page to** → **Home screen**.
   - **Chrome:** ⋮ menu → **Add to Home screen**.

The app follows the system light/dark setting. If Windows Firewall or macOS
blocks the connection, allow Node.js on private networks.

## Language

Brazilian Portuguese (pt-BR) only. All UI text lives in one file,
`src/i18n/messages.ts`. Money (`R$ 1.234,56`, `US$ 1.234,56`), dates
(`12 set.`, `segunda, 28 set.`) and chart labels (`13,4 mil`) use pt-BR
formatting (`src/lib/money.ts`, `src/lib/dates.ts`). The default categories are
seeded with their Portuguese names. Error codes from the API are shown in
Portuguese, never the server's own text. Transaction descriptions and account
names are shown as the banks send them.

## Data

- **Deployed site:** every screen reads Trove's database (Postgres on Neon).
  The database only changes on **Sync**, which fetches each Meu Pluggy
  connection in turn, and on edits made in the app (categories, hidden
  transactions). Setup: [docs/neon-setup.md](docs/neon-setup.md) and
  [docs/pluggy-setup.md](docs/pluggy-setup.md).
- **Until configured or synced:** demo data, with a Sync or Connect prompt.
- **Local development:** demo data; edits are kept in localStorage.

## Login (deployed site only)

The site on Vercel is private: every request goes through `middleware.ts`,
and only users in the Auth0 tenant (a single user, with sign-ups disabled)
can sign in. Local development (`npm run dev`) has no login. Setup and
troubleshooting: [docs/auth0-setup.md](docs/auth0-setup.md).

## Icons and bank badges

The icon pack lives in `src/assets/icons/` (see its README): UI icons
(`ui/`), the 54 category icons (`categories/`), bank glyphs and brand files.
`src/components/Icon.tsx` draws them in the current text colour.
`categories/categories.json` also holds the 24 category colours (CSS tokens
`--cat-*`, light and dark) and the default categories; after updating it, run
`node scripts/category-catalog.mjs` to regenerate `src/data/categoryCatalog.ts`.

Banks show as rounded-square badges (`src/components/BankBadge.tsx`) holding
Trove's own outline glyph (`ui/bank-*.svg`, not the official logos), tinted
with their colour token: Nubank `--series-4`, Itaú `--series-2`, Santander
`--series-5`, Wise `--series-3`. Other banks get their first two letters in a
neutral badge. Categories are circles (`CategoryBadge`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server, reachable on the LAN |
| `npm test` | Runs the unit tests; the database tests also run when `TEST_DATABASE_URL` points at a disposable Postgres |
| `npm run build` | Typechecks (app and server) and builds to `dist/` |
| `npm run preview` | Serves the production build, reachable on the LAN |

## Demo data

The data is in `src/data/seed.ts`. It is generated relative to today, so the
current month always has transactions.

| Institution | Accounts |
|---|---|
| Nubank | Checking account + credit card |
| Itaú | Checking account + credit card |
| Inter | Checking account + credit card |
| Wise | BRL balance + USD balance, shown in USD and converted to BRL |

It covers salary, freelance income paid in USD, rent, bills, card purchases,
installment purchases (parcelas, active and paid off), transfers and Pix
between accounts, and card bill payments.

## How the numbers work

- Money is stored as integer cents in BRL. Foreign-currency balances and
  transactions also keep their original amount, e.g. `US$ 1.800,00` next to
  `R$ 9.810,00`.
- **Transfers between connected accounts and card bill payments are neither
  income nor expenses**, and have no category. A card purchase is counted
  once, when it happens, not again when the bill is paid. Bill payments are
  recognised by Pluggy's category, their wording, or by pairing the bank
  debit with the card credit; any transaction can also be marked (or
  unmarked) as one in its details, or as a transfer between own accounts
  (e.g. money moved in from an account that isn't connected).
- A transaction counts as income or an expense by its category's type;
  uncategorized ones count by sign.
- **Bulk categorization:** many transactions can get one category and
  subcategory at once (Transações → Selecionar, or the checkbox column on
  desktop), all or nothing, with Undo. Transfers can't be selected, and a
  selection must be all expenses or all income.
- **Average income** (Overview) averages the last 6 complete months of
  income in the categories chosen on its card (all by default; the choice is
  saved in the database and shared between devices).
- **Previsão do fim do mês** (Overview, then its detail page) projects what
  is left in the chosen accounts (checking accounts in BRL by default) on the
  last day of the month: today's balance + the salary still expected (its
  6-month average, on its usual day) − card bills due this month − recurring
  charges paid by debit, Pix or boleto − the usual day-to-day spending. Each
  value is counted once: card installments and subscriptions are inside the
  bills. The accounts, day-to-day spending and freelance income are settings
  saved in the database.
- **Fora do padrão** compares each expense category with its own average:
  the last complete month vs the 6 before it, or, from day 11, the month so
  far vs the same days of those months. Beyond ±15% is unusual; categories
  averaging under R$ 100 are left out.
- **Recorrentes** finds charges the same merchant repeats every month (or
  every year) at a similar amount and day, flags new ones, stopped ones and
  price increases, and totals them per month and year (stopped ones out,
  yearly ones divided by 12). Answers such as "Não é recorrente" are saved in
  the database and kept when detection runs again after each sync.
- The insights read 14 months of transactions (a year is needed for yearly
  charges); every screen still shows the last 6.
- **Account and card names:** any account or card can be renamed on Contas
  (the pencil next to it). The name is shown everywhere in Trove and saved
  in the database (`accounts.nickname`), a column a sync never writes;
  "Usar o nome do banco" goes back to the bank's.
- **Hidden transactions** are left out of every total, chart, average,
  category breakdown and installments total. Balances, net worth and card
  bills still include them, as they are the bank's figures.
- Net worth = money in accounts − open credit card bills. Its history is
  rebuilt from today's balances minus the transactions since each month end.
- **Installments (parcelas):** each installment is charged in its own bill and
  counts as an expense in the month it's charged, as the bank bills it.
  Installments not charged yet still reduce the card's available limit
  (available = limit − open bill − future installments). The Installments tab
  shows each purchase's progress (e.g. 3/10) and the amount already committed
  in each future bill.

## Project layout

```
src/
  data/types.ts            domain model (mirrors Pluggy's Item/Account/Transaction)
  data/edits.ts            changes to categories and transactions, and their rules
  data/categoryCatalog.ts  colours, icons and default categories (generated)
  data/seed.ts             demo data
  data/repository.ts       data-access interface the UI uses
  data/mockRepository.ts   demo data, edits in localStorage
  data/apiRepository.ts    database-backed data via /api (deployed site)
  i18n/                    UI strings (pt-BR)
  lib/                     money, dates, summaries, bills, installment plans
  pages/                   Overview, Transactions, Accounts, Installments, Categories
  components/              shared UI
  assets/icons/            icon pack
middleware.ts              Vercel middleware: only signed-in users reach the app
api/auth/                  login, callback and logout (Vercel Functions)
api/finance.ts             the app's data, read from the database
api/edits.ts, api/sync.ts  saving edits; background sync from Meu Pluggy and its progress
server/auth/               login logic, encrypted cookies, tests
server/db/                 database access: read, edits, sync, tests
server/pluggy/             Pluggy client, mapping to Trove's model, exchange rates, tests
db/                        schema and migrations
```
