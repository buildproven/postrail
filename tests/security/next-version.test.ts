import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw (critical RCE) and
// GHSA-p3m5-59mp-jv5r (DoS): first patched release on this major line.
const FLOOR: readonly [number, number, number] = [16, 4, 1]

function parse(version: string): number[] {
  return (version.split('-')[0] ?? version).split('.').map(Number)
}

function isBelow(
  version: readonly number[],
  floor: readonly number[]
): boolean {
  for (let i = 0; i < floor.length; i += 1) {
    const have = version[i] ?? 0
    const need = floor[i] ?? 0
    if (have !== need) return have < need
  }
  return false
}

const lock = JSON.parse(
  readFileSync(resolve(__dirname, '../../package-lock.json'), 'utf8')
) as { packages: Record<string, { version?: string }> }

describe('locked next version', () => {
  it('is at or above the patched release', () => {
    const locked = lock.packages['node_modules/next']?.version
    expect(locked).toBeDefined()
    expect(isBelow(parse(locked ?? '0.0.0'), FLOOR)).toBe(false)
  })

  it('treats the release before the floor as vulnerable', () => {
    expect(isBelow([FLOOR[0], FLOOR[1], FLOOR[2] - 1], FLOOR)).toBe(true)
    expect(isBelow(FLOOR, FLOOR)).toBe(false)
  })
})
