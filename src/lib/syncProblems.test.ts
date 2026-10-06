import { describe, expect, it } from 'vitest'
import { needsReconnect, problemFromCode, problemFromStatus } from './syncProblems'

describe('sync problems', () => {
  it('reads the reason from the stored error code', () => {
    expect(['pluggy_401', 'pluggy_403', 'pluggy_404', 'pluggy_429', 'pluggy_500', 'pluggy_502', 'timeout', '42P01', '23505', 'error', null].map(problemFromCode)).toEqual([
      'credentials', 'credentials', 'notFound', 'rateLimited', 'unavailable', 'unavailable', 'timeout', 'database', 'database', 'unknown', 'unknown',
    ])
  })

  it('reads why a sync could not start from the HTTP status', () => {
    expect([0, 503, 403, 500, 401, 400].map(problemFromStatus)).toEqual(['network', 'notConfigured', 'notFound', 'database', 'unknown', 'unknown'])
  })

  it('flags connections that need reconnecting in Meu Pluggy', () => {
    expect(['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT', 'UPDATED', 'UPDATING', null].map(needsReconnect)).toEqual([true, true, true, false, false, false])
  })
})
