import {setup} from '../../../../setup.mjs';

const appName = 'FleetActivityComposerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary The producer for the slot `FleetControlBridge` has consumed since it was written.
 *
 * Events merge trivially; SIGHT does not — and that asymmetry is the whole reason this module exists.
 * A degraded adapter contributes zero events, which is byte-identical to a healthy adapter on a quiet
 * fleet. The event list therefore cannot carry the difference, and the capability is the only place it
 * can survive. Every test below is aimed at that single claim: the composite never reports more sight
 * than it has.
 */
test.describe('fleetActivityComposer — composing two truths means composing two capabilities', () => {
    let createFleetActivityReadSource;

    const wired = (events = []) => async () => ({
        capability: {source: 'fleet:a2a', state: 'wired', confidence: 'observed'},
        events
    });

    const degraded = (source, reason) => async () => ({
        capability: {source, state: 'degraded', confidence: 'none', reason},
        events    : []
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/fleet/fleetActivityComposer.mjs');
        createFleetActivityReadSource = mod.createFleetActivityReadSource
    });

    test('both adapters wired → the composite may claim wired, and the feed merges newest-first', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : wired([{occurredAt: '2026-07-16T11:00:00.000Z', id: 'a2a-old'}]),
            readPrLaneSnapshot: wired([{occurredAt: '2026-07-16T12:00:00.000Z', id: 'pr-new'}])
        });

        const {capability, events} = await source.readActivitySnapshot();

        expect(capability.state).toBe('wired');
        expect(capability.confidence).toBe('observed');
        expect(capability.reason).toBeNull();
        // one feed, not two lists stapled together
        expect(events.map(event => event.id)).toEqual(['pr-new', 'a2a-old'])
    });

    test('ONE blind adapter degrades the composite — a half-feed must not read as the whole fleet', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : wired([{occurredAt: '2026-07-16T11:00:00.000Z', id: 'a2a-1'}]),
            readPrLaneSnapshot: degraded('fleet:pr-lane', 'github unreachable')
        });

        const {capability, events} = await source.readActivitySnapshot();

        // The events look perfectly healthy — one real row, nothing obviously missing. That is exactly
        // why `wired` here would be a lie the caller could never detect.
        expect(events.map(event => event.id)).toEqual(['a2a-1']);

        expect(capability.state).toBe('degraded');
        expect(capability.confidence).toBe('none');
        expect(capability.reason).toContain('fleet:pr-lane');
        expect(capability.reason).toContain('github unreachable')
    });

    test('BOTH blind → not-wired, not degraded — half a feed and none of it are different facts', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : degraded('fleet:a2a', 'mailbox unreadable'),
            readPrLaneSnapshot: degraded('fleet:pr-lane', 'github unreachable')
        });

        const {capability} = await source.readActivitySnapshot();

        expect(capability.state).toBe('not-wired');
        // BOTH are named: an operator debugging a dead feed must not fix one adapter and wonder why
        // nothing changed.
        expect(capability.reason).toContain('fleet:a2a');
        expect(capability.reason).toContain('fleet:pr-lane')
    });

    test('a wired composite with NO events says so — "nothing happened" is not "we could not look"', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : wired([]),
            readPrLaneSnapshot: wired([])
        });

        const {capability, events} = await source.readActivitySnapshot();

        // The AC that makes the whole module worth having: an empty list under a WIRED capability is a
        // quiet fleet; the same empty list under a degraded one is blindness. Identical events, and the
        // capability is the only thing that separates them.
        expect(events).toEqual([]);
        expect(capability.state).toBe('wired')
    });

    test('a THROWING adapter degrades rather than taking the snapshot down with it', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => { throw new Error('mailbox exploded') },
            readPrLaneSnapshot: wired([{occurredAt: '2026-07-16T12:00:00.000Z', id: 'pr-1'}])
        });

        const {capability, events} = await source.readActivitySnapshot();

        expect(capability.state).toBe('degraded');
        expect(capability.reason).toContain('mailbox exploded');
        // the half that CAN be read still reaches the cockpit — degraded is not blank
        expect(events.map(event => event.id)).toEqual(['pr-1'])
    });

    test('the caller\'s limit bounds the MERGED feed, and reaches both adapters', async () => {
        const seen      = [];
        const recording = id => async params => {
            seen.push([id, params.limit]);
            return {capability: {source: id, state: 'wired', confidence: 'observed'}, events: [
                {occurredAt: '2026-07-16T12:00:00.000Z', id: `${id}-a`},
                {occurredAt: '2026-07-16T11:00:00.000Z', id: `${id}-b`}
            ]}
        };

        const source = createFleetActivityReadSource({
            readA2ASnapshot   : recording('a2a'),
            readPrLaneSnapshot: recording('pr')
        });

        const {events} = await source.readActivitySnapshot({limit: 3});

        // bounding only the merge would let each adapter read unboundedly and throw the surplus away
        expect(seen).toEqual([['a2a', 3], ['pr', 3]]);
        expect(events).toHaveLength(3)
    });

    test('fails LOUD on a missing reader — a one-legged composite is not the fleet\'s activity', () => {
        expect(() => createFleetActivityReadSource({readA2ASnapshot: wired([])}))
            .toThrow(/readA2ASnapshot and readPrLaneSnapshot must be injected/);
        expect(() => createFleetActivityReadSource({readPrLaneSnapshot: wired([])}))
            .toThrow(/readA2ASnapshot and readPrLaneSnapshot must be injected/);
        expect(() => createFleetActivityReadSource())
            .toThrow(/must be injected/)
    })
});

