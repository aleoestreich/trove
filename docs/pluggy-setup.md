# Meu Pluggy setup

Trove gets bank data from Pluggy, the Open Finance service behind Meu Pluggy:
- on **Sync**, the server (behind the Auth0 login) fetches each connection,
  its accounts and their transactions from Pluggy and saves them in Trove's
  database ([docs/neon-setup.md](neon-setup.md));
- every screen reads that database; nothing calls Pluggy on load.

Until the settings below and the database are in place, the deployed site
shows demo data (with the "Demo data" label).

> **Free path only.** Trove only reads the account holder's own data, which
> Pluggy provides to individuals for free through Meu Pluggy, following
> Pluggy's **"Access your data"** tutorial (docs.pluggy.ai).
>
> **No direct bank connections** in the Pluggy dashboard or Pluggy Connect,
> and no paid plan: direct connections are Pluggy's paid product. Banks are
> connected **in the Meu Pluggy app** and reached through it.

---

## 1. API credentials (Pluggy's tutorial)

The **"Access your data"** tutorial provides:

| Credential | What it is |
|---|---|
| **Client ID** | The API credentials' ID |
| **Client Secret** | The API credentials' secret. Never pasted in chats, issues or code |

A step that asks to choose or pay for a plan is not the free path.

## 2. Credentials in Vercel

In the `trove` project → **Settings** → **Environment Variables**, add these
for **Production** (and Preview if preview links are used), marked
**Sensitive**, with the real values typed only into Vercel:

| Name | Value |
|---|---|
| `PLUGGY_CLIENT_ID` | the Client ID |
| `PLUGGY_CLIENT_SECRET` | the Client Secret |
| `PLUGGY_WEBHOOK_SECRET` | a long random value (e.g. from a password generator). It proves webhook calls come from Pluggy (step 5) |

Then redeploy: **Deployments** → latest production deployment → **⋯** →
**Redeploy**. Settings only apply to new deployments.

## 3. Connect Meu Pluggy from Trove

1. Open Trove and log in. **Accounts** → **Connect your banks** →
   **Connect Meu Pluggy**.
2. Pluggy Connect opens showing **only Meu Pluggy**: the server restricts it to
   that connector, so banks can't be connected directly (the paid path). If the
   MeuPluggy connector isn't available for these credentials, Trove opens
   nothing and says so.
3. Log in with the Meu Pluggy account and approve sharing.
4. Trove shows the new connection's **item ID**, with a **Copy** button.

The banks (Nubank, Itaú, Inter, Wise…) stay connected in the **Meu Pluggy**
app; Trove reads them all through this one item. An item ID already obtained
from the tutorial works the same way, and this step can be skipped.

## 4. Item ID in Vercel

Add one more variable, then redeploy:

| Name | Value |
|---|---|
| `PLUGGY_ITEM_IDS` | the item ID from step 3 (several are separated by commas) |

## 5. Webhook (optional)

Data only changes on **Sync**, so the webhook only logs what Pluggy reports
(new connections, errors). Register it for the Pluggy application (dashboard
or API) with:

| Field | Value |
|---|---|
| URL | `https://YOUR_SITE/api/webhooks/pluggy` |
| Event | `all` (or at least `item/updated`, `item/created`, `item/error`, `transactions/created`) |
| Header | `X-Trove-Webhook-Secret` = the same value as `PLUGGY_WEBHOOK_SECRET` |

Calls without that header are refused (`401`). Without
`PLUGGY_WEBHOOK_SECRET`, every webhook call is refused (`503`).

Per event:
- `item/updated` and `transactions/*`: nothing (Sync fetches the changes).
- `item/created`: logs the new item ID (useful for step 4).
- `item/error`: logs the error code (the connection needs reconnecting in Meu
  Pluggy).

Nothing else is stored. The logs are in Vercel → **Logs**.

## 6. Check

1. With the database set up ([docs/neon-setup.md](neon-setup.md)), open Trove
   and log in: demo data shows with "Sync to load your banks". **Sync now**
   syncs each connection in turn; then the real accounts appear and the "Demo
   data" label goes away.
2. `https://YOUR_SITE/api/finance?summary` (while logged in) returns a live
   report from Pluggy for tuning the mapping:
   - connections and their status;
   - each account's name and the bank its card is named after;
   - account types and currencies;
   - how Pluggy's categories map to Trove's.

   It contains **no amounts or transaction descriptions**.
3. Worth checking by eye:
   - **Wise:** the USD balance shows as US$ with its R$ value next to it.
   - **Cards:** open bill, limit and available limit match the bank's app.
   - **Installments tab:** purchases show the right "3/10".
   - **Transfers:** moving money between connected accounts, and paying a
     card bill, count as neither income nor expenses.

   A transaction in the wrong category can be changed or hidden from its
   details. Edits are saved in the database, and a later sync never undoes
   them.

## Troubleshooting

