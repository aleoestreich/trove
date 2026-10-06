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
2. Paste the whole of `db/schema.sql` and **Run**. It creates 9 tables.
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
| `category_overrides` | `transaction_id` → `transactions` | Your category for a transaction (today saved per phone) |
| `card_settings` | `account_id` → `accounts` | Your closing and due days per card (today saved per phone) |
| `sync_runs` | generated `id` | When each sync ran, what triggered it, how many rows changed, and errors as status codes only |
| `webhook_events` | `event_id` (Pluggy's) | Webhook deliveries already handled, so a repeated delivery runs once |

Transactions that disappear are kept, not deleted. A pending card purchase can
come back under a new ID once it posts. When a sync no longer finds the old one,
it sets `removed_at` and the app hides it.

Use the debug screen (`/#/debug`) to confirm that `id` stays the same across
syncs and to see when `provider_id` and `card_bill_id` (Pluggy's `billId`) are filled in.
