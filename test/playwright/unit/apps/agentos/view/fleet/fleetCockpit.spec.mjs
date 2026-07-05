import {setup} from '../../../../../setup.mjs';

const appName = 'FleetCockpitLoadActivityTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import Instance       from '../../../../../../../src/manager/Instance.mjs';

/**
 * Covers the fail-closed matrix for `FleetCockpit.loadActivity()` — the app-side consumption of the
 * read-observe `fleetActivity` bridge verb.
 *
 * `loadActivity`'s unit is its ROUTING decision: given the bridge's honest capability state, which
 * `adapterState` (+ event order) does it apply to the stream? The stream is a collaborator, so it is
 * mocked with a spy that records what `loadActivity` sets — this pins the routing precisely and in
 * isolation. That the REAL `ActivityStream` renders each `adapterState` (sample / live / stale) is
 * covered by `activityStream.spec.mjs`; here we prove `loadActivity` chooses the right one.
 */
test.describe('Fleet cockpit — activity feed binding (loadActivity, #14868)', () => {
    let FleetCockpit;

    const clearBridge = () => { delete globalThis.AgentOS };

    // a spy stream: `loadActivity` either assigns `adapterState` directly (stale) or calls `set({...})`
    // (live); both land on the same object so the resulting state is assertable.
    const makeStream = () => ({adapterState: 'sample', events: null, set(config) { Object.assign(this, config) }});

    /**
     * @param {Object|null} bridge The stubbed `registryBridge` (or null for "no bridge").
     * @returns {Promise<Object>} the spy stream after loadActivity routed to it.
     */
    const routeLoadActivity = async bridge => {
        bridge ? (globalThis.AgentOS = {fleet: {registryBridge: bridge}}) : clearBridge();

        const stream  = makeStream(),
              cockpit = {getReference: reference => reference === 'activity-stream' ? stream : null};

        await FleetCockpit.prototype.loadActivity.call(cockpit);

        return stream
    };

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs')).default
    });

    test.afterEach(() => clearBridge());

    test('no bridge → keeps the honestly-labelled sample seed (fail-closed, no crash)', async () => {
        expect((await routeLoadActivity(null)).adapterState).toBe('sample')
    });

    test('a bridge without fleetActivity → keeps the sample seed', async () => {
        expect((await routeLoadActivity({})).adapterState).toBe('sample')
    });

    test('not-wired capability → keeps the sample seed', async () => {
        const stream = await routeLoadActivity({fleetActivity: async () => ({capability: {state: 'not-wired'}, events: []})});
        expect(stream.adapterState).toBe('sample')
    });

    test('degraded capability → the stale banner', async () => {
        const stream = await routeLoadActivity({fleetActivity: async () => ({capability: {state: 'degraded'}, events: []})});
        expect(stream.adapterState).toBe('stale')
    });

    test('a thrown source → fail-closed, keeps the sample seed (never blanks or falsely goes live)', async () => {
        const stream = await routeLoadActivity({fleetActivity: async () => { throw new Error('bridge boom') }});
        expect(stream.adapterState).toBe('sample')
    });

    test('wired + events → live, reversing the newest-first feed to chronological for the stream', async () => {
        const stream = await routeLoadActivity({fleetActivity: async () => ({
            capability: {state: 'wired'},
            events    : [ // newest-first, as the adapter sorts
                {type: 'a2a-activity', occurredAt: '2026-07-04T12:00:00.000Z', payload: {subject: 'newest'}},
                {type: 'a2a-activity', occurredAt: '2026-07-04T11:00:00.000Z', payload: {subject: 'older'}}
            ]
        })});
        expect(stream.adapterState).toBe('live');
        expect(stream.events.map(event => event.payload.subject)).toEqual(['older', 'newest'])
    });

    test('wired + empty → live (streaming but quiet), never the sample — a wired source is live', async () => {
        const stream = await routeLoadActivity({fleetActivity: async () => ({capability: {state: 'wired'}, events: []})});
        expect(stream.adapterState).toBe('live');
        expect(stream.events).toEqual([])
    });
});
