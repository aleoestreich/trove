import { readPluggyCredentials } from '../server/pluggy/client.js'
import { connectToken } from '../server/pluggy/connectToken.js'

export function POST(request: Request): Promise<Response> {
  return connectToken(request, readPluggyCredentials(process.env))
}
