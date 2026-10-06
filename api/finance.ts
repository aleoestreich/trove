import { readPluggyConfig } from '../server/pluggy/client.js'
import { finance } from '../server/pluggy/finance.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { financeFromDb } from '../server/db/handlers.js'

export function GET(request: Request): Promise<Response> {
  const pluggy = readPluggyConfig(process.env)
  // ?summary: the diagnostic report, read live from Pluggy (no amounts or descriptions).
  if (new URL(request.url).searchParams.has('summary')) return finance(request, pluggy)
  return financeFromDb(request, { pluggy, databaseUrl: readDatabaseUrl(process.env) })
}
