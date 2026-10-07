// Every screen reads Trove's database; only Sync reaches Pluggy (plus the
// Connect token, which opens Pluggy Connect to link the account and returns
// no data). This guards against a route calling Pluggy again.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url).pathname

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) return sources(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

describe('only Sync calls Pluggy', () => {
  it('creates a Pluggy client only in the sync route and the Connect token', () => {
    const callers = [...sources('api'), ...sources('server'), 'middleware.ts']
      .filter((file) => /new PluggyClient\(/.test(readFileSync(join(root, file), 'utf8')))
      .map((file) => relative(root, join(root, file)))
      .sort()
    expect(callers).toEqual(['server/db/handlers.ts', 'server/pluggy/connectToken.ts'])
  })

  it('in handlers.ts, only the sync worker does', () => {
    const handlers = readFileSync(join(root, 'server/db/handlers.ts'), 'utf8')
    const uses = handlers.split('\n').filter((line) => line.includes('new PluggyClient('))
    expect(uses).toHaveLength(1)
    expect(uses[0]).toMatch(/runJob\(/)
  })
})
