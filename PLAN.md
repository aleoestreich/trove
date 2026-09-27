# Trove — Plan

A simple app that aggregates transactions from several bank accounts and shows
expenses and income in one place.

**Approach:** build a frontend-only app first, running entirely in the browser
on mock data plus CSV import, so it can be tested right away. All data access
goes through one interface, so the backend and authentication can replace the
local implementation later without changing the UI.

---

## Phase 1 — Testable frontend MVP (no backend, no auth)

### Stack
| Concern | Choice | Why |
|---|---|---|
| Build / dev server | Vite | Fast, zero-config |
| UI | React + TypeScript | Typed data model shared with a future backend |
| Styling | Tailwind CSS | Quick, consistent UI without a component library |
| Charts | Recharts | Simple bar/pie charts for spend by category and month |
| Persistence | `localStorage` (behind a repository interface) | Data survives reloads; swapped for an API later |
| CSV parsing | Papa Parse | Robust parsing of bank export files |
| Tests | Vitest + React Testing Library | Unit tests for parsing, categorisation, totals |

### Data model
```ts
Account      { id, name, institution, type: 'checking'|'savings'|'credit', currency, balance }
Transaction  { id, accountId, date, description, amount, currency, categoryId, source: 'mock'|'csv'|'api' }
Category     { id, name, kind: 'income'|'expense', color }
```
- `amount` is signed: positive = income, negative = expense. Stored in minor
  units (cents) to avoid floating-point errors.
- Transfers between your own accounts get a `transfer` category and are
  excluded from income/expense totals, so they don't count twice.

### Data layer
```
src/data/
  repository.ts       # interface: getAccounts, getTransactions(filters), addTransactions, ...
  localRepository.ts  # Phase 1: localStorage implementation
  seed.ts             # mock accounts + ~6 months of realistic transactions
  csvImport.ts        # parse a CSV, map columns, dedupe, assign to an account
  categorize.ts       # keyword rules, e.g. "UBER" -> Transport
```
Phase 2 adds `apiRepository.ts` behind the same interface.

### Screens
1. **Dashboard**: total balance across accounts, income vs. expenses for the
   selected month, net cash flow, spend by category (chart), 6-month trend.
2. **Transactions**: one list across all accounts; filter by account, date
   range, category, and income/expense; search by description; edit a
   transaction's category.
3. **Accounts**: list of accounts with balances; add or edit an account by
   hand; import a CSV into an account.
4. **CSV import dialog**: upload a file, map its columns (date, description,
   amount or debit/credit), preview, confirm. Duplicates are skipped.
5. **Settings**: manage categories and rules, reset to demo data, export all
   data as JSON.

### Milestones
1. Scaffold (Vite, TS, Tailwind, routing, lint) and data model.
2. Seed data, `localRepository`, and the Transactions page.
3. Dashboard with totals and charts.
4. Accounts page and CSV import with column mapping.
5. Categorisation rules and category editing.
6. Tests for money math, CSV parsing, dedupe, and categorisation. Add a README
   with the run instructions (`npm install && npm run dev`).

**How you test it:** run it locally and click through the demo data, then
import real CSV exports from your banks to see actual numbers. No bank
credentials are needed at this stage.

---

## Phase 2 — Backend (later)
- API: Node (Fastify) + TypeScript, reusing the shared types; PostgreSQL via
  Prisma.
- Endpoints for accounts, transactions, categories, and imports.
  `apiRepository.ts` replaces `localRepository.ts` in the frontend.
- **Bank aggregation** through a provider instead of scraping. Which one
  depends on where your banks are:
  - EU/UK: GoCardless Bank Account Data (PSD2 open banking; free tier)
  - US/Canada: Plaid
  - Other options: TrueLayer, Tink, SaltEdge
- Background job to sync transactions, with dedupe by provider transaction ID.
- Migration step: import existing localStorage data through the JSON export.

## Phase 3 — Authentication & security (later)
- User accounts (Auth.js, Clerk, or Supabase Auth); every record is scoped to
  a user.
- Encrypt the provider access tokens at rest; never store bank credentials.
- HTTPS, secure cookies, rate limiting.

## Later ideas
Budgets per category, recurring-transaction detection, multi-currency
conversion, alerts, and a mobile-friendly PWA.

---

## Open questions
1. Which country/countries are your banks in? This decides the aggregation
   provider in Phase 2, plus the default currency and CSV date formats.
2. Single currency, or several?
3. Is the proposed stack (React + TypeScript + Tailwind) OK, or do you prefer
   something else?
