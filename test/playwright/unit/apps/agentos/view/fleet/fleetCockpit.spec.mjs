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

import {test, expect}  from '@playwright/test';
import {readFileSync}  from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import Instance        from '../../../../../../../src/manager/Instance.mjs';

const seedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../../apps/agentos/resources/data/fleetRoster.json');

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

/**
 * Covers the Store-backed roster data path: the shared `FleetRoster` singleton contract
 * and the fail-closed routing matrix for `FleetCockpit.loadRoster()` — the app-side consumption of
 * the read-observe `fleetRoster` bridge verb. Like `loadActivity`, the unit is the ROUTING decision;
 * the grid + store are collaborators, mocked with spies that record what `loadRoster` does to them.
 */
test.describe('Fleet cockpit — Store-backed roster (loadRoster)', () => {
    let FleetAgent, FleetCockpit, FleetRoster;

    const clearBridge = () => { delete globalThis.AgentOS };

    // a spy store + grid: `loadRoster` clears/adds on the first snapshot, reconciles after (upsert +
    // remove-absent), flips adapterState. `items` feeds the reconciliation's absence sweep.
    const makeGrid = (known = {}, items = []) => {
        const store = {
            added  : [],
            cleared: 0,
            removed: [],
            items,
            clear() { this.cleared++ },
            add(rows) { this.added.push(...[].concat(rows)) },
            get(id) { return known[id] ?? null },
            remove(id) { this.removed.push(id) }
        };

        return {adapterState: 'sample', store}
    };

    const makeCockpit = (grid, rosterWired = false) => ({
        getReference   : reference => reference === 'fleet-grid' ? grid : null,
        mapRosterRow   : FleetCockpit.prototype.mapRosterRow,
        reconcileRoster: FleetCockpit.prototype.reconcileRoster,
        rosterWired
    });

    const routeLoadRoster = async (bridge, {known, items, rosterWired} = {}) => {
        bridge ? (globalThis.AgentOS = {fleet: {registryBridge: bridge}}) : clearBridge();

        const grid    = makeGrid(known, items),
              cockpit = makeCockpit(grid, rosterWired);

        await FleetCockpit.prototype.loadRoster.call(cockpit);

        return {cockpit, grid}
    };

    test.beforeAll(async () => {
        FleetAgent   = (await import('../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        FleetCockpit = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs')).default;
        FleetRoster  = (await import('../../../../../../../apps/agentos/store/FleetRoster.mjs')).default
    });

    test.afterEach(() => clearBridge());

    test('FleetRoster is a provider-hosted Store CLASS — JSON-fetched seed, durable agentId keying, honest sample', () => {
        // no singleton: the cockpit provider hosts + autoLoads the ONE shared instance; the class
        // carries the url seed (the Portal.store.* house pattern)
        expect(FleetRoster.isClass).toBe(true);
        expect(FleetRoster.config.singleton).toBeFalsy();
        expect(FleetRoster.config.url).toBe('../../apps/agentos/resources/data/fleetRoster.json');

        // the JSON sample seed: the seven REAL maintainer identities — no invented agents
        const seed = JSON.parse(readFileSync(seedPath, 'utf8')).data;
        expect(seed).toHaveLength(7);
        const knownHandles = ['neo-fable', 'neo-fable-clio', 'neo-gemini-pro', 'neo-gpt', 'neo-opus-ada', 'neo-opus-grace', 'neo-opus-vega'];
        expect(seed.map(row => row.agentId).sort()).toEqual(knownHandles);

        // engine tags pinned to the registry designations at seed time — this front-door surface
        // must not silently reintroduce a stale model designation
        const engineTags = Object.fromEntries(seed.map(row => [row.agentId, row.engineTag]));
        expect(engineTags).toEqual({
            'neo-fable'     : 'fable-5',
            'neo-fable-clio': 'fable-5',
            'neo-gemini-pro': '3.1-pro',
            'neo-gpt'       : 'gpt-5.6-sol',
            'neo-opus-ada'  : 'opus-4.8',
            'neo-opus-grace': 'opus-4.8',
            'neo-opus-vega' : 'opus-4.8'
        });

        // seed rows hydrate as records exposing the model fields — incl the B4/C2 control seam defaults
        const store = Neo.create(FleetRoster, {data: seed});
        expect(store.getKeyProperty()).toBe('agentId');
        expect(store.model.className).toBe('AgentOS.model.FleetAgent');

        const euclid = store.get('neo-gpt');
        expect(euclid.isRecord).toBe(true);
        expect(euclid.displayName).toBe('Euclid');
        expect(euclid.pendingAction).toBeNull();
        expect(euclid.controlReason).toBeNull();

        store.destroy()
    });

    test('no bridge / no verb / malformed rows / thrown → keeps the last-known roster (fail-closed, no crash)', async () => {
        for (const bridge of [
            null,
            {},
            {fleetRoster: async () => ({rows: null})},
            {fleetRoster: async () => { throw new Error('bridge boom') }}
        ]) {
            const {grid} = await routeLoadRoster(bridge);

            expect(grid.adapterState).toBe('sample');
            expect(grid.store.cleared).toBe(0);
            expect(grid.store.added).toEqual([])
        }
    });

    test('a resolved EMPTY snapshot is the authoritative cold zero-state — the sample clears and the grid goes live (never seven fake maintainers)', async () => {
        const {cockpit, grid} = await routeLoadRoster({fleetRoster: async () => ({rows: []})});

        expect(grid.store.cleared).toBe(1);   // the sample seed is replaced by the TRUE zero state
        expect(grid.store.added).toEqual([]);
        expect(grid.adapterState).toBe('live');
        expect(cockpit.rosterWired).toBe(true)
    });

    test('mapRosterRow maps a DTO row onto the FleetAgent contract — durable id, identity facts, honest state vocabulary', () => {
        const mapped = FleetCockpit.prototype.mapRosterRow({
            id         : 'neo-gpt',
            displayName: 'Neo GPT',
            avatarUrl  : 'https://github.com/neo-gpt.png?size=80',
            family     : 'gpt',
            engineTag  : 'GPT-5.6 Sol',
            lifecycle  : {state: 'running', confidence: 'observed'}
        });

        expect(mapped).toEqual({
            agentId    : 'neo-gpt',
            avatarUrl  : 'https://github.com/neo-gpt.png?size=80',
            displayName: 'Neo GPT',
            engineTag  : 'GPT-5.6 Sol',
            family     : 'gpt',
            state      : 'ok'
        });

        // laneLine is OMITTED, never nulled — a roster merge must not wipe what the activity producer writes
        expect(Object.hasOwn(mapped, 'laneLine')).toBe(false)
    });

    test('mapRosterRow state vocabulary — running → ok; stopped / not-wired / absent liveness → off (benched, never guessed)', () => {
        const map = lifecycle => FleetCockpit.prototype.mapRosterRow({id: 'x', lifecycle}).state;

        expect(map({state: 'running'})).toBe('ok');
        expect(map({state: 'stopped'})).toBe('off');
        expect(map({state: 'not-wired'})).toBe('off');
        expect(map(undefined)).toBe('off');

        // un-enriched identity facts flow as nulls (unclassified / tagless)
        const bare = FleetCockpit.prototype.mapRosterRow({id: 'x'});
        expect(bare.family).toBeNull();
        expect(bare.engineTag).toBeNull()
    });

    test('the FIRST non-empty snapshot populates the Store (replaces the sample seed) and goes live — rows without a durable id are dropped', async () => {
        const {cockpit, grid} = await routeLoadRoster({fleetRoster: async () => ({rows: [
            {id: 'vega', lifecycle: {state: 'running'}},
            {noId: true},
            {id: 'ada', lifecycle: {state: 'stopped'}}
        ]})});

        expect(grid.store.cleared).toBe(1);
        // rows arrive MAPPED onto the record contract — durable id → agentId, runtime → session state
        expect(grid.store.added.map(row => [row.agentId, row.state])).toEqual([['vega', 'ok'], ['ada', 'off']]);
        expect(grid.adapterState).toBe('live');
        expect(cockpit.rosterWired).toBe(true)
    });

    test('later snapshots RECONCILE — record.set per known agentId, add for a joiner, REMOVE for a resident absent from the snapshot (no ghost card)', async () => {
        const writes = [],
              vega   = {agentId: 'vega', set(row) { writes.push(row) }},
              ghost  = {agentId: 'removed-agent'};

        const {grid} = await routeLoadRoster({fleetRoster: async () => ({rows: [
            {id: 'vega', family: 'claude', lifecycle: {state: 'running'}},
            {id: 'joiner', lifecycle: {state: 'stopped'}}
        ]})}, {known: {vega}, items: [vega, ghost], rosterWired: true});

        // known resident → runtime status reconciled onto ITS record (the store re-renders just that card)
        expect(writes).toEqual([{
            agentId    : 'vega',
            avatarUrl  : null,
            displayName: null,
            engineTag  : null,
            family     : 'claude',
            state      : 'ok'
        }]);

        // a resident ABSENT from the authoritative snapshot is removed — define → remove → no ghost card
        expect(grid.store.removed).toEqual(['removed-agent']);
        // new resident → joins the roster; the seed is never re-cleared on a merge
        expect(grid.store.added.map(row => row.agentId)).toEqual(['joiner']);
        expect(grid.store.cleared).toBe(0);
        expect(grid.adapterState).toBe('live')
    });

    // Source precedence: the provider-hosted store autoLoads the JSON sample while loadRoster races
    // the bridge. These run against a REAL isolated FleetRoster instance so the reconciliation is
    // exercised end-to-end, with onRosterStoreLoad standing in for the store's late `load` event.
    const makeLiveCockpit = store => {
        const grid = {adapterState: 'sample', store};

        return {
            getReference     : reference => reference === 'fleet-grid' ? grid : null,
            grid,
            lastLiveRows     : null,
            mapRosterRow     : FleetCockpit.prototype.mapRosterRow,
            onRosterStoreLoad: FleetCockpit.prototype.onRosterStoreLoad,
            reconcileRoster  : FleetCockpit.prototype.reconcileRoster,
            rosterWired      : false
        }
    };

    test('a sample seed landing AFTER live truth cannot overwrite the roster (fail-closed toward live)', async () => {
        const store   = Neo.create(FleetRoster, {data: []}),
              cockpit = makeLiveCockpit(store);

        globalThis.AgentOS = {fleet: {registryBridge: {fleetRoster: async () => ({rows: [
            {id: 'ada',  family: 'claude', lifecycle: {state: 'running'}},
            {id: 'vega', family: 'claude', lifecycle: {state: 'stopped'}}
        ]})}}};

        // the bridge wins the race: live truth lands first
        await FleetCockpit.prototype.loadRoster.call(cockpit);

        expect(cockpit.rosterWired).toBe(true);
        expect(cockpit.lastLiveRows.map(row => row.agentId)).toEqual(['ada', 'vega']);
        expect(store.getCount()).toBe(2);

        // now the slower JSON seed lands: the url pipeline replaces the items and fires `load`
        store.clear();
        store.add([{agentId: 'sample-1'}, {agentId: 'sample-2'}, {agentId: 'sample-3'}]);
        cockpit.onRosterStoreLoad();

        // live truth is re-asserted: sample rows evicted, live residents restored
        expect(store.getCount()).toBe(2);
        expect(store.get('ada')).toBeTruthy();
        expect(store.get('vega')).toBeTruthy();
        expect(store.get('sample-1')).toBeFalsy();

        store.destroy()
    });

    test('a seed load BEFORE live truth passes through untouched (the normal boot path)', () => {
        const store   = Neo.create(FleetRoster, {data: []}),
              cockpit = makeLiveCockpit(store);

        // the seed lands while nothing live exists yet
        store.add([{agentId: 'sample-1'}, {agentId: 'sample-2'}]);
        cockpit.onRosterStoreLoad();

        expect(store.getCount()).toBe(2);
        expect(store.get('sample-1')).toBeTruthy();

        store.destroy()
    });
});