/**
 * @summary The composition, with NO double between the halves.
 *
 * Two suites can both be green over code that cannot run: when each stubs the other, both agree with
 * a contract neither honours, and the mismatch surfaces only in production. The suite above has that
 * hole by construction — it proves the composer against one reading of the bridge's contract.
 *
 * This binds the REAL `FleetControlBridge` to the REAL composer. If the producer does not satisfy the
 * consumer, this is the only test here that can say so.
 */
test.describe('fleetActivityComposer ↔ FleetControlBridge — the real consumer calls the real producer', () => {
    let FleetControlBridge, createFleetActivityReadSource;

    test.beforeAll(async () => {
        FleetControlBridge           = (await import('../../../../../../ai/services/fleet/FleetControlBridge.mjs')).default;
        createFleetActivityReadSource = (await import('../../../../../../ai/services/fleet/fleetActivityComposer.mjs')).createFleetActivityReadSource
    });

    test.afterEach(() => { FleetControlBridge.activitySource = null });

    test('the bridge accepts the composer as its activitySource and gets a composed snapshot back', async () => {
        const seen = [];

        FleetControlBridge.activitySource = createFleetActivityReadSource({
            readA2ASnapshot: async params => {
                seen.push(['a2a', params.limit]);
                return {
                    capability: {source: 'fleet:a2a', state: 'wired', confidence: 'observed'},
                    events    : [{occurredAt: '2026-07-16T11:00:00.000Z', id: 'a2a-1'}]
                }
            },
            readPrLaneSnapshot: async params => {
                seen.push(['pr-lane', params.limit]);
                return {
                    capability: {source: 'fleet:pr-lane', state: 'wired', confidence: 'observed'},
                    events    : [{occurredAt: '2026-07-16T12:00:00.000Z', id: 'pr-1'}]
                }
            }
        });

        // the bridge's own verb, not a direct call to the source
        const result = await FleetControlBridge.fleetActivity({limit: 25});

        // The bridge forwards its bounds verbatim (FleetControlBridge.mjs:355) — so the caller's limit
        // must reach BOTH adapters through the composer, not stop at it.
        expect(seen).toEqual([['a2a', 25], ['pr-lane', 25]]);

        expect(result.capability.state).toBe('wired');
        expect(result.capability.source).toBe('fleet:activity-adapters');
        expect(result.events.map(event => event.id)).toEqual(['pr-1', 'a2a-1'])
    });

    test('a blind half reaches the bridge as degraded — the honest state survives the seam', async () => {
        FleetControlBridge.activitySource = createFleetActivityReadSource({
            readA2ASnapshot   : async () => ({capability: {source: 'fleet:a2a', state: 'wired', confidence: 'observed'}, events: []}),
            readPrLaneSnapshot: async () => ({capability: {source: 'fleet:pr-lane', state: 'degraded', confidence: 'none', reason: 'github unreachable'}, events: []})
        });

        const result = await FleetControlBridge.fleetActivity();

        // The events are empty either way; only the capability distinguishes a quiet fleet from a
        // half-blind one — and it has to survive the bridge to be worth anything.
        expect(result.events).toEqual([]);
        expect(result.capability.state).toBe('degraded');
        expect(result.capability.reason).toContain('github unreachable')
    })
});
