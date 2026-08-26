import {setup} from '../../../../../../setup.mjs';

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

import {test, expect}       from '@playwright/test';
import {EventEmitter}       from 'node:events';
import {createAppLifecycle} from '../../../../../../../../harness/appLifecycle.mjs';
import {readFileSync}       from 'fs';
import path                 from 'path';
import {fileURLToPath}      from 'url';
import Neo                  from '../../../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../../../src/core/_export.mjs';

const seedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../../../apps/agentos/resources/data/fleetRoster.json');

// A usable three-source collection: the runtime axis is WIRED. The eligibility partition fails a
// fleet start closed without it (projected 'off' over unusable provenance is display fallback,
// never a stopped runtime), so every fixture that models a startable member carries this shape.
const wiredSources = () => ({
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
});

/**
 * Provider-owned activity collaborators for prototype-host tests. The Store records every admitted
 * bounded page; the provider records count truth. Keeping them separate pins the production boundary.
 */
const makeActivityStoreHarness = () => {
    const activityStore = {
              pages: [],
              ingestSnapshot(events, options) {
                  this.pages.push({events, options});
                  return {added: events.length, dropped: 0, retained: events.length, newEventIds: events.map(event => event.eventId)}
              }
          },
          activityProvider = {
              data: {},
              getData(key) { return this.data[key] },
              getStore() { return null },
              setData(key, value) { this.data[key] = value }
          };

    return {
        activityProvider,
        activityStore,
        activityWired                  : false,
        getStateProvider               : () => activityProvider,
        resolveFleetActivityEventsStore: () => activityStore
    }
};

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
    const makeStream = () => ({adapterState: 'sample', set(config) { Object.assign(this, config) }});

    /**
     * @param {Object|null} bridge The stubbed `registryBridge` (or null for "no bridge").
     * @returns {Promise<{stream: Object, cockpit: Object}>} the spy stream AND the owner, after
     *     `loadActivity` routed to them.
     *
     * The owner is returned, not just the stream, because the routing decision has TWO outputs: what
     * the stream is told, and what the OWNER retains (`streamAdapterState`, `degradedReason` — the
     * banner's inputs). Handing back only the stream made the owner's half untestable, which is
     * exactly how the not-wired branch shipped without a witness.
     */
    const routeLoadActivity = async bridge => {
        bridge ? ((globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge}) : clearBridge();

        const stream = makeStream(),
              // the real banner sync runs against this fake: its getReference returns null for
              // the banner slot, so the guard no-ops — production code, no stub drift. The loss
              // edge + recovery clear are wired from the prototype for the same reason, and
              // `streamAdapterState` mirrors the class field default because the never-wired
              // guard reads it: a fake missing it would let a pre-wired throw claim last-known
              // data that never existed.
              cockpit = {
                  ...makeActivityStoreHarness(),
                  clearDegradedReason : FleetCockpit.prototype.clearDegradedReason,
                  degradeWiredSurface : FleetCockpit.prototype.degradeWiredSurface,
                  getReference        : reference => reference === 'activity-stream' ? stream : null,
                  streamAdapterState  : 'sample',
                  streamDegradedReason: null,
                  streamReadInFlight  : 0,
                  streamReadGeneration: 0,
                  syncSpineBanner     : FleetCockpit.prototype.syncSpineBanner
              };

        await FleetCockpit.prototype.loadActivity.call(cockpit);

        return {stream, cockpit, store: cockpit.activityStore, provider: cockpit.activityProvider}
    };

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    test.afterEach(() => clearBridge());

    test('no bridge → keeps the honestly-labelled sample seed (fail-closed, no crash)', async () => {
        const {stream, cockpit} = await routeLoadActivity(null);

        expect(stream.adapterState).toBe('sample');
        // SILENCE: the owner learned nothing, so it retains no cause. This is what lets the banner
        // fall back to "server offline" honestly — it is the only state that implies one.
        expect(cockpit.streamDegradedReason ?? null).toBe(null)
    });

    test('a bridge without fleetActivity → keeps the sample seed', async () => {
        const {stream, cockpit} = await routeLoadActivity({});

        expect(stream.adapterState).toBe('sample');
        expect(cockpit.streamDegradedReason ?? null).toBe(null)
    });

    test('not-wired capability → keeps the sample seed AND retains the producer’s reason', async () => {
        // The producer ANSWERED. The seed stays — the stream really is showing sample events, so its
        // own state is honestly 'sample' — but an answer is not silence, and the retained reason is
        // the ONLY thing that separates "we never reached the server" from "it answered: my source
        // is unconfigured". Without it the banner told the operator to start a running server.
        //
        // This is the verbatim string the live devFleetServer returns, not one I invented to agree
        // with myself: `{state:'not-wired', reason:'fleet activity source not wired'}`.
        const {stream, cockpit} = await routeLoadActivity({fleetActivity: async () => ({
            capability: {state: 'not-wired', reason: 'fleet activity source not wired'},
            events    : []
        })});

        expect(stream.adapterState).toBe('sample');
        expect(cockpit.streamAdapterState).toBe('sample');
        expect(cockpit.streamDegradedReason).toBe('fleet activity source not wired')
    });

    test('not-wired WITHOUT a reason retains none — the producer said nothing to relay', async () => {
        // The guard against over-correcting: a bare not-wired teaches the owner no cause, so it must
        // not manufacture one. Falls back to the generic offline copy, which is correct here.
        const {cockpit} = await routeLoadActivity({fleetActivity: async () => ({capability: {state: 'not-wired'}, events: []})});

        expect(cockpit.streamDegradedReason ?? null).toBe(null)
    });

    test('degraded capability → the stale banner', async () => {
        const {stream} = await routeLoadActivity({fleetActivity: async () => ({capability: {state: 'degraded'}, events: []})});

        expect(stream.adapterState).toBe('stale')
    });

    test('a thrown source → fail-closed, keeps the sample seed (never blanks or falsely goes live)', async () => {
        const {stream} = await routeLoadActivity({fleetActivity: async () => { throw new Error('bridge boom') }});
        expect(stream.adapterState).toBe('sample')
    });

    test('wired + events → live, admitting producer order into the provider Store', async () => {
        const {stream, store, provider} = await routeLoadActivity({fleetActivity: async () => ({
            capability: {state: 'wired'},
            counts    : [{source: 'memory-core:mailbox', scope: 'total', value: 2, complete: true, capturedAt: '2026-07-04T12:00:00.000Z'}],
            events    : [ // newest-first, as the adapter sorts
                {eventId: 'a2a:newest', type: 'a2a-activity', occurredAt: '2026-07-04T12:00:00.000Z', payload: {subject: 'newest'}},
                {eventId: 'a2a:older',  type: 'a2a-activity', occurredAt: '2026-07-04T11:00:00.000Z', payload: {subject: 'older'}}
            ]
        })});
        expect(stream.adapterState).toBe('live');
        expect(store.pages).toEqual([{
            events: [
                {eventId: 'a2a:newest', type: 'a2a-activity', occurredAt: '2026-07-04T12:00:00.000Z', payload: {subject: 'newest'}},
                {eventId: 'a2a:older',  type: 'a2a-activity', occurredAt: '2026-07-04T11:00:00.000Z', payload: {subject: 'older'}}
            ],
            options: {replace: true}
        }]);
        expect(provider.data.activityCounts).toHaveLength(1)
    });

    test('wired + empty → live (streaming but quiet), never the sample — a wired source is live', async () => {
        const {stream, cockpit, store} = await routeLoadActivity({fleetActivity: async () => ({capability: {state: 'wired'}, events: []})});

        expect(stream.adapterState).toBe('live');
        expect(store.pages).toEqual([{events: [], options: {replace: true}}]);
        // recovery clears the retained cause — a stale reason on a live feed would outlive its truth
        expect(cockpit.streamDegradedReason ?? null).toBe(null)
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

    // reason: null on every fact — the fixture doubles as DTO input AND expected normalized
    // output, and normalization now carries the producer's retained cause (null when absent)
    const liveSources = (runtimeConfidence = 'observed') => ({
        roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed', reason: null},
        repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed', reason: null},
        runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: runtimeConfidence, reason: null}
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

    const makeCockpit = (grid, rosterWired = false, gridAdapterState = 'sample', rosterSourceMode = 'sample') => ({
        clearDegradedReason: FleetCockpit.prototype.clearDegradedReason,
        degradeWiredSurface: FleetCockpit.prototype.degradeWiredSurface,
        // the resident-pane owner pushes route through the phase-blind accessors; an
        // unmaterialized pane resolves null — the same silence contract as getReference
        getCatchUpPane        : () => null,
        getMemoriesPane       : () => null,
        getOperatorMailboxPane: () => null,
        getReference          : reference => reference === 'fleet-grid' ? grid : null,
        // the provider-owned roster authority: in this fixture the grid's bound store IS the
        // provider store, so the builders read the same truth the reconcile writes
        resolveFleetRosterStore: () => grid?.store ?? null,
        // mirrors the class field default — the loss edge reads it to keep a never-wired surface
        // on its honest sample seed instead of claiming last-known data
        gridAdapterState,
        // …and the async-ingress fence reads this one. Omitting it is not a benign gap: `++undefined`
        // is NaN, `NaN !== NaN`, so the read's generation never matches the owner's and EVERY read
        // drops itself — silently, with a green suite full of unwritten state.
        gridReadGeneration: 0,
        mapRosterRow      : FleetCockpit.prototype.mapRosterRow,
        reconcileRoster   : FleetCockpit.prototype.reconcileRoster,
        reconcileSelection: FleetCockpit.prototype.reconcileSelection,
        rosterSourceMode,
        rosterWired,
        // the real banner sync: null getReference for the slot → guarded no-op, no stub drift
        syncSpineBanner    : FleetCockpit.prototype.syncSpineBanner
    });

    const routeLoadRoster = async (bridge, {known, items, rosterSourceMode, rosterWired} = {}) => {
        bridge ? ((globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge}) : clearBridge();

        const grid    = makeGrid(known, items),
              cockpit = makeCockpit(grid, rosterWired, 'sample', rosterSourceMode);

        await FleetCockpit.prototype.loadRoster.call(cockpit);

        return {cockpit, grid}
    };

    test.beforeAll(async () => {
        FleetAgent   = (await import('../../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default;
        FleetRoster  = (await import('../../../../../../../../apps/agentos/store/FleetRoster.mjs')).default
    });

    test.afterEach(() => clearBridge());

    test('FleetRoster is a provider-hosted Store CLASS — JSON-fetched seed, durable agentId keying, honest sample', () => {
        // no singleton: the cockpit provider hosts + autoLoads the ONE shared instance; the class
        // carries the url seed (the Portal.store.* house pattern)
        expect(FleetRoster.isClass).toBe(true);
        expect(FleetRoster.config.singleton).toBeFalsy();
        expect(FleetRoster.config.url).toBe('../../apps/agentos/resources/data/fleetRoster.json');

        // the JSON sample seed: the eleven REAL maintainer identities, registry-derived — no invented agents
        const seed = JSON.parse(readFileSync(seedPath, 'utf8')).data;
        expect(seed).toHaveLength(11);
        const knownHandles = ['neo-fable', 'neo-fable-clio', 'neo-gemini-pro', 'neo-gpt', 'neo-gpt-emmy', 'neo-kimi-iris', 'neo-kimi-phoebe', 'neo-opus-ada', 'neo-opus-grace', 'neo-opus-vega', 'neo-preview'];
        expect(seed.map(row => row.agentId).sort()).toEqual(knownHandles);

        // engine tags pinned to the registry designations at seed time — this front-door surface
        // must not silently reintroduce a stale model designation
        const engineTags = Object.fromEntries(seed.map(row => [row.agentId, row.engineTag]));
        expect(engineTags).toEqual({
            'neo-fable'      : 'fable-5',
            'neo-fable-clio' : 'fable-5',
            'neo-gemini-pro' : '3.1-pro',
            'neo-gpt'        : 'gpt-5.6-sol',
            'neo-gpt-emmy'   : 'gpt-5.6-sol',
            'neo-kimi-iris'  : 'kimi-k3',
            'neo-kimi-phoebe': 'kimi-k3',
            'neo-opus-ada'   : 'opus-5',
            'neo-opus-grace' : 'opus-5',
            // rotating seat (weekly Fable/Opus) -> honest absence, never a half-week-stale literal
            'neo-opus-vega'  : null,
            // guest seat, provisioned ahead of first boot -> engine facts are observation-owned and
            // land from the live harness, so a designation here would be a prediction
            'neo-preview'    : null
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

    test('the presence-capability envelope rides every admitted snapshot onto the grid chip config', async () => {
        // the operator falsifier this plumbs for: the plane's who_is_online read failed, every
        // card's band correctly vanished (absence of signal), and the unnamed absence read as
        // "no one is online" — a verdict. The producer's degraded envelope was already on the
        // wire; loadRoster previously dropped it at the destructure.
        const degraded = {
            source    : 'fleet:presenceState',
            state     : 'degraded',
            confidence: 'none',
            capturedAt: '2026-08-10T21:45:00.000Z',
            reason    : 'plane who_is_online read failed'
        };

        const {grid} = await routeLoadRoster({fleetRoster: async () => ({
            capabilities: {presence: degraded},
            rows        : [{id: 'a1', displayName: 'A1'}]
        })});

        expect(grid.presenceCapability).toEqual(degraded);

        // a recovered producer (or an assembler omitting the envelope) plumbs null — the chip
        // must claim nothing on the next poll
        const {grid: recovered} = await routeLoadRoster({fleetRoster: async () => ({
            rows: [{id: 'a1', displayName: 'A1'}]
        })});

        expect(recovered.presenceCapability).toBeNull()
    });

    test('a resolved EMPTY first snapshot preserves the zero-call sample until a source is selected', async () => {
        const {cockpit, grid} = await routeLoadRoster({fleetRoster: async () => ({rows: []})});

        expect(FleetCockpit.config.rosterSourceMode).toBe('sample');
        expect(grid.store.cleared).toBe(0);   // a fresh empty registry cannot erase first-run truth
        expect(grid.store.added).toEqual([]);
        expect(grid.adapterState).toBe('sample');
        expect(cockpit.rosterSourceMode).toBe('sample');
        expect(cockpit.rosterWired).toBe(false);
        // the ANSWERED-empty retention: the sample stays, but the cause is on record — the banner
        // names "connected · registry empty" instead of claiming "server offline" against a
        // transport that just replied
        expect(cockpit.gridDegradedReason).toBe('server connected · fleet registry empty — define agents to go live')
    });

    test('the answered-empty reason is RETRACTED on silence — the claim must not outlive the connection', async () => {
        // empty answer retains the cause…
        const {cockpit} = await routeLoadRoster({fleetRoster: async () => ({rows: []})});

        expect(cockpit.gridDegradedReason).toContain('registry empty');

        // …then the transport dies: back on silence, the generic cold copy is the honest line
        // again, so the never-wired loss edge must drop the retained answered-state cause.
        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetRoster: async () => { throw new Error('transport lost') }}};
        await FleetCockpit.prototype.loadRoster.call(cockpit);

        expect(cockpit.gridAdapterState).toBe('sample');
        expect(cockpit.gridDegradedReason).toBe(null)
    });

    test('answered-empty → bridge ABSENT also retracts — absence is its own transition, not a thrown-call proxy', async () => {
        // the exact-head reviewer falsifier: an answered producer-specific cause survived the
        // no-bridge early return while the surface stayed sample — "server connected" rendering
        // against NO bridge at all. Absence must withdraw the answered cause exactly like a
        // thrown call does.
        const {cockpit} = await routeLoadRoster({fleetRoster: async () => ({rows: []})});

        expect(cockpit.gridDegradedReason).toContain('registry empty');

        clearBridge();
        await FleetCockpit.prototype.loadRoster.call(cockpit);

        expect(cockpit.gridAdapterState).toBe('sample');
        expect(cockpit.gridDegradedReason).toBe(null)
    });

    test('answered-empty → verb ABSENT retracts too — a bridge without the verb is the same cold truth', async () => {
        const {cockpit} = await routeLoadRoster({fleetRoster: async () => ({rows: []})});

        expect(cockpit.gridDegradedReason).toContain('registry empty');

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {}};
        await FleetCockpit.prototype.loadRoster.call(cockpit);

        expect(cockpit.gridAdapterState).toBe('sample');
        expect(cockpit.gridDegradedReason).toBe(null)
    });

    test('a resolved EMPTY first snapshot is authoritative after explicit source selection', async () => {
        const {cockpit, grid} = await routeLoadRoster(
            {fleetRoster: async () => ({rows: []})},
            {rosterSourceMode: 'selected'}
        );

        expect(grid.store.cleared).toBe(1);
        expect(grid.store.added).toEqual([]);
        expect(grid.adapterState).toBe('live');
        expect(cockpit.rosterSourceMode).toBe('selected');
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
            agentId    : 'neo-gpt',
            authMode   : null,   // tri-state launch facts: absent on the row → honest null, never guessed
            avatarUrl  : 'https://github.com/neo-gpt.png?size=80',
            displayName: 'Neo GPT',
            engineTag  : 'GPT-5.6 Sol',
            family     : 'gpt',
            // the mailbox identity authority: absent on this row → honest null (unverifiable), never
            // silently substituted with the registry key, which is a different id space entirely
            githubUsername: null,
            lastActivityAt: null,
            launchable    : null,
            openLaneCount : null,   // roster-DTO-owned tri-state: un-stamped → honest null (no badge)
            // the authoritative participation fact: absent on the row → honest null, never guessed
            participationStatus: null,
            // the presence axis rides the same passthrough contract as wake/throttle below
            presence: null,
            sources : liveSources(),
            state   : 'ok',
            // the S2 telltale axes: absent on this row → honest null, never a synthesized 'unknown'.
            // The view must not manufacture the taxonomy's unknown — that value means the PRODUCER
            // looked and could not see, which is a different fact from "this row carried no axis".
            throttle: null,
            wake    : null
        });

        // laneLine is OMITTED, never nulled — a roster merge must not wipe what the activity producer writes
        expect(Object.hasOwn(mapped, 'laneLine')).toBe(false)
    });

    test('mapRosterRow passes the S2 axes through WHOLE — the view never re-derives a produced fact', () => {
        const
            wake     = {source: 'fleet:wakeState', state: 'suppressed', confidence: 'observed'},
            throttle = {source: 'fleet:throttleState', state: 'rate-limited', confidence: 'observed', reason: 'session cap'},
            mapped   = FleetCockpit.prototype.mapRosterRow({
                id       : 'neo-gpt',
                lifecycle: {source: 'fleet:runtimeStatus', state: 'running', confidence: 'observed'},
                sources  : liveSources(),
                throttle,
                wake
            });

        // Whole objects, not re-derived states: `confidence` and `reason` are the producer's evidence
        // that it actually looked, and a view that rebuilt {state} alone would strip exactly the
        // fields that distinguish an observed fact from a guess.
        expect(mapped.wake).toEqual(wake);
        expect(mapped.throttle).toEqual(throttle);

        // The incident this answers had BOTH at once — orthogonal axes, never collapsed to one enum.
        expect(mapped.wake.state).toBe('suppressed');
        expect(mapped.throttle.state).toBe('rate-limited')
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

        // a lifecycle/runtime confidence contradiction is rejected evidence — the downgrade reads
        // `invalid` with the contradiction named, never a silently calm not-wired
        expect(contradictory).toMatchObject({
            state  : 'off',
            sources: {runtime: {source: 'fleet:runtimeStatus', state: 'invalid', confidence: 'none', reason: 'lifecycle and runtime facts contradict'}}
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
        expect(cockpit.rosterSourceMode).toBe('selected');
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
            agentId    : 'vega',
            authMode   : null,
            avatarUrl  : null,
            displayName: null,
            engineTag  : null,
            family     : 'claude',
            // the mailbox identity authority rides the reconcile like every other DTO fact —
            // absent on this row → honest null (unverifiable), never the registry key substituted
            githubUsername     : null,
            lastActivityAt     : null,
            launchable         : null,
            openLaneCount      : null,
            participationStatus: null,
            presence           : null,
            sources            : liveSources(),
            state              : 'ok',
            throttle           : null,
            wake               : null
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
    const makeLiveCockpit = (store, index, detail = null) => {
        const grid = {adapterState: 'sample', store};

        const cockpit = {
            // the real accessor runs against this fake's getReference — the detail consumers
            // route through it (docked: projected pane; detached: the owner-held handle)
            detachedDetailPane: null,
            getAgentDetailPane: FleetCockpit.prototype.getAgentDetailPane,
            // the REAL phase-blind memories accessor over this fake's surface: no
            // tear-out maps here → safe-nav falls through to getReference, same as the detail twin
            getMemoriesPane    : FleetCockpit.prototype.getMemoriesPane,
            applySelection     : FleetCockpit.prototype.applySelection,
            clearDegradedReason: FleetCockpit.prototype.clearDegradedReason,
            degradeWiredSurface: FleetCockpit.prototype.degradeWiredSurface,
            getReference       : reference => reference === 'fleet-grid' ? grid : reference === 'agent-detail' ? detail : null,
            grid,
            // mirrors the class field defaults the loss edge reads
            gridAdapterState  : 'sample',
            // …and the async-ingress fence: omit it and `++undefined` is NaN, so the read's own
            // generation never equals the owner's and EVERY read silently drops itself
            gridReadGeneration: 0,
            id                : `fake-fleet-cockpit-${index}`,
            lastLiveRows      : null,
            mapRosterRow      : FleetCockpit.prototype.mapRosterRow,
            onRosterStoreLoad : FleetCockpit.prototype.onRosterStoreLoad,
            reconcileRoster   : FleetCockpit.prototype.reconcileRoster,
            reconcileSelection: FleetCockpit.prototype.reconcileSelection,
            reconcilingRoster : false,
            // the provider-owned roster authority — the SAME store the grid fake binds, so the
            // write path, the listener latch and the selection re-seat all read one truth
            resolveFleetRosterStore: () => store,
            // resident-pane accessors: unmaterialized here — the same silence contract as getReference
            getCatchUpPane        : () => null,
            getOperatorMailboxPane: () => null,
            rosterWired           : false,
            selectionState        : {},
            setState(values) {
                Object.assign(this.selectionState, values)
            },
            // the real banner sync: null getReference for the slot → guarded no-op, no stub drift
            syncSpineBanner    : FleetCockpit.prototype.syncSpineBanner
        };

        store.on({load: cockpit.onRosterStoreLoad, scope: cockpit});

        return cockpit
    };

    test('a sample seed landing AFTER live truth cannot overwrite the roster (fail-closed toward live)', async () => {
        const store   = Neo.create(FleetRoster, {data: []}),
              cockpit = makeLiveCockpit(store, 1);

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetRoster: async () => ({rows: [
            {id: 'ada',  family: 'claude', lifecycle: {state: 'running'}},
            {id: 'vega', family: 'claude', lifecycle: {state: 'stopped'}}
        ]})}};

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

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetRoster: async () => ({rows})}};

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

    test('reconcileSelection (real Store): first-live clear/add re-seats a surviving selection onto the new instance', async () => {
        const store    = Neo.create(FleetRoster, {data: []}),
              setCalls = [],
              detail   = {set(config) { setCalls.push(config) }},
              cockpit  = makeLiveCockpit(store, 4, detail);

        // a sample 'vega' is open in the inspector before live truth resolves
        store.add([{agentId: 'vega'}, {agentId: 'sample-x'}]);
        cockpit.detailRecord = store.get('vega');
        const sampleInstance = cockpit.detailRecord;

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetRoster: async () => ({rows: [
            {id: 'vega', family: 'claude', lifecycle: {state: 'running'}},
            {id: 'ada',  family: 'claude', lifecycle: {state: 'stopped'}}
        ]})}};

        await FleetCockpit.prototype.loadRoster.call(cockpit);   // first-live clear+add replaces the seed

        const liveInstance = store.get('vega');
        expect(liveInstance).toBeTruthy();
        expect(liveInstance).not.toBe(sampleInstance);           // a genuinely new record instance
        expect(cockpit.detailRecord).toBe(liveInstance);         // re-seated onto the live instance
        expect(cockpit.selectionState).toEqual({selectedAgentId: 'vega', selectedAgentIdentity: null});
        expect(setCalls).toEqual([{record: liveInstance}]);      // the inspector re-rendered

        store.destroy()
    });

    test('reconcileSelection (real Store): a later empty snapshot clears a removed resident to the honest empty state', async () => {
        const store    = Neo.create(FleetRoster, {data: []}),
              setCalls = [],
              detail   = {set(config) { setCalls.push(config) }},
              cockpit  = makeLiveCockpit(store, 5, detail);

        cockpit.rosterWired = true;                              // past the first-live replacement
        store.add([{agentId: 'vega'}, {agentId: 'ada'}]);
        cockpit.detailRecord = store.get('vega');

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetRoster: async () => ({rows: []})}};

        await FleetCockpit.prototype.loadRoster.call(cockpit);   // authoritative empty snapshot → real Store.remove

        expect(store.get('vega')).toBeFalsy();                   // removed via the real Store path
        expect(cockpit.detailRecord).toBeNull();                // selection cleared
        expect(cockpit.selectionState).toEqual({selectedAgentId: null, selectedAgentIdentity: null});
        expect(setCalls).toEqual([{record: null}]);             // AgentDetail → honest empty state

        store.destroy()
    });

    test('reconcileSelection (real Store): a surviving same-instance reconcile is a no-op (mutation path owns it)', async () => {
        const store    = Neo.create(FleetRoster, {data: []}),
              setCalls = [],
              detail   = {set(config) { setCalls.push(config) }},
              cockpit  = makeLiveCockpit(store, 6, detail);

        cockpit.rosterWired = true;
        store.add([{agentId: 'vega'}, {agentId: 'ada'}]);
        cockpit.detailRecord = store.get('vega');
        const instance = cockpit.detailRecord;

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetRoster: async () => ({rows: [
            {id: 'vega', family: 'claude', lifecycle: {state: 'running'}},
            {id: 'ada',  family: 'claude', lifecycle: {state: 'stopped'}}
        ]})}};

        await FleetCockpit.prototype.loadRoster.call(cockpit);   // reconcile: record.set mutates in place (same object)

        expect(store.get('vega')).toBe(instance);               // same instance, mutated in place
        expect(cockpit.detailRecord).toBe(instance);            // selection unchanged
        expect(setCalls).toEqual([]);                           // no re-seat — recordChange owns mutation

        store.destroy()
    });

    test('onDetailRecordChange routes a roster mutation of the inspected agent to the detail — reactive to record MUTATION, not just a re-seat', () => {
        const
            record  = {agentId: 'vega'},
            applied = [],
            detail  = {applyRecord() { applied.push(true) }},
            host    = Object.create(FleetCockpit.prototype);

        host.detailRecord = record;
        host.getReference = name => name === 'agent-detail' ? detail : null;

        // a recordChange for the INSPECTED record re-renders the detail in place — a roster re-poll
        // mutating state/lane/sources on the open agent must never leave a stale inspector
        FleetCockpit.prototype.onDetailRecordChange.call(host, {record});
        expect(applied).toEqual([true]);

        // a recordChange for a DIFFERENT record is ignored — no needless re-render
        FleetCockpit.prototype.onDetailRecordChange.call(host, {record: {agentId: 'ada'}});
        expect(applied).toEqual([true]);

        // detail not mounted (auto-hidden, not yet revealed) → the optional chain no-ops safely
        host.getReference = () => null;
        FleetCockpit.prototype.onDetailRecordChange.call(host, {record});
        expect(applied).toEqual([true])
    });

    test('reconcileSelection re-seats or clears the owner-held selection on authoritative membership changes', () => {
        const
            setCalls = [],
            detail   = {set(config) { setCalls.push(config) }},
            makeHost = (detailRecord, storeGet) => {
                const host = Object.create(FleetCockpit.prototype);

                host.detailRecord            = detailRecord;
                host.applySelection          = FleetCockpit.prototype.applySelection;
                host.resolveFleetRosterStore = () => ({get: storeGet});
                host.getReference            = name => name === 'agent-detail' ? detail : null;
                host.getAgentDetailPane      = FleetCockpit.prototype.getAgentDetailPane;
                host.getMemoriesPane         = () => null;
                host.selectionState          = {};
                host.setState                = values => Object.assign(host.selectionState, values);

                return host
            };

        // (1) the inspected resident is REMOVED (absent from the authoritative snapshot / empty
        //     snapshot) → clear the selection to the honest empty state (Store.remove fires no recordChange)
        setCalls.length = 0;
        const removedHost = makeHost({agentId: 'vega'}, () => undefined);
        FleetCockpit.prototype.reconcileSelection.call(removedHost);
        expect(removedHost.detailRecord).toBeNull();
        expect(removedHost.selectionState).toEqual({selectedAgentId: null, selectedAgentIdentity: null});
        expect(setCalls).toEqual([{record: null}]);

        // (2) the resident survives as the SAME instance (in-place record.set reconcile) → no re-seat;
        //     the mutation path (recordChange → applyRecord) already keeps the inspector truthful
        setCalls.length = 0;
        const same     = {agentId: 'vega'};
        const sameHost = makeHost(same, id => id === 'vega' ? same : undefined);
        FleetCockpit.prototype.reconcileSelection.call(sameHost);
        expect(sameHost.detailRecord).toBe(same);
        expect(setCalls).toEqual([]);

        // (3) the durable agentId survives as a NEW instance (first-live clear+add replace of the sample
        //     seed) → re-seat detailRecord onto the live instance and re-render
        setCalls.length = 0;
        const stale      = {agentId: 'vega'}, fresh = {agentId: 'vega'};
        const reseatHost = makeHost(stale, id => id === 'vega' ? fresh : undefined);
        FleetCockpit.prototype.reconcileSelection.call(reseatHost);
        expect(reseatHost.detailRecord).toBe(fresh);
        expect(reseatHost.selectionState).toEqual({selectedAgentId: 'vega', selectedAgentIdentity: null});
        expect(setCalls).toEqual([{record: fresh}]);

        // (4) nothing selected → no-op, and the Store is never touched
        setCalls.length = 0;
        const noneHost = makeHost(null, () => { throw new Error('store must not be touched when nothing is selected') });
        FleetCockpit.prototype.reconcileSelection.call(noneHost);
        expect(setCalls).toEqual([])
    });
});

