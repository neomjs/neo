import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSFleetCockpitResidentBootTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import FleetActivityEvents from '../../../../../../../../apps/agentos/store/FleetActivityEvents.mjs';
import FleetCockpit  from '../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs';
import FleetRoster   from '../../../../../../../../apps/agentos/store/FleetRoster.mjs';
import StateProvider from '../../../../../../../../src/state/Provider.mjs';

/**
 * Resident-boot lifecycle contracts for the south reading-surface tabs: the panes construct at
 * projection time — BEFORE the fleet grid child and usually before the bridge — so their
 * roster-derived options must boot from the PROVIDER-owned Store (never through the projected
 * grid), refresh when the live roster answers, and the construction-time CatchUp history request
 * must recover from the cold-before-bridge ordering instead of pinning its unavailable envelope.
 */
test.describe.serial('AgentOS.view.fleet.cockpit.Container — resident boot lifecycle (#17451)', () => {
    let cockpit, prevFleet;

    test.beforeEach(() => {
        prevFleet = globalThis.AgentOS?.fleet;
        cockpit   = Neo.create(FleetCockpit, {
            stateProvider: {
                module: StateProvider,
                stores: {
                    fleetActivityEvents: {module: FleetActivityEvents},
                    fleetRoster        : {module: FleetRoster, autoLoad: false}
                }
            }
        })
    });

    test.afterEach(() => {
        cockpit?.destroy();
        cockpit = null;
        // stub only the `fleet` key and restore it — never delete the AgentOS namespace
        // (it is the app CLASS NAMESPACE root; deleting it unregisters every AgentOS.* class)
        prevFleet === undefined ? delete globalThis.AgentOS?.fleet : globalThis.AgentOS.fleet = prevFleet
    });

    test('cold boot: resident panes exist before the grid answers, with honest provider-truth options', async () => {
        await cockpit.refreshPromise;

        const mailbox = cockpit.getOperatorMailboxPane(),
              catchUp = cockpit.getCatchUpPane();

        // resident tabs project at boot — the accessors resolve live instances, no reveal step
        expect(mailbox).toBeTruthy();
        expect(catchUp).toBeTruthy();
        expect(cockpit.getMemoriesPane()).toBeTruthy();

        // cold truth, not breakage: an unanswered roster yields the broadcast sentinel alone —
        // and empty option lists — never a throw and never a stale hand-mapped list
        expect(mailbox.recipientOptions.map(option => option.id)).toEqual(['AGENT:*']);
        expect(cockpit.buildMemoriesAgentOptions()).toEqual([]);
        expect(cockpit.buildCatchUpPartitionOptions()).toEqual([])
    });

    test('the builders read the PROVIDER Store, never the projected grid — options resolve with no grid at all', () => {
        const rows = [{agentId: 'vega', githubUsername: 'neo-opus-vega', displayName: 'Vega'}],
              host = {
                  resolveFleetRosterStore: () => ({items: rows}),
                  getReference           : () => null // the grid does not exist — torn, absent, or not yet projected
              };

        expect(FleetCockpit.prototype.buildOperatorRecipientOptions.call(host).map(option => option.id))
            .toEqual(['AGENT:*', '@neo-opus-vega']);
        expect(FleetCockpit.prototype.buildMemoriesAgentOptions.call(host).map(option => option.agentIdentity))
            .toEqual(['@neo-opus-vega']);
        expect(FleetCockpit.prototype.buildCatchUpPartitionOptions.call(host).map(option => option.partition))
            .toEqual(['@neo-opus-vega'])
    });

    test('the first live roster answer refreshes EVERY resident consumer — the mailbox recipients included', async () => {
        await cockpit.refreshPromise;

        const mailbox = cockpit.getOperatorMailboxPane();

        expect(mailbox.recipientOptions.map(option => option.id)).toEqual(['AGENT:*']);

        globalThis.AgentOS.fleet = {registryBridge: {
            selected   : true,
            fleetRoster: async () => ({capabilities: {}, rows: [{id: 'vega', githubUsername: 'neo-opus-vega', displayName: 'Vega'}]})
        }};

        await cockpit.loadRoster();

        expect(mailbox.recipientOptions.map(option => option.id)).toEqual(['AGENT:*', '@neo-opus-vega']);
        expect(cockpit.getMemoriesPane().agentOptions.map(option => option.agentIdentity)).toEqual(['@neo-opus-vega']);
        expect(cockpit.getCatchUpPane().partitionOptions.map(option => option.partition)).toEqual(['@neo-opus-vega'])
    });

    test('loadRoster ingests into the PROVIDER Store with NO grid at all — the projected child renders, it never owns the roster', async () => {
        const store = Neo.create(FleetRoster, {autoLoad: false}),
              sets  = {catchUp: [], mailbox: [], memories: []},
              host  = {
                  buildActivityActorDirectory  : FleetCockpit.prototype.buildActivityActorDirectory,
                  buildCatchUpPartitionOptions : FleetCockpit.prototype.buildCatchUpPartitionOptions,
                  buildMemoriesAgentOptions    : FleetCockpit.prototype.buildMemoriesAgentOptions,
                  buildOperatorRecipientOptions: FleetCockpit.prototype.buildOperatorRecipientOptions,
                  clearDegradedReason          : FleetCockpit.prototype.clearDegradedReason,
                  degradeWiredSurface          : FleetCockpit.prototype.degradeWiredSurface,
                  getCatchUpPane               : () => ({set: values => sets.catchUp.push(values), onRefreshClick() {}}),
                  getMemoriesPane              : () => ({set: values => sets.memories.push(values)}),
                  getOperatorMailboxPane       : () => ({set: values => sets.mailbox.push(values)}),
                  getReference                 : () => null, // NO grid, NO activity stream — torn or absent
                  gridAdapterState             : 'sample',
                  gridReadGeneration           : 0,
                  mapRosterRow                 : FleetCockpit.prototype.mapRosterRow,
                  reconcileRoster              : FleetCockpit.prototype.reconcileRoster,
                  reconcileSelection           : FleetCockpit.prototype.reconcileSelection,
                  resolveFleetRosterStore      : () => store,
                  rosterSourceMode             : 'sample',
                  rosterWired                  : false,
                  syncSpineBanner              : () => {}
              };

        globalThis.AgentOS.fleet = {registryBridge: {
            selected   : true,
            fleetRoster: async () => ({capabilities: {}, rows: [{id: 'vega', githubUsername: 'neo-opus-vega', displayName: 'Vega'}]})
        }};

        await FleetCockpit.prototype.loadRoster.call(host);

        // the live rows landed in the PROVIDER Store despite the missing projection
        expect(store.getCount()).toBe(1);
        expect(store.getAt(0).githubUsername).toBe('neo-opus-vega');
        expect(host.gridAdapterState).toBe('live');
        expect(host.rosterWired).toBe(true);

        // and every resident consumer refreshed from that same truth
        expect(sets.mailbox.some(values => values.recipientOptions?.some(option => option.id === '@neo-opus-vega'))).toBe(true);
        expect(sets.memories.some(values => values.agentOptions?.some(option => option.agentIdentity === '@neo-opus-vega'))).toBe(true);
        expect(sets.catchUp.some(values => values.partitionOptions?.some(option => option.partition === '@neo-opus-vega'))).toBe(true);

        store.destroy()
    });

    test('cold-before-bridge CatchUp recovers exactly once at bridge arrival; a healthy snapshot never re-drives', async () => {
        await cockpit.refreshPromise;

        // the construction-time historyRequest ran with no bridge → the unavailable envelope
        expect(cockpit.catchUpSnapshot?.capability?.state).toBe('unavailable');

        let redrives = 0;
        cockpit.getCatchUpPane().onRefreshClick = () => {
            redrives++;
            // the guarded refresh path lands a healthy snapshot (what the real handler achieves
            // once the bridge answers) — so the NEXT live load must not re-drive again
            cockpit.catchUpSnapshot = {capability: {state: 'wired'}}
        };

        globalThis.AgentOS.fleet = {registryBridge: {
            selected   : true,
            fleetRoster: async () => ({capabilities: {}, rows: [{id: 'vega', githubUsername: 'neo-opus-vega'}]})
        }};

        await cockpit.loadRoster();
        expect(redrives, 'the one-shot cold miss recovers at bridge arrival').toBe(1);

        await cockpit.loadRoster();
        expect(redrives, 'a healthy snapshot is never re-driven — the recovery is need-gated, not periodic').toBe(1)
    });

    test('pane-before-identity: the resident mailbox boots read-free and lands exactly ONE first read at identity resolution', async () => {
        await cockpit.refreshPromise;

        let reads = 0;
        cockpit.loadOperatorInbox = () => { reads++ };

        // resident projection happened with no identity — no read may have fired, and none may
        // fire until the identity resolves
        expect(cockpit.operatorRecord).toBe(null);

        globalThis.AgentOS.fleet = {registryBridge: {
            resolveViewerIdentity: async () => ({ok: true, agentIdentityNodeId: '@neo-fable-clio'})
        }};

        await cockpit.loadOperatorIdentity();

        expect(cockpit.operatorRecord?.githubUsername).toBe('neo-fable-clio');
        expect(reads, 'the opposite ordering to the construction-flush: one live set, one read').toBe(1)
    })
});
