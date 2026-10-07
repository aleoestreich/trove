import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { financeRoutes } from '../server/db/handlers.js'

// The app's data (GET /api/finance) and older transactions (GET /api/transactions, rewritten
// here by vercel.json), read from the database only (Pluggy is reached by Sync alone).
export function GET(request: Request): Promise<Response> {
  return financeRoutes(request, { pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })
}
