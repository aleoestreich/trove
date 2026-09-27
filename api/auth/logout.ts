import { readConfig } from '../../server/auth/config.js'
import { logout } from '../../server/auth/handlers.js'

export function GET(request: Request): Response {
  return logout(request, readConfig(process.env))
}
