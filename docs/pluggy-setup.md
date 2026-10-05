# Connecting your banks (Meu Pluggy)

Trove shows your real accounts by reading them from Pluggy, the Open Finance
service behind Meu Pluggy. Nothing is stored:
- when you open Trove, its server (behind your Auth0 login) fetches your
  connections, accounts and the last 6 months of transactions from Pluggy;
- it converts them into Trove's format and sends them to your phone;
- a copy is kept in memory for 5 minutes, so switching tabs is fast.

Until the three settings in step 3 exist, the deployed site keeps showing demo
data (with the "Demo data" label).

> **Stay on the free path.** Trove only needs your *own* data, which Pluggy
> gives individuals for free through Meu Pluggy. Follow Pluggy's **"Access your
> data"** tutorial (docs.pluggy.ai) exactly.
>
> **Don't connect banks directly** in the Pluggy dashboard or Pluggy Connect,
> and don't pick a paid plan. Direct bank connections are Pluggy's paid
> product. Your banks should be connected **in the Meu Pluggy app**, and
> reached through it.

---

## 1. Get your API credentials (Pluggy's tutorial)

Follow Pluggy's **"Access your data"** tutorial to get:

| You need | What it is |
|---|---|
| **Client ID** | Your API credentials' ID |
| **Client Secret** | Your API credentials' secret. Keep it private: never paste it in chats, issues or code |

If a step asks you to choose or pay for a plan, stop: that's not the free
path.

## 2. Add the credentials in Vercel

In the `trove` project, go to **Settings** → **Environment Variables**. Add
these for **Production** (and Preview if you test on preview links), marked
**Sensitive**. Use your real values, typed only into Vercel:

| Name | Value |
|---|---|
| `PLUGGY_CLIENT_ID` | your Client ID |
| `PLUGGY_CLIENT_SECRET` | your Client Secret |
| `PLUGGY_WEBHOOK_SECRET` | a long random value you make up (e.g. from a password generator). It proves webhook calls come from Pluggy (step 5) |

Then redeploy: **Deployments** → latest production deployment → **⋯** →
**Redeploy**. Settings only apply to new deployments.

## 3. Connect Meu Pluggy from Trove

1. Open Trove on your phone and log in. Go to the **Accounts** tab →
   **Connect your banks** → **Connect Meu Pluggy**.
2. Pluggy Connect opens, showing **only Meu Pluggy**. Trove's server restricts
   it to that connector, so banks can't be connected directly (the paid path).
   If the MeuPluggy connector isn't available for your credentials, Trove
   opens nothing and tells you.
3. Log in with your Meu Pluggy account and approve sharing.
4. Trove shows the new connection's **item ID**. Tap **Copy**.

Your banks (Nubank, Itaú, Inter, Wise…) stay connected in the **Meu Pluggy**
app. Trove reads them all through this one item.

(If the tutorial already gave you an item ID for your Meu Pluggy connection,
you can use that instead and skip this step.)

## 4. Add the item ID in Vercel

Add one more variable, then redeploy:

| Name | Value |
|---|---|
| `PLUGGY_ITEM_IDS` | the item ID from step 3 (if you ever have more than one, separate them with commas) |

The **Connect your banks** box disappears once your real data loads.

## 5. Webhook (optional, keeps data fresh)

Pluggy can notify Trove when your data changes, so Trove refreshes right away
instead of within 5 minutes. Register a webhook for your application (in the
Pluggy dashboard or through its API) with:

| Field | Value |
|---|---|
| URL | `https://YOUR_SITE/api/webhooks/pluggy` |
| Event | `all` (or at least `item/updated`, `item/created`, `item/error`, `transactions/created`) |
| Header | `X-Trove-Webhook-Secret` = the same value as `PLUGGY_WEBHOOK_SECRET` |

Calls without that header are refused (`401`). If `PLUGGY_WEBHOOK_SECRET`
isn't set, every webhook call is refused (`503`).

What Trove does with each event:
- `item/updated` and `transactions/*`: clears its cache, so the next load is
  fresh.
- `item/created`: logs the new item ID (useful for step 4).
- `item/error`: logs the error code, so you know to reconnect in Meu Pluggy.

Nothing else is stored. You can see these logs in Vercel → **Logs**.

## 6. Check it

1. Open Trove and log in. Your real accounts should appear, and the "Demo
   data" label should be gone.
2. Open `https://YOUR_SITE/api/finance?summary` (while logged in) and send the
   result to whoever maintains the code. It lists:
   - your connections and their status;
   - each account's name and the bank its card is named after;
   - account types and currencies;
   - how Pluggy's categories were matched to Trove's.

   It contains **no amounts or transaction descriptions**, and it's what's
   needed to fine-tune the mapping.
