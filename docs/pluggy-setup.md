# Connecting your banks (Meu Pluggy)

Trove shows your real accounts by reading them from Pluggy, the Open Finance
service behind Meu Pluggy. Nothing is stored:
- when you open Trove, its server (behind your Auth0 login) fetches your
  connections, accounts and the last 6 months of transactions from Pluggy;
- it converts them into Trove's format and sends them to your phone;
- a copy is kept in memory for 5 minutes, so switching tabs is fast.

Until the three settings in step 3 exist, the deployed site keeps showing demo
data (with the "Demo data" label).

> I couldn't open Pluggy's documentation from my session, so the dashboard
> steps below may use slightly different names. The goal of steps 1 and 2 is
> always the same: **a Client ID and Client Secret**, and **the ID of the
> connection (item)** that holds your accounts.

---

## 1. Create a Pluggy developer account and get API credentials

1. Go to <https://dashboard.pluggy.ai> and sign up. You can use the same email
   as Meu Pluggy.
2. Create an application (e.g. `Trove`).
3. Open the application's credentials and copy its **Client ID** and **Client
   Secret**.
4. Check the plan. Pluggy has limits and pricing for connections; use the
   free, trial or personal option if one is offered, and read what it allows.

Keep the Client Secret private: don't paste it in chats, issues or code. It
only goes into Vercel (step 3).

## 2. Create the connection to your accounts

In the Pluggy dashboard, open the way to test or add a connection (Pluggy
Connect), then:

- **Option A: Meu Pluggy (if listed).** Choose the **MeuPluggy** connector and
  log in with your Meu Pluggy account. This brings in the banks you already
  linked in Meu Pluggy (Nubank, Itaú, Inter, Wise…) as one connection.
- **Option B: each bank directly.** Choose each bank (Open Finance) and
  authorise it. Each bank becomes its own connection.

Then open the dashboard's list of **Items** (connections) and copy each item's
**ID**. It looks like `a1b2c3d4-...`.

## 3. Add three settings in Vercel

In the `trove` project, go to **Settings** → **Environment Variables**. Add
these for **Production** (and Preview if you test on preview links), marked
**Sensitive**:

| Name | Value |
|---|---|
| `PLUGGY_CLIENT_ID` | the Client ID from step 1 |
| `PLUGGY_CLIENT_SECRET` | the Client Secret from step 1 |
| `PLUGGY_ITEM_IDS` | the item ID(s) from step 2. Separate several with commas: `id1,id2` |

Then redeploy: **Deployments** → latest production deployment → **⋯** →
**Redeploy**. Settings only apply to new deployments.

## 4. Check it

1. Open Trove and log in. Your real accounts should appear, and the "Demo
   data" label should be gone.
2. Open `https://YOUR_SITE/api/finance?summary` (while logged in) and send the
   result to whoever maintains the code. It lists:
   - your connections and their status;
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
| Still "Demo data" | A setting is missing, or no redeploy since adding them | Step 3, then redeploy |
| "Pluggy refused the credentials (HTTP 401)" | Wrong Client ID or Secret | Re-copy both (step 1) |
| "…GET /items/… (HTTP 404)" | Wrong item ID | Re-copy it from the Items list (step 2) |
| "Exchange rate service failed" / "No exchange rate for USD" | The USD→BRL rate couldn't be fetched | Try again in a minute |
| Data looks out of date | Pluggy refreshes connections on its own schedule; Trove also caches for 5 minutes | Open `/api/finance?refresh` to skip Trove's cache; update the connection in Meu Pluggy / Pluggy if it's stale there |
| A connection shows `LOGIN_ERROR` or `OUTDATED` in the summary | The bank consent expired or needs attention | Reconnect it in Meu Pluggy / the Pluggy dashboard |

## How it works (for developers)

- `api/finance.ts` → `server/pluggy/finance.ts`: `GET /api/finance`, protected
  by the login middleware. It fails closed with `503 not_configured` when
  settings are missing, and the app then falls back to demo data.
- `server/pluggy/client.ts`: minimal `fetch` client. It calls `POST /auth`,
  sends the API key as `X-API-KEY`, and uses `GET /items/{id}`,
  `GET /accounts?itemId=` and `GET /v2/transactions?accountId=&dateFrom=`
  with the cursor.
- `server/pluggy/map.ts`: Pluggy → Trove model:
  - signs from `DEBIT`/`CREDIT`;
  - BRL conversion, keeping the original currency;
  - installments from `creditCardMetadata`;
  - category matching;
  - transfer detection.
- `server/pluggy/rates.ts`: USD→BRL (and other currencies) from
  `economia.awesomeapi.com.br`, cached for 1 hour.
- `src/data/pluggyRepository.ts`: the app side. It loads `/api/finance`, falls
  back to demo data on `503`, and goes to login on `401`.
- Tests: `server/pluggy/pluggy.test.ts`.