test.describe('Fleet cockpit — whole-fleet control (B4, #14611)', () => {
    let FleetCockpit, FleetCockpitController;

    test.beforeAll(async () => {
        [FleetCockpit, FleetCockpitController] = await Promise.all([
            import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs').then(module => module.default),
            import('../../../../../../../../apps/agentos/view/fleet/cockpit/Controller.mjs').then(module => module.default)
        ])
    });

    test('onStartFleet fans out start to every resident card via the C2 adapter (fold skipped; no bridge → fail-closed per card, never optimistic)', () => {
        // The fleet-start button drives the round-trip directly (the cockpit owns the wire): it
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

    test('getRosterRecords treats a present empty Store as authoritative and falls back to cards only when the Store composition is absent', () => {
        const
            staleCard  = {ntype: 'fm-agent-card', record: {agentId: 'stale'}},
            controller = Object.create(FleetCockpitController.prototype);

        controller.getReference = name => ({
            'fleet-cards': {items: [staleCard]},
            'fleet-grid' : {store: {items: []}}
        })[name] ?? null;

        expect(controller.getRosterRecords()).toEqual([]);

        controller.getReference = name => ({
            'fleet-cards': {items: [staleCard]},
            'fleet-grid' : {store: {}}
        })[name] ?? null;

        expect(controller.getRosterRecords()).toEqual([]);

        controller.getReference = name => name === 'fleet-cards' ? {items: [staleCard]} : null;

        expect(controller.getRosterRecords()).toEqual([staleCard.record])
    });

    test('overlapping fleet activations join one active batch: one bridge call per member and one authoritative summary', async () => {
        const
            calls    = [],
            releases = new Map(),
            records  = ['ada', 'euclid'].map(agentId => ({
                agentId,
                controlReason: null,
                pendingAction: null,
                sources      : wiredSources(),
                state        : 'off',
                set(values) { Object.assign(this, values) }
            })),
            summaries  = [],
            controller = Object.create(FleetCockpitController.prototype);

        (globalThis.AgentOS ??= {}).fleet = {
            registryBridge: {
                startAgent(agentId) {
                    calls.push(agentId);
                    return new Promise(resolve => releases.set(agentId, resolve))
                }
            }
        };

        controller.getReference          = name => name === 'fleet-grid' ? {store: {items: records}} : null;
        controller.refreshRosterOnSettle = settledOk => settledOk;
        controller.renderStartSummary    = summary => summaries.push(summary);

        try {
            const
                first  = controller.onStartFleet(),
                second = controller.onStartFleet();

            expect(second).toBe(first);

            await Promise.resolve();
            await Promise.resolve();

            expect(calls).toEqual(['ada', 'euclid']);

            releases.get('ada')({state: 'running'});
            await Promise.resolve();
            await Promise.resolve();

            const third = controller.onStartFleet();

            expect(third).toBe(first);
            expect(calls).toEqual(['ada', 'euclid']);

            releases.get('euclid')({state: 'running'});
            await first;

            expect(summaries.filter(Boolean)).toHaveLength(1);
            expect(summaries.filter(Boolean)[0].started).toBe(2);
            expect(controller.startFleetPromise).toBeNull()
        } finally {
            delete globalThis.AgentOS?.fleet
        }
    });

    test('the next fleet activation excludes a timeout-bearing member instead of silently retrying an unknown operation', async () => {
        const
            calls  = [],
            record = {
                agentId      : 'euclid',
                controlReason: {action: 'start', kind: 'timeout', reason: 'start timed out after 30000ms'},
                sources      : wiredSources(),
                state        : 'off'
            },
            controller = Object.create(FleetCockpitController.prototype);

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {startAgent: agentId => calls.push(agentId)}};
        controller.getReference          = name => name === 'fleet-grid' ? {store: {items: [record]}} : null;
        controller.refreshRosterOnSettle = settledOk => settledOk;
        controller.renderStartSummary    = () => {};

        try {
            const summary = await controller.onStartFleet();

            expect(calls).toEqual([]);
            expect(summary.attempted).toBe(0);
            expect(summary.excluded).toHaveLength(1);
            expect(summary.excluded[0].reason).toContain('outcome unknown')
        } finally {
            delete globalThis.AgentOS?.fleet
        }
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
        FleetCockpitController = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Controller.mjs')).default;
        FleetCockpit          = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default;
        FleetAgent            = (await import('../../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store                 = (await import('../../../../../../../../src/data/Store.mjs')).default
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

    test('onAgentSelect: a card select holds the owner-side detailRecord + reveals the auto-hidden inspector through the commit loop', () => {
        const
            record  = {agentId: 'vega', displayName: 'Vega', githubUsername: 'neo-opus-vega'},
            detail  = {record: null, set(cfg) { Object.assign(this, cfg) }},
            applied = [],
            cockpit = {
                detailRecord  : null,
                dockModel     : {items: {detail: {autoHidden: true}}},
                selectionState: {},
                applySelection: FleetCockpit.prototype.applySelection,
                applyDockZoneOperation(op) { applied.push(op); return {document: {revealed: true}, errors: []} },
                // the controller drill routes through the OWNER accessor (docked pane here;
                // the vessel-held handle while detached — the pop-out suite covers that phase)
                getAgentDetailPane() { return detail },
                getMemoriesPane() { return null },
                onDockZoneDocumentChange(doc) { this.committed = doc },
                resolveFleetRosterStore() { return {get: id => id === 'vega' ? record : null} },
                setState(values) { Object.assign(this.selectionState, values) }
            },
            controller = Object.create(FleetCockpitController.prototype);

        controller.component = cockpit;

        controller.onAgentSelect({agentId: 'vega'});

        // owner-held selection (survives a later re-projection — resolveDockComponentRef reads it) +
        // the live pane updated in place
        expect(cockpit.detailRecord).toBe(record);
        expect(detail.record).toBe(record);
        expect(cockpit.selectionState).toEqual({
            selectedAgentId      : 'vega',
            selectedAgentIdentity: '@neo-opus-vega'
        });
        // the auto-hidden inspector is revealed through the standard commit loop, not a bespoke path
        expect(applied).toEqual([{operation: 'setItemAutoHidden', itemId: 'detail', autoHidden: false}]);
        expect(cockpit.committed).toEqual({revealed: true})
    });

    test('onAgentSelect: an already-revealed inspector updates in place (no re-projection); an unknown agent is a fail-closed no-op', () => {
        const
            record  = {agentId: 'ada', githubUsername: 'neo-opus-ada'},
            detail  = {record: null, set(cfg) { Object.assign(this, cfg) }},
            applied = [],
            cockpit = {
                detailRecord  : null,
                dockModel     : {items: {detail: {autoHidden: false}}},   // already revealed
                selectionState: {},
                applySelection: FleetCockpit.prototype.applySelection,
                applyDockZoneOperation(op) { applied.push(op); return {document: {}, errors: []} },
                getAgentDetailPane() { return detail },
                getMemoriesPane() { return null },
                onDockZoneDocumentChange() { this.reprojected = true },
                resolveFleetRosterStore() { return {get: id => id === 'ada' ? record : null} },
                setState(values) { Object.assign(this.selectionState, values) }
            },
            controller = Object.create(FleetCockpitController.prototype);

        controller.component = cockpit;

        controller.onAgentSelect({agentId: 'ada'});
        expect(cockpit.detailRecord).toBe(record);
        expect(detail.record).toBe(record);
        expect(cockpit.selectionState).toEqual({
            selectedAgentId      : 'ada',
            selectedAgentIdentity: '@neo-opus-ada'
        });
        expect(applied).toEqual([]);                  // already revealed → no reveal op...
        expect(cockpit.reprojected).toBeUndefined();  // ...and no full re-projection

        // unknown agentId → fail-closed no-op, the selection stands
        controller.onAgentSelect({agentId: 'ghost'});
        expect(cockpit.detailRecord).toBe(record)
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
        const store = Neo.create(Store, {keyProperty: 'agentId', model: FleetAgent});
        // `gridReadGeneration` mirrors the class default because the async-ingress fence reads it: a
        // fake omitting it makes `++undefined` NaN, so the read's generation never matches the
        // owner's and EVERY read silently drops itself — a green suite over state nobody wrote.
        const cockpit = {
            clearDegradedReason: FleetCockpit.prototype.clearDegradedReason,
            degradeWiredSurface: FleetCockpit.prototype.degradeWiredSurface,
            // the resident-pane owner pushes route through the phase-blind accessors; an
            // unmaterialized pane resolves null — the same silence contract as getReference
            getCatchUpPane        : () => null,
            getMemoriesPane       : () => null,
            getOperatorMailboxPane: () => null,
            getReference          : reference => reference === 'fleet-grid' ? {adapterState: 'sample', store} : null,
            // the provider-owned roster authority — the same REAL store the grid binds
            resolveFleetRosterStore: () => store,
            gridAdapterState       : 'sample',
            gridReadGeneration     : 0,
            mapRosterRow           : FleetCockpit.prototype.mapRosterRow,
            reconcileRoster        : FleetCockpit.prototype.reconcileRoster,
            reconcileSelection     : FleetCockpit.prototype.reconcileSelection,
            loadRoster             : FleetCockpit.prototype.loadRoster,
            rosterWired            : false,
            // the real banner sync: null getReference for the slot → guarded no-op, no stub drift
            syncSpineBanner    : FleetCockpit.prototype.syncSpineBanner
        };

        // boot: the real loadRoster reads the bridge — the agent is stopped, so the record resolves to 'off'
        await cockpit.loadRoster();
        expect(store.get('vega').state).toBe('off');
        // success-state proof: the load COMPLETED (reached the post-reconcile adapter-state assignment), not
        // merely mutated the record before a swallowed missing-reconcileSelection error (Euclid's falsifier)
        expect(cockpit.gridAdapterState).toBe('live');

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
        // and the re-poll load COMPLETED too (reconcile phase reached success state, not a swallowed error)
        expect(cockpit.gridAdapterState).toBe('live');

        store.destroy()
    })
});

/**
 * The slot-sync consumer witness: `syncSpineBanner` against a REAL recording banner slot — the
 * derivation lands on the component (cls hook + hidden + text) and a missing slot stays a guarded
 * no-op. This suite also carries the liveness owner's transition matrix, because the transition is
 * only real if it reaches the slot: a state that moves without the banner moving is the same silent
 * failure as never moving at all.
 */
test.describe('Fleet cockpit — the spine-banner slot sync (syncSpineBanner)', () => {
    let FleetCockpit;

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    const makeBanner = () => {
        const calls = [];

        // `vdom` mirrors the real component: the sync writes the full-text `title` there
        // (the drill-free detail) before flushing the same pass through set()
        return {calls, vdom: {}, set(config) { calls.push(config) }}
    };

    // A cockpit with no provider in its chain is the DEFAULT fixture: the banner speaks its verdict
    // unlabeled, and the instance mirror writes nowhere. Every existing case below asserts the
    // verdict itself, so provider-less is exactly the shape that keeps them about the verdict.
    const makeHost = (gridAdapterState, streamAdapterState, banner) => ({
        getReference    : reference => reference === 'fleet-spine-banner' ? banner : null,
        getStateProvider: () => null,
        gridAdapterState,
        streamAdapterState,
        syncSpineBanner : FleetCockpit.prototype.syncSpineBanner
    });

    // ⭐ The daemon surface reaching the REAL slot. The derivation being correct is a separate suite;
    // this asserts the cockpit actually FEEDS it, because a derivation nothing feeds is indistinguishable
    // from an absent feature — and the wiring is the half that makes the shell spec's banner exist.
    test('⭐ a dead daemon reaches the slot with the diagnosis, outranking a stale feed', () => {
        const banner = makeBanner(),
              host   = {
                  ...makeHost('live', 'stale', banner),
                  daemonDegradedReason: 'orchestrator exited',
                  daemonState         : 'stopped'
              };

        host.syncSpineBanner();

        const {cls, hidden, text} = banner.calls[0];

        expect(cls).toEqual(['fm-spine-banner', 'fm-spine-banner-degraded']);
        expect(hidden).toBe(false);
        expect(text).toContain('stopped');
        expect(text).toContain('orchestrator exited');
        // The stale feed is the symptom; it must not be the sentence.
        expect(text).not.toContain('last-known data')
    });

    test('the bound instance NAMES itself on every spoken line, and the chrome dot mirrors the same verdict', () => {
        // The scope rule: the switcher and this banner are the only two places in the main window
        // that speak the instance name. The banner composes it HERE (the pure derivation stays
        // label-free), and the SAME verdict is mirrored into provider data so the chrome dot cannot
        // disagree with the sentence beside it — one truth, two renderers.
        const
            banner       = makeBanner(),
            written      = [],
            record       = {canonicalEndpoint: 'https://fleet.example.io/fleet', label: 'cloud-eu', profileId: 'p1'},
            withProvider = (data, storeHit) => ({
                ...makeHost('live', 'stale', banner),
                getStateProvider: () => ({
                    getData : key => data[key],
                    getStore: name => name === 'fleetInstances' ? {get: id => (storeHit && id === 'p1' ? record : null)} : null,
                    setData : patch => written.push(patch)
                }),
                daemonDegradedReason: 'orchestrator exited',
                daemonState         : 'stopped'
            });

        withProvider({boundProfileId: 'p1'}, true).syncSpineBanner();

        // the label PREFIXES the verdict; the verdict itself is untouched
        expect(banner.calls[0].text).toMatch(/^cloud-eu — /);
        expect(banner.calls[0].text).toContain('orchestrator exited');
        // a degraded verdict mirrors as the limited dot state — never as ok
        expect(written.at(-1)).toEqual({instanceState: 'limited'});

        // honest absence, both halves: a bound id the roster does not hold names NOTHING (the row
        // may be retired or not yet hydrated), and the mirror still writes the verdict
        banner.calls.length = 0;
        withProvider({boundProfileId: 'p1'}, false).syncSpineBanner();
        expect(banner.calls[0].text).not.toContain('cloud-eu');
        expect(banner.calls[0].text).toContain('orchestrator exited');
        expect(written.at(-1)).toEqual({instanceState: 'limited'})
    });

    test('a LIVE spine mirrors ok and stays label-free — a hidden banner speaks no scope', () => {
        // The label rides SPOKEN lines only: a fully live spine renders zero pixels, so prefixing a
        // hidden empty string would put an instance name into a sentence nobody sees.
        const
            banner  = makeBanner(),
            written = [],
            host    = {
                ...makeHost('live', 'live', banner),
                getStateProvider: () => ({
                    getData : () => 'p1',
                    getStore: () => ({get: () => ({canonicalEndpoint: 'http://127.0.0.1:8083/fleet', label: 'local'})}),
                    setData : patch => written.push(patch)
                })
            };

        host.syncSpineBanner();

        expect(banner.calls[0].hidden).toBe(true);
        expect(banner.calls[0].text).toBe('');
        expect(written.at(-1)).toEqual({instanceState: 'ok'})
    });

    test('⭐ an unfed daemon surface stays SILENT on a live owner — absence claims nothing', () => {
        // `daemonState` is null until the runtime pull lands. This asserts the default is honest
        // silence rather than an implicit "the organism is fine", which is what defaulting to
        // `'running'` would have asserted on the strength of never having asked.
        const banner = makeBanner();

        makeHost('live', 'live', banner).syncSpineBanner();

        expect(banner.calls[0].hidden).toBe(true);
        expect(banner.calls[0].text).toBe('')
    });

    // ⭐ The producer→cockpit→slot witness the predecessor lacked: the SHELL transition drives the
    // banner. A test that hand-assigns `daemonState` witnesses only a pass-through — that misreading
    // is what made the closed predecessor PR look delivered while its fields had no writer at all.
    test('⭐ a SHELL transition drives the banner: lifecycle owner → wire payload → feed → slot', () => {
        const
            child     = new EventEmitter(),
            lifecycle = createAppLifecycle({
                app          : Object.assign(new EventEmitter(), {exit() {}, quit() {}}),
                teardownBrain: async () => ({})
            }),
            banner    = makeBanner(),
            cockpit   = {
                ...makeHost('live', 'live', banner),
                applyBrainHealth       : FleetCockpit.prototype.applyBrainHealth,
                brainHealthReadInFlight: false,
                daemonDegradedReason   : null,
                daemonState            : null
            };

        lifecycle.setBrainState('running');
        lifecycle.watchBrainChild(child, 'orchestrator');
        child.emit('error', new Error('spawn ENOENT'));

        // The payload is the producer's own wire truth, never test-fabricated consumer state.
        cockpit.applyBrainHealth(lifecycle.brainHealth);

        expect(cockpit.daemonState).toBe('degraded');
        expect(banner.calls[0].hidden).toBe(false);
        expect(banner.calls[0].text).toContain('degraded');
        expect(banner.calls[0].text).toContain('orchestrator: error spawn ENOENT');

        // Recovery is ALSO the shell's transition — the owner's `running` write, which is the
        // terminal step any future restart machinery performs. Restart machinery itself (a second
        // boot-settle after an owned-child fault) is lifecycle-service scope, not this leaf's.
        lifecycle.setBrainState('running');
        cockpit.applyBrainHealth(lifecycle.brainHealth);

        expect(cockpit.daemonState).toBe('running');
        expect(cockpit.daemonDegradedReason).toBeNull();
        expect(banner.calls[1].hidden).toBe(true)
    });

    test('⭐ transport failure never impersonates recovery: fault → dead transport → retained; only running clears', () => {
        const banner  = makeBanner(),
              cockpit = {
                  ...makeHost('live', 'live', banner),
                  applyBrainHealth    : FleetCockpit.prototype.applyBrainHealth,
                  daemonDegradedReason: null,
                  daemonState         : null
              };

        // a real fault from the lifecycle owner
        cockpit.applyBrainHealth({cause: {detail: 'orchestrator: exit code 1', observedAt: 1, source: 'owned-child-termination'}, state: 'degraded'});

        expect(cockpit.daemonState).toBe('degraded');
        expect(banner.calls[0].hidden).toBe(false);
        expect(banner.calls[0].text).toContain('orchestrator: exit code 1');

        // the transport dies: an unavailable envelope AND a rejection-mapped null. A dead transport
        // is not a recovered organism — the KNOWN fault must stay visible, not be erased.
        cockpit.applyBrainHealth({error: 'brain: shell health capability unavailable', ok: false});
        cockpit.applyBrainHealth(null);

        expect(cockpit.daemonState).toBe('degraded');
        expect(cockpit.daemonDegradedReason).toBe('orchestrator: exit code 1');
        expect(banner.calls, 'transport answers repaint nothing').toHaveLength(1);

        // ONLY the owner's own running answer clears the fault
        cockpit.applyBrainHealth({cause: null, state: 'running'});

        expect(cockpit.daemonState).toBe('running');
        expect(cockpit.daemonDegradedReason).toBeNull();
        expect(banner.calls[1].hidden).toBe(true)
    });

    test('dev-server mode stays silent: transport-only answers on a never-fed surface write nothing', () => {
        const banner  = makeBanner(),
              cockpit = {
                  ...makeHost('live', 'live', banner),
                  applyBrainHealth    : FleetCockpit.prototype.applyBrainHealth,
                  daemonDegradedReason: null,
                  daemonState         : null
              };

        cockpit.applyBrainHealth({error: 'brain: shell health capability unavailable', ok: false});
        cockpit.applyBrainHealth(null);

        // never fed → still null/null, and no banner write at all: silence claims nothing
        expect(cockpit.daemonState).toBeNull();
        expect(cockpit.daemonDegradedReason).toBeNull();
        expect(banner.calls).toEqual([])
    });

    test('a cold owner writes the REAL slot: cold class hook, visible, cause + shipped remedy', () => {
        const banner = makeBanner();

        makeHost('sample', 'sample', banner).syncSpineBanner();

        expect(banner.calls).toHaveLength(1);

        const {cls, hidden, text} = banner.calls[0];

        expect(cls).toEqual(['fm-spine-banner', 'fm-spine-banner-cold']);
        expect(hidden).toBe(false);
        expect(text).toContain('Fleet server offline');
        expect(text).toContain('neo-agent-brain checkout')
    });

    test('a degraded owner writes the degraded hook + last-known copy', () => {
        const banner = makeBanner();

        makeHost('live', 'stale', banner).syncSpineBanner();

        const {cls, hidden, text} = banner.calls[0];

        expect(cls).toEqual(['fm-spine-banner', 'fm-spine-banner-degraded']);
        expect(hidden).toBe(false);
        expect(text).toContain('last-known')
    });

    test('a fully live owner hides the REAL slot with empty copy — zero nominal pixels', () => {
        const banner = makeBanner();

        makeHost('live', 'live', banner).syncSpineBanner();

        expect(banner.calls[0]).toEqual({cls: ['fm-spine-banner', 'fm-spine-banner-live'], hidden: true, text: ''})
    });

    test('the Reconnect affordance shares the banner verdict: visible on any spoken line, hidden on live', () => {
        const banner    = makeBanner(),
              reconnect = makeBanner(),
              host      = {
                  ...makeHost('sample', 'sample', banner),
                  getReference: reference =>
                      reference === 'fleet-spine-banner'     ? banner :
                      reference === 'fleet-reconnect-button' ? reconnect : null
              };

        host.syncSpineBanner();
        expect(reconnect.calls[0]).toEqual({hidden: false});

        host.gridAdapterState   = 'live';
        host.streamAdapterState = 'live';
        host.syncSpineBanner();
        expect(reconnect.calls[1]).toEqual({hidden: true})
    });

    test('reconnectFleet re-drives every liveness seam immediately — the one-click recovery', () => {
        const
            driven = [],
            panes  = {
                'catch-up'  : {onRefreshClick: () => driven.push('catchUpHistory')},
                'memories'  : {onRefreshClick: () => driven.push('memoriesHistory')},
                'wakeRoutes': {onRefreshClick: () => driven.push('wakeRoutesHistory')}
            };

        FleetCockpit.prototype.reconnectFleet.call({
            loadActivity   : () => driven.push('activity'),
            loadBrainHealth: () => driven.push('brainHealth'),
            loadRoster     : () => driven.push('roster'),
            // fleet-wide and owner-held: re-driven directly, not through a pane accessor, so a
            // not-yet-materialized Tasks tab still reopens on post-reconnect truth
            loadTasks             : () => driven.push('tasks'),
            ensureViewerWakeStream: () => driven.push('viewerWake'),
            // the resident-pane re-drives route through the phase-blind accessors: a vesseled
            // pane must receive the reconnect re-drive too, so the seam is the accessor, not the raw reference
            getCatchUpPane   : () => panes['catch-up'],
            getMemoriesPane  : () => panes.memories,
            getWakeRoutesPane: () => panes.wakeRoutes ?? null,
            getReference     : reference => panes[reference] ?? null
        });

        expect(driven.sort()).toEqual([
            'activity', 'brainHealth', 'catchUpHistory', 'memoriesHistory', 'roster', 'tasks', 'viewerWake', 'wakeRoutesHistory'
        ])
    });

    test('reconnectFleet tolerates unmounted panes — a missing reference is silence, never a throw', () => {
        const driven = [];

        FleetCockpit.prototype.reconnectFleet.call({
            loadActivity          : () => driven.push('activity'),
            loadBrainHealth       : () => driven.push('brainHealth'),
            loadRoster            : () => driven.push('roster'),
            loadTasks             : () => driven.push('tasks'),
            ensureViewerWakeStream: () => driven.push('viewerWake'),
            getCatchUpPane        : () => null,
            getMemoriesPane       : () => null,
            getWakeRoutesPane     : () => null,
            getReference          : () => null
        });

        expect(driven.sort()).toEqual(['activity', 'brainHealth', 'roster', 'tasks', 'viewerWake'])
    });

    test('⭐ the shell transport fact reaches the cold copy through the health pull — daemon truth untouched', () => {
        const banner  = makeBanner(),
              cockpit = {
                  ...makeHost('sample', 'live', banner),
                  applyBrainHealth    : FleetCockpit.prototype.applyBrainHealth,
                  daemonDegradedReason: null,
                  daemonState         : null
              };

        // a state-less payload carrying only the fact: the daemon surface stays unfed (absence
        // claims nothing), while the cold copy moves to the shell's honest line
        cockpit.applyBrainHealth({state: null, transport: {phase: 'starting'}});

        expect(cockpit.daemonState).toBeNull();
        expect(cockpit.shellTransport).toEqual({phase: 'starting'});
        expect(banner.calls.at(-1).text).toContain('Fleet transport starting');

        // the boot settles foreign — the SAME wire moves the copy to the named case
        cockpit.applyBrainHealth({state: null, transport: {fleetPort: 8083, mode: 'foreign-listener', phase: 'settled', reason: 'viewer mismatch', up: false}});

        expect(banner.calls.at(-1).text).toContain('another fleet server holds port 8083');

        // an UNCHANGED fact repaints nothing — the same no-visible-change discipline the daemon
        // surface holds for transport-failure answers
        const paints = banner.calls.length;

        cockpit.applyBrainHealth({state: null, transport: {fleetPort: 8083, mode: 'foreign-listener', phase: 'settled', reason: 'viewer mismatch', up: false}});
        expect(banner.calls.length).toBe(paints)
    });

    /**
     * @summary Builds a live host driving the REAL loadActivity through the REAL loss edge.
     */
    const makeLivenessHost = banner => {
        const stream = {adapterState: 'live', set() {}};

        return {
            ...makeActivityStoreHarness(),
            clearDegradedReason: FleetCockpit.prototype.clearDegradedReason,
            degradeWiredSurface: FleetCockpit.prototype.degradeWiredSurface,
            getReference       : reference =>
                reference === 'fleet-spine-banner' ? banner :
                reference === 'activity-stream'    ? stream : null,
            gridAdapterState    : 'live',
            gridDegradedReason  : null,
            loadActivity        : FleetCockpit.prototype.loadActivity,
            streamAdapterState  : 'live',
            streamDegradedReason: null,
            streamReadGeneration: 0,
            syncSpineBanner     : FleetCockpit.prototype.syncSpineBanner
        }
    };

    const withBridge = async (fleetActivity, host) => {
        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity}};

        try {
            await host.loadActivity()
        } finally {
            delete globalThis.AgentOS?.fleet
        }
    };

    test('owner-truth MOBILITY: once live, a thrown load advances to stale and the slot NAMES the loss', async () => {
        // This inverts the immobility pin that previously stood here. That spec recorded the gap on
        // purpose — "the loss/recovery transition is the dedicated liveness owner's contract" — and
        // this leaf IS that owner, so the pin is discharged, not broken. `live` must stop meaning
        // "was live once": a transport death the operator can't see is the dishonest state.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        await withBridge(async () => { throw new Error('transport lost') }, host);

        expect(host.streamAdapterState).toBe('stale');
        expect(host.streamDegradedReason).toBe('transport lost');
        expect(banner.calls[0].hidden).toBe(false);
        expect(banner.calls[0].cls).toContain('fm-spine-banner-degraded');
        // the retained reason is NAMED, not generic copy
        expect(banner.calls[0].text).toContain('transport lost');
        expect(banner.calls[0].text).toContain('last-known')
    });

    test('recovery: a later successful poll returns live, clears the reason, and re-hides the slot', async () => {
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        await withBridge(async () => { throw new Error('transport lost') }, host);
        expect(host.streamAdapterState).toBe('stale');

        await withBridge(async () => ({capability: {state: 'wired'}, events: []}), host);

        expect(host.streamAdapterState).toBe('live');
        expect(host.streamDegradedReason, 'a stale cause must never outlive the degrade it explained').toBe(null);
        expect(banner.calls.at(-1).hidden).toBe(true)
    });

    test('the retained reason survives while the OTHER surface is still degraded', async () => {
        // clearing on the first recovery would strand the banner on generic copy while a real,
        // named degrade is still live on the sibling surface
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        host.gridAdapterState = 'stale';
        host.gridDegradedReason = 'roster bridge unreachable';

        await withBridge(async () => ({capability: {state: 'wired'}, events: []}), host);

        expect(host.streamAdapterState).toBe('live');
        expect(host.gridDegradedReason).toBe('roster bridge unreachable');
        expect(banner.calls.at(-1).hidden).toBe(false);
        expect(banner.calls.at(-1).text).toContain('roster bridge unreachable')
    });

    test('a never-wired surface stays cold-honest: a pre-live throw never claims last-known data', async () => {
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        host.streamAdapterState = 'sample';

        await withBridge(async () => { throw new Error('transport lost') }, host);

        // 'stale' would tell the operator we are showing last-known data that never existed
        expect(host.streamAdapterState).toBe('sample');
        expect(host.streamDegradedReason).toBe(null)
    });

    test('not-wired → bridge ABSENT retracts the activity cause — the answer must not outlive its producer', async () => {
        // the activity half of the reviewer falsifier: the producer ANSWERED not-wired (reason
        // retained, honest sample), then the bridge vanished — the retained cause must go with it.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        host.streamAdapterState = 'sample';

        await withBridge(async () => ({capability: {state: 'not-wired', reason: 'activity source not wired'}, events: []}), host);
        expect(host.streamDegradedReason).toBe('activity source not wired');
        expect(host.streamAdapterState).toBe('sample');

        // withBridge already removed the bridge in its finally — this drive hits the absence exit
        await host.loadActivity();

        expect(host.streamAdapterState).toBe('sample');
        expect(host.streamDegradedReason).toBe(null)
    });

    test('CONTROL — a wired surface keeps its stale reason through bridge absence (last-known truth survives)', async () => {
        // the retraction is scoped to never-wired ANSWERED causes; a surface that reached live and
        // degraded holds last-known data, and its cause explains exactly that — absence must not
        // erase it (the per-surface-reason doctrine's other half).
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        await withBridge(async () => { throw new Error('transport lost') }, host);
        expect(host.streamAdapterState).toBe('stale');
        expect(host.streamDegradedReason).toBe('transport lost');

        await host.loadActivity();

        expect(host.streamAdapterState).toBe('stale');
        expect(host.streamDegradedReason).toBe('transport lost')
    });

    test('the degraded reason is redacted + bounded before it reaches operator-visible chrome', async () => {
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        await withBridge(async () => { throw new Error('502 from bridge (Authorization: Bearer super-secret)') }, host);

        expect(host.streamDegradedReason).not.toContain('super-secret');
        expect(host.streamDegradedReason).toContain('502 from bridge');
        expect(banner.calls[0].text).not.toContain('super-secret');

        const long = makeLivenessHost(makeBanner());
        await withBridge(async () => { throw new Error('x'.repeat(400)) }, long);
        expect(long.streamDegradedReason.length).toBeLessThanOrEqual(120)
    });

    test('a healthy SIBLING never erases this surface\'s retained reason — @neo-gpt\'s red proof', async () => {
        // His exact falsifier, and it defeated the cold-line fix completely. One shared
        // `degradedReason` for two independently-answering surfaces cannot know whose cause it holds:
        //
        //   1. loadActivity resolves first: {state:'not-wired', reason:'…'} → reason retained
        //   2. the healthy roster resolves {rows:[]} → clearDegradedReason() ran, saw grid=live and
        //      stream=SAMPLE (not stale, so the guard never noticed it), and erased the activity's
        //      cause → banner regressed to "Fleet server offline" while the server was answering.
        //
        // The guard was not too weak — the FIELD was shared, and no guard on a shared field can tell
        // whose cause it holds. Per-surface ownership makes the race unrepresentable rather than
        // guarded, which is why this is a field split and not another condition.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        // the stream sits on its SEED, which is the real state when a not-wired answer arrives — the
        // not-wired branch deliberately leaves the state alone (the feed really is showing sample
        // events), so a host starting at 'live' would stay 'live' and never reach the cold line at
        // all. My first version of this witness did exactly that and passed for the wrong reason.
        host.streamAdapterState = 'sample';

        // 1. the activity surface answers not-wired and retains its own cause
        await withBridge(async () => ({capability: {state: 'not-wired', reason: 'fleet activity source not wired'}, events: []}), host);

        expect(host.streamDegradedReason).toBe('fleet activity source not wired');

        // 2. the roster surface recovers cleanly — it may only clear ITS OWN reason
        host.clearDegradedReason('grid');
        host.gridAdapterState = 'live';
        host.syncSpineBanner();

        expect(host.streamDegradedReason, 'a sibling has no standing to retract this cause').toBe('fleet activity source not wired');

        const text = banner.calls.at(-1).text;

        expect(text).toContain('fleet activity source not wired');
        expect(text, 'the lie the retained reason exists to prevent').not.toContain('Fleet server offline')
    });

    test('an OLDER failed completion never overwrites a NEWER success — @neo-gpt\'s second probe', async () => {
        // The interval re-drives both seams, so two reads of the SAME surface are in flight at once
        // and complete in any order. Without a fence the LOSER writes last: a slow failure landing
        // after a fast success regresses live → stale on strictly older news, and the banner names a
        // degrade that already recovered. The catch is not exempt from ordering just because it is
        // the sad path — that is the branch this pins.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        let releaseSlow;
        const slow = new Promise((resolve, reject) => { releaseSlow = () => reject(new Error('stale transport lost')) });

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity: () => slow}};
        const slowRead = host.loadActivity();       // read 1 — in flight, will FAIL
        await new Promise(resolve => setTimeout(resolve, 0));   // read 1 must reach the old method first

        // read 2 starts and wins outright while read 1 is still hanging
        globalThis.AgentOS.fleet.registryBridge.fleetActivity = async () => ({capability: {state: 'wired'}, events: []});
        await host.loadActivity();

        expect(host.streamAdapterState).toBe('live');

        releaseSlow();                              // read 1 finally fails, LATE
        await slowRead;

        expect(host.streamAdapterState, 'older news must not unseat newer truth').toBe('live');
        expect(host.streamDegradedReason ?? null, 'a superseded read may not name a degrade').toBe(null);
        expect(banner.calls.at(-1).hidden, 'nor repaint the banner it was not allowed to write').toBe(true);

        delete globalThis.AgentOS.fleet
    });

    test('an OLDER SUCCESS never unseats a NEWER loss — the inverse he also named', async () => {
        // His case 1, and the one my first fence witness missed: I pinned "older FAILURE after newer
        // success" and stopped, because that was the direction that felt dangerous. The fence is
        // symmetric and the ordering rule has no favourite outcome — a stale SUCCESS overwriting a
        // fresh loss is the same defect wearing good news, and it is arguably worse: it paints the
        // spine live while the transport is down.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        let releaseSlow;
        const slow = new Promise(resolve => { releaseSlow = () => resolve({capability: {state: 'wired'}, events: []}) });

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity: () => slow}};
        const slowRead = host.loadActivity();       // read 1 — in flight, will SUCCEED
        // the bridge is invoked a microtask in, so read 1 must actually REACH it before the swap —
        // otherwise read 1 silently picks up read 2's method and the test proves nothing
        await new Promise(resolve => setTimeout(resolve, 0));

        // read 2 starts and loses the transport while read 1 still hangs
        globalThis.AgentOS.fleet.registryBridge.fleetActivity = async () => { throw new Error('transport lost') };
        await host.loadActivity();

        expect(host.streamAdapterState).toBe('stale');

        releaseSlow();                              // read 1 finally succeeds, LATE
        await slowRead;

        expect(host.streamAdapterState, 'stale good news must not claim the spine is live').toBe('stale');
        expect(host.streamDegradedReason).toBe('transport lost');

        delete globalThis.AgentOS.fleet
    });

    test('a newer ABSENCE invalidates an older pending success — @neo-gpt\'s early-return clause', async () => {
        // His second clause. The generation bump used to sit AFTER the no-bridge guard, so a tick
        // that found the bridge gone returned silently without claiming a generation — and an
        // in-flight read from when the bridge was still there came back and wrote. Absence is newer
        // knowledge; an early return is still a read attempt and must invalidate its predecessor.
        //
        // The guard order was the bug, not the guard: I had put the cheap check first out of habit,
        // which is exactly where it costs the most.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        // seeded to the SEED so the dropped write is observable: the host defaults to 'live', where
        // "must not become live" cannot discriminate — it was never anything else. Read 1 would set
        // live; the fence must leave this at 'sample'.
        host.streamAdapterState = 'sample';

        let releaseSlow;
        const slow = new Promise(resolve => { releaseSlow = () => resolve({capability: {state: 'wired'}, events: []}) });

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity: () => slow}};
        const slowRead = host.loadActivity();       // read 1 — in flight while the bridge exists
        await new Promise(resolve => setTimeout(resolve, 0));   // read 1 must reach the bridge first

        delete globalThis.AgentOS.fleet;            // the bridge disappears
        await host.loadActivity();                  // read 2 — early-returns on absence, but CLAIMS a generation

        releaseSlow();                              // read 1 lands, LATE, with news from a vanished bridge
        await slowRead;

        expect(host.streamAdapterState, 'a read from a bridge that no longer exists must not claim live').toBe('sample')
    });

    test('a read completing after destroy mutates NOTHING — no post-destroy writes', async () => {
        const banner = makeBanner(),
              host   = makeLivenessHost(banner);

        let releaseSlow;
        const slow = new Promise(resolve => { releaseSlow = () => resolve({capability: {state: 'degraded', reason: 'late'}, events: []}) });

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity: () => slow}};
        const inFlight = host.loadActivity();

        host.isDestroyed = true;                    // the owner goes away mid-read
        releaseSlow();
        await inFlight;

        // a timer that outlives its owner is a liar with no one left to correct it — and so is a read
        expect(host.streamAdapterState).toBe('live');
        expect(host.streamDegradedReason ?? null).toBe(null);
        expect(banner.calls, 'a dead surface renders nothing').toHaveLength(0);

        delete globalThis.AgentOS.fleet
    });

    test('hostile markup in a reason renders INERT — the sink is text, never html', async () => {
        // The reason is a RETAINED TRANSPORT STRING: it arrives over the fleet wire from the
        // adapter, so it is attacker-adjacent input, not our copy. `syncSpineBanner` used to write
        // it with `html:` — an innerHTML sink — which would execute markup a reason carried.
        //
        // `toSafeDegradedReason` does NOT save you here and that is the trap worth pinning: it
        // redacts SECRETS (bearer tokens, credentials). It is a redactor, not a markup escaper, and
        // mistaking one for the other is how a reason becomes a script tag. The fix is the sink, not
        // more regex: `text` routes to `textContent` — data, never code.
        const banner = makeBanner(),
              host   = makeLivenessHost(banner),
              markup = '<img src=x onerror="alert(1)">';

        await withBridge(async () => { throw new Error(`transport lost ${markup}`) }, host);

        const call = banner.calls.at(-1);

        // the sink itself is the assertion: an `html` key here is the defect, whatever it contains
        expect(call.html, 'the banner must never write an innerHTML sink').toBeUndefined();
        expect(call.text).toContain('transport lost');
        // the reason is relayed VERBATIM as text — not stripped. Escaping is the sink's job, and
        // stripping would quietly corrupt a legitimate reason that happens to contain a bracket.
        expect(call.text).toContain(markup)
    });

    test('a missing slot is a guarded no-op — never a throw', () => {
        expect(() => makeHost('sample', 'sample', null).syncSpineBanner()).not.toThrow()
    })
});

