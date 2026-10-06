import { readDatabaseUrl } from '../server/db/connection.js'
import { edits } from '../server/db/handlers.js'

export function POST(request: Request): Promise<Response> {
  return edits(request, { pluggy: null, databaseUrl: readDatabaseUrl(process.env) })
}
