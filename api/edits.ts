import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { edits } from '../server/db/handlers.js'

export function POST(request: Request): Promise<Response> {
  // Pluggy's settings name the configured connections, which bulk edits are limited to.
  return edits(request, { pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })
}