/**
 * The liveness owner's LIFECYCLE witness. A transition matrix proves the owner tells the truth while
 * it runs; this proves it stops running. A leaked interval would keep re-polling the bridge on behalf
 * of a destroyed cockpit and write states onto detached children — a timer that outlives its owner is
 * a liar with no one left to correct it.
 *
 * The destroy that matters is the ordinary one, the shell tearing this view down. NOT pop-out: that
 * path reparents the AgentDetail into a vessel and leaves the cockpit alive as its holder
 * (reparent-never-recreate), so the timer must SURVIVE it — stopping there would strand the surface
 * it still speaks for. Start-idempotence is the guard for that direction: a reattach that re-ran
 * start on a live cockpit would silently double the poll rate against the bridge.
 */
test.describe('Fleet cockpit — the liveness owner lifecycle (start/stop, #15293)', () => {
    let FleetCockpit;

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    /**
     * @summary A host wired to the REAL start/stop with counting timer primitives — the leak is
     * observable as a set/clear imbalance, not inferred from reading the source.
     */
    const makeTimerHost = () => {
        const cleared = [];
        let   nextId  = 0;

        // `loadActivity` / `loadRoster` return PROMISES because the real ones are `async` and
        // `startLiveness` chains `.finally()` to release the overlap latch — a void fake would throw
        // on the first tick. The `*ReadInFlight` pair mirrors the class defaults the latch reads.
        return {
            cleared,
            polls                  : 0,
            brainReads             : 0,
            brainHealthReadInFlight: 0,
            gridReadInFlight       : 0,
            livenessPollInterval   : 50,
            livenessTimerId        : null,
            maxReadsInFlight       : 2,
            streamReadInFlight     : 0,
            loadActivity() { this.polls++; return Promise.resolve() },
            // the third seam counts separately: the wire-read expectations stay untouched by it
            loadBrainHealth() { this.brainReads++; return Promise.resolve() },
            loadRoster()   { this.polls++; return Promise.resolve() },
            // the fourth tick seam (viewer wake rebind) launches no wire read — modeled as a
            // plain no-op so the wire-read balance assertions stay exact
            ensureViewerWakeStream() {},
            startLiveness: FleetCockpit.prototype.startLiveness,
            stopLiveness : FleetCockpit.prototype.stopLiveness,
            // counting stand-ins: the real ones are globals, and the assertion is about balance
            _setInterval  : () => ++nextId,
            _clearInterval: id => cleared.push(id)
        }
    };

    test('start is idempotent: a second call never stacks a second timer', () => {
        const host     = makeTimerHost(),
              original = globalThis.setInterval;

        globalThis.setInterval = host._setInterval;

        try {
            host.startLiveness();
            const first = host.livenessTimerId;

            host.startLiveness();
            host.startLiveness();

            // a stacked timer would double the poll rate against the bridge for the same cockpit
            expect(host.livenessTimerId).toBe(first)
        } finally {
            globalThis.setInterval = original
        }
    });

    test('a SYNCHRONOUS bridge throw releases the wire slot — @neo-gpt\'s sync-throw falsifier', async () => {
        // The leak I built inside the fix for the leak. `Promise.resolve(bridge.fleetActivity())`
        // evaluates the CALL first, so a synchronous throw reaches loadActivity's catch before
        // `boundedRead` attaches its settle hook — the counter goes up and never comes down. Two
        // throws consume the cap and this surface never probes again.
        //
        // His numbers at 2313675141: wireReads 2 (expected 3), streamReadInFlight 2 (expected 0).
        // The repair invokes INSIDE the chain, so a sync throw rejects the tracked promise and the
        // reject path owns the release.
        const stream = {adapterState: 'live', set() {}},
              host   = {
                  ...makeTimerHost(),
                  ...makeActivityStoreHarness(),
                  clearDegradedReason : FleetCockpit.prototype.clearDegradedReason,
                  degradeWiredSurface : FleetCockpit.prototype.degradeWiredSurface,
                  getReference        : reference => reference === 'activity-stream' ? stream : null,
                  maxReadsInFlight    : 2,
                  streamAdapterState  : 'live',
                  streamDegradedReason: null,
                  streamReadGeneration: 0,
                  streamReadInFlight  : 0,
                  syncSpineBanner     : FleetCockpit.prototype.syncSpineBanner
              };

        let tick, wireReads = 0;

        host.livenessReadTimeout = 5;
        host.loadActivity        = FleetCockpit.prototype.loadActivity;
        host.loadRoster          = () => Promise.resolve();

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity() {
            wireReads++;
            throw new Error('sync boom')            // SYNCHRONOUS, never a rejected promise
        }}};

        const originalSetInterval = globalThis.setInterval;
        globalThis.setInterval = fn => { tick = fn; return 1 };

        try {
            host.startLiveness();

            for (let i = 0; i < 3; i++) {
                tick();
                await new Promise(resolve => setTimeout(resolve, 10))
            }

            expect(host.streamReadInFlight, 'a sync throw must not strand its slot').toBe(0);
            expect(wireReads, 'and the surface must keep probing, not seize after two throws').toBe(3);
            expect(host.streamAdapterState, 'the throw still degrades honestly').toBe('stale')
        } finally {
            globalThis.setInterval = originalSetInterval;
            delete globalThis.AgentOS.fleet
        }
    });

    test('five ticks against a hung WIRE launch a BOUNDED number of reads — @neo-gpt\'s 5-tick falsifier', async () => {
        // His probe, and it falsified a claim I had made to him in writing: I said max-in-flight was
        // "1 per surface by construction". It was 1 per WRAPPER. `boundedRead`'s race settles its own
        // promise on timeout, so the slot freed while the underlying read kept hanging — 5 ticks, 5
        // hung reads, 0 settled. I closed the freeze and re-opened the accumulation, then asserted
        // the opposite.
        //
        // The count now tracks the WIRE (`onWireSettled`), so a timed-out wrapper does not pretend
        // the socket came back. Capped above 1 because with no abort seam a single slot cannot both
        // bound accumulation AND survive a permanent hang: one hang would hold the only slot forever.
        const stream = {adapterState: 'live', set() {}},
              host   = {
                  ...makeTimerHost(),
                  ...makeActivityStoreHarness(),
                  clearDegradedReason : FleetCockpit.prototype.clearDegradedReason,
                  degradeWiredSurface : FleetCockpit.prototype.degradeWiredSurface,
                  getReference        : reference => reference === 'activity-stream' ? stream : null,
                  maxReadsInFlight    : 2,
                  streamAdapterState  : 'live',
                  streamDegradedReason: null,
                  streamReadGeneration: 0,
                  streamReadInFlight  : 0,
                  syncSpineBanner     : FleetCockpit.prototype.syncSpineBanner
              };

        let tick, wireReads = 0;   // 5-tick

        host.livenessReadTimeout = 5;
        host.loadActivity        = FleetCockpit.prototype.loadActivity;
        host.loadRoster          = () => Promise.resolve();

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity: () => {
            wireReads++;
            return new Promise(() => {})            // EVERY read hangs forever — nothing settles
        }}};

        const originalSetInterval = globalThis.setInterval;
        globalThis.setInterval = fn => { tick = fn; return 1 };

        try {
            host.startLiveness();

            for (let i = 0; i < 5; i++) {
                tick();
                await new Promise(resolve => setTimeout(resolve, 15))   // outlive the bounded window
            }

            // the wrapper timing out must NOT be mistaken for the wire returning
            expect(wireReads, 'five ticks against a hung wire must not launch five reads').toBeLessThanOrEqual(host.maxReadsInFlight);
            expect(host.streamReadInFlight, 'the cap must never grow').toBeLessThanOrEqual(host.maxReadsInFlight);
            // and the surface still told the truth while the wire hung
            expect(host.streamAdapterState).toBe('stale')
        } finally {
            globalThis.setInterval = originalSetInterval;
            delete globalThis.AgentOS.fleet
        }
    });

    test('a read that NEVER settles must not freeze the surface — @neo-gpt\'s latch falsifier', async () => {
        // I fixed unbounded accumulation and introduced permanent freeze. His words, and they're
        // exact: "the surface can stay last-known live forever, which recreates the original defect."
        //
        // The latch releases in a `.finally()`. A promise that never settles never runs it, so the
        // slot is held FOREVER and every later tick is suppressed — including the one that would
        // have noticed the transport recovering. A liveness owner that stops polling is the precise
        // thing this ticket exists to prevent, rebuilt from the other side by its own guard.
        //
        // The bound is what makes the latch safe to hold: a read may fail, it may never hang — the
        // same contract `detailVesselConnectWindowMs` already states for the vessel admission.
        // drives the REAL loadActivity against a REAL hanging bridge — the fake read of an earlier
        // draft would have replaced the very `boundedRead` under test with a stub of my own optimism
        const stream = {adapterState: 'live', set() {}},
              host   = {
                  ...makeTimerHost(),
                  ...makeActivityStoreHarness(),
                  clearDegradedReason : FleetCockpit.prototype.clearDegradedReason,
                  degradeWiredSurface : FleetCockpit.prototype.degradeWiredSurface,
                  getReference        : reference => reference === 'activity-stream' ? stream : null,
                  streamAdapterState  : 'live',
                  streamDegradedReason: null,
                  streamReadGeneration: 0,
                  streamReadInFlight  : 0,
                  syncSpineBanner     : FleetCockpit.prototype.syncSpineBanner
              };

        let tick, calls = 0;

        host.livenessReadTimeout = 5;                 // short window; the spec pins it, never sleeps on prod
        host.loadActivity        = FleetCockpit.prototype.loadActivity;
        host.loadRoster          = () => Promise.resolve();

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {fleetActivity: () => {
            calls++;
            // read 1 hangs FOREVER; later reads answer at once — the recovery this must find
            return calls === 1 ? new Promise(() => {}) : Promise.resolve({capability: {state: 'wired'}, events: []})
        }}};

        const originalSetInterval = globalThis.setInterval;
        globalThis.setInterval = fn => { tick = fn; return 1 };

        try {
            host.startLiveness();

            tick();                                            // read 1 — hangs forever
            // the bridge is now invoked INSIDE the promise chain (so a sync throw rejects rather
            // than escaping), which means the call lands a microtask after the tick. Asserting
            // synchronously here read 0 and blamed the code for my own timing assumption.
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(calls).toBe(1);

            await new Promise(resolve => setTimeout(resolve, 40));   // outlive the bounded window

            tick();                                            // the transport recovered; this MUST probe
            await new Promise(resolve => setTimeout(resolve, 0));   // the bridge call is a microtask in
            expect(calls, 'a hung read must not suppress the probe that would notice recovery').toBe(2);

            await new Promise(resolve => setTimeout(resolve, 40));

            tick();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(calls, 'and liveness must keep running, not limp once').toBe(3)
        } finally {
            globalThis.setInterval = originalSetInterval;
            delete globalThis.AgentOS.fleet
        }
    });

    test('a tick never launches past the cap for that surface (pinned at 1 here)', async () => {
        // @neo-gpt's fourth finding, and the one the generation fence does NOT reach: the fence makes
        // a late read HARMLESS, not ABSENT. A transport slower than the 15s cadence would have every
        // tick launch another pair regardless of the unresolved prior one — unbounded in-flight reads
        // against a bridge already failing to answer, which is exactly when piling on is worst.
        // Skipping a tick costs nothing: the next reads the same live truth, only later.
        const host     = makeTimerHost(),
              original = globalThis.setInterval;

        let tick, releaseActivity;

        // pinned at 1 so the cap's edge is the assertion. Production runs 2 — a single slot cannot
        // both bound accumulation and survive a permanent hang, which is the whole reason the cap
        // exists rather than a boolean. The RULE is the cap; this pins its boundary at its tightest.
        host.maxReadsInFlight = 1;
        host.loadActivity     = function() {
            this.polls++;
            this.streamReadInFlight++;                                     // the launcher counts the WIRE
            return new Promise(resolve => { releaseActivity = () => { this.streamReadInFlight--; resolve() } })
        };
        globalThis.setInterval = fn => { tick = fn; return 1 };

        try {
            // the latch releases in a `.finally()`, i.e. on a MICROTASK — so a tick must be given a
            // drain before the next, exactly as the real 15s cadence does. My first version fired
            // both ticks synchronously and saw the ROSTER suppressed too: correct behaviour (its
            // latch had not released yet) against a specimen that modelled no time passing at all.
            const drain = async () => { await Promise.resolve(); await Promise.resolve() };

            host.startLiveness();

            tick();                                   // tick 1 launches both; activity hangs
            expect(host.polls).toBe(2);
            await drain();                            // roster resolved; its latch releases

            tick();                                   // tick 2 — activity is STILL unresolved
            expect(host.polls, 'a second activity read must not stack on an unresolved one').toBe(3); // roster only
            await drain();

            releaseActivity();
            await drain();                            // activity finally settles; its latch releases

            tick();                                   // tick 3 — the surface is free again
            expect(host.polls, 'suppression must not be permanent — it is a skip, not a stop').toBe(5)
        } finally {
            globalThis.setInterval = original
        }
    });

    test('stop clears the timer exactly once and is safe on a never-started cockpit', () => {
        const host          = makeTimerHost(),
              originalSet   = globalThis.setInterval,
              originalClear = globalThis.clearInterval;

        globalThis.setInterval   = host._setInterval;
        globalThis.clearInterval = host._clearInterval;

        try {
            // never started → nothing to clear, and no throw
            expect(() => host.stopLiveness()).not.toThrow();
            expect(host.cleared).toHaveLength(0);

            host.startLiveness();
            const id = host.livenessTimerId;

            host.stopLiveness();
            expect(host.cleared).toEqual([id]);
            expect(host.livenessTimerId, 'a stale id would make a later stop clear a stranger timer').toBe(null);

            // exact-once: a second stop is a no-op, never a double-clear
            host.stopLiveness();
            expect(host.cleared).toEqual([id]);

            // and the cockpit can start again cleanly after a stop (the reattach path)
            host.startLiveness();
            expect(host.livenessTimerId).not.toBe(null)
        } finally {
            globalThis.setInterval   = originalSet;
            globalThis.clearInterval = originalClear
        }
    });

    test('the owner actually re-drives the real seams on the cadence', async () => {
        const host = makeTimerHost();

        host.livenessPollInterval = 10;
        host.startLiveness();

        try {
            // the daemon surface has no other first load — arming the owner IS its first read
            expect(host.brainReads, 'the immediate first Brain read must not wait a full cadence').toBe(1);

            await new Promise(resolve => setTimeout(resolve, 45));

            // both wire seams, every tick: re-driving the real verbs IS the mechanism
            expect(host.polls, 'the owner must poll, not just hold a timer id').toBeGreaterThanOrEqual(4);

            // the third seam rides the same cadence: immediate read plus tick re-reads. Overlap and
            // hang behavior are witnessed by the never-settle tests below against REAL promises —
            // never by assigning the in-flight field here.
            expect(host.brainReads, 'the Brain read must re-drive on the cadence, not just once').toBeGreaterThanOrEqual(2)
        } finally {
            host.stopLiveness()
        }
    });

    /**
     * @summary Builds a host wired to the REAL loadBrainHealth with a controllable Neo.Main mock.
     * Returns the host, the recorded apply calls, and the hung wires' resolvers — so the tests can
     * settle a wire deliberately instead of ever assigning the in-flight field.
     */
    const makeBrainReadHost = ({timeout}) => {
        const
            applied = [],
            wires   = [],
            host    = {
                applied,
                wires,
                brainHealthReadGeneration: 0,
                brainHealthReadInFlight  : 0,
                isDestroyed              : false,
                livenessReadTimeout      : timeout,
                maxReadsInFlight         : 2,
                applyBrainHealth(response) { applied.push(response) },
                loadBrainHealth: FleetCockpit.prototype.loadBrainHealth
            };

        return host
    };

    const withMainMock = async (host, run) => {
        const hadNeo   = Boolean(globalThis.Neo),
              original = globalThis.Neo?.Main;

        (globalThis.Neo ??= {}).Main = {brainHealth: () => new Promise(resolve => host.wires.push(resolve))};

        try {
            await run()
        } finally {
            if (original === undefined) { delete globalThis.Neo.Main } else { globalThis.Neo.Main = original }
            if (!hadNeo) { delete globalThis.Neo }
        }
    };

    test('a Brain read that NEVER settles must not freeze the surface — bounded slot, capped wires', async () => {
        const host = makeBrainReadHost({timeout: 20});

        await withMainMock(host, async () => {
            // the first read hangs: the bounded race frees the CALLER on the timeout…
            const first = host.loadBrainHealth();

            expect(host.brainHealthReadInFlight).toBe(1);
            await first;

            expect(host.applied, 'the timed-out read lands as transport truth').toEqual([null]);
            // …while the WIRE never settled, so its slot stays counted — the accumulation bound
            expect(host.brainHealthReadInFlight).toBe(1);

            // the surface is NOT frozen: a second read launches under the cap and hangs too
            await host.loadBrainHealth();
            expect(host.brainHealthReadInFlight).toBe(2);

            // two hung wires reach the cap: the tick guard now suppresses — bounded, never a stop
            expect(host.brainHealthReadInFlight < host.maxReadsInFlight).toBe(false);

            // a hung wire finally answering releases its slot but its answer goes nowhere
            host.applied.length = 0;
            host.wires[0]({cause: null, state: 'running'});
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(host.applied, 'a wire the race already dropped never writes').toEqual([]);
            expect(host.brainHealthReadInFlight, 'its settle still frees the slot').toBe(1)
        })
    });

    test('a slow Brain answer landing after a newer read never writes — the generation fence', async () => {
        const host = makeBrainReadHost({timeout: 500});

        await withMainMock(host, async () => {
            const slow = host.loadBrainHealth(),
                  fast = host.loadBrainHealth();

            // the mock's invoke sits one microtask deep (the sync-throw guard wraps it in a
            // resolved-promise chain), so the wires materialize only after a flush
            await expect.poll(() => host.wires.length).toBe(2);

            // the NEWER read answers first with current truth
            host.wires[1]({cause: null, state: 'running'});
            await fast;
            expect(host.applied).toEqual([{cause: null, state: 'running'}]);

            // the STALE wire answers late — inside its timeout window, but past its generation
            host.wires[0]({cause: {detail: 'stale news', observedAt: 1, source: 'owned-child-termination'}, state: 'degraded'});
            await slow;

            expect(host.applied, 'older news never overwrites newer truth').toEqual([{cause: null, state: 'running'}]);
            expect(host.brainHealthReadInFlight, 'both wires settled, both slots free').toBe(0)
        })
    })
});

