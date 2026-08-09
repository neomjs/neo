import {setup} from '../../../../setup.mjs'

const appName = 'FleetPresenceStateAdapterTest'

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
    PRESENCE_SOURCE_LABEL,
    PRESENCE_STATES,
    presenceIdentityForAgent,
    readFleetPresenceSnapshot
} from '../../../../../../ai/services/fleet/fleetPresenceStateAdapter.mjs'

const
    agents = [
        {id: 'neo-fable-clio', githubUsername: 'neo-fable-clio'},
        {id: 'neo-gpt',        githubUsername: 'neo-gpt'}
    ],
    healthyPayload = {
        agents: [
            {
                identity: '@neo-fable-clio',
                state   : 'online',
                signals : {activityRecency: {lastActivityAt: '2026-08-09T11:00:00.000Z'}}
            },
            {
                identity: '@neo-gpt',
                state   : 'idle',
                signals : {}
            }
        ]
    }

/**
 * Self-test for the presence axis of the truth-preserving presence contract: the
 * plane's `who_is_online` band embryo joined per registered agent, the tier-degradation rule at
 * the producer boundary (no reader ⇒ absence of signal, never a verdict), and row-local honesty —
 * a seat missing from a healthy report degrades itself, never its siblings or the capability.
 */
test.describe('fleetPresenceStateAdapter — capability envelope (producer health)', () => {
    test('no reader is the honest degraded default — every row unknown, tier absent, never a verdict', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({agents})

        expect(capability.source).toBe(PRESENCE_SOURCE_LABEL)
        expect(capability.state).toBe('degraded')
        expect(capability.confidence).toBe('none')
        expect(capability.reason).toContain('no presence truth source exists for this mode')

        expect(states).toHaveLength(2)

        for (const row of states) {
            expect(row.presence).toBe('unknown')
            expect(row.confidence).toBe('none')
            expect(row.reason).toContain('no presence truth source')
        }
    })

    test('a throwing reader degrades the envelope with the redacted cause; rows stay unknown', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => { throw new Error('plane unreachable') }
        })

        expect(capability.state).toBe('degraded')
        expect(capability.confidence).toBe('none')
        expect(capability.reason).toBe('plane unreachable')
        expect(states.every(row => row.presence === 'unknown')).toBe(true)
    })

    test('a malformed answer (no agents array) is unreadable, never an empty fleet', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => ({rows: []})
        })

        expect(capability.state).toBe('degraded')
        expect(capability.reason).toBe('presence answer unreadable')
        expect(states.every(row => row.presence === 'unknown')).toBe(true)
    })

    test('capturedAt is the envelope observation bound, serialized ISO', async () => {
        const {capability} = await readFleetPresenceSnapshot({
            agents,
            capturedAt: '2026-08-09T12:00:00.000Z'
        })

        expect(capability.capturedAt).toBe('2026-08-09T12:00:00.000Z')
    })
})

