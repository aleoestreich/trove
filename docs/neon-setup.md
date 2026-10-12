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
2. Paste the whole of `db/schema.sql` and **Run**. It creates 14 tables.
   Running it again is safe: existing tables are skipped.

**Tables created from an earlier version:** run
[`db/migrations/002_categories_and_sync.sql`](../db/migrations/002_categories_and_sync.sql)
the same way. It adds `categories`, `subcategories`, `app_settings` and the
transactions' `category_id`, `subcategory_id` and `is_hidden` columns. It
replaces three tables that were never written to (`user_categories`, the old
`subcategories`, `transaction_overrides`); running it again is safe. Until it
has run, the app shows "The database tables are out of date".

Then run [`db/migrations/003_sync_jobs.sql`](../db/migrations/003_sync_jobs.sql)
the same way: it adds `sync_jobs` and `sync_job_items` for the background
sync.

Then run [`db/migrations/004_category_edits.sql`](../db/migrations/004_category_edits.sql):
it adds the transactions' `category_edited_at`, which marks a category set by
an edit (see [Edits are never overwritten](#edits-are-never-overwritten)).

Then run [`db/migrations/005_transfer_override.sql`](../db/migrations/005_transfer_override.sql):
it adds the transactions' `transfer_override`, the hand-set answer to "is
this a card bill payment?" (see [Card bill payments](#card-bill-payments)).
Then [`db/migrations/006_own_transfer_override.sql`](../db/migrations/006_own_transfer_override.sql),
which lets that answer also be "a transfer between own accounts" (`'own'`).

Then run [`db/migrations/007_account_nickname.sql`](../db/migrations/007_account_nickname.sql):
it adds the accounts' `nickname`, the name set in Trove for an account or
card (see [Account names](#account-names)).

Then run [`db/migrations/008_sync_options.sql`](../db/migrations/008_sync_options.sql):
it adds the sync jobs' `period` and `account_ids` and the accounts'
`transactions_synced_at`, for [Advanced sync](#advanced-sync). Until it
runs, every sync fails with a database error.

Then run [`db/migrations/009_card_days.sql`](../db/migrations/009_card_days.sql):
it adds the accounts' `card_close_day` and `card_due_day` and the bills'
`closing_date`, and fills `closing_date` in from the bills already stored
(see [Card closing days](#card-closing-days)). Until it runs, every page
reports that the tables are out of date.

Then run [`db/migrations/010_manual_balances.sql`](../db/migrations/010_manual_balances.sql):
it adds `manual_balances`, for the [FGTS balance](#fgts-balance). Until it
runs, every page reports that the tables are out of date.

Then run [`db/migrations/011_pension_plans.sql`](../db/migrations/011_pension_plans.sql):
it adds `manual_accounts` and the balances' `account_id`, for the
[previdência privada plans](#previdência-privada). Until it runs, every
page reports that the tables are out of date.

Then run [`db/migrations/012_spending_groups.sql`](../db/migrations/012_spending_groups.sql):
it adds the categories' and subcategories' `spending_group`, for the
[Equilíbrio do mês](#equilíbrio-do-mês). Until it runs, every page reports
that the tables are out of date.

Then run [`db/migrations/013_receivables.sql`](../db/migrations/013_receivables.sql):
it adds `receivables` and `receivable_payments`, for [A receber](#a-receber).
Until it runs, every page reports that the tables are out of date.

Then run [`db/migrations/014_investment_transfers.sql`](../db/migrations/014_investment_transfers.sql):
it lets `transfer_override` be `'investment'`, for
[investment moves](#investment-moves). Until it runs, marking a transaction
as an investment fails.

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
| `transactions` | `id` (Pluggy transaction ID) → `accounts` | Date, description, type, amount (and in the account's currency), status, operation type, Pluggy's category, installment *n* of *N*, purchase date and total, merchant, payment method, `card_bill_id`, `provider_id`; edits: `category_id`, `subcategory_id`, `is_hidden`, `category_edited_at`, `transfer_override` |
| `categories` | `id` | Name, type (expense or income), colour key, icon key, order. The 14 defaults are seeded on first run, with their Portuguese names; a default added to the app later is added once to a database seeded before it (`app_settings` `default_categories_offered`) |
| `subcategories` | `id` → `categories`; unique name per category | Subcategories, deleted with their category |
| `card_settings` | `account_id` → `accounts` | Closing and due days per card (not used yet: still kept per device) |
| `exchange_rates` | (`currency_code`, `as_of`) | BRL per unit of a foreign currency, one per day, saved by the sync |
| `sync_jobs` | `id` | One per Sync: when it started and finished |
| `sync_job_items` | (`job_id`, `connection_id`) | One per connection in a job: queued, running, ok or failed, with counts or an error code |
| `sync_runs` | generated `id` | Log of each connection sync: what triggered it, how many rows changed, and errors as status codes only |
| `webhook_events` | `event_id` (Pluggy's) | Webhook deliveries already handled, so a repeated delivery runs once |
| `app_settings` | `key` | App-wide values: when the default categories were seeded, when anything last synced, and the average income's filter (`income_avg_filter`) |
| `receivables` | `id` → `transactions` | "A receber": part or all of an expense owed by a person (name, amount in cents) |
| `receivable_payments` | `id` → `receivables` | Payments back of a receivable: day, amount, and the incoming transaction (NULL: typed in by hand) |

Transactions that disappear are kept, not deleted. A pending card purchase can
come back under a new ID once it posts; when a sync no longer finds the old
one, it sets `removed_at` and the app stops showing it.

Deleting a category leaves its transactions uncategorized (`ON DELETE SET
NULL`) and deletes its subcategories. Moving ("linking") a subcategory to
another category moves its transactions with it, in one database transaction.

## Sync

Trove only contacts the banks on **Sync** (under the header on Overview and
Accounts on phones, in the sidebar on desktop). The sync runs in the
background on the server:

1. `POST /api/sync` creates a job (`sync_jobs`) with one item per connection
   in `PLUGGY_ITEM_IDS` (`sync_job_items`, all `queued`) and answers `202` at
   once. A second press while a job is unfinished returns that job.
2. After the response (Vercel's `waitUntil`), a worker claims the queued
   items one at a time (`FOR UPDATE SKIP LOCKED`) and syncs each connection.
   It stops claiming after 40 s, within the function's 60 s limit; anything
   left stays queued.
3. The app polls `GET /api/sync` every 1.5 s for progress. That request also
   starts a worker when items are queued and none is running, so a long sync
   continues across invocations. With the app closed, the work in progress
   finishes on the server; remaining queued items resume on the next poll.
   Opening the app during a sync shows its progress.
4. An item still `running` after 90 s belongs to a worker that was stopped:
   it is marked `failed` (`timeout`) and can be retried.

Syncing one connection fetches the connection, its accounts, their
transactions and, for credit cards, their closed bills (`GET /bills`; a card
whose bills can't be read still syncs the rest), then saves everything in one
database transaction:

- **idempotent:** rows are upserted on Pluggy's IDs (connection, account,
  transaction, bill), so syncing the same data again changes nothing and
  never duplicates a row. A transaction ID repeated within one fetch is kept
  once, and a lock on the connection ID serializes two syncs of the same
  connection;
- new transactions get Trove's category guess, and existing ones keep their
  stored category, subcategory and `is_hidden`: a sync never overwrites
  edits (see [Edits are never overwritten](#edits-are-never-overwritten));
- a connection is fetched back to **1 January 2025** (`HISTORY_START` in
  `server/db/sync.ts`) until that has been done once: its first sync, or the
  next sync of a connection fetched with a shorter window before. Pluggy
  returns what each bank provides from there (often about a year). How far
  back each connection has been fetched is kept in `app_settings`
  (`fetched_from:<item ID>`). After that, syncs re-read from 35 days before
  the oldest last read of the accounts being synced
  (`accounts.transactions_synced_at`, else the connection's last sync);
- transactions in that window that Pluggy no longer returns are marked
  removed (on a full fetch, only from the earliest day Pluggy returned, so a
  bank with a shorter history never removes older stored transactions);
- the day's balances and exchange rates are saved, so loading the app calls
  neither Pluggy nor a rate service;
- each run is logged in `sync_runs` (counts and status codes only).

### Advanced sync

The button next to **Sync** opens the advanced sync: how far back, and which
accounts and cards. `POST /api/sync` takes `{ period?, accountIds? }`
(`SyncOptions`, kept on the job):

- `period`: `default` (the window above), or `3m`, `6m`, `1y` (from the 1st
  of the month that makes 3, 6 or 12 months with the current one, Brazil
  time) or `all` (from 2000-01-01: everything the bank provides).
  `src/data/syncPeriod.ts` holds the rule, shared with the app's labels. A
  chosen period is a history read: only what's after the earliest day
  Pluggy returned can be marked removed;
- `accountIds`: stored accounts of connections in `PLUGGY_ITEM_IDS` (`403`
  otherwise; `400` for an empty, repeated or malformed list). Only their
  connections are synced, and only their transactions and bills are read.
  The other accounts of those connections still get their balance; their
  stored transactions are left as they are, and their next sync reads back
  from their own last read. `fetched_from` only moves when every account of
  the connection was read.

Edits are kept as in any sync: a sync never overwrites a stored category,
subcategory or hidden flag.

If one connection fails, the others are still saved and the sync bar offers
**Retry** (a new job for the failed connections), with the reason for each
failure read from its error code ([Sync errors](pluggy-setup.md#sync-errors)).
The latest job's failures are shown again when the app opens, until a later
sync succeeds. A connection whose `bank_connections.status` needs a reconnect
in Meu Pluggy (`LOGIN_ERROR`, `OUTDATED`…) is flagged in the sync bar and on
its card on Accounts. Pluggy's webhook changes nothing: data only moves on
Sync.

### Edits are never overwritten

A category, subcategory or hidden flag set in the app stays as set:

- **Same transaction updated by the bank** (new amount, description, status):
  the upsert never writes `category_id`, `subcategory_id`, `is_hidden` or
  `category_edited_at`.
- **Transaction replaced under a new ID** (a pending card purchase that posts):
  the old row is marked removed, and its edits move to the new row. The new
  row is the one with the same bank ID (`provider_id`) or, failing that, a new
  transaction in the same account with the same type and amount, at most 10
  days from the pending one, nearest in date. Each edit moves once. Without
  edits, the new row keeps its own guess. Receivables and payments back that
  point at the old row move to the new one too.
- **Transfer detection on read:** a transaction whose category was edited
  (`category_edited_at` set) keeps that category even when it would be paired
  as an own transfer or read as a card bill payment.
- **An empty guess isn't kept:** an uncategorized transaction whose category
  was never edited shows today's guess on read (e.g. a default category
  added after its first sync). One left uncategorized by hand
  (`category_edited_at` set) stays uncategorized.

### Card bill payments

Paying a card's bill moves money that was already spent: each purchase
counts as an expense when it's made on the card, so the payment from a bank
account must not count again (nor the payment arriving on the card as
income). A card bill payment is a transfer: no category, neither income nor
an expense, still in the account balance and the card bill. It's recognised
on read (`server/pluggy/map.ts`), in this order:

1. **Set by hand** in the transaction's details: "Marcar como pagamento de
   fatura" (`transfer_override = 'card-payment'`, which also clears the
   category) or "Não é pagamento de fatura" (`'none'`, which turns detection
   off for it). Syncs never change it, and it moves to a transaction that
   replaces a pending one. The same answer marks a **transfer between own
   accounts** ("Marcar como transferência entre suas contas", `'own'`) for
   one that isn't detected, such as a wire from an account that isn't
   connected; "Não é transferência entre suas contas" (`'none'`) undoes it.
2. An **edited category** wins over the rules below.
3. **Pluggy's category** ("Credit card payment").
4. **Wording**: a debit from a bank account like "PAGAMENTO FATURA", "PAG
   FATURA", "PGTO CARTAO", "FATURA DO CARTÃO"; a credit on a card like
   "Pagamento recebido" (refunds, "Estorno"…, excluded).
5. **Pairing**: a bank debit and a card credit of the same amount up to 5
   days apart, nearest first.

### Investment moves

Money moved into or out of an investment (an aplicação, a resgate, a
caixinha, a CDB, Tesouro Direto) is the owner's money changing place, so it
is a transfer (`transfer: 'investment'`): no category, neither income nor
an expense, still in the account balance. Recognised on read
(`categoryFor` in `server/pluggy/map.ts`), after own transfers and bill
payments:

1. **Set by hand**: "Marcar como investimento" (`transfer_override =
   'investment'`), or "Não é investimento" (`'none'`).
2. An **edited category** wins over the rules below.
3. **What an investment pays** comes first: Pluggy's interest, yield or
   dividend categories, or wording like "Rendimento", "Juros",
   "Dividendos", "Proventos" on money in, is income under Rendimentos;
   interest on money out (a card's or an overdraft's) is a fee, under
   Impostos e tarifas.
4. **Pluggy's investment categories** ("Investments", "Automatic
   investment", "Fixed income", "Variable income", "Mutual funds") or
   **wording** like "Aplicação", "Resgate", "Caixinha", "Cofrinho", "RDB",
   "CDB", "LCI/LCA", "Tesouro Direto", "Poupança".

Balances of the investments themselves aren't read yet, so net worth still
counts only the bank accounts and cards.

### Bulk categorization

**Transações → Selecionar** (phones) or the checkbox column (desktop) sets
one category and subcategory on many transactions at once, through
`POST /api/edits` with `{ op: 'categorizeMany', transactionIds, categoryId,
subcategoryId }`:

- The rules (`checkBulk` in `src/data/edits.ts`, the same in the app and on
  the server): every ID is a live transaction of a configured connection;
  none is a transfer or card bill payment; all are expenses or all income;
  the category is of that type; the subcategory belongs to it. Otherwise
  `400` with a `reason` (`transfer`, `mixed_types`, `category_type`,
  `subcategory_category`) or `404`.
- One database transaction, all or nothing. The rows are locked, checked
  against the transactions as the app shows them (transfers are detected on
  read), updated, and marked `category_edited_at`, so a sync never changes
  them.
- The answer is `{ updated, previous: [{ id, categoryId, subcategoryId,
  editedAt }] }`. Undo sends `previous` back as
  `{ op: 'restoreCategories', items }`, which restores each value and edited
  mark in one transaction.

### Average income filter

The "Renda média" card on Overview counts only the income categories and
subcategories chosen with its pill. The choice is stored once in the
database (so phone and desktop share it), in `app_settings` under
`income_avg_filter`, as exclusions, so any income category or subcategory
created later counts by default:

```json
{
  "income_avg_excluded_category_ids": [],
  "income_avg_excluded_subcategory_ids": [],
  "income_avg_exclude_uncategorized": false
}
```

No row means nothing is excluded. Deleting an excluded category or
subcategory removes its ID. The calculation lives in
`src/data/incomeAverage.ts`, shared by the app and the server: income only
(no own transfers, card bill payments, hidden transactions or expenses), in
BRL (foreign income at the stored rate), over the last 6 complete months.

| Route | Answer |
|---|---|
| `GET /api/overview/income-average` | `{ average, months: [{ month, total }], lowest, highest, currentMonth, allAverage, filter }`; `filter` holds the exclusions and the pill's label |
| `GET /api/overview/income-average/categories` | Every income category, its subcategories and "Sem categoria", with the monthly average and the total per month (enough for the picker's live preview) |
| `PUT /api/settings/income-average-filter` | Saves `{ excludedCategoryIds, excludedSubcategoryIds, excludeUncategorized }` and answers with the recalculated `GET /api/overview/income-average` body; `400` with `reason: nothing_selected` ("Selecione pelo menos uma categoria") or `not_income` |

These routes and the insight routes below are one Vercel Function
(`api/insights.ts`); `vercel.json` rewrites their paths to it, as the Hobby
plan allows 12 functions per deployment.

The app computes the same figures from the snapshot it already has (the
filter comes with `GET /api/finance`), so the card and the preview need no
extra request; saving goes through the `PUT`.

## Insights: projection, unusual categories and recurring charges

The calculations live in `src/data/projection.ts`, `src/data/unusual.ts` and
`src/data/recurring.ts`, shared by the app and the server
(`server/db/insights.ts`). Two more `app_settings` rows hold what they need
(no migration: the table exists already):

- `projection_settings`: `{ accountIds, includeDaily, includeFreelance }`
  (`accountIds: null` means the checking accounts in BRL). No row: the
  defaults (day-to-day spending on, freelance off).
- `recurring_overrides`: the answers about recurring charges, by recurring
  charge ID (the merchant as a slug): `{ status, statusAt, increaseDismissedAt }`,
  with `status` one of `confirmed`, `not_recurring`, `cancelled`,
  `still_active`. Detection runs on every read, so it follows each sync and
  each category change, and these answers are applied on top.

| Route | Answer |
|---|---|
| `GET /api/insights/projection` | `{ available, asOf, endDate, end, low, range, breakdown, daily, events, settings }`; `available: false` without 2 months of salary history |
| `PUT /api/insights/projection/settings` | Saves `{ accountIds, includeDaily, includeFreelance }` and answers with the recalculated projection; `400` when invalid (e.g. no account) |
| `GET /api/insights/unusual-categories` | `{ month, compareFrom, compareTo, mode, days, unusual, normal }` |
| `GET /api/recurring` | `{ monthTotal, yearTotal, active, stopped, alerts }` |
| `POST /api/recurring/:id/action` | `{ action }`: `confirm`, `not_recurring`, `cancelled`, `still_active` or `dismiss_increase`; answers with the recalculated list |

The app computes the same from its snapshot, so the cards need no extra
request; saving goes through the `PUT` and `POST` routes.

## Account names

A name set in Trove for an account or card is the `nickname` column of
`accounts` (migration 007). It is saved through `POST /api/edits`
(`{ op: "renameAccount", accountId, name }`; `name: null` goes back to the
bank's) and read with each account. Sync's upsert only writes the bank's
columns (`name`, `raw`…), never `nickname`, so a sync never changes it.

## Card closing days

A card's bill needs its closing and due dates. In order, they come from:

1. The days set in Trove, the `card_close_day` and `card_due_day` columns
   of `accounts` (migration 009). They're saved through `POST /api/edits`
   (`{ op: "setCardDays", accountId, days: { close, due } }`; `days: null`
   clears them) and work on every device. Days an older version kept in
   the browser are moved there on the next load. Sync never writes these
   columns.
2. The dates the bank reports for the card (`creditData.balanceCloseDate`).
3. The card's last 3 bills: their `closing_date` (Pluggy's
   `billClosingDate`, stored by each sync), or, when the bank doesn't
   report it, an estimate from the purchases charged to each bill
   (`src/data/closingDay.ts`).

## FGTS balance

No bank connection reports the FGTS, so its total is typed in by hand on
Accounts and kept as a history (`src/data/fgts.ts`):

- Every update is a row of `manual_balances` (`kind = 'fgts'`, the day it
  refers to and the balance in cents), migration 010. A correction rewrites
  its row; deleting removes it.
- Whether it's shown is `app_settings` `fgts` (`{ "tracking": true }`).
  Turning it off keeps the rows.
- Edits, through `POST /api/edits`: `setFgtsTracking`, `saveFgtsBalance`
  (`entry: { id, date, balance }`), `deleteFgtsBalance` and
  `clearFgtsHistory`. Both read with the snapshot (`fgts`).
- It never counts in a total: net worth shows it as its own line, and it
  stays out of income, spending, insights and the projection. Sync never
  touches it.
- Visão geral reminds to update it from the 20th of a month without a
  balance for that month (employers deposit by the 20th), or when the
  latest balance is more than a month old.

## Previdência privada

Previdência privada plans are tracked by hand too (`src/data/pension.ts`):

- Each plan is a row of `manual_accounts` (`kind = 'pension'`): a name set
  in Trove (up to 40 characters) and, optionally, `PGBL` or `VGBL`.
- Its balances are rows of `manual_balances` (`kind = 'pension'`,
  `account_id` = the plan), one per update. Deleting a plan deletes them
  (`ON DELETE CASCADE`). The FGTS's rows have no `account_id`.
- Whether they're shown is `app_settings` `pension` (`{ "tracking": true }`).
  Turning it off keeps the plans.
- Edits, through `POST /api/edits`: `setPensionTracking`,
  `savePensionPlan` (`plan: { id, name, type }`, adds or renames),
  `deletePensionPlan`, `savePensionBalance` (`planId`, `entry`) and
  `deletePensionBalance`. Read with the snapshot (`pension`).
- Like the FGTS, it never counts in a total: net worth shows the plans'
  latest balances added up as a line of their own.
- A plan's balance is due for an update when it has none, or its latest is
  more than a month old; Visão geral reminds about those plans.

## 13º e férias

The extra pay of a CLT job (`src/data/extraPay.ts`), off by default:

- Stored in `app_settings` `extra_pay`
  (`{ "enabled": false, "salary": null, "firstPart": 11, "vacations": [] }`;
  `salary` in cents or null for the projection's median month, `firstPart`
  a month from 2 to 11 or `"vacation"`, each vacation `{ id, start, days,
  sold }` with 5–30 days, at most 20 when 10 are sold). Anything stored
  that isn't valid reads as off. No migration: `app_settings` already exists.
- Edit, through `POST /api/edits`: `setExtraPay` (`extraPay`, complete).
  Read with the snapshot (`extraPay`). Syncs never touch it.
- The month-end projection (app and `GET /api/insights/projection`) adds
  the 13º's parts and the vacation pay due before its end, and lowers each
  month's salary by its vacation days.

## Visão geral layout

The order of the Visão geral's cards and the hidden ones ("Personalizar",
`src/data/overviewLayout.ts`), the same on every device:

- Stored in `app_settings` `overview_layout`
  (`{ "order": [every card, once], "hidden": [cards] }`, card keys such as
  `netWorth`, `balance`, `projection`); the default order with every card
  shown when absent. No migration: `app_settings` already exists.
- Edit, through `POST /api/edits`: `setOverviewLayout` (`layout`, every
  card listed once in `order`). Read with the snapshot (`overviewLayout`).
  Syncs never touch it.
- Read back made whole: unknown cards are dropped, and a card added to the
  app later shows at its default place (after the card before it by
  default).

## A receber

Money paid on someone else's behalf, tracked until it's paid back
(`src/data/receivables.ts`):

- Each receivable is a row of `receivables`: the expense it came from
  (`transaction_id`, a purchase or a Pix out), the person (up to 40
  characters) and what they owe (`amount_cents`, in BRL, part or all of the
  expense). Several people can owe parts of one expense.
- Each payment back is a row of `receivable_payments`: the day, the amount,
  and the incoming transaction it came in (`transaction_id`), or NULL when
  typed in by hand (cash, an account that isn't connected). Deleting a
  receivable deletes its payments (`ON DELETE CASCADE`).
- Edits, through `POST /api/edits`: `saveReceivable` (`receivable: { id,
  transactionId, person, amount }`, adds one or changes who and how much),
  `deleteReceivable`, `saveReceivablePayment` (`receivableId`, `payment: {
  id, date, amount, transactionId }`, adds one or corrects it) and
  `deleteReceivablePayment`. Read with the snapshot (`receivables`).
- The rules (`applyReceivableEdit` in `src/data/edits.ts`, the same in the
  app and on the server, which reads the transactions as the app shows them
  first, under one lock): the expense is money out and not a transfer, and
  stays the same; its receivables add up to at most its amount; what one is
  owed is never below what was paid back; its payments add up to at most
  what's owed; a payment from a transaction is money in, not a transfer, and
  the payments from one transaction add up to at most what came in. A
  refused edit answers 400 with a `reason`.
- Totals are unchanged: the expense still counts as the bank charged it,
  and the money that came in still counts as income.

## Equilíbrio do mês

How each month's income splits between Essencial, Estilo de vida and
Futuro, against a target (`src/data/spendingBalance.ts`):

- Each expense category's group is `categories.spending_group`
  (`essential`, `lifestyle`, or NULL: "Sem grupo"); a check keeps income
  categories without one. A subcategory may have its own
  (`subcategories.spending_group`; NULL: it follows its category). A
  category that becomes income, or a subcategory moved under one, loses it.
- The target is `app_settings` `balance_target`
  (`{ "essential": 50, "lifestyle": 30, "future": 20 }`, whole percents
  that add up to 100); 50/30/20 when absent.
- Edits, through `POST /api/edits`: `setCategoryGroups` (`groups:
  [{ categoryId, group }]`, all or none, expense categories only; also the
  undo of "Organizar categorias"), `setSubcategoryGroup` (`id`, `group`) and
  `setBalanceTarget` (`target`). Read with the snapshot (`categories`,
  `subcategories`, `balanceTarget`). Syncs never touch them.
- The split itself is computed in the app from the stored transactions:
  the income is the average income's filter (for the month in progress,
  Renda média itself, the average of the last 6 complete months, or what came in when that's more,
  since some income only arrives at the end of the month), the spending the
  expenses that count everywhere else (no hidden ones, transfers or bill
  payments; installments in the month they're charged). The month in
  progress also counts the charges still expected in it: installments to be
  charged and recurring charges not charged yet, each in its category's
  group; and a group that hasn't reached its target yet keeps the rest of
  it in reserve, out of the Futuro. Futuro = income − Essencial −
  Estilo de vida; "Sem grupo" sits inside it until classified.

## Reads

Every screen works from one snapshot (`GET /api/finance`): connections,
accounts, the last 14 months of transactions (6 shown on most screens; the
insights use the rest), the list of every stored month and the categories.
Older months are read when Transações asks for them:
`GET /api/transactions?month=YYYY-MM|all&type=&account=&category=&q=`
answers `{ transactions }` with the same mapping and Transações' filters
applied (one function with `/api/finance`, through a `vercel.json` rewrite). Totals, bills,
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
- **Stored:** Pluggy's data, the categories and subcategories, each
  transaction's `category_id`, `subcategory_id` and `is_hidden`, and the
  receivables with their payments back. A new
  transaction's category is the guess at its first sync; after that only
  edits change it.

### One database per user

Trove has a single user, so the tables have no user column. A second user
would get a second Neon database, or a user column on `bank_connections` that
every other table reaches through its foreign keys.
