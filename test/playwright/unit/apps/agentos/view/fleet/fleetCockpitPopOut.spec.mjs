import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FleetCockpitPopOutTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import Container     from '../../../../../../../src/container/Base.mjs';
import FleetCockpit  from '../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs';
import FleetRoster   from '../../../../../../../apps/agentos/store/FleetRoster.mjs';
import StateProvider from '../../../../../../../src/state/Provider.mjs';

/**
 * @summary Installs deterministic popup-vessel seams for the cockpit pop-out specs.
 *
 * The seams model the REAL call grammar: `Neo.Main.windowOpen` resolves a **Boolean** — a blocked
 * popup resolves `false`, it never throws — so the specs exercise the admission state machine on
 * the same truth production runs on. The real OS-window round-trip is owned by the E2E witness;
 * these seams isolate document ownership, park/re-adopt identity, the failure edges and close
 * bookkeeping without weakening the call contract.
 * @param {Object} [options={}]
 * @param {Boolean} [options.openResult=true] What `windowOpen` resolves — `false` = blocked popup.
 * @param {String|null} [options.popupUrl=null] The URL `getByPath` reports for the vessel window.
 * @returns {Object} spy state + `restore()`.
 */
function installWindowVessel({deferOpen = false, openResult = true, popupUrl = null} = {}) {
    let previous = {
            getByPath    : Neo.Main.getByPath,
            getWindowData: Neo.Main.getWindowData,
            windowClose  : Neo.Main.windowClose,
            windowOpen   : Neo.Main.windowOpen
        },
        previousWindowConfigs = Neo.windowConfigs,
        state = {closeCalls: [], openCalls: [], resolveOpen: null};

    Neo.windowConfigs = {'unit-window': {basePath: './'}};

    Neo.Main.getByPath     = async () => popupUrl;
    Neo.Main.getWindowData = async () => ({screenLeft: 10, screenTop: 20});
    Neo.Main.windowOpen    = data => {
        state.openCalls.push(data);

        // deferOpen models the REAL race window: the popup's Boolean completion arriving
        // arbitrarily late — the test resolves it manually via resolveOpen(value)
        return deferOpen
            ? new Promise(resolve => {state.resolveOpen = resolve})
            : Promise.resolve(openResult)
    };
    Neo.Main.windowClose   = async data => {
        state.closeCalls.push(data)
    };

    return {
        get closeCalls() { return state.closeCalls },
        get openCalls()  { return state.openCalls },
        resolveOpen(value) { state.resolveOpen?.(value) },
        restore() {
            Object.assign(Neo.Main, previous);
            Neo.windowConfigs = previousWindowConfigs
        }
    }
}

/**
 * Contract specs for the Stage-1 pop-out: shell-owned verbs + the vessel admission state machine.
 * The pins: the observable state edges (docked → opening → connected → windowed → reattaching →
 * docked, plus the two failure edges), the Boolean-`windowOpen` PRIMARY failure path, the bounded
 * connect window, generation revalidation making stale continuations inert, exact-index restore
 * (`addTab` appends by default — the stored index is the placement truth), disconnect correlation,
 * accessor phase-determinism, shell-toggle routing and destroy hygiene. The real two-window
 * journey is the E2E witness's (`FleetCockpitPopOutNL.spec.mjs`).
 */
