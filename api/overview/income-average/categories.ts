import { readPluggyConfig } from '../../../server/pluggy/client.js'
import { readDatabaseUrl } from '../../../server/db/connection.js'
import { incomeCategoriesRoute } from '../../../server/db/handlers.js'

export function GET(request: Request): Promise<Response> {
  return incomeCategoriesRoute(request, { pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })
}
