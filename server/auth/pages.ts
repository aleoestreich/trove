// Minimal pages for login problems. They live outside the React app, so the
// text is inline and bilingual (English / PT-BR).

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function messagePage(status: number, title: string, detail: string, link: { href: string; label: string }): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Trove</title>
<style>
:root{color-scheme:light dark;--page:#f5f5f9;--surface:#fff;--ink:#0b0b1f;--ink-2:#3d3d56;--line:#e4e4ee;--accent:#3d5afe;--blend:multiply}
@media (prefers-color-scheme:dark){:root{--page:#0b0b1f;--surface:#15152e;--ink:#f2f2f8;--ink-2:#c4c4d6;--line:#28284a;--accent:#7c8bff;--blend:screen}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--page);color:var(--ink);font:15px/22px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:0 16px}
main{max-width:22rem;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
svg{width:56px;height:53px}circle{mix-blend-mode:var(--blend)}
h1{font-size:20px;line-height:26px;font-weight:500;margin:4px 0 0}p{color:var(--ink-2);margin:0}
a{margin-top:8px;display:inline-flex;align-items:center;height:48px;padding:0 24px;border-radius:14px;background:var(--accent);color:var(--surface);font-weight:500;text-decoration:none}
</style></head>
<body><main><svg viewBox="11 14 42 40" aria-hidden="true"><g style="isolation:isolate"><circle cx="25" cy="28" r="14" fill="#3d5afe"/><circle cx="39" cy="28" r="14" fill="#a34bff"/><circle cx="32" cy="40" r="14" fill="#19e3b1"/></g></svg>
<h1>${escape(title)}</h1><p>${escape(detail)}</p><a href="${escape(link.href)}">${escape(link.label)}</a></main></body></html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' },
  })
}

export const tryAgain = { href: '/api/auth/login', label: 'Try again / Tentar de novo' }
export const signOutLink = { href: '/api/auth/logout', label: 'Sign out / Sair' }
