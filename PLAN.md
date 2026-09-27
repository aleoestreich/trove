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
  - **Overview:** net balance across all accounts (with the USD breakdown),
    month switcher, income / expenses / net, spending by category, 6-month
    trend, latest transactions.
  - **Transactions:** search, filters (month, type, account, category), list
    grouped by day. Tap a transaction to see details and change its category.
  - **Accounts:** grouped by institution. Bank balances, USD balance with its
    BRL value and rate, card bill with limit usage and close/due dates.
  - **Installments:** total still to pay, amount already committed in each
    future month's bills, and each purchase with its progress (3/10), amount
    per installment, amount left and end month.
- **Installments (parcelas):** each installment is a transaction with
  number/total/total amount/purchase date (Pluggy's `creditCardMetadata`).
  It counts as an expense in the month it's charged (decided: no option to
  count the full purchase up front). Future installments are
  projected from what has been charged so far, and they reduce the card's
  available limit.
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

## Phase 2 — Backend + Meu Pluggy

- API: Node (Fastify) + TypeScript, reusing `src/data/types.ts`. PostgreSQL via
  Prisma.
- Pluggy integration:
  - The user connects their Meu Pluggy items. Store the item IDs; the backend
    fetches accounts and transactions with the Pluggy API key (server-side
    only).
  - Map Pluggy's `Account.balance` (already BRL) → `balance`, and keep the
    original currency and amount in `foreign`. Map `Transaction.amount` and
    `currencyCode` / `amountInAccountCurrency` the same way. Map
    `creditCardMetadata` (installmentNumber, totalInstallments, totalAmount,
    purchaseDate) → `installment`.
  - Map Pluggy categories to ours, and detect transfers between the user's own
    accounts.
  - Sync through Pluggy webhooks (`item/updated`, `transactions/created`)
    plus a daily fallback job. Dedupe by Pluggy transaction ID.
- Frontend: add `apiRepository.ts` implementing the same `Repository`
  interface and swap it in for `mockRepository`.

## Phase 3 — Authentication & security

- User accounts (e.g. Supabase Auth or Clerk); every record is scoped to a
  user.
- Pluggy API credentials live only on the server; never store bank passwords.
- HTTPS, secure cookies, rate limiting. Optionally lock the app with a PIN or
  biometrics on the phone.
- Turn the app into a full PWA (service worker, offline cache of the last
  sync).
