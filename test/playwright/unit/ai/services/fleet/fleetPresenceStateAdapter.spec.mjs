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
    beaconFreshAtBound,
    gradePresenceBand,
    PRESENCE_BANDS,
    PRESENCE_CAPABILITY_REASON_CODES,
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

    test('a binding-classified read degrades WITH the typed reasonCode — and never an empty fleet', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => {
                throw Object.assign(new Error('plane who_is_online failed: session lost and plane identity mismatch'), {
                    planeBlockerCode: 'viewer-binding-unavailable'
                })
            }
        })

        expect(capability.state).toBe('degraded')
        expect(capability.reasonCode).toBe('viewer-binding-unavailable')
        expect(PRESENCE_CAPABILITY_REASON_CODES).toContain(capability.reasonCode)

        // binding-unavailable is NEVER rendered as an empty/dark fleet: every roster row answers
        expect(states).toHaveLength(agents.length)
        expect(states.every(row => row.presence === 'unknown')).toBe(true)
    })

    test('an unclassified failure carries NO reasonCode — and an unrecognized stamp is dropped, never admitted', async () => {
        const plain = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => { throw new Error('plane unreachable') }
        })

        expect(plain.capability.state).toBe('degraded')
        expect('reasonCode' in plain.capability).toBe(false)

        // the closed-set guard: an out-of-vocabulary stamp must not leak an open enum downstream
        const unrecognized = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => {
                throw Object.assign(new Error('weird'), {planeBlockerCode: 'made-up-code'})
            }
        })

        expect('reasonCode' in unrecognized.capability).toBe(false)
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
    test('bands + recency join per agent through the default @githubUsername identity — emitted GRADED', async () => {
        const {capability, states} = await readFleetPresenceSnapshot({
            agents,
            readPresence: () => healthyPayload
        })

        expect(capability.state).toBe('wired')
        expect(capability.confidence).toBe('observed')
        expect(capability.reason).toBeNull()

        // the emitted vocabulary is the GRADE: online-without-a-fresh-beacon reads `fresh`
        // (recent durable activity), the plane's idle window reads `recent`
        expect(states[0]).toEqual({
            agentId   : 'neo-fable-clio',
            presence  : 'fresh',
            lastSeenAt: '2026-08-09T11:00:00.000Z',
            confidence: 'observed',
            source    : PRESENCE_SOURCE_LABEL
        })
        expect(states[1].presence).toBe('recent')
        expect(states[1].lastSeenAt).toBeNull()
    })

    test('the flap falsifier: a FRESH beacon grades active-turn regardless of add_memory staleness; membership facts never grade', async () => {
        const {states} = await readFleetPresenceSnapshot({
            agents: [
                {id: 'mid-turn',  githubUsername: 'mid-turn'},
                {id: 'long-turn', githubUsername: 'long-turn'},
                {id: 'benched',   githubUsername: 'benched'}
            ],
            // the bound is pinned BEFORE the vouched freshUntil — the beacon is fresh AT THIS
            // SNAPSHOT, deterministically (never an implicit wall-clock `new Date()`)
            capturedAt  : '2026-08-11T00:00:00.000Z',
            readPresence: () => ({agents: [
                // fresh beacon + fresh activity: mid-turn RIGHT NOW
                {identity: '@mid-turn', state: 'online', signals: {turnPresence: {fresh: true, freshUntil: '2026-08-11T00:30:00.000Z'}}},
                // the 70-minute-turn specimen: add_memory stale (plane says idle) but the beacon
                // is fresh — the grade is active-turn, never a flap to recent/dark
                {identity: '@long-turn', state: 'idle', signals: {turnPresence: {fresh: true, freshUntil: '2026-08-11T00:30:00.000Z'}}},
                // a fresh beacon must not rescue a membership fact
                {identity: '@benched', state: 'benched', signals: {turnPresence: {fresh: true}}}
            ]})
        })

        expect(states.map(row => row.presence)).toEqual(['active-turn', 'active-turn', 'benched'])
    })

    test('gradePresenceBand is pure and total: the full grade matrix, malformed signals never fabricate', () => {
        // the grade matrix over the plane vocabulary × beacon freshness
        expect(gradePresenceBand({state: 'online', beaconFresh: true})).toBe('active-turn')
        expect(gradePresenceBand({state: 'idle',   beaconFresh: true})).toBe('active-turn')
        expect(gradePresenceBand({state: 'dark',   beaconFresh: true})).toBe('active-turn')
        expect(gradePresenceBand({state: 'online'})).toBe('fresh')
        expect(gradePresenceBand({state: 'idle'})).toBe('recent')
        expect(gradePresenceBand({state: 'dark'})).toBe('dark')

        // membership facts pass through untouched, beacon or not
        expect(gradePresenceBand({state: 'benched',        beaconFresh: true})).toBe('benched')
        expect(gradePresenceBand({state: 'neverConnected', beaconFresh: true})).toBe('neverConnected')

        // total on odd input: pass-through, never a fabricated grade; absent signal = not fresh
        expect(gradePresenceBand({state: 'unknown'})).toBe('unknown')
        expect(gradePresenceBand({})).toBe(undefined)
        expect(gradePresenceBand()).toBe(undefined)

        // every graded output the adapter can emit is in the declared band vocabulary
        for (const state of PRESENCE_STATES) {
            expect(PRESENCE_BANDS).toContain(gradePresenceBand({state, beaconFresh: true}))
            expect(PRESENCE_BANDS).toContain(gradePresenceBand({state, beaconFresh: false}))
        }
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
        expect(states.find(row => row.agentId === 'neo-fable-clio').presence).toBe('fresh')
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

    test('every admitted plane verdict emits its GRADE — the closed input set maps onto the closed band set', async () => {
        const
            roster   = PRESENCE_STATES.map((state, index) => ({id: `agent-${index}`, githubUsername: `agent-${index}`})),
            payload  = {agents: PRESENCE_STATES.map((state, index) => ({identity: `@agent-${index}`, state}))},
            {states} = await readFleetPresenceSnapshot({agents: roster, readPresence: () => payload})

        // beaconless grading: online→fresh, idle→recent, the rest verbatim — and every emission
        // is in the declared band vocabulary
        expect(states.map(row => row.presence)).toEqual(['fresh', 'recent', 'dark', 'benched', 'neverConnected'])
        states.forEach(row => expect(PRESENCE_BANDS).toContain(row.presence))
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
        // graded emission: beaconless online → fresh, idle → recent
        expect(states.find(row => row.agentId === 'prefixed').presence).toBe('fresh')
        expect(states.find(row => row.agentId === 'bare').presence).toBe('recent')

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

        expect(states.map(row => row.presence)).toEqual(['fresh', 'fresh'])
    })

    test('a custom presenceIdentityFor overrides the identity join', async () => {
        const {states} = await readFleetPresenceSnapshot({
            agents             : [{id: 'clio-registry-id'}],
            readPresence       : () => ({agents: [{identity: 'IDENTITY:custom', state: 'online'}]}),
            presenceIdentityFor: () => 'IDENTITY:custom'
        })

        expect(states[0].presence).toBe('fresh')
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

test.describe('fleetPresenceStateAdapter — beacon horizons (the vouched-bound derivation)', () => {
    test('beaconFreshAtBound is pure and total: horizons govern at the bound; the boolean is only the degraded-tier fallback', () => {
        const boundAt = Date.parse('2026-08-11T00:00:00.000Z')

        // no observation → never fresh
        expect(beaconFreshAtBound({})).toBe(false)
        expect(beaconFreshAtBound({turnPresence: null, boundAt})).toBe(false)

        // a vouched horizon governs — in BOTH directions, whatever the producer boolean claims
        expect(beaconFreshAtBound({turnPresence: {fresh: false, freshUntil: '2026-08-11T00:30:00.000Z'}, boundAt})).toBe(true)
        expect(beaconFreshAtBound({turnPresence: {fresh: true,  freshUntil: '2026-08-10T23:59:00.000Z'}, boundAt})).toBe(false)

        // an expired observation vouches nothing, whatever its horizons or boolean claim
        expect(beaconFreshAtBound({turnPresence: {fresh: true, freshUntil: '2026-08-11T00:30:00.000Z', expiresAt: '2026-08-11T00:00:00.000Z'}, boundAt})).toBe(false)

        // the veto also beats the DEGRADED-tier boolean fallback: absent or malformed freshUntil
        // must not smuggle a fresh:true past a validly expired observation (the reviewer's
        // exact-head falsifier pair)
        expect(beaconFreshAtBound({turnPresence: {fresh: true, expiresAt: '2026-08-10T23:00:00.000Z'}, boundAt})).toBe(false)
        expect(beaconFreshAtBound({turnPresence: {fresh: true, expiresAt: '2026-08-10T23:00:00.000Z', freshUntil: 'not-a-date'}, boundAt})).toBe(false)

        // horizon tier absent or unparseable → the vouched boolean is the only signal
        // (tier degradation: no refinement, never a fabricated verdict)
        expect(beaconFreshAtBound({turnPresence: {fresh: true},  boundAt})).toBe(true)
        expect(beaconFreshAtBound({turnPresence: {fresh: false}, boundAt})).toBe(false)
        expect(beaconFreshAtBound({turnPresence: {fresh: true, freshUntil: 'not-a-date'}, boundAt})).toBe(true)

        // no usable bound → boolean fallback (never NaN comparisons)
        expect(beaconFreshAtBound({turnPresence: {fresh: true, freshUntil: '2026-08-10T00:00:00.000Z'}})).toBe(true)
    })

    test('the skew falsifier: ONE payload, two bounds — the grade derives from the vouched horizon, never the producer clock', async () => {
        const
            roster  = [{id: 'seat', githubUsername: 'seat'}],
            payload = {agents: [{
                identity: '@seat',
                state   : 'online',
                signals : {turnPresence: {fresh: true, freshUntil: '2026-08-11T00:30:00.000Z', expiresAt: '2026-08-11T01:00:00.000Z'}}
            }]}

        // bound BEFORE freshUntil: mid-turn right now
        const early = await readFleetPresenceSnapshot({agents: roster, readPresence: () => payload, capturedAt: '2026-08-11T00:15:00.000Z'})

        expect(early.states[0].presence).toBe('active-turn')

        // the SAME payload at a later bound: the producer boolean still claims fresh, the vouched
        // horizon says the turn ended — the grade follows the horizon down to the plane verdict
        const late = await readFleetPresenceSnapshot({agents: roster, readPresence: () => payload, capturedAt: '2026-08-11T00:45:00.000Z'})

        expect(late.states[0].presence).toBe('fresh')

        // past expiry the observation vouches nothing at all; the envelope bound is the same
        // instant the horizons were evaluated against — one clock value, declared
        const expired = await readFleetPresenceSnapshot({agents: roster, readPresence: () => payload, capturedAt: '2026-08-11T01:30:00.000Z'})

        expect(expired.states[0].presence).toBe('fresh')
        expect(expired.capability.capturedAt).toBe('2026-08-11T01:30:00.000Z')
    })
})
