import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { financeFromDb } from '../server/db/handlers.js'

// The app's data, read from the database only (Pluggy is reached by Sync alone).
export function GET(request: Request): Promise<Response> {
  return financeFromDb(request, { pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })
}
