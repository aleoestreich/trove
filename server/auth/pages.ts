// Minimal pages for login problems. They live outside the React app, so the
// text is inline and bilingual (English / PT-BR).

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function messagePage(status: number, title: string, detail: string, link: { href: string; label: string }): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Trove</title>
<style>
:root{color-scheme:light dark;--bg:#f9f9f7;--ink:#0b0b0b;--muted:#52514e;--accent:#2a78d6}
@media (prefers-color-scheme:dark){:root{--bg:#0d0d0d;--ink:#fff;--muted:#c3c2b7;--accent:#3987e5}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif;padding:0 16px}
main{max-width:28rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:var(--muted);margin:0 0 1rem}
a{display:inline-block;padding:.6rem 1rem;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none}
</style></head>
<body><main><h1>${escape(title)}</h1><p>${escape(detail)}</p><a href="${escape(link.href)}">${escape(link.label)}</a></main></body></html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' },
  })
}

export const tryAgain = { href: '/api/auth/login', label: 'Try again / Tentar de novo' }
export const signOutLink = { href: '/api/auth/logout', label: 'Sign out / Sair' }
