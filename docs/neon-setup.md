# Neon (Postgres) setup

Trove stores its data in a Postgres database on [Neon](https://neon.tech).
Pluggy only returns about the last 12 months, so the database is what keeps
older history. It also holds the categories and the edits made to
transactions, so they are the same on every device. The free plan is enough
for one user.

The tables are in [`db/schema.sql`](../db/schema.sql). Once the database is
set up, every screen reads from it, and it only changes on **Sync** (see
[Sync](#sync)) or on an edit made in the app.

## 1. Create the project

1. Sign up at [neon.tech](https://neon.tech) on the **Free** plan.
2. **Create project**:
   - **Name:** `trove`.
   - **Postgres version:** the default (latest).
   - **Region:** the one nearest to Vercel's function region (Vercel →
     **Project → Settings → Functions → Function Region**). Washington, D.C.
     (`iad1`, the default) matches Neon's **AWS US East 1 (N. Virginia)**;
     São Paulo (`gru1`) matches **AWS South America (São Paulo)**. The same
     region on both sides keeps queries fast.
3. Neon creates a database named `neondb` and a role. Both can be kept, or a
   database named `trove` added under **Databases**.

## 2. Create the tables

1. In Neon, open **SQL Editor** and select the database.
2. Paste the whole of `db/schema.sql` and **Run**. It creates 12 tables.
   Running it again is safe: existing tables are skipped.

**Tables created from an earlier version:** run
[`db/migrations/002_categories_and_sync.sql`](../db/migrations/002_categories_and_sync.sql)
the same way. It adds `categories`, `subcategories`, `app_settings` and the
transactions' `category_id`, `subcategory_id` and `is_hidden` columns. It
replaces three tables that were never written to (`user_categories`, the old
`subcategories`, `transaction_overrides`); running it again is safe. Until it
has run, the app shows "The database tables are out of date".

## 3. Give Vercel the connection string

1. In Neon, open **Connect**, choose the database and role, and turn
   **Connection pooling** on (the host then contains `-pooler`). Serverless
   functions open many short connections, which is what pooling is for.
2. Copy the connection string (`postgresql://…?sslmode=require`).
3. In Vercel → **Project → Settings → Environment Variables**, add:
   - **Key:** `DATABASE_URL`
   - **Value:** the connection string
   - **Environments:** Production. Preview deployments need a separate Neon
     **branch** (Neon → Branches → Create branch) with its own string, so
     previews never write to production data.
4. Redeploy.

The connection string contains the database password and is handled like the
Pluggy secret:
- It lives only in Vercel's environment variables, never in code, commits or
  chats.
- If it leaks: reset the role's password in Neon (**Roles → Reset password**)
  and update `DATABASE_URL`.

Alternatively, Vercel → **Storage → Create Database → Neon** (or **Connect**
on an existing Neon database) creates the variables and keeps them in sync
when the password changes. The free plan is available there too, but the
database is then billed and managed through Vercel.

With Vercel Storage, variable names start with the prefix chosen there. Trove
reads, in this order:

1. `DATABASE_URL` (added by hand, or by Storage with no prefix);
2. `TROVE_DATABASE_DATABASE_URL` (Storage with the prefix `TROVE_DATABASE`).

Both are the pooled connection. The `…_UNPOOLED` and `…_PG*` variables that
Storage also creates aren't used. If neither variable is set, the routes that
need the database refuse with `503` (fail closed).

## The tables

The tables follow Pluggy's model: a bank connection (Pluggy's *item*) has
accounts, and an account has transactions and, for cards, monthly bills. Each
table is keyed by Pluggy's own IDs, so a sync is an *upsert*: insert a row, or
update it if that ID already exists.

Money is stored as integer cents (`bigint`), as in the app. Each Pluggy row
also keeps the complete response in `raw` (`jsonb`), so a field Trove doesn't
use today can be read later without fetching it again.

| Table | Key | Holds |
|---|---|---|
| `bank_connections` | `id` (Pluggy item ID) | One per connection in Meu Pluggy: connector, Trove's bank name, status, last refresh, `synced_at` |
| `accounts` | `id` (Pluggy account ID) → `bank_connections` | Type, name, currency, balance; for cards: limit, available, minimum payment, close and due dates, brand |
| `account_balances` | (`account_id`, `as_of`) | One balance per account per day. Pluggy only gives the current balance, so this builds the history |
| `card_bills` | `id` (Pluggy bill ID) → `accounts` | A card's monthly statements: due date, total, minimum payment, finance charges. The card itself is a row in `accounts` |
| `transactions` | `id` (Pluggy transaction ID) → `accounts` | Date, description, type, amount (and in the account's currency), status, operation type, Pluggy's category, installment *n* of *N*, purchase date and total, merchant, payment method, `card_bill_id`, `provider_id`; edits: `category_id`, `subcategory_id`, `is_hidden` |
| `categories` | `id` | Name, type (expense or income), colour key, icon key, order. The 10 defaults are seeded on first run, in the app's language |
| `subcategories` | `id` → `categories`; unique name per category | Subcategories, deleted with their category |
| `card_settings` | `account_id` → `accounts` | Closing and due days per card (not used yet: still kept per device) |
| `exchange_rates` | (`currency_code`, `as_of`) | BRL per unit of a foreign currency, one per day, saved by the sync |
| `sync_runs` | generated `id` | When each sync ran, what triggered it, how many rows changed, and errors as status codes only |
| `webhook_events` | `event_id` (Pluggy's) | Webhook deliveries already handled, so a repeated delivery runs once |
| `app_settings` | `key` | App-wide values: when the default categories were seeded, when anything last synced |

Transactions that disappear are kept, not deleted. A pending card purchase can
come back under a new ID once it posts; when a sync no longer finds the old
one, it sets `removed_at` and the app stops showing it.

The debug screen (`/#/debug`) shows whether `id` stays the same across syncs
and when `provider_id` and `card_bill_id` (Pluggy's `billId`) are filled in.

Deleting a category leaves its transactions uncategorized (`ON DELETE SET
NULL`) and deletes its subcategories. Moving ("linking") a subcategory to
another category moves its transactions with it, in one database transaction.

## Sync

Trove only contacts the banks on **Sync** (under the header on Overview and
Accounts on phones, in the sidebar on desktop). For each connection in
`PLUGGY_ITEM_IDS`, one at a time, the server fetches the connection, its
accounts and their transactions from Meu Pluggy, then saves them in one
database transaction:

- rows are matched on Pluggy's IDs; new transactions get Trove's category
  guess, and existing ones keep their stored category, subcategory and
  `is_hidden`: a sync never overwrites edits;
- the first sync goes back 12 months; later ones re-read from 35 days before
  the previous sync;
- transactions in that window that Pluggy no longer returns are marked
  removed;
- the day's balances and exchange rates are saved, so loading the app calls
  neither Pluggy nor a rate service;
- each run is logged in `sync_runs` (counts and status codes only).

If one connection fails, the others are still saved and the sync bar offers
**Retry**. Pluggy's webhook changes nothing: data only moves on Sync.

## Reads

Every screen works from one snapshot (`GET /api/finance`): connections,
accounts, the last 7 months of transactions (6 shown, plus one for the
6-complete-month income average) and the categories. Totals, bills,
installments and transfers are computed from it. The reads:

1. **Connections and accounts:** `bank_connections` joined to `accounts`.
2. **Transactions:** live transactions (`removed_at IS NULL`) from the first
   day of the oldest month loaded, newest first, with `category_id`,
   `subcategory_id` and `is_hidden`. Each row's `raw` JSON goes through the
   same mapping as Pluggy's live answers (`server/pluggy/map.ts`), so bank
   names, currency conversion, installments and transfer pairing stay in one
   place.
3. **Categories:** `categories` and `subcategories`.
4. **Rates:** the latest `exchange_rates` row per currency.

The first read also seeds the default categories, once.

On a local Postgres with 50,000 fake transactions (about 5 years of heavy
use), read 2 took about 4 ms using `transactions_live_booked_idx`. It returns
each row's JSON (about 1.5 KB), so 7 months of a typical history is a few MB
per load; if that becomes slow, the mapping can move to the stored columns.

Other reads and their indexes:

| Read | Index used |
|---|---|
| Sync: mark an account's transactions Pluggy no longer returns as removed | `transactions_live_account_idx` |
| Transactions of one card bill (Accounts → current bill) | `transactions_card_bill_idx` |
| A card's latest bills | `card_bills_account_due_idx` |
| A pending purchase that came back under a new ID (match by the bank's ID) | `transactions_provider_idx` |
| Latest syncs per connection | `sync_runs_connection_started_idx` |

### What is stored, what is computed

- **Computed on every load:** Trove's category guesses for display, transfer
  pairs, bill cycles, installment plans and monthly totals. Improving a rule
  fixes past transactions at once, with no data migration.
- **Stored:** Pluggy's data, the categories and subcategories, and each
  transaction's `category_id`, `subcategory_id` and `is_hidden`. A new
  transaction's category is the guess at its first sync; after that only
  edits change it.

### One database per user

Trove has a single user, so the tables have no user column. A second user
would get a second Neon database, or a user column on `bank_connections` that
every other table reaches through its foreign keys.
