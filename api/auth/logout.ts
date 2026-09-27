import { readConfig } from '../../server/auth/config'
import { logout } from '../../server/auth/handlers'

export function GET(request: Request): Response {
  return logout(request, readConfig(process.env))
}
