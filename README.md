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

## Languages

English and Brazilian Portuguese (PT-BR), switched in the header and saved on
the device. On first launch the device language is used. UI text, money
(`R$ 1.234,56` / `R$1,234.56`) and dates follow the language. The default
categories and subcategories are seeded once, in the language active on first
run, and shown in the active language while they keep a default name
(`src/data/categoryNames.ts`). Renamed defaults and categories created in the
app show the name as entered. Transaction descriptions and account names are
shown as the banks send them. Strings live in `src/i18n/messages.ts`.

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
  once, when it happens, not again when the bill is paid.
- A transaction counts as income or an expense by its category's type;
  uncategorized ones count by sign.
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
  i18n/                    EN / PT-BR strings and the language switch
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