/**
 * Covers the cockpit-owned wake-routes read (`loadWakeRoutes`): the memories-sibling loader under
 * the same three laws — a typed unavailable envelope for an unwired or throwing bridge (never
 * fabricated seats), the generation fence (a slow older read never overwrites a newer one), and
 * write-time pane resolution (the accepted truth reaches the LIVE pane, and an owner-held snapshot
 * survives pane rematerialization). Prototype-call harness; the bridge mock is scoped to the
 * `fleet` subkey only, per the loadActivity block's discipline.
 */
test.describe('Fleet cockpit — the wake-routes read (loadWakeRoutes)', () => {
    let FleetCockpit;

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    const clearFleetBridge = () => { delete globalThis.AgentOS?.fleet };
    const setFleetBridge   = bridge => { (globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge} };

    const makeHost = pane => ({
        isDestroyed             : false,
        wakeRoutesReadGeneration: 0,
        wakeRoutesSnapshot      : null,
        getWakeRoutesPane       : () => pane,
        getReference            : reference => reference === 'wakeRoutes' ? pane : null,
        loadWakeRoutes          : FleetCockpit.prototype.loadWakeRoutes
    });

    test('an unwired verb lands as a typed unavailable envelope on the owner AND the live pane', async () => {
        clearFleetBridge();

        const pane = {snapshot: null},
              host = makeHost(pane);

        const snapshot = await host.loadWakeRoutes();

        expect(snapshot.capability).toEqual({state: 'unavailable', reason: 'fleet wake-routes verb not wired'});
        expect(snapshot.seats).toEqual([]);
        expect(host.wakeRoutesSnapshot).toBe(snapshot);
        expect(pane.snapshot).toBe(snapshot)
    });

    test('a throwing bridge is transport truth, never fabricated seats', async () => {
        setFleetBridge({fleetWakeRoutes: () => { throw new Error('boom') }});

        try {
            const host     = makeHost(null),
                  snapshot = await host.loadWakeRoutes();

            expect(snapshot.capability.reason).toBe('fleet wake-routes read failed');
            expect(snapshot.seats).toEqual([])
        } finally {
            clearFleetBridge()
        }
    });

    test('the generation fence: a slow older read never overwrites the newer accepted truth', async () => {
        const wires = [];

        setFleetBridge({fleetWakeRoutes: () => new Promise(resolve => wires.push(resolve))});

        try {
            const pane = {snapshot: null},
                  host = makeHost(pane);

            const slow = host.loadWakeRoutes(),
                  fast = host.loadWakeRoutes();

            const newer = {capability: {state: 'wired'}, count: 1, seats: [{agentIdentity: '@a'}]},
                  older = {capability: {state: 'wired'}, count: 9, seats: []};

            wires[1](newer);
            await fast;
            expect(host.wakeRoutesSnapshot).toBe(newer);
            expect(pane.snapshot).toBe(newer);

            wires[0](older);
            await slow;
            expect(host.wakeRoutesSnapshot, 'the loser never writes').toBe(newer);
            expect(pane.snapshot).toBe(newer)
        } finally {
            clearFleetBridge()
        }
    })
});

