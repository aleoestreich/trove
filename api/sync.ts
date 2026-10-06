import { readPluggyConfig } from '../server/pluggy/client.js'
import { readDatabaseUrl } from '../server/db/connection.js'
import { startSync, syncStatus } from '../server/db/handlers.js'

// The background sync keeps running after the response (waitUntil), up to this limit;
// the worker stops claiming connections well before it (server/db/syncJobs.ts).
export const config = { maxDuration: 60 }

const settings = () => ({ pluggy: readPluggyConfig(process.env), databaseUrl: readDatabaseUrl(process.env) })

export function POST(request: Request): Promise<Response> {
  return startSync(request, settings())
}

export function GET(request: Request): Promise<Response> {
  return syncStatus(request, settings())
}