test.describe('Fleet cockpit — whole-fleet control (B4, #14611)', () => {
    let FleetCockpitController;

    test.beforeAll(async () => {
        FleetCockpitController = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpitController.mjs')).default
    });

    test('onStartFleet fans out start to every resident card via the C2 adapter (fold skipped; no bridge → fail-closed per card, never optimistic)', () => {
        // The morning-start button drives the round-trip directly (the cockpit owns the wire): it
        // enumerates the rendered cards — the collapsed-idle fold is filtered by ntype — and dispatches a
        // start intent + each card's roster record to the adapter. No bridge → each card takes an honest
        // `unauthorized` controlReason onto its record, never an optimistic fleet-wide success.
        delete globalThis.AgentOS;

        const mkCard = agentId => {
            const writes = [],
                  record = {agentId, writes, set(values) { writes.push(values) }};
            return {ntype: 'fm-agent-card', record, writes}
        };

        const vega = mkCard('neo-opus-vega'),
              ada  = mkCard('neo-opus-ada'),
              fold = {ntype: 'component'}; // the collapsed-idle fold — no record, must be skipped

        const controller = Object.create(FleetCockpitController.prototype);

        controller.getReference = name => name === 'fleet-cards' ? {items: [vega, fold, ada]} : null;

        controller.onStartFleet();

        expect(vega.writes.some(write => write.controlReason?.kind === 'unauthorized')).toBe(true);
        expect(ada.writes.some(write => write.controlReason?.kind === 'unauthorized')).toBe(true)
    });

    test('onAgentLifecycleIntent resolves the firing card + drives the C2 adapter — no bridge → fail-closed onto the card record, never optimistic', () => {
        // A card fires intent-only; the cockpit resolves the firing card from the event `source` and
        // hands it + the card's roster record to the adapter. With no registry bridge the adapter fails
        // closed — an `unauthorized` controlReason lands on the record, never an optimistic success.
        delete globalThis.AgentOS;

        const writes  = [],
              record  = {agentId: 'vega', set(values) { writes.push(values) }},
              card    = {record},
              origGet = Neo.getComponent;

        Neo.getComponent = id => id === 'fm-card-x' ? card : null;

        try {
            const controller = Object.create(FleetCockpitController.prototype);
            controller.onAgentLifecycleIntent({action: 'start', agentId: 'vega', source: 'fm-card-x'})
        } finally {
            Neo.getComponent = origGet
        }

        expect(writes.some(write => write.controlReason?.kind === 'unauthorized')).toBe(true)
    });
});