/**
 * Covers the cockpit-owned tasks read (`loadTasks`): the wake-routes loader's three laws (typed
 * unavailable envelope, generation fence, write-time pane resolution) PLUS the liveness tick's
 * in-flight accounting — the count rises before the wire call and is released on that read's OWN
 * settle, so a slow snapshot read is never stacked by the next tick and a newer read never
 * releases an older one's slot. Prototype-call harness, bridge mock scoped to the `fleet` subkey.
 */
test.describe('Fleet cockpit — the tasks read (loadTasks)', () => {
    let FleetCockpit;

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    const clearFleetBridge = () => { delete globalThis.AgentOS?.fleet };
    const setFleetBridge   = bridge => { (globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge} };

    const makeHost = pane => ({
        isDestroyed        : false,
        tasksReadGeneration: 0,
        tasksReadInFlight  : 0,
        tasksSnapshot      : null,
        getTasksPane       : () => pane,
        getReference       : reference => reference === 'tasks' ? pane : null,
        loadTasks          : FleetCockpit.prototype.loadTasks
    });

    test('an unwired verb lands as a typed unavailable envelope on the owner AND the live pane', async () => {
        clearFleetBridge();

        const pane = {snapshot: null},
              host = makeHost(pane);

        const snapshot = await host.loadTasks();

        expect(snapshot.capability).toEqual({state: 'unavailable', reason: 'fleet tasks verb not wired'});
        expect(snapshot.running).toEqual([]);
        expect(snapshot.queued).toEqual([]);
        expect(snapshot.recent).toEqual([]);
        expect(host.tasksSnapshot).toBe(snapshot);
        expect(pane.snapshot).toBe(snapshot);
        expect(host.tasksReadInFlight, 'released on settle').toBe(0)
    });

    test('a throwing bridge is transport truth, never fabricated rows — and still releases its slot', async () => {
        setFleetBridge({fleetTasks: () => { throw new Error('boom') }});

        try {
            const host     = makeHost(null),
                  snapshot = await host.loadTasks();

            expect(snapshot.capability.reason).toBe('fleet tasks read failed');
            expect(snapshot.counts).toEqual({running: 0, queued: 0, recent: 0});
            expect(host.tasksReadInFlight).toBe(0)
        } finally {
            clearFleetBridge()
        }
    });

    test('the generation fence + in-flight accounting: the loser never writes, each read releases only itself', async () => {
        const wires = [];

        setFleetBridge({fleetTasks: () => new Promise(resolve => wires.push(resolve))});

        try {
            const pane = {snapshot: null},
                  host = makeHost(pane);

            const slow = host.loadTasks(),
                  fast = host.loadTasks();

            expect(host.tasksReadInFlight, 'two unsettled reads on the wire').toBe(2);

            const newer = {capability: {state: 'wired'}, running: [{id: 'a'}], queued: [], recent: []},
                  older = {capability: {state: 'wired'}, running: [], queued: [], recent: []};

            wires[1](newer);
            await fast;
            expect(host.tasksSnapshot).toBe(newer);
            expect(pane.snapshot).toBe(newer);
            expect(host.tasksReadInFlight, 'the slow read still holds its slot').toBe(1);

            wires[0](older);
            await slow;
            expect(host.tasksSnapshot, 'the loser never writes').toBe(newer);
            expect(pane.snapshot).toBe(newer);
            expect(host.tasksReadInFlight).toBe(0)
        } finally {
            clearFleetBridge()
        }
    })
});

