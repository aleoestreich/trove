// Vercel Routing Middleware: runs before every request to the deployed site.
// Only a signed-in session for ALLOWED_EMAIL gets the app; see server/auth.
// Not used by `npm run dev` (local development has no login).

import { readConfig } from './server/auth/config'
import { guard } from './server/auth/handlers'

export default function middleware(request: Request): Promise<Response> {
  return guard(request, readConfig(process.env))
}