test.describe.serial('AgentOS.view.fleet.FleetCockpit — detail pop-out state machine (#14610)', () => {
    let cockpit, vessel;

    /**
     * Reveals the auto-hidden detail inspector (the drill's standard commit loop), then resolves
     * the live pane — the pre-state every pop-out flow starts from.
     * @returns {Promise<Neo.container.Base>} the projected AgentDetail instance
     */
    async function revealDetail() {
        const result = cockpit.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'detail', autoHidden: false});

        expect(result.errors).toEqual([]);
        cockpit.onDockZoneDocumentChange(result.document);
        await cockpit.refreshPromise;

        const pane = cockpit.getReference('agent-detail');

        expect(pane).toBeTruthy();
        return pane
    }

    /**
     * The canonical vessel URL the connect handler matches on.
     * @returns {String}
     */
    function vesselUrl() {
        return `https://unit.test/apps/agentos/childapps/widget/index.html?detail=agent-detail&cockpitId=${cockpit.id}`
    }

    /**
     * Simulates the vessel window joining the shared heap: registers a minimal app whose
     * `mainView` can adopt the pane, then drives the connect handler.
     * @param {String} windowId
     * @returns {Promise<Neo.container.Base>} the vessel's mainView
     */
    async function simulateConnect(windowId) {
        const mainView = Neo.create(Container, {});

        Neo.apps ??= {};
        Neo.apps[windowId] = {mainView};

        await cockpit.onWindowConnect({windowId});

        return mainView
    }

    test.beforeEach(() => {
        cockpit = Neo.create(FleetCockpit, {
            // hermetic: no sample-seed fetch in the unit env; the roster data path has its own suite
            stateProvider: {
                module: StateProvider,
                stores: {fleetRoster: {module: FleetRoster, autoLoad: false}}
            }
        })
    });

    test.afterEach(() => {
        // destroy BEFORE restoring the vessel seams: teardown of a detached inspector calls
        // windowClose, which the bare unit env does not provide
        cockpit?.destroy();
        cockpit = null;
        vessel?.restore();
        vessel = null;
        Neo.apps = {}
    });

    test('detach: document truth + park + the docked → opening edge', async () => {
        vessel = installWindowVessel({popupUrl: null});

        const pane = await revealDetail();

        expect(cockpit.detailVesselState).toBe('docked');

        const result = await cockpit.popOutAgentDetail();

        expect(result).toEqual({detached: true, errors: []});
        expect(cockpit.detailVesselState).toBe('opening');

        // document truth: the item left the tree but keeps its catalog record
        const doc = cockpit.getDockZoneDocument();

        expect(doc.items.detail).toBeTruthy();
        expect(doc.nodes['secondary-rail'].items).not.toContain('detail');

        // the LIVE pane is owner-held (parked), not destroyed — and the stored home is exact
        expect(cockpit.detachedDetailPane).toBe(pane);
        expect(pane.isDestroyed).toBeFalsy();
        expect(cockpit.detachedDetail.homeTabsNodeId).toBe('secondary-rail');
        expect(cockpit.detachedDetail.homeTabIndex).toBe(0);

        // exactly one vessel open, carrying the correlation params
        expect(vessel.openCalls).toHaveLength(1);
        expect(vessel.openCalls[0].url).toContain(`cockpitId=${cockpit.id}`);

        // the shell affordance now names the reverse action
        expect(cockpit.getReference('detail-window-toggle').text).toBe('Reattach detail')
    });

    test('connect: the matching vessel adopts the SAME instance — opening → windowed', async () => {
        vessel = installWindowVessel({popupUrl: null});

        const pane = await revealDetail();

        await cockpit.popOutAgentDetail();

        vessel.restore();
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const mainView = await simulateConnect('vessel-win-1');

        expect(cockpit.detailVesselState).toBe('windowed');
        expect(cockpit.detachedDetail.windowId).toBe('vessel-win-1');
        expect(cockpit.detachedDetail.connectTimer).toBeNull();

        // reparent-never-recreate: the identical instance now lives in the vessel's view tree
        expect(mainView.items).toContain(pane);
        expect(cockpit.getAgentDetailPane()).toBe(pane)
    });

    test('connect: a non-matching vessel is ignored — the state stays opening', async () => {
        vessel = installWindowVessel({popupUrl: 'https://unit.test/index.html?detail=agent-detail&cockpitId=someone-else'});

        await revealDetail();
        await cockpit.popOutAgentDetail();

        const mainView = await simulateConnect('foreign-win');

        expect(cockpit.detailVesselState).toBe('opening');
        expect(cockpit.detachedDetail.windowId).toBeNull();
        expect(mainView.items).toHaveLength(0)
    });

    test('reattach: exact-index restore into the remembered tabs node — windowed → docked', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const pane = await revealDetail();

        await cockpit.popOutAgentDetail();
        await simulateConnect('vessel-win-2');

        const result = await cockpit.reattachAgentDetail();

        expect(result).toEqual({errors: [], reattached: true});
        expect(cockpit.detailVesselState).toBe('docked');
        expect(cockpit.detachedDetail).toBeNull();
        expect(cockpit.detachedDetailPane).toBeNull();

        // the placement truth: `addTab` appends by default — the restore must land the item back
        // at its STORED index (0, before the rest of the rail), not at the tail
        expect(cockpit.getDockZoneDocument().nodes['secondary-rail'].items).toEqual(['detail', 'perspectives', 'defineAgent', 'operator']);

        // same instance re-adopted by the projection; the vessel was closed by name
        expect(cockpit.getReference('agent-detail')).toBe(pane);
        expect(vessel.closeCalls).toHaveLength(1);
        expect(vessel.closeCalls[0].names).toEqual([`fm-agent-detail-${cockpit.id}`]);

        expect(cockpit.getReference('detail-window-toggle').text).toBe('Pop out detail')
    });

    test('blocked popup: windowOpen=false takes the failed-blocked edge and rolls back commit-or-neither', async () => {
        vessel = installWindowVessel({openResult: false, popupUrl: null});

        const pane   = await revealDetail(),
              result = await cockpit.popOutAgentDetail();

        expect(result.detached).toBe(false);
        expect(result.errors[0]).toContain('popup blocked');

        // the rollback settled the machine home; the failure trace survives it
        expect(cockpit.detailVesselState).toBe('docked');
        expect(cockpit.lastDetailVesselFailure).toBe('blocked');

        // the SAME instance is docked again at its exact home; nothing was closed (nothing opened)
        expect(cockpit.getReference('agent-detail')).toBe(pane);
        expect(cockpit.getDockZoneDocument().nodes['secondary-rail'].items).toEqual(['detail', 'perspectives', 'defineAgent', 'operator']);
        expect(vessel.closeCalls).toHaveLength(0)
    });

    test('bounded connect window: a vessel that never joins takes the failed-timeout edge and rolls back', async () => {
        vessel = installWindowVessel({popupUrl: null});

        // the short window rides the class-config contract: passed at CREATION (instance config
        // over the `static config` default), never poked onto an internal field post-construct
        cockpit.destroy();
        cockpit = Neo.create(FleetCockpit, {
            detailVesselConnectWindowMs: 20,
            stateProvider              : {
                module: StateProvider,
                stores: {fleetRoster: {module: FleetRoster, autoLoad: false}}
            }
        });

        const pane = await revealDetail();

        const result = await cockpit.popOutAgentDetail();

        expect(result.detached).toBe(true);
        expect(cockpit.detailVesselState).toBe('opening');

        await expect.poll(() => cockpit.detailVesselState, {timeout: 2000}).toBe('docked');

        expect(cockpit.lastDetailVesselFailure).toBe('timeout');
        expect(cockpit.getReference('agent-detail')).toBe(pane);

        // the timeout rollback closes the maybe-open vessel by name
        expect(vessel.closeCalls).toHaveLength(1)
    });

    test('generation revalidation: a stale connect after reattach is inert', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const pane = await revealDetail();

        await cockpit.popOutAgentDetail();

        // the user reattaches BEFORE the vessel ever connects — the in-flight admission dies
        await cockpit.reattachAgentDetail();

        expect(cockpit.detailVesselState).toBe('docked');

        const mainView = await simulateConnect('late-vessel');

        // the stale continuation must not steal the docked pane or corrupt the machine
        expect(cockpit.detailVesselState).toBe('docked');
        expect(mainView.items).toHaveLength(0);
        expect(cockpit.getReference('agent-detail')).toBe(pane)
    });

    test('disconnect correlation: the vessel closing brings the inspector home exactly once', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const pane = await revealDetail();

        await cockpit.popOutAgentDetail();
        await simulateConnect('vessel-win-3');

        expect(cockpit.detailVesselState).toBe('windowed');

        cockpit.onWindowDisconnect({windowId: 'vessel-win-3'});
        await cockpit.refreshPromise;

        await expect.poll(() => cockpit.detailVesselState, {timeout: 2000}).toBe('docked');

        expect(cockpit.getReference('agent-detail')).toBe(pane);

        // the vessel is already gone: the disconnect path must not close it a second time
        expect(vessel.closeCalls).toHaveLength(0);

        // a late duplicate disconnect is inert (the cleared bookkeeping is the guard)
        cockpit.onWindowDisconnect({windowId: 'vessel-win-3'});
        expect(cockpit.detailVesselState).toBe('docked')
    });

    test('shell toggle routes by state; a reattach in flight is a guarded no-op', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        await revealDetail();

        // docked → toggle detaches
        await cockpit.onDetailWindowToggle();
        expect(cockpit.detailVesselState).toBe('opening');

        await simulateConnect('vessel-win-4');
        expect(cockpit.detailVesselState).toBe('windowed');

        // transitional guard: a mid-reattach toggle refuses instead of double-driving
        cockpit.detailVesselState = 'reattaching';

        const guarded = await cockpit.onDetailWindowToggle();

        expect(guarded.reattached).toBe(false);
        expect(guarded.errors[0]).toContain('reattach in flight');

        cockpit.detailVesselState = 'windowed';

        // windowed → toggle reattaches
        await cockpit.onDetailWindowToggle();
        expect(cockpit.detailVesselState).toBe('docked')
    });

    test('accessor phase-determinism: one route to the live pane in both phases', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const pane = await revealDetail();

        expect(cockpit.getAgentDetailPane()).toBe(pane);

        await cockpit.popOutAgentDetail();
        await simulateConnect('vessel-win-5');

        // a vessel-mounted pane is OUT of this cockpit's projected tree — the accessor still lands
        expect(cockpit.getAgentDetailPane()).toBe(pane);

        await cockpit.reattachAgentDetail();

        expect(cockpit.getAgentDetailPane()).toBe(pane)
    });

    test('stale open completion: a vessel materializing after reattach is closed, never orphaned', async () => {
        vessel = installWindowVessel({deferOpen: true, popupUrl: null});

        const pane = await revealDetail();

        // the open hangs (real popups complete arbitrarily late) — the admission is in flight
        const popOutPromise = cockpit.popOutAgentDetail();

        await expect.poll(() => vessel.openCalls.length, {timeout: 2000}).toBe(1);

        // the user reattaches while the open is STILL pending: dock state restores, generation dies
        const reattach = await cockpit.reattachAgentDetail({windowAlreadyClosed: true});

        expect(reattach.reattached).toBe(true);
        expect(cockpit.detailVesselState).toBe('docked');
        expect(vessel.closeCalls).toHaveLength(0);

        // NOW the vessel materializes under the dead generation — the stale continuation owns
        // exactly one cleanup: close the orphan by its immutable name; it touches nothing else
        vessel.resolveOpen(true);

        const result = await popOutPromise;

        expect(result.detached).toBe(false);
        expect(result.errors[0]).toContain('superseded');

        await expect.poll(() => vessel.closeCalls.length, {timeout: 2000}).toBe(1);
        expect(vessel.closeCalls[0].names).toEqual([`fm-agent-detail-${cockpit.id}`]);

        // zero resurrection: the docked state the reattach restored is untouched
        expect(cockpit.detailVesselState).toBe('docked');
        expect(cockpit.detachedDetail).toBeNull();
        expect(cockpit.getReference('agent-detail')).toBe(pane)
    });

    test('destroy during reattach: the stale continuation cleans the vessel only, never resurrects fields', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const pane = await revealDetail();

        await cockpit.popOutAgentDetail();
        await simulateConnect('vessel-win-7');

        expect(cockpit.detailVesselState).toBe('windowed');

        // start the reattach, then destroy the cockpit while it awaits the projection —
        // teardown skips the vessel close (the reattach already cleared the bookkeeping),
        // so the stale continuation still owns exactly that close
        const reattachPromise = cockpit.reattachAgentDetail();

        cockpit.destroy();

        const result = await reattachPromise;

        expect(result.reattached).toBe(false);
        expect(result.errors[0]).toContain('superseded');

        // the pane died with the cockpit (teardown's job), the vessel closed exactly once
        // (the continuation's job), and no live handle was resurrected post-destroy
        // (core destroy() deletes instance fields — falsy is the destroyed-object truth)
        expect(pane.isDestroyed).toBe(true);
        expect(cockpit.detachedDetailPane).toBeFalsy();

        await expect.poll(() => vessel.closeCalls.length, {timeout: 2000}).toBe(1);
        expect(vessel.closeCalls[0].names).toEqual([`fm-agent-detail-${cockpit.id}`]);

        cockpit = null
    });

    test('destroy while detached: vessel closed, pane destroyed, late events inert', async () => {
        vessel = installWindowVessel({popupUrl: vesselUrl()});

        const pane = await revealDetail();

        await cockpit.popOutAgentDetail();
        await simulateConnect('vessel-win-6');

        cockpit.destroy();

        expect(vessel.closeCalls).toHaveLength(1);
        expect(pane.isDestroyed).toBe(true);

        // a post-destroy disconnect must be inert (the isDestroyed guard)
        cockpit.onWindowDisconnect({windowId: 'vessel-win-6'});

        cockpit = null
    })
});
