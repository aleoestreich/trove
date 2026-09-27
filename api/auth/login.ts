import { readConfig } from '../../server/auth/config'
import { login } from '../../server/auth/handlers'

export function GET(request: Request): Promise<Response> {
  return login(request, readConfig(process.env))
}
