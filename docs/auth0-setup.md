# Login setup (Auth0 on Vercel)

Trove is private. On the deployed site, every request, including the app's
JavaScript files, goes through `middleware.ts` first. Without a valid session
for the one allowed email, you get Auth0's login page and nothing else.
Local development (`npm run dev`) has no login.

There are three locks:

1. **Auth0:** sign-ups are off and only your user exists.
2. **An Auth0 Action:** refuses any email other than yours.
3. **Trove's server:** after Auth0, the callback checks the email against
   `ALLOWED_EMAIL`, and the middleware checks the session on every request.
   If any setting is missing, the site refuses everything.

Replace `YOUR_EMAIL` below with your email, and `YOUR_SITE` with your Vercel
production address (e.g. `trove-abc.vercel.app`, from the project's
**Domains** in Vercel).

> Menu names in Auth0 and Vercel change from time to time. If a label doesn't
> match exactly, look for the closest one.

---

## 1. Auth0: your user and no sign-ups (done)

- **User Management** → **Users**: your user exists, with connection
  `Username-Password-Authentication`.
- **Authentication** → **Database** → `Username-Password-Authentication`:
  **Disable Sign Ups** is on.
- **Applications** → your Trove app → **Connections**: only
  `Username-Password-Authentication` is enabled (no Google or other social
  logins).

## 2. Auth0: the app's addresses and settings

In **Applications** → **Applications** → your Trove app → **Settings**:

| Setting | Value |
|---|---|
| Application Type | **Regular Web Application** |
| Allowed Callback URLs | `https://YOUR_SITE/api/auth/callback` |
| Allowed Logout URLs | `https://YOUR_SITE/` |

Under **Credentials** (or **Advanced Settings** → **OAuth**), set **Token
Endpoint Authentication Method** to **Client Secret (Post)**. Trove sends the
client secret in the request body.

Click **Save**.

If you later add your own domain, add its callback and logout addresses on new
lines too.

## 3. Auth0: the "only my email" rule

1. Go to **Actions** → **Library** → **Create Action** → **Build from
   scratch**.
2. **Name:** `Only my email`. **Trigger:** **Login / Post Login**.
3. Replace the code with:

   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const allowed = 'YOUR_EMAIL'
     if ((event.user.email || '').toLowerCase() !== allowed.toLowerCase()) {
       api.access.deny('This account is not allowed.')
     }
   }
   ```

4. Click **Deploy**.
5. Go to **Actions** → **Triggers** (or **Flows**) → **post-login**, drag
   **Only my email** into the flow between Start and Complete, then click
   **Apply**.

## 4. Auth0: login page in Portuguese (optional)

In **Settings** → **General** → **Languages**, add **Portuguese (Brazil)**.
Trove asks Auth0 for the language chosen in the app (🇺🇸 / 🇧🇷), or the
phone's language on first visit.

## 5. Vercel: add `ALLOWED_EMAIL`

The Auth0 integration already added `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
`AUTH0_CLIENT_SECRET` and `AUTH0_SECRET`. Add one more:

1. In the `trove` project, go to **Settings** → **Environment Variables** →
   **Add**.
2. **Key:** `ALLOWED_EMAIL`. **Value:** `YOUR_EMAIL`. **Environments:**
   Production (and Preview if you want). Mark it **Sensitive**.
3. Save.

Environment variables apply from the next deployment, so deploy after adding
it (step 6).

## 6. Deploy

Merge the PR into `main`. Vercel deploys `main` to production automatically,
provided the `trove` project is connected to the `aleoestreich/trove`
repository (**Settings** → **Git**).

Preview deployments get a new address each time, so logging in there fails
with a "callback URL mismatch" from Auth0. They stay locked, which is fine.

## 7. Check it

1. **As a stranger:** open `https://YOUR_SITE` in a private/incognito window.
   You should land on Auth0's login page. There should be no "Sign up" link
   and no Google button.
2. **App files are locked:** in the private window, open
   `https://YOUR_SITE/manifest.webmanifest`. You should be sent to the login,
   not see the file.
3. **As you:** log in with your email and password. Trove opens.
4. **Sign out:** go to the **Accounts** tab → **Sign out** / **Sair** at the
   bottom. You're back at the login page.
5. **On your phone** (S25+ or A17): open the site in Samsung Internet, log
   in, then menu (☰) → **Add page to** → **Home screen**.

A session lasts 7 days. After that you log in again.

## If something's wrong

| You see | Meaning | Fix |
|---|---|---|
| "Login is not configured…" | A setting is missing, usually `ALLOWED_EMAIL`, or no deploy since adding it | Step 5, then redeploy |
| Auth0: "Callback URL mismatch" | Auth0 doesn't know this address | Step 2: the callback URL must match exactly |
| "Login failed: Auth0 did not accept the login" | Token exchange refused | Step 2: Regular Web Application and Client Secret (Post) |
| "Login refused" / "This account is not allowed" | The Action refused the email | Step 3: check the email in the Action |
| "Not allowed / Sem acesso" | Auth0 let the login through, but the email isn't `ALLOWED_EMAIL` | Step 5: check the value; sign out and try again |
| "Login expired" | The login took over 10 minutes, or cookies are blocked | Try again; allow cookies for the site |

## How it works (for developers)

- `middleware.ts`: Vercel Routing Middleware, run before every request. It
  calls `guard()` in `server/auth/handlers.ts`.
- `api/auth/login.ts`: starts the login. Authorization code flow with PKCE,
  `state` and `nonce`, which are stored encrypted in a 10-minute
  `__Host-trove_login` cookie.
- `api/auth/callback.ts`: exchanges the code, verifies the ID token (issuer,
  audience, signature via Auth0's keys, nonce) and checks the email. It then
  sets `__Host-trove_session`: encrypted with a key derived from
  `AUTH0_SECRET`, HttpOnly, Secure, 7 days.
- `api/auth/logout.ts`: clears the cookies and signs out of Auth0.
- Tests: `server/auth/auth.test.ts` runs the whole flow against a simulated
  Auth0.
