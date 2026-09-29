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

## 1–2. Get your credentials and your Meu Pluggy item (Pluggy's tutorial)

Follow Pluggy's **"Access your data"** tutorial. By the end you should have
three things:

| You need | What it is |
|---|---|
| **Client ID** | Your API credentials' ID |
| **Client Secret** | Your API credentials' secret. Keep it private: never paste it in chats, issues or code |
| **Item ID** | The ID of the connection that gives the API access to your Meu Pluggy data |

Your banks (Nubank, Itaú, Inter, Wise…) stay connected in the **Meu Pluggy**
app. Trove reads them through that single item.

If a step asks you to choose or pay for a plan, stop: that's not the free
path.

## 3. Add three settings in Vercel

In the `trove` project, go to **Settings** → **Environment Variables**. Add
these for **Production** (and Preview if you test on preview links), marked
**Sensitive**:

| Name | Value |
|---|---|
| `PLUGGY_CLIENT_ID` | the Client ID from step 1 |
| `PLUGGY_CLIENT_SECRET` | the Client Secret from step 1 |
| `PLUGGY_ITEM_IDS` | the item ID from the tutorial (if you ever have more than one, separate them with commas) |

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
| "Pluggy refused the credentials (HTTP 401)" | Wrong Client ID or Secret | Re-copy both (steps 1–2) |
| "…GET /items/… (HTTP 404)" | Wrong item ID | Re-copy it (steps 1–2) |
| "Exchange rate service failed" / "No exchange rate for USD" | The USD→BRL rate couldn't be fetched | Try again in a minute |
| Data looks out of date | Pluggy refreshes connections on its own schedule; Trove also caches for 5 minutes | Open `/api/finance?refresh` to skip Trove's cache; update the connection in the Meu Pluggy app if it's stale there |
| A connection shows `LOGIN_ERROR` or `OUTDATED` in the summary | The bank consent expired or needs attention | Reconnect that bank in the Meu Pluggy app |

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
