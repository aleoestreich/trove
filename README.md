# Trove

See all your bank accounts, credit cards, income and expenses in one place.
It's built mobile-first and can be installed on an Android phone.

**Status:** Phase 1. It runs entirely in the browser on hardcoded demo data.
There is no backend or login yet. See [PLAN.md](PLAN.md).

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173).

### On your Android phone (tested at Galaxy S25+ size)

1. Connect your computer and phone to the same Wi-Fi.
2. Run `npm run dev`. Vite prints a **Network** URL, such as
   `http://192.168.0.12:5173`.
3. Open that URL on the phone.
4. Add it to the home screen:
   - **Samsung Internet:** menu (☰) → **Add page to** → **Home screen**.
   - **Chrome:** ⋮ menu → **Add to Home screen**.

The app follows the phone's light/dark setting. If Windows Firewall or macOS
blocks the connection, allow Node.js on private networks.

## Languages

The app is in English and Brazilian Portuguese (PT-BR). Switch with the
🇺🇸 | 🇧🇷 flag switch in the header; the choice is saved on the device. On
first launch it follows the phone's language. Text, category names, money
(`R$ 1.234,56` / `R$1,234.56`) and dates follow the language. Transaction
descriptions and account names come from the banks and are shown as-is.
Strings live in `src/i18n/messages.ts`.

## Login (deployed site only)

The site on Vercel is private: every request goes through `middleware.ts`,
and only one email can sign in, through Auth0. Local development
(`npm run dev`) has no login. Setup and troubleshooting:
[docs/auth0-setup.md](docs/auth0-setup.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server, reachable on your LAN |
| `npm test` | Runs the unit tests (money math, summaries, demo data) |
| `npm run build` | Typechecks and builds to `dist/` |
| `npm run preview` | Serves the production build, reachable on your LAN |

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
installment purchases (parcelas, active and paid off), transfers and Pix between accounts, and
card bill payments.

## How the numbers work

- Money is stored as integer cents in BRL. Foreign-currency balances and
  transactions also keep their original amount, e.g. `US$ 1.800,00` next to
  `R$ 9.810,00`.
- **Transfers between your own accounts and card bill payments are not income
  or expenses.** This way a card purchase is counted once, when it happens,
  and not again when the bill is paid.
- Net worth = money in accounts − open credit card bills. Its history is
  rebuilt from today's balances minus the transactions since each month end.
- **Installments (parcelas):** each installment is charged in its own bill and
  counts as an expense in the month it's charged, the same way the bank bills
  it. Installments not charged yet still reduce the card's available limit
  (available = limit − open bill − future installments). The Installments tab
  shows every purchase's progress (e.g. 3/10) and how much is already
  committed in each future bill.
- If you change a transaction's category, the change is saved in the
  browser's localStorage.

## Project layout

```
src/
  data/types.ts           domain model (mirrors Pluggy's Item/Account/Transaction)
  data/seed.ts            hardcoded demo data
  data/repository.ts      data-access interface the UI uses
  data/mockRepository.ts  Phase 1 implementation (demo data + localStorage)
  i18n/                   EN / PT-BR strings and the language switch
  lib/                    money, dates, income/expense summaries, installment plans
  pages/                  Overview, Transactions, Installments, Accounts
  components/             shared UI
middleware.ts             Vercel middleware: only the signed-in owner gets the app
api/auth/                 login, callback and logout (Vercel Functions)
server/auth/              login logic, encrypted cookies, tests
```
