import {setup} from '../../../../setup.mjs'

const appName = 'FleetWakeStateAdapterTest'

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
    readFleetWakeStateSnapshot,
    resolveAgentWakeState,
    resolveDaemonLiveness,
    WAKE_SOURCE_LABEL,
    WAKE_STATES
} from '../../../../../../ai/services/fleet/fleetWakeStateAdapter.mjs'

const enoent = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e }
const esrch  = () => { const e = new Error('ESRCH');  e.code = 'ESRCH';  throw e }
const eperm  = () => { const e = new Error('EPERM');  e.code = 'EPERM';  throw e }

/**
 * Self-test for the wake axis of the S2 telltale taxonomy: observation-only truth (subscription
 * intent × daemon PID-file liveness), the graduated four-state mapping, and the fail-honest rule —
 * every unreadable source degrades to `unknown` with a reason, never to a healthy default.
 */
test.describe('fleetWakeStateAdapter — daemon liveness (PID file + process probe)', () => {
    test('no configured PID path is honestly unknown, never a guessed off', () => {
        expect(resolveDaemonLiveness({})).toEqual({alive: 'unknown', reason: 'wake daemon PID file path not configured'})
    })

    test('a missing PID file is OBSERVED not-running (the exclusive-create contract)', () => {
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: enoent})).toEqual({alive: false, reason: null})
    })

    test('a live recorded process reads alive; EPERM proves existence too', () => {
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => '4242\n', probeProcess: () => {}}).alive).toBe(true)
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => '4242', probeProcess: eperm}).alive).toBe(true)
    })

    test('a stale PID file (ESRCH) is OBSERVED dead, with the staleness named', () => {
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => '4242', probeProcess: esrch}))
            .toEqual({alive: false, reason: 'stale PID file: recorded process is gone'})
    })

    test('unreadable or malformed PID state degrades to unknown with the reason preserved', () => {
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => { throw new Error('EACCES: denied') }}))
            .toEqual({alive: 'unknown', reason: 'EACCES: denied'})
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => 'not-a-pid'}).alive).toBe('unknown')
    })
})

test.describe('fleetWakeStateAdapter — the graduated four-state mapping', () => {
    test('covers exactly the taxonomy', () => {
        expect(WAKE_STATES).toEqual(['on', 'off', 'suppressed', 'unknown'])
    })

    test('no subscription is observed off — regardless of daemon state', () => {
        expect(resolveAgentWakeState({subscriptionState: 'none', daemonAlive: true})).toBe('off')
        expect(resolveAgentWakeState({subscriptionState: 'none', daemonAlive: false})).toBe('off')
        expect(resolveAgentWakeState({subscriptionState: 'none', daemonAlive: 'unknown'})).toBe('off')
    })

    test('active subscription + live daemon is on; + dead daemon is suppressed (the blind-switch incident class)', () => {
        expect(resolveAgentWakeState({subscriptionState: 'active', daemonAlive: true})).toBe('on')
        expect(resolveAgentWakeState({subscriptionState: 'active', daemonAlive: false})).toBe('suppressed')
    })

    test('any unknown input axis makes the output unknown — no fabricated precision', () => {
        expect(resolveAgentWakeState({subscriptionState: 'unknown', daemonAlive: true})).toBe('unknown')
        expect(resolveAgentWakeState({subscriptionState: 'active', daemonAlive: 'unknown'})).toBe('unknown')
        expect(resolveAgentWakeState({subscriptionState: 'garbage', daemonAlive: true})).toBe('unknown')
    })
})

test.describe('fleetWakeStateAdapter — the fleet snapshot + capability envelope', () => {
    const agents = [{id: 'grace'}, {id: 'vega'}, {id: 'euclid'}]

    test('both sources readable: wired/observed capability and per-agent taxonomy rows', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents,
            resolveSubscriptionState: agent => agent.id === 'vega' ? 'none' : 'active',
            pidFilePath             : '/x/wake.pid',
            readFile                : () => '4242',
            probeProcess            : () => {}
        })

        expect(capability).toMatchObject({source: WAKE_SOURCE_LABEL, state: 'wired', confidence: 'observed', reason: null})
        expect(states).toEqual([
            {agentId: 'grace',  wake: 'on',  confidence: 'observed', source: WAKE_SOURCE_LABEL},
            {agentId: 'vega',   wake: 'off', confidence: 'observed', source: WAKE_SOURCE_LABEL},
            {agentId: 'euclid', wake: 'on',  confidence: 'observed', source: WAKE_SOURCE_LABEL}
        ])
    })

    test('dead daemon: subscribed agents read suppressed — exactly the hand-disabled incident', async () => {
        const {states} = await readFleetWakeStateSnapshot({
            agents,
            resolveSubscriptionState: () => 'active',
            pidFilePath             : '/x/wake.pid',
            readFile                : enoent
        })

        expect(states.map(row => row.wake)).toEqual(['suppressed', 'suppressed', 'suppressed'])
    })

    test('unknown-on-unreachable: no subscription reader degrades every row honestly, with reasons', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents      : [{id: 'grace'}],
            pidFilePath : '/x/wake.pid',
            readFile    : () => '4242',
            probeProcess: () => {}
        })

        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
        expect(capability.reason).toContain('subscription read path unavailable')
        expect(states).toEqual([{
            agentId   : 'grace',
            wake      : 'unknown',
            confidence: 'none',
            source    : WAKE_SOURCE_LABEL,
            reason    : 'subscription read path unavailable'
        }])
    })

    test('a throwing subscription reader degrades the capability and carries the failure reason', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                  : [{id: 'grace'}],
            resolveSubscriptionState: () => { throw new Error('graph offline') },
            pidFilePath             : '/x/wake.pid',
            readFile                : () => '4242',
            probeProcess            : () => {}
        })

        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
        expect(states[0]).toMatchObject({wake: 'unknown', confidence: 'none', reason: 'graph offline'})
    })

    test('neither source readable: degraded/none — "we cannot see" is distinguishable from "the fleet is off"', async () => {
        const {capability} = await readFleetWakeStateSnapshot({agents})

        expect(capability).toMatchObject({state: 'degraded', confidence: 'none'})
        expect(capability.reason).toContain('PID file path not configured')
        expect(capability.reason).toContain('subscription read path unavailable')
    })

    test('rows without an agent id are skipped; empty rosters return an empty observed set', async () => {
        const {states} = await readFleetWakeStateSnapshot({
            agents                  : [{}, {id: 'grace'}],
            resolveSubscriptionState: () => 'none',
            pidFilePath             : '/x/wake.pid',
            readFile                : () => '4242',
            probeProcess            : () => {}
        })

        expect(states.map(row => row.agentId)).toEqual(['grace'])
    })
})