test.describe('fleetPresenceStateAdapter — healthy report (band join)', () => {
    test('bands + recency join per agent through the default @githubUsername identity', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => healthyPayload
        })

        expect(capability.state).toBe('wired')
        expect(capability.confidence).toBe('observed')
        expect(capability.reason).toBeNull()

        expect(states[0]).toEqual({
            agentId   : 'neo-fable-clio',
            presence  : 'online',
            lastSeenAt: '2026-08-09T11:00:00.000Z',
            confidence: 'observed',
            source    : PRESENCE_SOURCE_LABEL
        })
        expect(states[1].presence).toBe('idle')
        expect(states[1].lastSeenAt).toBeNull()
    })

    test('a seat absent from a HEALTHY report is row-local unknown — capability stays wired/observed', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents      : [...agents, {id: 'neo-kimi-iris', githubUsername: 'neo-kimi-iris'}],
            readPresence: () => healthyPayload
        })

        expect(capability.state).toBe('wired')
        expect(capability.confidence).toBe('observed')

        const absent = states.find(row => row.agentId === 'neo-kimi-iris')

        expect(absent.presence).toBe('unknown')
        expect(absent.reason).toBe('seat absent from the presence report')

        // Siblings keep their own truth — row-local honesty never spreads.
        expect(states.find(row => row.agentId === 'neo-fable-clio').presence).toBe('online')
    })

    test('an out-of-vocabulary band is skipped, not admitted — the seat answers unknown, the enum stays closed', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents      : [{id: 'neo-fable-clio', githubUsername: 'neo-fable-clio'}],
            readPresence: () => ({agents: [{identity: '@neo-fable-clio', state: 'levitating'}]})
        })

        expect(capability.state).toBe('wired')
        expect(states[0].presence).toBe('unknown')
        expect(states[0].reason).toBe('seat absent from the presence report')
        expect(PRESENCE_STATES).not.toContain('levitating')
    })

    test('every emitted band in the closed vocabulary passes through verbatim', async () => {
        const
            roster   = PRESENCE_STATES.map((state, index) => ({id: `agent-${index}`, githubUsername: `agent-${index}`})),
            payload  = {agents: PRESENCE_STATES.map((state, index) => ({identity: `@agent-${index}`, state}))},
            {states} = await readFleetPresenceSnapshot({agents: roster, readPresence: () => payload})

        expect(states.map(row => row.presence)).toEqual([...PRESENCE_STATES])
    })

    test('the default join accepts the registry\'s FULL production spelling domain — a persisted leading @ never fabricates absence', async () => {
        // defineAgent stores githubUsername unchanged (truthiness is its only requirement), so a
        // persisted '@neo-gpt' is an ACCEPTED production spelling of the same seat as 'neo-gpt'.
        const {capability, states} = await readFleetPresenceSnapshot({
            agents: [
                {id: 'prefixed', githubUsername: '@neo-gpt'},
                {id: 'bare',     githubUsername: 'neo-fable-clio'}
            ],
            readPresence: () => ({agents: [
                {identity: '@neo-gpt',        state: 'online'},
                {identity: '@neo-fable-clio', state: 'idle'}
            ]})
        })

        expect(capability.state).toBe('wired')
        expect(states.find(row => row.agentId === 'prefixed').presence).toBe('online')
        expect(states.find(row => row.agentId === 'bare').presence).toBe('idle')

        // the canonicalizer itself: one prefix, degenerate stacking stripped, id fallback covered
        expect(presenceIdentityForAgent({githubUsername: '@neo-gpt'})).toBe('@neo-gpt')
        expect(presenceIdentityForAgent({githubUsername: '@@weird'})).toBe('@weird')
        expect(presenceIdentityForAgent({id: '@already'})).toBe('@already')
    })

    test('two registry instances sharing one identity both receive the band — the intentional cardinality', async () => {
        const {states} = await readFleetPresenceSnapshot({
            agents: [
                {id: 'seat-a', githubUsername: 'neo-gpt'},
                {id: 'seat-b', githubUsername: 'neo-gpt'}
            ],
            readPresence: () => ({agents: [{identity: '@neo-gpt', state: 'online'}]})
        })

        expect(states.map(row => row.presence)).toEqual(['online', 'online'])
    })

    test('a custom presenceIdentityFor overrides the identity join', async () => {
        const {states} = await readFleetPresenceSnapshot({
            agents             : [{id: 'clio-registry-id'}],
            readPresence       : () => ({agents: [{identity: 'IDENTITY:custom', state: 'online'}]}),
            presenceIdentityFor: () => 'IDENTITY:custom'
        })

        expect(states[0].presence).toBe('online')
    })

    test('agents without an id are skipped — the sibling adapters\' one-agent-set rule', async () => {
        const {states} = await readFleetPresenceSnapshot({
            agents      : [{githubUsername: 'ghost'}, {id: 'real', githubUsername: 'real'}],
            readPresence: () => ({agents: []})
        })

        expect(states).toHaveLength(1)
        expect(states[0].agentId).toBe('real')
    })
})
