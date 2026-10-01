// POST /api/connect-token: creates a Pluggy Connect token server-side, so the
// app can open Pluggy Connect (to link Meu Pluggy, per Pluggy's "Access your
// data" tutorial) without the Client ID or Secret ever reaching the browser.
// Protected by the login middleware like every other route.
//
// Free path only: the response also carries the ID of the MeuPluggy connector,
// and the app opens Pluggy Connect restricted to it (`connectorIds`), so banks
// can't be connected directly (Pluggy's paid product). If the MeuPluggy
// connector can't be found, no token is issued.
//
// Request body (optional): { "clientUserId": "..." } to tag the connection.
// Responses:
//   200 { accessToken, connectorIds }
//   409 { error: 'meupluggy_not_found' } the MeuPluggy connector isn't available
//   400 { error: 'bad_request' }      body is not valid JSON or clientUserId is invalid
//   503 { error: 'not_configured' }   PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET missing
//   502 { error: 'upstream', message } Pluggy failed (message never contains credentials)

import { PluggyClient, type PluggyCredentials } from './client.js'

/** Matches "MeuPluggy" / "Meu Pluggy" only. */
const MEU_PLUGGY = /^meu\s*pluggy$/i

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function connectToken(request: Request, credentials: PluggyCredentials | null, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (!credentials) return json(503, { error: 'not_configured' })

  let clientUserId: string | undefined
  const text = await request.text()
  if (text.trim()) {
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return json(400, { error: 'bad_request', message: 'Body must be JSON.' })
    }
    const value = (body as { clientUserId?: unknown } | null)?.clientUserId
    if (value !== undefined) {
      if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
        return json(400, { error: 'bad_request', message: 'clientUserId must be a string of 1-128 characters.' })
      }
      clientUserId = value
    }
  }

  try {
    const client = new PluggyClient(credentials, fetchFn)
    const connectorIds = (await client.findConnectors('MeuPluggy')).filter((c) => MEU_PLUGGY.test(c.name)).map((c) => c.id)
    if (connectorIds.length === 0) {
      return json(409, { error: 'meupluggy_not_found', message: 'The MeuPluggy connector is not available for these credentials.' })
    }
    const accessToken = await client.createConnectToken(clientUserId ? { clientUserId } : {})
    return json(200, { accessToken, connectorIds })
  } catch (e) {
    return json(502, { error: 'upstream', message: e instanceof Error ? e.message : 'Unknown error' })
  }
}
