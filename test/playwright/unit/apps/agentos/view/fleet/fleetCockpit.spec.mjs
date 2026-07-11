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

// A usable three-source collection: the runtime axis is WIRED. The eligibility partition fails a
// fleet start closed without it (projected 'off' over unusable provenance is display fallback,
// never a stopped runtime), so every fixture that models a startable member carries this shape.
const wiredSources = () => ({
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
});

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

    // scope the mock to the `fleet` subkey ONLY: `globalThis.AgentOS` is the app's Neo NAMESPACE
    // root — replacing or deleting it wipes every `AgentOS.*` class registration for all later
    // spec files in the shared worker (order-dependent cross-file bleed).
    const clearBridge = () => { delete globalThis.AgentOS?.fleet };

    // a spy stream: `loadActivity` either assigns `adapterState` directly (stale) or calls `set({...})`
    // (live); both land on the same object so the resulting state is assertable.
    const makeStream = () => ({adapterState: 'sample', events: null, set(config) { Object.assign(this, config) }});

    /**
     * @param {Object|null} bridge The stubbed `registryBridge` (or null for "no bridge").
     * @returns {Promise<Object>} the spy stream after loadActivity routed to it.
     */
    const routeLoadActivity = async bridge => {
        bridge ? ((globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge}) : clearBridge();

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

    const liveSources = (runtimeConfidence = 'observed') => ({
        roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
        repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
        runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: runtimeConfidence}
    });

    // scope the mock to the `fleet` subkey ONLY: `globalThis.AgentOS` is the app's Neo NAMESPACE
    // root — replacing or deleting it wipes every `AgentOS.*` class registration for all later
    // spec files in the shared worker (order-dependent cross-file bleed).
    const clearBridge = () => { delete globalThis.AgentOS?.fleet };

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
        bridge ? ((globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge}) : clearBridge();

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

    test('density: openLaneCount survives the FIRST authoritative load — a stamped live count is stored, a missing stamp degrades to null, the sample number never outlives the replacement (#14598)', async () => {
        const {grid} = await routeLoadRoster({fleetRoster: async () => ({rows: [
            {id: 'neo-gpt',   openLaneCount: 23, lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'}, sources: liveSources()},
            {id: 'neo-fable', lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'}, sources: liveSources()}
        ]})});

        // the first authoritative snapshot REPLACES the sample seed (clear + add through the real
        // loadRoster) — the roster DTO owns the field, so what lands is the DTO's truth:
        expect(grid.store.cleared).toBe(1);
        // a live stamped count is stored (the badge renders it) …
        expect(grid.store.added.find(row => row.agentId === 'neo-gpt').openLaneCount).toBe(23);
        // … and an un-stamped row degrades to an explicit null (the badge hides) — the seeded
        // sample's number must never pose as live truth past this replacement
        expect(grid.store.added.find(row => row.agentId === 'neo-fable').openLaneCount).toBeNull()
    });

    test('mapRosterRow maps a DTO row onto the FleetAgent contract — durable id, identity facts, honest state vocabulary', () => {
        const mapped = FleetCockpit.prototype.mapRosterRow({
            id         : 'neo-gpt',
            displayName: 'Neo GPT',
            avatarUrl  : 'https://github.com/neo-gpt.png?size=80',
            family     : 'gpt',
            engineTag  : 'GPT-5.6 Sol',
            lifecycle  : {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'},
            sources    : liveSources()
        });

        expect(mapped).toEqual({
            agentId      : 'neo-gpt',
            authMode     : null,   // tri-state launch facts: absent on the row → honest null, never guessed
            avatarUrl    : 'https://github.com/neo-gpt.png?size=80',
            displayName  : 'Neo GPT',
            engineTag    : 'GPT-5.6 Sol',
            family       : 'gpt',
            launchable   : null,
            openLaneCount: null,   // roster-DTO-owned tri-state: un-stamped → honest null (no badge)
            // the authoritative participation fact: absent on the row → honest null, never guessed
            participationStatus: null,
            sources            : liveSources(),
            state              : 'ok'
        });

        // laneLine is OMITTED, never nulled — a roster merge must not wipe what the activity producer writes
        expect(Object.hasOwn(mapped, 'laneLine')).toBe(false)
    });

    test('mapRosterRow state vocabulary — running is healthy only behind wired runtime provenance', () => {
        const map = (state, sources = liveSources(), confidence = 'observed') => FleetCockpit.prototype.mapRosterRow({
            id       : 'x',
            lifecycle: {source: 'fleet:runtimeStatus', state, confidence},
            sources
        }).state;

        expect(map('running')).toBe('ok');
        expect(map('stopped')).toBe('off');
        expect(map('not-wired')).toBe('off');
        expect(map(undefined)).toBe('off');
        expect(map('running', {runtime: {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}})).toBe('off');
        expect(map('running', {runtime: {source: 'fleet:runtimeStatus', state: 'missing', confidence: 'none'}})).toBe('off');
        expect(map('running', {})).toBe('off');
        expect(map('running', liveSources('inferred'), 'observed')).toBe('off');

        const
            contradictory = FleetCockpit.prototype.mapRosterRow({
                id       : 'x',
                lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'inferred'},
                sources  : liveSources()
            }),
            stopped       = FleetCockpit.prototype.mapRosterRow({
                id       : 'x',
                lifecycle: {source: 'fleet:runtimeStatus', state: 'stopped', confidence: 'observed'},
                sources  : liveSources()
            });

        expect(contradictory).toMatchObject({
            state  : 'off',
            sources: {runtime: {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}}
        });
        expect(stopped).toMatchObject({
            state  : 'off',
            sources: {runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}}
        });

        // un-enriched identity facts flow as nulls (unclassified / tagless)
        const bare = FleetCockpit.prototype.mapRosterRow({id: 'x'});
        expect(bare.family).toBeNull();
        expect(bare.engineTag).toBeNull()
    });

    test('the FIRST non-empty snapshot populates the Store (replaces the sample seed) and goes live — rows without a durable id are dropped', async () => {
        const {cockpit, grid} = await routeLoadRoster({fleetRoster: async () => ({rows: [
            {id: 'vega', lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'}, sources: liveSources()},
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
            {id: 'vega', family: 'claude', lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'}, sources: liveSources()},
            {id: 'joiner', lifecycle: {state: 'stopped'}}
        ]})}, {known: {vega}, items: [vega, ghost], rosterWired: true});

        // known resident → runtime status reconciled onto ITS record (the store re-renders just that card)
        expect(writes).toEqual([{
            agentId            : 'vega',
            authMode           : null,
            avatarUrl          : null,
            displayName        : null,
            engineTag          : null,
            family             : 'claude',
            launchable         : null,
            openLaneCount      : null,
            participationStatus: null,
            sources            : liveSources(),
            state              : 'ok'
        }]);

        // a resident ABSENT from the authoritative snapshot is removed — define → remove → no ghost card
        expect(grid.store.removed).toEqual(['removed-agent']);
        // new resident → joins the roster; the seed is never re-cleared on a merge
        expect(grid.store.added.map(row => row.agentId)).toEqual(['joiner']);
        expect(grid.store.cleared).toBe(0);
        expect(grid.adapterState).toBe('live')
    });

    // Source precedence: the provider-hosted store autoLoads the JSON sample while loadRoster races
    // the bridge. These run against a REAL isolated FleetRoster instance with the REAL load
    // listener attached (the store fires `load` for its own mutations, so the guard's recursion
    // behavior is only observable through the live listener path — a manual handler call is a
    // mock-hole).
    const makeLiveCockpit = (store, index) => {
        const grid = {adapterState: 'sample', store};

        const cockpit = {
            getReference     : reference => reference === 'fleet-grid' ? grid : null,
            grid,
            id               : `fake-fleet-cockpit-${index}`,
            lastLiveRows     : null,
            mapRosterRow     : FleetCockpit.prototype.mapRosterRow,
            onRosterStoreLoad: FleetCockpit.prototype.onRosterStoreLoad,
            reconcileRoster  : FleetCockpit.prototype.reconcileRoster,
            reconcilingRoster: false,
            rosterWired      : false
        };

        store.on({load: cockpit.onRosterStoreLoad, scope: cockpit});

        return cockpit
    };

    test('a sample seed landing AFTER live truth cannot overwrite the roster (fail-closed toward live)', async () => {
        const store   = Neo.create(FleetRoster, {data: []}),
              cockpit = makeLiveCockpit(store, 1);

        globalThis.AgentOS = {fleet: {registryBridge: {fleetRoster: async () => ({rows: [
            {id: 'ada',  family: 'claude', lifecycle: {state: 'running'}},
            {id: 'vega', family: 'claude', lifecycle: {state: 'stopped'}}
        ]})}}};

        // the bridge wins the race: live truth lands first
        await FleetCockpit.prototype.loadRoster.call(cockpit);

        expect(cockpit.rosterWired).toBe(true);
        expect(cockpit.lastLiveRows.map(row => row.agentId)).toEqual(['ada', 'vega']);
        expect(store.getCount()).toBe(2);

        // now the slower JSON seed lands: replace the items — the store fires `load` itself,
        // reaching the guard through the REAL listener
        store.clear();
        store.add([{agentId: 'sample-1'}, {agentId: 'sample-2'}, {agentId: 'sample-3'}]);

        // live truth is re-asserted: sample rows evicted, live residents restored
        expect(store.getCount()).toBe(2);
        expect(store.get('ada')).toBeTruthy();
        expect(store.get('vega')).toBeTruthy();
        expect(store.get('sample-1')).toBeFalsy();

        store.destroy()
    });

    test('a seed load BEFORE live truth passes through untouched (the normal boot path)', () => {
        const store   = Neo.create(FleetRoster, {data: []}),
              cockpit = makeLiveCockpit(store, 2);

        // the seed lands while nothing live exists yet — the store's own load fires the guard
        store.add([{agentId: 'sample-1'}, {agentId: 'sample-2'}]);

        expect(store.getCount()).toBe(2);
        expect(store.get('sample-1')).toBeTruthy();

        store.destroy()
    });

    test('guard re-entry is latched: reconciling a large snapshot through the live listener cannot overflow the stack', async () => {
        const store   = Neo.create(FleetRoster, {data: []}),
              cockpit = makeLiveCockpit(store, 3);

        // 1,000 authoritative rows — the unlatched recursion overflowed at ~524 nested frames
        const rows = Array.from({length: 1000}, (item, index) => ({
            id: `agent-${index}`, lifecycle: {state: 'running'}
        }));

        globalThis.AgentOS = {fleet: {registryBridge: {fleetRoster: async () => ({rows})}}};

        await FleetCockpit.prototype.loadRoster.call(cockpit);

        expect(cockpit.rosterWired).toBe(true);
        expect(store.getCount()).toBe(1000);

        // a late seed load now triggers reconciliation of all 1,000 rows THROUGH the listener:
        // every joiner add fires `load` back at the guard — the latch must hold
        store.clear();
        store.add([{agentId: 'sample-1'}]);

        expect(store.getCount()).toBe(1000);
        expect(store.get('agent-0')).toBeTruthy();
        expect(store.get('agent-999')).toBeTruthy();
        expect(store.get('sample-1')).toBeFalsy();

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
        delete globalThis.AgentOS?.fleet;

        const mkCard = agentId => {
            const writes = [],
                  record = {agentId, sources: wiredSources(), state: 'off', writes, set(values) { writes.push(values) }};
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

    test('onStartFleet partitions from the wire: excluded members never flip pending, and the summary renders their reasons (#14612)', async () => {
        // The staged bring-up targets the WIRED DOWN fleet: an already-up member, an unlaunchable
        // family, a guest row, KNOWN non-active participation statuses (benched AND temporarily
        // unreachable — the authoritative fact), and a runtime-unwired row are EXCLUDED-with-reason
        // — no intent fires at them
        // (their records take zero writes; excluded cards never join the pending cascade) — while
        // the eligible member drives its round-trip (no bridge → honest unauthorized). The chrome
        // summary slot receives the counts line + hover-reachable reasons.
        delete globalThis.AgentOS?.fleet;

        const mkRecord = fields => {
            const writes = [];
            return {...fields, writes, set(values) { writes.push(values) }}
        };

        const
            down        = mkRecord({agentId: 'vega',   state: 'off', sources: wiredSources()}),
            up          = mkRecord({agentId: 'ada',    state: 'ok',  sources: wiredSources()}),
            noLaunch    = mkRecord({agentId: 'native', state: 'off', launchable: false, family: 'native-neo'}),
            guest       = mkRecord({state: 'off'}),
            benched     = mkRecord({agentId: 'gemini', state: 'off', sources: wiredSources(), participationStatus: 'operator_benched'}),
            unreachable = mkRecord({agentId: 'flaky',  state: 'off', sources: wiredSources(), participationStatus: 'temporarily_unreachable'}),
            unwired     = mkRecord({agentId: 'silent', state: 'off'}),   // no sources → runtime normalizes not-wired
            slot        = {
                sets: [],
                vdom: {},
                set(values) { this.sets.push(values) },
                update() {}
            };

        const controller = Object.create(FleetCockpitController.prototype);

        controller.getReference = name => ({
            'fleet-grid'         : {store: {items: [down, up, noLaunch, guest, benched, unreachable, unwired]}},
            'fleet-start-summary': slot
        })[name] ?? null;
        controller.refreshRosterOnSettle = async () => {};

        const summary = await controller.onStartFleet();

        // eligible: only the wired down member — it took the honest unauthorized round-trip
        expect(down.writes.some(write => write.controlReason?.kind === 'unauthorized')).toBe(true);
        // excluded members took ZERO writes — never silently skipped, never falsely pending;
        // the benched + unreachable + unwired rows are the authority witnesses: zero bridge
        // writes for EVERY known non-active participation status and unusable runtime source
        expect(up.writes).toHaveLength(0);
        expect(noLaunch.writes).toHaveLength(0);
        expect(guest.writes).toHaveLength(0);
        expect(benched.writes).toHaveLength(0);
        expect(unreachable.writes).toHaveLength(0);
        expect(unwired.writes).toHaveLength(0);

        expect(summary.started).toBe(0);
        expect(summary.rejected).toHaveLength(1);
        expect(summary.excluded.map(entry => entry.agentId)).toEqual(['ada', 'native', null, 'gemini', 'flaky', 'silent']);

        // the chrome slot rendered: cleared at action start, then the outcome line + reasons title
        expect(slot.sets[0]).toEqual({hidden: true, html: ''});
        expect(slot.sets[1].hidden).toBe(false);
        expect(slot.sets[1].html).toContain('rejected');
        expect(slot.sets[1].html).toContain('6 excluded');
        expect(slot.vdom.title).toContain('native: not launchable');
        expect(slot.vdom.title).toContain("ada: already up — session state 'ok'");
        expect(slot.vdom.title).toContain("gemini: not active — authoritative participation status 'operator_benched'");
        expect(slot.vdom.title).toContain("flaky: not active — authoritative participation status 'temporarily_unreachable'");
        expect(slot.vdom.title).toContain("silent: runtime source 'not-wired'")
    });

    test('onAgentLifecycleIntent resolves the firing card + drives the C2 adapter — no bridge → fail-closed onto the card record, never optimistic', () => {
        // A card fires intent-only; the cockpit resolves the firing card from the event `source` and
        // hands it + the card's roster record to the adapter. With no registry bridge the adapter fails
        // closed — an `unauthorized` controlReason lands on the record, never an optimistic success.
        delete globalThis.AgentOS?.fleet;

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

/**
 * Covers the observe half of define→start→observe: after a lifecycle intent SETTLES, the
 * cockpit re-polls the roster so runtime truth re-materializes — `loadRoster` otherwise only fires
 * once at construct, leaving a started resident's card at its stale pre-start state until a reload.
 * `loadRoster` is a spied collaborator here; that it correctly reconciles the Store is covered above.
 */
test.describe('Fleet cockpit — controller re-polls the roster on a settled lifecycle intent (#14978)', () => {
    let FleetCockpitController, FleetCockpit, FleetAgent, Store;

    const settlingBridge  = () => ({startAgent: async () => ({}), stopAgent: async () => ({}), restartAgent: async () => ({})});
    const rejectingBridge = () => ({startAgent: async () => { throw new Error('harness offline') }});

    const setBridge   = bridge => { (globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge} };
    const clearBridge = () => { delete globalThis.AgentOS?.fleet };

    // a controller with a spied loadRoster — count the re-polls without a real Store/grid.
    const makeController = calls => {
        const controller = Object.create(FleetCockpitController.prototype);
        controller.component = {loadRoster: () => { calls.push(1) }};
        return controller
    };

    test.beforeAll(async () => {
        FleetCockpitController = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpitController.mjs')).default;
        FleetCockpit          = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs')).default;
        FleetAgent            = (await import('../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store                 = (await import('../../../../../../../src/data/Store.mjs')).default
    });

    test.afterEach(() => clearBridge());

    test('refreshRosterOnSettle re-polls only when the settle reports a real change', async () => {
        const calls      = [],
              controller = makeController(calls);

        await controller.refreshRosterOnSettle(Promise.resolve(true));
        expect(calls.length).toBe(1);   // a real change → one re-poll

        await controller.refreshRosterOnSettle(Promise.resolve(false));
        expect(calls.length).toBe(1)    // nothing changed (rejected/timeout) → no re-poll, honest reason stands
    });

    test('onAgentLifecycleIntent re-polls the roster once a start settles successfully', async () => {
        setBridge(settlingBridge());

        const calls      = [],
              controller = makeController(calls),
              card       = {record: {agentId: 'vega'}},
              origGet    = Neo.getComponent;

        Neo.getComponent = id => id === 'fm-card-x' ? card : null;

        try {
            await controller.onAgentLifecycleIntent({action: 'start', agentId: 'vega', source: 'fm-card-x'})
        } finally {
            Neo.getComponent = origGet
        }

        expect(calls.length).toBe(1)
    });

    test('a rejected intent does NOT re-poll — the honest failure render is preserved', async () => {
        setBridge(rejectingBridge());

        const calls      = [],
              controller = makeController(calls),
              card       = {record: {agentId: 'vega'}},
              origGet    = Neo.getComponent;

        Neo.getComponent = id => id === 'fm-card-x' ? card : null;

        try {
            await controller.onAgentLifecycleIntent({action: 'start', agentId: 'vega', source: 'fm-card-x'})
        } finally {
            Neo.getComponent = origGet
        }

        expect(calls.length).toBe(0)
    });

    test('onStartFleet fans out N starts but re-polls the roster EXACTLY ONCE after the batch settles', async () => {
        setBridge(settlingBridge());

        const calls      = [],
              controller = makeController(calls),
              cards      = [
                  {ntype: 'fm-agent-card', record: {agentId: 'vega',  sources: wiredSources(), state: 'off'}},
                  {ntype: 'fm-agent-card', record: {agentId: 'ada',   sources: wiredSources(), state: 'off'}},
                  {ntype: 'fm-agent-card', record: {agentId: 'grace', sources: wiredSources(), state: 'off'}}
              ];

        controller.getReference = name => name === 'fleet-cards' ? {items: cards} : null;

        await controller.onStartFleet();

        expect(calls.length).toBe(1)   // three residents started, ONE roster re-poll — never N polls
    });

    // The composition-root binding witness: not "loadRoster was called" (the spy tests above) but
    // "reconciliation reaches the RECORD". Assembles the REAL path end to end — the real controller
    // onAgentLifecycleIntent, the real C2 adapter, a stateful bridge whose `fleetRoster` reflects the
    // start, the real FleetCockpit.loadRoster, and a REAL Store — and asserts the SAME record advances
    // off -> running, so post-settle reconciliation is proven to update the card's data surface.
    test('composition-root witness: a settled card Start reconciles the REAL roster record off -> running via the re-poll (#14978)', async () => {
        let running = false;

        const wired     = channel => ({source: `fleet:${channel}`, state: 'wired', confidence: 'observed'});
        const rosterRow = () => ({
            id         : 'vega',
            displayName: 'Vega',
            family     : 'claude',
            engineTag  : 'opus-4.8',
            // lifecycle 'stopped' -> derived card state 'off'; 'running' -> 'ok' (mapFleetSessionHealth)
            lifecycle: {source: 'fleet:runtimeStatus', state: running ? 'running' : 'stopped', confidence: 'observed'},
            sources  : {roster: wired('listAgents'), repoStatus: wired('fleetStatus'), runtime: wired('runtimeStatus')}
        });

        setBridge({
            startAgent : async () => { running = true; return {ok: true, result: {id: 'vega', state: 'running'}} },
            fleetRoster: async () => ({rows: [rosterRow()]})
        });

        // a REAL store the REAL loadRoster reconciles into — the record is the card's data surface
        const store   = Neo.create(Store, {keyProperty: 'agentId', model: FleetAgent});
        const cockpit = {
            getReference   : reference => reference === 'fleet-grid' ? {adapterState: 'sample', store} : null,
            mapRosterRow   : FleetCockpit.prototype.mapRosterRow,
            reconcileRoster: FleetCockpit.prototype.reconcileRoster,
            loadRoster     : FleetCockpit.prototype.loadRoster,
            rosterWired    : false
        };

        // boot: the real loadRoster reads the bridge — the agent is stopped, so the record resolves to 'off'
        await cockpit.loadRoster();
        expect(store.get('vega').state).toBe('off');

        // drive the REAL controller path for that record — real onAgentLifecycleIntent -> real adapter ->
        // bridge.startAgent -> refreshRosterOnSettle -> real loadRoster -> reconcile
        const controller = Object.create(FleetCockpitController.prototype),
              origGet    = Neo.getComponent;

        controller.component = cockpit;
        Neo.getComponent     = id => id === 'card-vega' ? {record: store.get('vega')} : null;

        try {
            await controller.onAgentLifecycleIntent({action: 'start', agentId: 'vega', source: 'card-vega'})
        } finally {
            Neo.getComponent = origGet
        }

        // the binding witness: the SAME real record advanced off -> ok through reconciliation, no reload/rebuild
        expect(store.get('vega').state).toBe('ok');

        store.destroy()
    })
});
