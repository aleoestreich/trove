import { readConfig } from '../../server/auth/config.js'
import { login } from '../../server/auth/handlers.js'

export function GET(request: Request): Promise<Response> {
  return login(request, readConfig(process.env))
}
