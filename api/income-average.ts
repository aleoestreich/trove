import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { incomeRoutes } from '../server/db/handlers.js'

// Serves GET /api/overview/income-average, GET /api/overview/income-average/categories
// and PUT /api/settings/income-average-filter (rewritten here by vercel.json).
const settings = () => ({ pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })

export function GET(request: Request): Promise<Response> {
  return incomeRoutes(request, settings())
}

export function PUT(request: Request): Promise<Response> {
  return incomeRoutes(request, settings())
}