| Message or symptom | Meaning | Fix |
|---|---|---|
| Still "Demo data" | A setting is missing (Pluggy or the database), no redeploy since adding it, or nothing synced yet | Steps 2 and 4 and the database setup, redeploy, then **Sync now** |
| "Pluggy refused the credentials (HTTP 401)" | Wrong Client ID or Secret | Copy both again (steps 1–2) |
| "Add PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET…" when connecting | Credentials missing, or no redeploy | Step 2 |
| "Meu Pluggy isn't available for these credentials…" | Pluggy doesn't list the MeuPluggy connector for this application | Check the tutorial's steps; Trove won't open other connectors |
| "…GET /items/… (HTTP 404)" | Wrong item ID | Copy it again (step 3) |
| "No exchange rate for USD (AwesomeAPI HTTP 429; …)" | None of the three free rate sources answered and no earlier rate is stored. The message names each source and its status | Retry in a minute |
| Data looks out of date | Trove only fetches on Sync; Pluggy refreshes connections on its own schedule | **Sync now**; update the connection in the Meu Pluggy app if it's stale there |
| "The database tables are out of date" | `db/migrations/002_categories_and_sync.sql` hasn't run | Run it in Neon's SQL Editor ([docs/neon-setup.md](neon-setup.md)) |
| "X didn't sync. Other banks are up to date." | That connection failed in Pluggy (Vercel → Logs, or the debug screen) | **Retry**; reconnect that bank in the Meu Pluggy app if it keeps failing |
| A connection shows `LOGIN_ERROR` or `OUTDATED` in the summary | The bank consent expired or needs attention | Reconnect that bank in the Meu Pluggy app |

## Debug screen

**Accounts → Pluggy debug** (or `/#/debug`) on the deployed site shows exactly
what Pluggy sends. For each item in `PLUGGY_ITEM_IDS`, each button calls one
of:

- `GET /items/{id}`;
- `GET /accounts?itemId=`;
- `GET /v2/transactions?accountId=` (one page; **Next page** follows the cursor);
- `GET /bills?accountId=` (credit cards).

It shows Pluggy's status and the full raw JSON, values included. Nothing is
stored or logged; the route is behind the login and only accepts the
configured items and their accounts.

## Implementation

- `api/finance.ts` → `server/db/handlers.ts`: `GET /api/finance` reads the
  database (`server/db/read.ts`). It fails closed with `503 not_configured`
  when Pluggy or the database isn't configured, and returns `409
  never_synced` before the first sync; the app then shows demo data.
  `?summary` is the live diagnostic report (`server/pluggy/finance.ts`).
- `api/sync.ts` → `server/db/syncJobs.ts` and `server/db/sync.ts`:
  `POST /api/sync` starts a background sync (optionally of some
  `connectionIds`, which must be in `PLUGGY_ITEM_IDS`; `403` otherwise) and
  answers `202`; `GET /api/sync` returns the latest job's progress. See
  [docs/neon-setup.md](neon-setup.md#sync).
- `server/pluggy/client.ts`: minimal `fetch` client. It calls `POST /auth`,
  sends the API key as `X-API-KEY`, and uses `GET /items/{id}`,
  `GET /accounts?itemId=` and `GET /v2/transactions?accountId=&dateFrom=`
  with the cursor.
- `api/debug/pluggy.ts` → `server/pluggy/debug.ts`: the debug screen's
  read-only passthrough (`PluggyClient.raw`), limited to the four calls above.
- `server/pluggy/map.ts`: Pluggy → Trove model, for live data and for the
  stored `raw` rows alike:
  - signs from `DEBIT`/`CREDIT`;
  - BRL conversion, keeping the original currency;
  - installments from `creditCardMetadata`;
  - category guesses (mapped to the default categories) and stored categories;
  - transfer detection (own transfers and card bill payments, no category);
  - **one card per item**, so a bank's checking account and credit card
    stay together. Meu Pluggy items all have the connector "MeuPluggy", with
    the real bank only in the account names ("Nu Pagamentos S.A. - …
    (Conta Pré-paga)"), so such an item is named after its **checking
    account's** bank (then savings, then any account): known banks by name
    (Nubank, Itaú, Wise…), others by their legal name. Account names are
    shortened to the part in brackets ("Conta Pré-paga");
  - **Wise.** Meu Pluggy doesn't give Wise's bank name: Wise has one
    checking account per currency, each named just "USD", "BRL", "EUR"…
    An item whose accounts don't name a known bank but have a currency-code
    name (or a USD account) is called "Wise". Such accounts show as
    "USD balance" / "Saldo em USD", and so on;
  - accounts with nothing to show and no transactions in the window are left
    out: bank accounts at zero, and credit cards with no bill and none of the
    limit in use (no future installments). The summary marks them
    `hiddenAsEmpty`.
- `api/connect-token.ts` → `server/pluggy/connectToken.ts`: `POST` (behind
  the login). It looks up the MeuPluggy connector (`GET /connectors?name=`),
  refuses with `409` if it's missing, then creates a Connect token
  (`POST /connect_token`). It returns `{ accessToken, connectorIds }`, and the
  app opens Pluggy Connect restricted to those `connectorIds`
  (`src/components/ConnectMeuPluggy.tsx`, `react-pluggy-connect`, loaded on
  demand).
- `api/webhooks/pluggy.ts` → `server/pluggy/webhook.ts`: the only non-login
  route the middleware lets through. It checks `X-Trove-Webhook-Secret` in
  constant time and logs events.
- `server/pluggy/rates.ts`: USD→BRL (and other currencies) from free sources
  without keys, tried in order: AwesomeAPI (`economia.awesomeapi.com.br`),
  Banco Central's PTAX (`olinda.bcb.gov.br`), then `open.er-api.com`.
  AwesomeAPI limits requests per IP, and Vercel's IPs are shared, so it can
  answer `429`; the others then take over. The sync stores the rates;
  reads use the latest stored ones.
- `src/data/apiRepository.ts`: the app side. It loads `/api/finance`, posts
  edits and syncs, falls back to demo data on `503`/`409`, and goes to login
  on `401`.
- Tests: `server/pluggy/pluggy.test.ts`, `server/db/db.test.ts`.
