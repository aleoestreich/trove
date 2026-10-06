# Login setup (Auth0 on Vercel)

Trove is private. On the deployed site, every request, including the app's
JavaScript files, goes through `middleware.ts` first. Without a valid session
the response is Auth0's login page and nothing else. Local development
(`npm run dev`) has no login.

**Who can sign in is decided only in Auth0:** the users in its user list,
with sign-ups disabled. Trove's code and settings contain no email or user
list. Trove accepts a login only if Auth0 has verified it for this
application, so with a single user in Auth0, only that user can get in.

> Auth0's user list is the lock: **Disable Sign Ups** stays on, social
> logins (Google etc.) stay off, and no other users are added.

`YOUR_SITE` below is the Vercel production address (e.g.
`trove-abc.vercel.app`, from the project's **Domains** in Vercel).

> Menu names in Auth0 and Vercel change from time to time; a label that
> doesn't match exactly has a close equivalent.

---

## 1. Auth0: one user, no sign-ups

- **User Management** → **Users**: a single user, with connection
  `Username-Password-Authentication`.
- **Authentication** → **Database** → `Username-Password-Authentication`:
  **Disable Sign Ups** is on.
- **Applications** → the Trove app → **Connections**: only
  `Username-Password-Authentication` is enabled. Google and any other social
  or passwordless option stay off: they can create new users even with
  sign-ups disabled.

## 2. Auth0: the app's addresses and settings

In **Applications** → **Applications** → the Trove app → **Settings**:

| Setting | Value |
|---|---|
| Application Type | **Regular Web Application** |
| Allowed Callback URLs | `https://YOUR_SITE/api/auth/callback` |
| Allowed Logout URLs | `https://YOUR_SITE/` |

Under **Credentials** (or **Advanced Settings** → **OAuth**), set **Token
Endpoint Authentication Method** to **Client Secret (Post)**. Trove sends the
client secret in the request body.

Then **Save**.

A custom domain later needs its callback and logout addresses added on new
lines too.

## 3. Auth0: extra protection (recommended)

- **Second factor:** **Security** → **Multi-factor Auth**. Turn on **One-time
  Password** or **Passkeys**, with the policy **Always**. A stolen password
  alone then isn't enough.
- **Brute-force protection:** **Security** → **Attack Protection** → **Brute-force Protection** on (the default).

## 4. Auth0: login page in Portuguese (optional)

In **Settings** → **General** → **Languages**, add **Portuguese (Brazil)**.
Trove asks Auth0 for the language chosen in the app (EN / PT), or the
device language on first visit.

## 5. Vercel: nothing to add

The Auth0 integration already set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
`AUTH0_CLIENT_SECRET` and `AUTH0_SECRET` for Production and Preview. Trove
uses only these four. The `AUTH0_MANAGEMENT_API_*` variables are unused.

## 6. Deploy

Merging into `main` deploys to production: Vercel deploys `main` to production automatically,
provided the `trove` project is connected to the `aleoestreich/trove`
repository (**Settings** → **Git**).

Preview deployments get a new address each time, so logging in there fails
with a "callback URL mismatch" from Auth0. They stay locked, which is fine.

## 7. Check

1. **Signed out:** `https://YOUR_SITE` in a private/incognito window lands on
   Auth0's login page, with no "Sign up" link and no Google button.
2. **App files are locked:** in the private window,
   `https://YOUR_SITE/manifest.webmanifest` redirects to the login instead of
   returning the file.
3. **Signed in:** after logging in, Trove opens.
4. **Sign out:** **Accounts** tab → **Sign out** / **Sair** at the bottom
   returns to the login page.
5. **On a phone** (S25+ or A17): open the site in Samsung Internet, log in,
   then menu (☰) → **Add page to** → **Home screen**.

A session lasts 7 days; after that, the login page shows again.

## Troubleshooting

| Message | Meaning | Fix |
|---|---|---|
| "Login is not configured…" | An `AUTH0_*` variable is missing in this environment | Check the Auth0 integration is connected to the `trove` project, then redeploy |
| Auth0: "Callback URL mismatch" | Auth0 doesn't know this address | Step 2: the callback URL must match exactly |
| "Login failed: Auth0 did not accept the login" | Token exchange refused | Step 2: Regular Web Application and Client Secret (Post) |
| "Login refused" | Auth0 refused the login (e.g. blocked user) | Check the user in Auth0 → User Management |
| "Login expired" | The login took over 10 minutes, or cookies are blocked | Retry; allow cookies for the site |

## Implementation

- `middleware.ts`: Vercel Routing Middleware, run before every request. It
  calls `guard()` in `server/auth/handlers.ts`, which serves the app only with
  a valid session cookie.
- `api/auth/login.ts`: starts the login. Authorization code flow with PKCE,
  `state` and `nonce`, which are stored encrypted in a 10-minute
  `__Host-trove_login` cookie.
- `api/auth/callback.ts`: exchanges the code with the client secret and PKCE
  verifier, then verifies the ID token: signature via Auth0's public keys,
  issuer = the tenant, audience = this app's client ID, and nonce. It then
  sets `__Host-trove_session` with the Auth0 user ID: encrypted with a key
  derived from `AUTH0_SECRET`, HttpOnly, Secure, 7 days. No email or user
  list is checked; Auth0 only issues tokens to its own users.
- `api/auth/logout.ts`: clears the cookies and signs out of Auth0.
- Tests: `server/auth/auth.test.ts` runs the whole flow against a simulated
  Auth0.
