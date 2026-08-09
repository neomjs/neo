import {setup} from '../../../../setup.mjs'

const appName = 'SelfDegradingSyncCallTest'

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
})

import {test, expect} from '@playwright/test'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'

import {runSelfDegradingSyncCall} from '../../../../../../ai/services/memory-core/helpers/selfDegradingSyncCall.mjs'

/**
 * Self-test for the sync-call latency guard: the budget the event loop cannot race. A sync call
 * blocks for its full duration, so the only safe bound is retrospective — pay once, learn, skip
 * while known-slow, resume after cooldown. Honest outcomes at every branch: the paid-for value is
 * never discarded, a skip carries its reason, and errors rethrow (latency pricing never swallows
 * failures).
 */
test.describe('selfDegradingSyncCall — the retrospective budget for event-loop-blocking work', () => {
    const clockAt = values => {
        let index = 0
        return () => values[Math.min(index++, values.length - 1)]
    }

    test('a within-budget run passes the value through and records its duration', () => {
        const state = {}
        const run   = runSelfDegradingSyncCall({
            fn        : () => 'delta',
            budgetMs  : 250,
            cooldownMs: 60_000,
            state,
            now       : clockAt([1_000, 1_100])
        })

        expect(run).toEqual({value: 'delta', skipped: false, durationMs: 100})
        expect(state.skipUntil).toBe(0)
        expect(state.lastDurationMs).toBe(100)
    })

    test('an over-budget run still returns the paid-for value but arms the cooldown', () => {
        const state = {}
        const run   = runSelfDegradingSyncCall({
            fn        : () => 'expensive-delta',
            budgetMs  : 250,
            cooldownMs: 60_000,
            state,
            now       : clockAt([1_000, 2_400])
        })

        expect(run).toEqual({value: 'expensive-delta', skipped: false, durationMs: 1_400, cooldownArmed: true})
        expect(state.skipUntil).toBe(61_000)
    })

    test('during cooldown the fn is NOT called and the skip carries its reason', () => {
        const state  = {skipUntil: 61_000, lastDurationMs: 1_400}
        let   called = false

        const run = runSelfDegradingSyncCall({
            fn        : () => { called = true; return 'never' },
            budgetMs  : 250,
            cooldownMs: 60_000,
            state,
            now       : clockAt([30_000])
        })

        expect(called).toBe(false)
        expect(run.value).toBeNull()
        expect(run.skipped).toBe(true)
        expect(run.reason).toContain('1400ms')
        expect(run.lastDurationMs).toBe(1_400)
    })

    test('cooldown expiry resumes execution, and a fast run clears the guard', () => {
        const state = {skipUntil: 61_000, lastDurationMs: 1_400}

        const run = runSelfDegradingSyncCall({
            fn        : () => 'recovered',
            budgetMs  : 250,
            cooldownMs: 60_000,
            state,
            now       : clockAt([61_001, 61_050])
        })

        expect(run).toEqual({value: 'recovered', skipped: false, durationMs: 49})
        expect(state.skipUntil).toBe(0)
    })

    test('a throwing fn rethrows — latency pricing never swallows failures', () => {
        const state = {}

        expect(() => runSelfDegradingSyncCall({
            fn        : () => { throw new Error('sqlite gone') },
            budgetMs  : 250,
            cooldownMs: 60_000,
            state,
            now       : clockAt([1_000])
        })).toThrow('sqlite gone')
    })
})
