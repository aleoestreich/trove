import { readPluggyConfig } from '../../server/pluggy/client.js'
import { readDatabaseUrl } from '../../server/db/connection.js'
import { saveIncomeFilterRoute } from '../../server/db/handlers.js'

export function PUT(request: Request): Promise<Response> {
  return saveIncomeFilterRoute(request, { pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })
}
