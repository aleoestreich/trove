# Neon (Postgres) setup

Trove can keep a copy of your Pluggy data in a Postgres database on
[Neon](https://neon.tech). Pluggy only returns about the last 12 months, so the
database is what keeps your history beyond that. It also keeps your category
changes and card closing days across devices. The free plan is enough for one
person.

The tables are in [`db/schema.sql`](../db/schema.sql). Trove doesn't read or
write the database yet: the sync comes in a later change. You can set it up now.

## 1. Create the project

1. Sign up at [neon.tech](https://neon.tech) and choose the **Free** plan.
2. **Create project**:
   - **Name:** `trove`.
   - **Postgres version:** the default (latest).
   - **Region:** the region nearest to where Vercel runs Trove's functions.
     You can check this in Vercel under **Project → Settings → Functions →
     Function Region**. The default is Washington, D.C. (`iad1`), which matches
     Neon's **AWS US East 1 (N. Virginia)**. If you move the functions to
     São Paulo (`gru1`), choose **AWS South America (São Paulo)** instead.
     Keeping both in the same region keeps every query fast.
3. Neon creates a database named `neondb` and a role. You can keep them, or add a
   database named `trove` under **Databases**.

## 2. Create the tables

1. In Neon, open **SQL Editor** and select the database.
2. Paste the whole of `db/schema.sql` and **Run**. It creates 10 tables.
   Running it again is safe: it skips the tables that already exist.

## 3. Give Vercel the connection string

1. In Neon, open **Connect**. Choose the database and role, and turn
   **Connection pooling** on: the host then contains `-pooler`. Serverless
   functions open many short connections, which is what pooling is for.
2. Copy the connection string (`postgresql://…?sslmode=require`).
3. In Vercel, go to **Project → Settings → Environment Variables** and add:
   - **Key:** `DATABASE_URL`
   - **Value:** the string you copied
   - **Environments:** Production. For Preview deployments, use a separate
     Neon **branch** (Neon → Branches → Create branch) with its own string,
     so previews never write to your real data.
4. Redeploy.

The connection string contains the database password. Treat it like the Pluggy
secret:
- Keep it only in Vercel's environment variables, never in the code, a commit
  or a chat.
- If it leaks, reset the role's password in Neon (**Roles → Reset password**)
  and update `DATABASE_URL`.

Alternatively, Vercel → **Storage → Create Database → Neon** creates the
project and sets the variables for you. The free plan is also available there,
but then the database is billed and managed through Vercel. Both ways work.

## The tables

The tables follow Pluggy's model: a bank connection (Pluggy calls it an
*item*) has accounts, and an account has transactions and, for cards, monthly
bills. Each table is keyed by Pluggy's own IDs, so
a sync is an *upsert*: insert a row, or update it if that ID already exists.

Money is stored as integer cents (`bigint`), as in the app. Each Pluggy row also
keeps the complete response in `raw` (`jsonb`), so a field Trove doesn't use
today can be read later without fetching it from Pluggy again.

| Table | Key | Holds |
|---|---|---|
| `bank_connections` | `id` (Pluggy item ID) | One per bank connected in Meu Pluggy: connector, Trove's bank name, status, last refresh |
| `accounts` | `id` (Pluggy account ID) → `bank_connections` | Type, name, currency, balance; for cards: limit, available, minimum payment, close and due dates, brand |
| `account_balances` | (`account_id`, `as_of`) | One balance per account per day. Pluggy only gives today's balance, so this builds the history |
| `card_bills` | `id` (Pluggy bill ID) → `accounts` | A card's monthly statements: due date, total, minimum payment, finance charges. The card itself is a row in `accounts` |
| `transactions` | `id` (Pluggy transaction ID) → `accounts` | Date, description, type, amount (and in the account's currency), status, operation type, Pluggy's category, installment *n* of *N*, purchase date and total, merchant, payment method, `card_bill_id`, `provider_id` |
| `transaction_overrides` | `transaction_id` → `transactions` | Your changes to a transaction: its category, and whether to ignore it (today saved per phone) |
| `card_settings` | `account_id` → `accounts` | Your closing and due days per card (today saved per phone) |
| `exchange_rates` | (`currency_code`, `as_of`) | BRL per unit of a foreign currency, one per day, saved by the sync |
| `sync_runs` | generated `id` | When each sync ran, what triggered it, how many rows changed, and errors as status codes only |
| `webhook_events` | `event_id` (Pluggy's) | Webhook deliveries already handled, so a repeated delivery runs once |

Transactions that disappear are kept, not deleted. A pending card purchase can
come back under a new ID once it posts. When a sync no longer finds the old one,
it sets `removed_at` and the app hides it.

Use the debug screen (`/#/debug`) to confirm that `id` stays the same across
syncs and to see when `provider_id` and `card_bill_id` (Pluggy's `billId`) are filled in.

## How the app reads it

Every screen (Overview, Transactions, Accounts, Installments) works from the
same snapshot the app loads once: connections, accounts, the last 6 months of
transactions and your settings. Totals, bills, installments, categories and
transfers are worked out in the app, as they are today. So loading Trove is
four small reads, sent to Neon in one round trip:

1. **Connections and accounts:** `bank_connections` joined to `accounts`, a
   few rows.
2. **Transactions shown:** live transactions (`removed_at IS NULL`) from the
   first of the oldest month shown, newest first, with your category and
   ignore choice from `transaction_overrides` (`LEFT JOIN`). This uses the partial index
   `transactions_live_booked_idx`. The query lists its columns and leaves out
   `raw`.
3. **Your settings:** `card_settings`.
4. **Rates:** the latest `exchange_rates` row per currency.

No call to Pluggy or to a rate service happens while you load the app. Those
calls happen only in the sync. On a local Postgres with 50,000 fake
transactions (about 5 years of heavy use), read 2 took about 4 ms.

The other reads:

| Read | Index used |
|---|---|
| Sync: mark an account's transactions Pluggy no longer returns as removed | `transactions_live_account_idx` |
| Transactions of one card bill (Accounts → current bill) | `transactions_card_bill_idx` |
| A card's latest bills | `card_bills_account_due_idx` |
| A pending purchase that came back under a new ID (match by the bank's ID) | `transactions_provider_idx` |
| "Last updated" and the latest syncs per connection | `sync_runs_connection_started_idx` |

### Why the app doesn't store its categories or totals

- **Derived values stay out of the database.** Trove's category guess, transfer pairs, bill
  cycles, installment plans and monthly totals are worked out from the stored
  rows each time the app loads. Improving a rule then fixes every past
  transaction at once, with no data to migrate.
- **Your own choices are stored.** Category changes, ignored transactions
  and card days are what the database keeps of Trove's own data.

### One database per owner

Trove has a single owner, so the whole database belongs to that owner and the
tables have no owner column. If a second person ever needs access, the
simplest option is a second Neon database. The other is to add an owner column
to `bank_connections`; every other table reaches its owner through it.
