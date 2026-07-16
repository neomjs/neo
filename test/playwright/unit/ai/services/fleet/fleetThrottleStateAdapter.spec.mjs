import {setup} from '../../../../setup.mjs'

const appName = 'FleetThrottleStateAdapterTest'

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

import {
    normalizeThrottleState,
    readFleetThrottleStateSnapshot,
    THROTTLE_SOURCE_LABEL,
    THROTTLE_STATES
} from '../../../../../../ai/services/fleet/fleetThrottleStateAdapter.mjs'

/**
 * Self-test for the throttle axis of the S2 telltale taxonomy. The platform truth this contract
 * pins: no trustworthy throttle source exists yet, so the honest default is every-row-unknown
 * under a degraded/none capability — never a fabricated `none`. The injected-reader seam is the
 * flip-target for the future watchdog-signals producer.
 */
test.describe('fleetThrottleStateAdapter — taxonomy normalization', () => {
    test('covers exactly the taxonomy', () => {
        expect(THROTTLE_STATES).toEqual(['none', 'overage', 'rate-limited', 'unknown'])
    })

    test('clamps anything outside the contract to unknown — a future producer cannot smuggle a fifth state', () => {
        expect(normalizeThrottleState('none')).toBe('none')
        expect(normalizeThrottleState('overage')).toBe('overage')
        expect(normalizeThrottleState('rate-limited')).toBe('rate-limited')
        expect(normalizeThrottleState('unknown')).toBe('unknown')
        expect(normalizeThrottleState('RATE_LIMITED')).toBe('unknown')
        expect(normalizeThrottleState('healthy')).toBe('unknown')
        expect(normalizeThrottleState(null)).toBe('unknown')
    })
})

test.describe('fleetThrottleStateAdapter — the fleet snapshot + capability envelope', () => {
    const agents = [{id: 'grace'}, {id: 'vega'}]

    test('unknown-on-unreachable is the PLATFORM DEFAULT: no reader ⇒ every row unknown, degraded/none, with the rationale', async () => {
        const {capability, states} = await readFleetThrottleStateSnapshot({agents})

        expect(capability).toMatchObject({source: THROTTLE_SOURCE_LABEL, state: 'degraded', confidence: 'none'})
        expect(capability.reason).toContain('no throttle truth source exists yet')
        expect(states).toEqual([
            {agentId: 'grace', throttle: 'unknown', confidence: 'none', source: THROTTLE_SOURCE_LABEL, reason: 'no throttle truth source exists yet: watchdog-signals producer not landed'},
            {agentId: 'vega',  throttle: 'unknown', confidence: 'none', source: THROTTLE_SOURCE_LABEL, reason: 'no throttle truth source exists yet: watchdog-signals producer not landed'}
        ])
    })

    test('an injected truth source produces observed taxonomy rows — the watchdog flip-target', async () => {
        const {capability, states} = await readFleetThrottleStateSnapshot({
            agents,
            resolveThrottleState: agent => agent.id === 'grace' ? 'rate-limited' : 'none'
        })

        expect(capability).toMatchObject({state: 'wired', confidence: 'observed', reason: null})
        expect(states).toEqual([
            {agentId: 'grace', throttle: 'rate-limited', confidence: 'observed', source: THROTTLE_SOURCE_LABEL},
            {agentId: 'vega',  throttle: 'none',         confidence: 'observed', source: THROTTLE_SOURCE_LABEL}
        ])
    })

    test('a reader answering unknown keeps the row honest and names it', async () => {
        const {states} = await readFleetThrottleStateSnapshot({
            agents              : [{id: 'grace'}],
            resolveThrottleState: () => 'unknown'
        })

        expect(states[0]).toMatchObject({throttle: 'unknown', confidence: 'none', reason: 'truth source answered unknown'})
    })

    test('a partially failing reader degrades the capability to partial and carries the per-row failure', async () => {
        const {capability, states} = await readFleetThrottleStateSnapshot({
            agents,
            resolveThrottleState: agent => {
                if (agent.id === 'vega') throw new Error('watchdog stream offline')
                return 'none'
            }
        })

        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
        expect(states[0]).toMatchObject({agentId: 'grace', throttle: 'none', confidence: 'observed'})
        expect(states[1]).toMatchObject({agentId: 'vega', throttle: 'unknown', confidence: 'none', reason: 'watchdog stream offline'})
    })

    test('an out-of-contract reader value degrades the CAPABILITY — garbage cannot hide under wired/observed', async () => {
        const {capability, states} = await readFleetThrottleStateSnapshot({
            agents,
            resolveThrottleState: agent => agent.id === 'grace' ? 'RATE_LIMITED' : 'none'
        })

        expect(states[0]).toMatchObject({throttle: 'unknown', confidence: 'none', reason: 'truth source returned an out-of-contract value'})
        expect(states[1]).toMatchObject({throttle: 'none', confidence: 'observed'})
        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
        expect(capability.reason).toContain('out-of-contract values for 1 agent(s)')
    })

    test('row reasons are REDACTED before any Body projection — a transport dump cannot leak a token', async () => {
        const {capability, states} = await readFleetThrottleStateSnapshot({
            agents              : [{id: 'grace'}],
            resolveThrottleState: () => { throw new Error('watchdog auth: token=glpat-SECRET-xyz rejected') }
        })

        expect(states[0].reason).not.toContain('glpat-SECRET-xyz')
        expect(states[0].reason).toContain('[redacted')
        expect(capability.reason).toContain('failed for 1 agent(s)')
    })

    test('rows without an agent id are skipped', async () => {
        const {states} = await readFleetThrottleStateSnapshot({
            agents              : [{}, {id: 'grace'}],
            resolveThrottleState: () => 'none'
        })

        expect(states.map(row => row.agentId)).toEqual(['grace'])
    })
})
