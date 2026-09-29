import { readConfig } from '../../server/auth/config.js'
import { callback } from '../../server/auth/handlers.js'

export function GET(request: Request): Promise<Response> {
  return callback(request, readConfig(process.env))
}