/**
 * Covers the app-side operator-mailbox seam on `FleetCockpit` — the three methods the
 * composition root owns so the operator is a first-class Fleet participant:
 *
 * - `composeOperatorMessage` — the WRITE: route one composed message to the authenticated verb, then
 *   re-poll ONLY on a real send. Its unit is the routing + conditional re-read decision, so the bridge
 *   verb and the re-read (`loadOperatorInbox`) are both spied — this isolates "did it send, and did it
 *   re-read exactly when a message actually landed" from how either collaborator behaves.
 * - `buildOperatorRecipientOptions` — the pure roster→picker mapping: the mailbox IDENTITY
 *   (`@githubUsername`), never the Fleet `agentId` key. The fixture makes the two fields DIFFER so a
 *   read of the wrong one fails the test rather than passing by coincidence.
 * - `loadOperatorInbox` — the READ-OBSERVE own-inbox twin of `AgentDetail.loadMailboxMirror`: the
 *   fail-closed matrix (no identity / no verb → honestly unobserved) plus BOTH fences (a superseded
 *   generation and a destroyed owner never write). The runtime source of `operatorRecord` is wired
 *   separately; the method's routing is fully pinned here by setting the identity owner-side.
 *
 * Same lightweight harness as the `loadActivity` block above: a plain fake cockpit + the prototype
 * method under `.call`, so each method's decision is exercised in isolation with no full instantiation.
 */
