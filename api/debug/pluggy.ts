import { readPluggyConfig } from '../../server/pluggy/client.js'
import { pluggyDebug } from '../../server/pluggy/debug.js'

export function GET(request: Request): Promise<Response> {
  return pluggyDebug(request, readPluggyConfig(process.env))
}
