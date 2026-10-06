import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { sync } from '../server/db/handlers.js'

// A sync fetches a whole connection from Pluggy; allow it time.
export const config = { maxDuration: 60 }

export function POST(request: Request): Promise<Response> {
  return sync(request, { pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })
}