3. Things worth checking by eye:
   - **Wise:** the USD balance appears as US$ with its R$ value next to it.
   - **Cards:** open bill, limit and available limit match the bank's app.
   - **Installments tab:** your parcelas appear with the right "3/10".
   - **Transfers:** moving money between your own accounts, and paying a card
     bill, are not counted as income or expenses.

   If a transaction lands in the wrong category, tap it and change it. The
   change is saved on that phone.

## If something's wrong

| You see | Meaning | Fix |
|---|---|---|
| Still "Demo data" | A setting is missing, or no redeploy since adding them | Steps 2 and 4, then redeploy |
| "Pluggy refused the credentials (HTTP 401)" | Wrong Client ID or Secret | Re-copy both (steps 1–2) |
| "Add PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET…" when connecting | Credentials missing, or no redeploy | Step 2 |
| "Meu Pluggy isn't available for these credentials…" | Pluggy doesn't list the MeuPluggy connector for your application | Check the tutorial's steps; Trove won't open other connectors |
| "…GET /items/… (HTTP 404)" | Wrong item ID | Re-copy it (step 3) |
| "No exchange rate for USD (AwesomeAPI HTTP 429; …)" | None of the three free rate sources answered, and this server instance has no earlier rate to reuse. The message names each source and its status | Try again in a minute |
| Data looks out of date | Pluggy refreshes connections on its own schedule; Trove also caches for 5 minutes | Open `/api/finance?refresh` to skip Trove's cache; update the connection in the Meu Pluggy app if it's stale there |
| A connection shows `LOGIN_ERROR` or `OUTDATED` in the summary | The bank consent expired or needs attention | Reconnect that bank in the Meu Pluggy app |

## Debug screen

To see exactly what Pluggy sends, open **Accounts → Pluggy debug** (or
`/#/debug`) on the deployed site. For each item in `PLUGGY_ITEM_IDS` it calls,
when you tap a button, one of:

- `GET /items/{id}`;
- `GET /accounts?itemId=`;
- `GET /v2/transactions?accountId=` (one page; **Next page** follows the cursor);
- `GET /bills?accountId=` (credit cards).

It shows Pluggy's status and the full raw JSON, values included.
Nothing is stored or logged; the route is behind the login and only accepts
the configured items and their own accounts.

## How it works (for developers)

- `api/finance.ts` → `server/pluggy/finance.ts`: `GET /api/finance`, protected
  by the login middleware. It fails closed with `503 not_configured` when
  settings are missing, and the app then falls back to demo data.
- `server/pluggy/client.ts`: minimal `fetch` client. It calls `POST /auth`,
  sends the API key as `X-API-KEY`, and uses `GET /items/{id}`,
  `GET /accounts?itemId=` and `GET /v2/transactions?accountId=&dateFrom=`
  with the cursor.
- `api/debug/pluggy.ts` → `server/pluggy/debug.ts`: the debug screen's
  read-only passthrough (`PluggyClient.raw`), limited to the four calls above.
- `server/pluggy/map.ts`: Pluggy → Trove model:
  - signs from `DEBIT`/`CREDIT`;
  - BRL conversion, keeping the original currency;
  - installments from `creditCardMetadata`;
  - category matching;
  - transfer detection;
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
    "USD balance" / "Saldo em USD", and so on. Exchange rates are only
    fetched for accounts that are shown, so an empty EUR or GBP balance
    can't make the load fail;
  - accounts with nothing to show and no transactions in the last 6 months
    are left out: bank accounts at zero, and credit cards with no bill and
    none of the limit in use (no future installments). The summary marks
    them `hiddenAsEmpty`.
- `api/connect-token.ts` → `server/pluggy/connectToken.ts`: `POST` (behind
  the login). It looks up the MeuPluggy connector (`GET /connectors?name=`),
  refuses with `409` if it's missing, then creates a Connect token
  (`POST /connect_token`). It returns `{ accessToken, connectorIds }`, and the
  app opens Pluggy Connect restricted to those `connectorIds`
  (`src/components/ConnectMeuPluggy.tsx`, `react-pluggy-connect`, loaded on
  demand).
- `api/webhooks/pluggy.ts` → `server/pluggy/webhook.ts`: the only non-login
  route the middleware lets through. It checks `X-Trove-Webhook-Secret` in
  constant time and clears the cache on data changes.
- `server/pluggy/rates.ts`: USD→BRL (and other currencies) from
  free sources without keys, tried in order: AwesomeAPI
  (`economia.awesomeapi.com.br`), Banco Central's PTAX
  (`olinda.bcb.gov.br`), then `open.er-api.com`. AwesomeAPI limits requests
  per IP, and Vercel's IPs are shared, so it can answer `429`; the others
  then take over. Cached for 1 hour; if all fail, the last good rate is
  reused.
- `src/data/pluggyRepository.ts`: the app side. It loads `/api/finance`, falls
  back to demo data on `503`, and goes to login on `401`.
- Tests: `server/pluggy/pluggy.test.ts`.
