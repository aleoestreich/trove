import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { insightRoutes } from '../server/db/insights.js'

// One function for the Overview's insights (vercel.json rewrites their public paths here):
// GET /api/overview/income-average, GET /api/overview/income-average/categories,
// PUT /api/settings/income-average-filter, GET /api/insights/projection,
// PUT /api/insights/projection/settings, GET /api/insights/unusual-categories,
// GET /api/recurring and POST /api/recurring/:id/action.
const settings = () => ({ pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })

export function GET(request: Request): Promise<Response> {
  return insightRoutes(request, settings())
}

export function PUT(request: Request): Promise<Response> {
  return insightRoutes(request, settings())
}

export function POST(request: Request): Promise<Response> {
  return insightRoutes(request, settings())
}