test.describe('Fleet cockpit — operator mailbox (compose · recipients · own-inbox read, #15377)', () => {
    let FleetCockpit, FleetCockpitController;

    // scope the mock to the `fleet` subkey ONLY (see the loadActivity block): replacing `globalThis.AgentOS`
    // would wipe every `AgentOS.*` registration for later specs in the shared worker.
    const clearBridge = () => { delete globalThis.AgentOS?.fleet };
    const setBridge   = bridge => { (globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge} };

    // a fake owner for the compose seam: it records what `loadOperatorInbox` is (or is not) called with,
    // so the re-poll decision is assertable without dragging in the real read's pane/subject/bridge machinery.
    const makeComposeOwner = () => ({
        inboxReloads: [],
        loadOperatorInbox(params) { this.inboxReloads.push(params); return Promise.resolve() }
    });

    // a fake owner for the read seam: a spy pane, an owner-held identity, the generation counter, and the
    // last-known snapshot — exactly the surface `loadOperatorInbox` reads and writes.
    const makeReadOwner = ({subject = 'NODE:operator', priorSnapshot = null, generation = 0, isDestroyed = false} = {}) => {
        const pane    = {snapshot: priorSnapshot},
              cockpit = {
                  getOperatorMailboxPane     : () => pane,
                  operatorRecord             : subject ? {agentIdentityNodeId: subject} : null,
                  operatorSnapshot           : priorSnapshot,
                  operatorInboxReadGeneration: generation,
                  isDestroyed
              };

        return {pane, cockpit}
    };

    test.beforeAll(async () => {
        FleetCockpit           = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default;
        FleetCockpitController = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Controller.mjs')).default
    });

    test.afterEach(() => clearBridge());

    // --- composeOperatorMessage: fail-closed refusal + conditional canonical re-read -------------------

    test('compose · no bridge → honest per-recipient not-wired refusal, nothing sent, no re-poll', async () => {
        clearBridge();

        const owner   = makeComposeOwner(),
              outcome = await FleetCockpit.prototype.composeOperatorMessage.call(owner, {to: 'AGENT:*', body: 'hi'});

        // one result per target, each an honest not-wired refusal — the surface renders each recipient's state
        expect(outcome).toEqual({results: [{to: 'AGENT:*', outcome: {status: 'not-wired', reason: 'fleet: operator compose verb not wired'}}]});
        expect(owner.inboxReloads, 'a refused send must not re-poll the inbox').toHaveLength(0)
    });

    test('compose · a bridge without composeOperatorMessage → the same not-wired refusal', async () => {
        setBridge({});

        const owner   = makeComposeOwner(),
              outcome = await FleetCockpit.prototype.composeOperatorMessage.call(owner, {to: 'AGENT:*', body: 'hi'});

        expect(outcome).toEqual({results: [{to: 'AGENT:*', outcome: {status: 'not-wired', reason: 'fleet: operator compose verb not wired'}}]});
        expect(owner.inboxReloads).toHaveLength(0)
    });

    test('compose · a real send (messageId came back) passes the payload through UNCHANGED and re-polls once at offset 0', async () => {
        const seen = [];
        // frozen: if the cockpit tried to inject a sender field here (it must not — the server stamps it at
        // the authenticated ingress), strict-mode mutation of a frozen object would throw and fail the test
        const message = Object.freeze({to: '@neo-fable-vega', subject: 's', body: 'b', priority: 'high'});

        setBridge({composeOperatorMessage: async payload => { seen.push(payload); return {messageId: 'M:42', status: 'sent'} }});

        const owner   = makeComposeOwner(),
              outcome = await FleetCockpit.prototype.composeOperatorMessage.call(owner, message);

        // asserted against a fresh literal, not `message` itself, so an added/changed field would be caught;
        // the single target passes through with `to` set to that one recipient (never the list)
        expect(seen).toEqual([{to: '@neo-fable-vega', subject: 's', body: 'b', priority: 'high'}]);
        expect(outcome).toEqual({results: [{to: '@neo-fable-vega', outcome: {messageId: 'M:42', status: 'sent'}}]});
        // the ONLY re-read: from the top of the inbox, exactly once, because a message genuinely landed
        expect(owner.inboxReloads).toEqual([{offset: 0}])
    });

    test('compose · a rejected outcome (no messageId) returns honestly and re-polls NOTHING', async () => {
        setBridge({composeOperatorMessage: async () => ({status: 'rejected', reason: 'recipient unknown'})});

        const owner   = makeComposeOwner(),
              outcome = await FleetCockpit.prototype.composeOperatorMessage.call(owner, {to: '@ghost', body: 'b'});

        expect(outcome).toEqual({results: [{to: '@ghost', outcome: {status: 'rejected', reason: 'recipient unknown'}}]});
        expect(owner.inboxReloads, 'nothing was sent, so nothing changed to re-read').toHaveLength(0)
    });

    test('compose · SEVERAL named recipients FAN OUT — one call each, per-target outcome, one re-poll for the batch', async () => {
        const seen = [];
        // vega sends, ghost is rejected — a discriminating mix a single aggregate verdict could not produce
        setBridge({composeOperatorMessage: async payload => {
            seen.push(payload.to);
            return payload.to === '@ghost' ? {status: 'rejected', reason: 'recipient unknown'} : {messageId: 'M:' + payload.to, status: 'sent'}
        }});

        const owner   = makeComposeOwner(),
              outcome = await FleetCockpit.prototype.composeOperatorMessage.call(owner, {to: ['@neo-fable-vega', '@ghost'], subject: 's', body: 'b', priority: 'high'});

        // one authenticated call per named target, in order — the verb is one-target, the fan-out is the cockpit's
        expect(seen).toEqual(['@neo-fable-vega', '@ghost']);
        // each recipient carries its OWN result: vega landed, ghost was refused
        expect(outcome).toEqual({results: [
            {to: '@neo-fable-vega', outcome: {messageId: 'M:@neo-fable-vega', status: 'sent'}},
            {to: '@ghost',          outcome: {status: 'rejected', reason: 'recipient unknown'}}
        ]});
        // exactly one re-poll for the whole batch, because at least one message genuinely landed
        expect(owner.inboxReloads).toEqual([{offset: 0}])
    });

    test('compose · onOperatorCompose writes the settled outcome BACK onto the operator-mailbox — closes the loop', async () => {
        // the review's P1: the surface fires compose intent-only and Observable.fire discards handler
        // returns, so the fan-out result must return as owner-written state. This is the ONLY path it
        // reaches the UI — a probe mailbox catches the write-back.
        const mailbox    = {},
              controller = Object.create(FleetCockpitController.prototype);

        controller.component = {
            composeOperatorMessage: async () => ({results: [{to: '@a', outcome: {messageId: 'M', status: 'sent'}}]}),
            getReference          : ref => ref === 'operator-mailbox' ? mailbox : null
        };

        await controller.onOperatorCompose({message: {to: ['@a']}, source: 'operator-mailbox'});

        expect(mailbox.composeOutcome).toEqual({results: [{to: '@a', outcome: {messageId: 'M', status: 'sent'}}]})
    });

    // --- buildOperatorRecipientOptions: the live roster → @githubUsername identity mapping -------------

    test('recipients · no provider roster yet → only the broadcast sentinel', () => {
        const owner = {resolveFleetRosterStore: () => null};

        expect(FleetCockpit.prototype.buildOperatorRecipientOptions.call(owner)).toEqual([
            {id: 'AGENT:*', name: 'All agents (broadcast)'}
        ])
    });

    test('recipients · maps the LIVE roster to @githubUsername identities — NOT the agentId key — and drops rows with no mailbox identity', () => {
        // agentId ('vega') deliberately differs from githubUsername ('neo-fable-vega') so the test FAILS if the
        // mapping ever reads the wrong field; the third row has no githubUsername (an unregistered guest) and drops
        const items = [
            {agentId: 'vega',  githubUsername: 'neo-fable-vega'},
            {agentId: 'grace', githubUsername: 'neo-claude-opus'},
            {agentId: 'guest'}
        ];
        const owner = {resolveFleetRosterStore: () => ({items})};

        expect(FleetCockpit.prototype.buildOperatorRecipientOptions.call(owner)).toEqual([
            {id: 'AGENT:*',          name: 'All agents (broadcast)'},
            {id: '@neo-fable-vega',  name: 'neo-fable-vega'},
            {id: '@neo-claude-opus', name: 'neo-claude-opus'}
        ])
    });

    // --- loadOperatorInbox: fail-closed matrix + both fences ------------------------------------------

    test('inbox · no bound operator identity → stays honestly unobserved, but the read attempt still advances the generation', async () => {
        // a snapshot that must NOT land: proving the guard fires before any read
        setBridge({fleetMailboxMirror: async () => ({rows: ['should-not-land']})});

        const {pane, cockpit} = makeReadOwner({subject: null});

        await FleetCockpit.prototype.loadOperatorInbox.call(cockpit, {offset: 0});

        expect(pane.snapshot, 'no subject → the pane must not receive a fabricated snapshot').toBe(null);
        expect(cockpit.operatorSnapshot).toBe(null);
        // starting a read invalidates any older in-flight read even when THIS one fail-closes
        expect(cockpit.operatorInboxReadGeneration, 'the generation advances before the guard, so a slower older read cannot win').toBe(1)
    });

    test('inbox · a bridge without fleetMailboxMirror → fail-closed, no snapshot', async () => {
        setBridge({});

        const {pane, cockpit} = makeReadOwner();

        await FleetCockpit.prototype.loadOperatorInbox.call(cockpit, {offset: 0});

        expect(pane.snapshot).toBe(null)
    });

    test('inbox · pane + subject + verb → reads at the operator identity and offset, writes BOTH owner and pane', async () => {
        const seen     = [],
              snapshot = {rows: [{id: 'msg-1'}], offset: 20};

        setBridge({fleetMailboxMirror: async params => { seen.push(params); return snapshot }});

        const {pane, cockpit} = makeReadOwner();

        await FleetCockpit.prototype.loadOperatorInbox.call(cockpit, {offset: 20});

        // the subject is the operator's OWN identity, held owner-side; the offset threads through unchanged
        expect(seen).toEqual([{subjectAgentId: 'NODE:operator', offset: 20}]);
        expect(cockpit.operatorSnapshot).toBe(snapshot);
        expect(pane.snapshot).toBe(snapshot)
    });

    test('inbox · a gesture-torn mailbox resolves through its owner-held vessel handle', async () => {
        const docked  = {id: 'docked'},
              torn    = {id: 'torn'},
              cockpit = {
                  getReference      : reference => reference === 'operator-mailbox' ? docked : null,
                  tearOutPaneHandles: {operator: torn}
              };

        expect(FleetCockpit.prototype.getOperatorMailboxPane.call(cockpit)).toBe(torn)
    });

    test('inbox · a superseded read never overwrites newer news (generation fence)', async () => {
        const fresh = {rows: ['fresh']},
              stale = {rows: ['stale']};

        const {pane, cockpit} = makeReadOwner({priorSnapshot: fresh, generation: 5});

        // the verb bumps the owner's generation DURING the await — modelling a newer read that started and
        // finished while this one was in flight; when this stale read resumes, its captured generation no longer matches
        setBridge({fleetMailboxMirror: async () => { cockpit.operatorInboxReadGeneration++; return stale }});

        await FleetCockpit.prototype.loadOperatorInbox.call(cockpit, {offset: 0});

        expect(pane.snapshot, 'the loser of the race must not write staler news over newer').toBe(fresh);
        expect(cockpit.operatorSnapshot).toBe(fresh)
    });

    test('inbox · a read that resolves after the cockpit is destroyed writes nothing', async () => {
        const prior = {rows: ['prior']};

        const {pane, cockpit} = makeReadOwner({priorSnapshot: prior, isDestroyed: true});

        setBridge({fleetMailboxMirror: async () => ({rows: ['late']})});

        await FleetCockpit.prototype.loadOperatorInbox.call(cockpit, {offset: 0});

        expect(pane.snapshot).toBe(prior);
        expect(cockpit.operatorSnapshot).toBe(prior)
    });

    test('inbox · the verb throwing keeps the last-known snapshot (fail-closed catch)', async () => {
        const prior = {rows: ['prior']};

        const {pane, cockpit} = makeReadOwner({priorSnapshot: prior});

        setBridge({fleetMailboxMirror: async () => { throw new Error('ingress down') }});

        await FleetCockpit.prototype.loadOperatorInbox.call(cockpit, {offset: 0});

        // fail-closed: the pane never renders "no mail" for a read that did not happen
        expect(pane.snapshot).toBe(prior);
        expect(cockpit.operatorSnapshot).toBe(prior)
    });

    // --- loadOperatorIdentity: the whoami bootstrap (resolveViewerIdentity → seed → pane) --------------

    test('identity · no resolveViewerIdentity verb → fail-closed, no operatorRecord seeded', async () => {
        setBridge({});

        const cockpit = {operatorRecord: null, getReference: () => ({set() {}})};

        await FleetCockpit.prototype.loadOperatorIdentity.call(cockpit);

        expect(cockpit.operatorRecord).toBe(null)
    });

    test('identity · resolveViewerIdentity ok → seeds operatorRecord (incl. the githubUsername possession authority) AND pushes it to the pane', async () => {
        // a realistic @-form node id — the mailbox subject the adapter returns, not a `NODE:` placeholder
        setBridge({resolveViewerIdentity: async () => ({ok: true, agentIdentityNodeId: '@neo-opus-grace'})});

        const paneSets = [],
              pane     = {set(cfg) { paneSets.push(cfg) }},
              cockpit  = {
                  operatorRecord               : null,
                  deriveOperatorIdentityPosture: FleetCockpit.prototype.deriveOperatorIdentityPosture,
                  getReference                 : () => null,
                  getOperatorMailboxPane       : () => pane,
                  resolveFleetRosterStore      : () => null
              };

        await FleetCockpit.prototype.loadOperatorIdentity.call(cockpit);

        // the record MUST carry `githubUsername` — MailboxPane's possession guard canonicalizes it to
        // `@<username>` and matches the admission's subjectAgentId; seeding only the node id fails
        // possession closed and the own inbox never renders (the exact review finding).
        // The push also carries the seat-conflation posture (null here: no roster in this fake —
        // absence of roster truth is not a clean bill).
        const expected = {agentIdentityNodeId: '@neo-opus-grace', githubUsername: 'neo-opus-grace'};
        expect(cockpit.operatorRecord).toEqual(expected);
        expect(paneSets).toEqual([{record: expected, identityPosture: null}])
    });

    test('identity · a refusal (ok:false — unbound / source-not-wired) never seeds a wrong subject', async () => {
        setBridge({resolveViewerIdentity: async () => ({ok: false, error: 'viewer identity unbound — authenticated ingress required'})});

        const cockpit = {operatorRecord: null, getReference: () => ({set() {}})};

        await FleetCockpit.prototype.loadOperatorIdentity.call(cockpit);

        expect(cockpit.operatorRecord, 'a refusal leaves the pane honestly unobserved, never a fallback identity').toBe(null)
    });

    test('identity · a not-yet-materialized pane (torn, or dropped by a custom document) still seeds the record for a projection-time read', async () => {
        setBridge({resolveViewerIdentity: async () => ({ok: true, agentIdentityNodeId: '@neo-opus-grace'})});

        // the pane resolves null (the resident tab normally exists at identity time, but a torn
        // vessel mid-flight or a memories-less custom document leaves the accessor empty); the
        // `?.set` no-ops but the record is held owner-side (with the possession authority), so the
        // next projection materializes the pane and reads. The posture derive rides the same
        // resolution over the cockpit surface (an empty provider roster → null posture).
        const cockpit = {
            operatorRecord               : null,
            deriveOperatorIdentityPosture: FleetCockpit.prototype.deriveOperatorIdentityPosture,
            getReference                 : () => null,
            getOperatorMailboxPane       : () => null,
            resolveFleetRosterStore      : () => null
        };

        await FleetCockpit.prototype.loadOperatorIdentity.call(cockpit);

        expect(cockpit.operatorRecord).toEqual({agentIdentityNodeId: '@neo-opus-grace', githubUsername: 'neo-opus-grace'})
    });
});


