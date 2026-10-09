# Trove — Plan

A simple app that aggregates transactions from several bank accounts and shows
expenses and income in one place.

**Decisions so far**
- Home currency is **BRL**. Foreign balances (e.g. USD on Wise) are shown in
  their own currency *and* converted to BRL. All totals are in BRL.
- Bank data will come from **Meu Pluggy** (Pluggy, Brazilian Open Finance). It
  already converts foreign balances to BRL.
- **Mobile-first**: it must work well on an Android phone and can be installed
  to the home screen.
- Stack: React + TypeScript + Tailwind (Vite). Recharts for charts.

---

## Phase 1 — Testable frontend on demo data ✅ (current)

No backend, no auth. It runs in the browser on hardcoded data.

- **Demo data:** 4 institutions (`src/data/seed.ts`):
  - Nubank, Itaú, Inter: each has a checking account and a credit card.
  - Wise: a BRL balance and a USD balance (the USD balance is shown as USD and
    as BRL).
  - About 6 months of transactions: salary, USD freelance income, rent, bills,
    card purchases, installments, Pix transfers, card bill payments.
- **Data model** (`src/data/types.ts`) mirrors Pluggy's Item → Account →
  Transaction. Account `type` is BANK/CREDIT, credit cards carry `creditData`
  (limit, available limit, close and due dates), and transactions keep the
  original foreign amount next to the BRL amount.
- **Money:** integer cents. Transfers and card bill payments are excluded from
  income and expenses, so nothing is counted twice.
- **Screens:**
  - **Overview (overall situation):**
    - net worth now (accounts minus card bills, as the banks report them);
    - where the money is (by bank, and BRL vs USD);
    - income vs expenses per month and the share of income kept;
    - coming up (open card bills + installments next month);
    - spending by category per month (top 5 + Other);
    - then one month in detail (totals, categories, latest transactions).
  - **Transactions:** search, filters (month, type, account, category), list
    grouped by day. Tap a transaction to see details and change its category.
  - **Accounts:** grouped by institution. Bank balances, USD balance with its
    BRL value and rate, card bill with limit usage and close/due dates.
  - **Installments:** total still to pay, amount already committed in each
    future month's bills, and each purchase with its progress (3/10), amount
    per installment, amount left and end month.
- **Balance history:** rebuilt backwards from today's balances minus later
  transactions (works the same with Pluggy data). USD balances are converted
  at the rate of that month's transactions. Demo balances are opening
  balances + all transactions, so the history is consistent.
- **Installments (parcelas):** each installment is a transaction with
  number/total/total amount/purchase date (Pluggy's `creditCardMetadata`).
  It counts as an expense in the month it's charged (decided: no option to
  count the full purchase up front). Future installments are
  projected from what has been charged so far, and they reduce the card's
  available limit.
- **Language:** pt-BR only (text, money and dates).
- **Mobile:** bottom tab bar, touch-sized targets, native selects, bottom
  sheet, dark mode, safe-area insets, and a web app manifest + icons for "Add
  to Home screen".
- **Tests:** Vitest covering summaries, money formatting/conversion, dates,
  filters, and the consistency of the demo data.

### Possible next steps within Phase 1
- Budgets per category (monthly limit + progress).
- Editable categories and auto-categorisation rules.
- Show bills by due date ("what's due this month").
- Deploy a preview (e.g. GitHub Pages) so the phone doesn't need to be on the
  same Wi-Fi.

---

## Phase 2 — Real data from Meu Pluggy

- ✅ **Live data from Pluggy** (first version): `GET /api/finance` (behind the
  login) reads the connections in `PLUGGY_ITEM_IDS`, their accounts and 6
  months of transactions from the Pluggy API, maps them to Trove's model and
  returns them to the app. No database; 5-minute in-memory cache. Setup:
  `docs/pluggy-setup.md`.
  - BRL totals; foreign accounts (Wise USD) converted with the day's rate and
    shown in their own currency too.
  - Installments from `creditCardMetadata`.
  - Pluggy categories matched to Trove's by name.
  - Transfers between own accounts and card bill payments detected.
  - The app falls back to demo data until Pluggy is configured.
- Next:
  - tune the category and transfer mapping with real data;
  - confirm how Meu Pluggy reports Wise;
  - add a "last updated" indicator and a manual refresh.
- ✅ Data in Postgres on Neon (`docs/neon-setup.md`): every screen and route
  reads the database; only the Sync button fetches from Meu Pluggy, and it
  never touches edits. The live read, its diagnostic report and the debug
  screen are gone.
- ✅ Categories and subcategories in the database (Categories tab), hidden
  transactions, category colours and icons.
- ✅ Background, idempotent sync (also stores card bills).
- ✅ Closing and due days estimated from each card's last 3 stored bills
  (the purchases charged to each), for banks that report no closing date.
- ✅ Card closing days in the database (they were kept per device), and each
  bill's closing date stored.
- ✅ FGTS balance tracked by hand (Accounts), with its history and a monthly
  reminder; shown apart from net worth.
- Next: use the stored card bills for the current bill (PR #23 reads them live).

## Phase 3 — Authentication & security

- ✅ **Single-user login** (done): Auth0 via the Vercel integration. Vercel
  Routing Middleware checks an encrypted session on every request. Who can
  sign in is managed only in Auth0 (one user, sign-ups disabled); the code has
  no email list. See `docs/auth0-setup.md`.
- Optional: passkeys (fingerprint) and MFA in Auth0.
- One database per user; no per-record user scoping needed (see docs/neon-setup.md).
- Pluggy API credentials live only on the server; never store bank passwords.
- HTTPS, secure cookies, rate limiting. Optionally lock the app with a PIN or
  biometrics on the phone.
- Turn the app into a full PWA (service worker, offline cache of the last
  sync).
