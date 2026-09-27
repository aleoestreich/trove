import { readConfig } from '../../server/auth/config'
import { callback } from '../../server/auth/handlers'

export function GET(request: Request): Promise<Response> {
  return callback(request, readConfig(process.env))
}
