import { readPluggyConfig } from '../server/pluggy/client.js'
import { finance } from '../server/pluggy/finance.js'

export function GET(request: Request): Promise<Response> {
  return finance(request, readPluggyConfig(process.env))
}