test.describe('Fleet cockpit — operator-seat identity posture (the conflation honesty half)', () => {
    let FleetCockpit;

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    const derive = (viewerIdentity, rows) => FleetCockpit.prototype.deriveOperatorIdentityPosture.call(
        {resolveFleetRosterStore: () => ({items: rows})},
        viewerIdentity
    );

    const ROWS = [{agentId: 'neo-fable-clio'}, {agentId: 'neo-opus-vega'}, {agentId: 'neo-opus-ada'}];

    test('a viewer matching a roster agent identity is conflated; an outside viewer is clean', () => {
        expect(derive('@neo-fable-clio', ROWS)).toEqual({conflated: true, seatIdentity: '@neo-fable-clio'});
        expect(derive('@tobiu', ROWS)).toEqual({conflated: false, seatIdentity: '@tobiu'})
    });

    test('an empty roster answers null — absence of roster truth is not a clean bill', () => {
        expect(derive('@tobiu', [])).toBeNull();
        expect(derive(null, ROWS)).toBeNull();
        expect(derive('   ', ROWS)).toBeNull()
    });

    test('loadOperatorIdentity holds the posture owner-side and pushes record + posture through the accessor', async () => {
        const pushes = [],
              me     = {
                  isDestroyed                  : false,
                  deriveOperatorIdentityPosture: FleetCockpit.prototype.deriveOperatorIdentityPosture,
                  resolveFleetRosterStore      : () => ({items: ROWS}),
                  getOperatorMailboxPane       : () => ({set: config => pushes.push(config)})
              },
              previousNs = globalThis.AgentOS;

        globalThis.AgentOS = {fleet: {registryBridge: {
            resolveViewerIdentity: async () => ({ok: true, agentIdentityNodeId: '@neo-fable-clio'})
        }}};

        try {
            await FleetCockpit.prototype.loadOperatorIdentity.call(me);

            expect(me.operatorRecord).toEqual({agentIdentityNodeId: '@neo-fable-clio', githubUsername: 'neo-fable-clio'});
            expect(me.operatorIdentityPosture).toEqual({conflated: true, seatIdentity: '@neo-fable-clio'});
            expect(pushes).toEqual([{
                record         : {agentIdentityNodeId: '@neo-fable-clio', githubUsername: 'neo-fable-clio'},
                identityPosture: {conflated: true, seatIdentity: '@neo-fable-clio'}
            }])
        } finally {
            globalThis.AgentOS = previousNs
        }
    });
});
