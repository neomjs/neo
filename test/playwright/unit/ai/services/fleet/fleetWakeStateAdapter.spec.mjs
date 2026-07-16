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

    test('a live, identity-verified process reads alive; EPERM still verifies identity', () => {
        const daemonCmd = () => 'node /repo/ai/daemons/wake/daemon.mjs'

        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => '4242\n', probeProcess: () => {}, readProcessCommand: daemonCmd}).alive).toBe(true)
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => '4242', probeProcess: eperm, readProcessCommand: daemonCmd}).alive).toBe(true)
    })

    test('a stale PID file (ESRCH) is OBSERVED dead, with the staleness named', () => {
        expect(resolveDaemonLiveness({pidFilePath: '/x/wake.pid', readFile: () => '4242', probeProcess: esrch}))
            .toEqual({alive: false, reason: 'stale PID file: recorded process is gone'})
    })

    test('a responding PID is NOT the daemon until its command carries the launch marker — reuse reads observed-dead', () => {
        expect(resolveDaemonLiveness({
            pidFilePath       : '/x/wake.pid',
            readFile          : () => '4242',
            probeProcess      : () => {},
            readProcessCommand: () => '/usr/bin/some-unrelated-tool --serve'
        })).toEqual({alive: false, reason: 'PID reused by another process: recorded daemon is gone'})
    })

    test('an unreadable process identity degrades to unknown — a responding PID alone proves nothing', () => {
        expect(resolveDaemonLiveness({
            pidFilePath       : '/x/wake.pid',
            readFile          : () => '4242',
            probeProcess      : () => {},
            readProcessCommand: () => null
        })).toEqual({alive: 'unknown', reason: 'wake daemon process identity unreadable'})

        expect(resolveDaemonLiveness({
            pidFilePath       : '/x/wake.pid',
            readFile          : () => '4242',
            probeProcess      : () => {},
            readProcessCommand: () => { throw new Error('ps unavailable') }
        })).toEqual({alive: 'unknown', reason: 'ps unavailable'})
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
    const agents    = [{id: 'grace'}, {id: 'vega'}, {id: 'euclid'}],
          daemonCmd = () => 'node /repo/ai/daemons/wake/daemon.mjs'

    test('both sources readable: wired/observed capability and per-agent taxonomy rows', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents,
            resolveSubscriptionState: agent => agent.id === 'vega' ? 'none' : 'active',
            pidFilePath             : '/x/wake.pid',
            readFile                : () => '4242',
            probeProcess            : () => {},
            readProcessCommand      : daemonCmd
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
            agents            : [{id: 'grace'}],
            pidFilePath       : '/x/wake.pid',
            readFile          : () => '4242',
            probeProcess      : () => {},
            readProcessCommand: daemonCmd
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
            probeProcess            : () => {},
            readProcessCommand      : daemonCmd
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
            probeProcess            : () => {},
            readProcessCommand      : daemonCmd
        })

        expect(states.map(row => row.agentId)).toEqual(['grace'])
    })

    test('diagnostics are ROW-LOCAL: one throwing row names only itself; siblings keep their own truth', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents,
            resolveSubscriptionState: agent => {
                if (agent.id === 'vega') throw new Error('graph offline for vega')
                return agent.id === 'grace' ? 'active' : 'none'
            },
            pidFilePath       : '/x/wake.pid',
            readFile          : () => '4242',
            probeProcess      : () => {},
            readProcessCommand: daemonCmd
        })

        expect(states).toEqual([
            {agentId: 'grace',  wake: 'on',      confidence: 'observed', source: WAKE_SOURCE_LABEL},
            {agentId: 'vega',   wake: 'unknown', confidence: 'none',     source: WAKE_SOURCE_LABEL, reason: 'graph offline for vega'},
            {agentId: 'euclid', wake: 'off',     confidence: 'observed', source: WAKE_SOURCE_LABEL}
        ])
        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
        expect(capability.reason).toContain('failed for 1 agent(s)')
    })

    test('an out-of-contract reader value degrades the CAPABILITY — garbage cannot hide under wired/observed', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                  : [{id: 'grace'}, {id: 'vega'}],
            resolveSubscriptionState: agent => agent.id === 'grace' ? 'garbage' : 'active',
            pidFilePath             : '/x/wake.pid',
            readFile                : () => '4242',
            probeProcess            : () => {},
            readProcessCommand      : daemonCmd
        })

        expect(states[0]).toMatchObject({wake: 'unknown', confidence: 'none', reason: 'truth source returned an out-of-contract value'})
        expect(states[1]).toMatchObject({wake: 'on', confidence: 'observed'})
        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
        expect(capability.reason).toContain('out-of-contract values for 1 agent(s)')
    })

    test('row reasons are REDACTED before any Body projection — a transport dump cannot leak a token', async () => {
        const {states} = await readFleetWakeStateSnapshot({
            agents                  : [{id: 'grace'}],
            resolveSubscriptionState: () => { throw new Error('fetch failed: token=glpat-SECRET-abc123 rejected') },
            pidFilePath             : '/x/wake.pid',
            readFile                : () => '4242',
            probeProcess            : () => {},
            readProcessCommand      : daemonCmd
        })

        expect(states[0].reason).not.toContain('glpat-SECRET-abc123')
        expect(states[0].reason).toContain('[redacted')
    })

    test('the bulk identity scan drives per-agent membership through the identity mapping — one scan, no fan-out', async () => {
        let scans = 0

        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'grace', githubUsername: 'neo-opus-grace'}, {id: 'vega', githubUsername: 'neo-opus-vega'}],
            listActiveSubscriptionIdentities: () => { scans++; return ['@neo-opus-grace'] },
            pidFilePath                     : '/x/wake.pid',
            readFile                        : () => '4242',
            probeProcess                    : () => {},
            readProcessCommand              : daemonCmd
        })

        expect(scans).toBe(1)
        expect(states).toEqual([
            {agentId: 'grace', wake: 'on',  confidence: 'observed', source: WAKE_SOURCE_LABEL},
            {agentId: 'vega',  wake: 'off', confidence: 'observed', source: WAKE_SOURCE_LABEL}
        ])
        expect(capability).toMatchObject({state: 'wired', confidence: 'observed'})
    })

    test('a failing bulk scan degrades every row honestly — never a fabricated empty fleet', async () => {
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'grace'}],
            listActiveSubscriptionIdentities: () => { throw new Error('graph read surface unavailable') },
            pidFilePath                     : '/x/wake.pid',
            readFile                        : () => '4242',
            probeProcess                    : () => {},
            readProcessCommand              : daemonCmd
        })

        expect(states[0]).toMatchObject({wake: 'unknown', confidence: 'none', reason: 'graph read surface unavailable'})
        expect(capability).toMatchObject({state: 'degraded', confidence: 'partial'})
    })

    test('a failing bulk scan AND an unconfigured daemon report confidence none — a reader that only throws is not a source', async () => {
        // The sibling case above keeps `partial` honestly: its PID probe still observes liveness.
        // Strip that last source and NOTHING is observed, so the envelope must say so — the mere
        // existence of a (throw-only) reader function must not buy partial visibility.
        const {capability, states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'grace'}],
            listActiveSubscriptionIdentities: () => { throw new Error('graph read surface unavailable') }
        })

        expect(states[0]).toMatchObject({wake: 'unknown', confidence: 'none', reason: 'graph read surface unavailable'})
        expect(capability).toMatchObject({state: 'degraded', confidence: 'none'})
        expect(capability.reason).toContain('PID file path not configured')
    })

    test('every row state stays inside the closed four-state taxonomy, whatever the sources do', async () => {
        const {states} = await readFleetWakeStateSnapshot({
            agents                          : [{id: 'grace'}, {id: 'vega'}, {id: 'euclid'}],
            listActiveSubscriptionIdentities: () => { throw new Error('graph offline') }
        })

        for (const row of states) {
            expect(WAKE_STATES).toContain(row.wake)
        }
    })
})
