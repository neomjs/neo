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
import DockZoneModel from '../../../../../../../src/dashboard/DockZoneModel.mjs';
import FleetCockpit  from '../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs';
import FleetRoster   from '../../../../../../../apps/agentos/store/FleetRoster.mjs';
import StateProvider from '../../../../../../../src/state/Provider.mjs';

/**
 * @summary Installs deterministic popup-vessel seams for the cockpit pop-out specs — the
 * Demo-B-proven pattern (`DemoBWorkspace.spec.mjs`). The real OS-window round-trip is owned by
 * the E2E witness; these seams isolate document ownership, park/re-adopt identity, rollback and
 * close bookkeeping without weakening the call contract.
 * @param {Object} [options={}]
 * @param {Error|null} [options.openError=null]
 * @param {String|null} [options.popupUrl=null] The URL `getByPath` reports for the popup window.
 * @returns {Object} spy state + `restore()`.
 */
function installWindowVessel({openError = null, popupUrl = null} = {}) {
    let previous = {
            getByPath    : Neo.Main.getByPath,
            getWindowData: Neo.Main.getWindowData,
            windowClose  : Neo.Main.windowClose,
            windowOpen   : Neo.Main.windowOpen
        },
        previousWindowConfigs = Neo.windowConfigs,
        state = {closeCalls: [], openCalls: []};

    Neo.windowConfigs = {'unit-window': {basePath: './'}};

    Neo.Main.getByPath     = async () => popupUrl;
    Neo.Main.getWindowData = async () => ({screenLeft: 10, screenTop: 20});
    Neo.Main.windowOpen    = async data => {
        state.openCalls.push(data);
        if (openError) throw openError
    };
    Neo.Main.windowClose   = async data => {
        state.closeCalls.push(data)
    };

    return {
        get closeCalls() { return state.closeCalls },
        get openCalls()  { return state.openCalls },
        restore() {
            Object.assign(Neo.Main, previous);
            Neo.windowConfigs = previousWindowConfigs
        }
    }
}

/**
 * Contract specs for the cockpit pop-out: the agent-detail inspector detaches to
 * its own window on the shared heap and comes home — reparent-never-recreate. The pins:
 * document truth (`detachItem` prunes the tree, keeps the catalog record), park-then-vessel
 * ordering, connect-time reparent of the SAME instance, accessor routing while detached,
 * commit-or-neither vessel rollback, disconnect-comes-home, remembered-home fallback, the
 * stand-in swap after an external re-tree, and destroy hygiene. The real two-window journey is
 * the E2E witness's (`FleetCockpitPopOutNL.spec.mjs`).
 */
test.describe.serial('AgentOS.view.fleet.FleetCockpit — agent-detail pop-out (#14610)', () => {
    let cockpit, vessel;

    /** @returns {Object} a FleetAgent-shaped field bag (plain records are a documented AgentDetail input) */
    const makeRecord = () => ({
        agentId    : 'neo-fable',
        displayName: 'Mnemosyne',
        engineTag  : null,
        family     : null,
        state      : 'ok'
    });

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
        // destroy BEFORE restoring the vessel seams: a detached-state destroy closes its popup
        // through them (the bare unit env never defines Neo.Main.windowClose)
        cockpit?.destroy?.();
        cockpit = null;
        vessel?.restore();
        vessel = null
    });

    test('pop-out prunes the tree, keeps the catalog record, parks the live pane and opens the vessel', async () => {
        vessel = installWindowVessel();

        const pane   = await revealDetail();
        const result = await cockpit.popOutAgentDetail();

        expect(result).toEqual({detached: true, errors: []});

        // document truth: out of the tree, still in the catalog (window ownership)
        expect(DockZoneModel.findContainingTabsId(cockpit.dockModel, 'detail')).toBe(null);
        expect(cockpit.dockModel.items.detail).toBeTruthy();

        // parked, not destroyed — out of every parent's items (the reconciler's preserved-park
        // leaves the stale parentId pointer; membership is the honest contract)
        expect(pane.isDestroyed).toBeFalsy();
        expect(pane.parent?.items ?? []).not.toContain(pane);
        expect(pane.popOutMode).toBe('windowed');
        expect(vessel.openCalls).toHaveLength(1);
        expect(vessel.openCalls[0].windowName).toBe(cockpit.detachedDetail.windowName);
        expect(vessel.openCalls[0].url).toContain('childapps/widget/index.html');
        expect(vessel.openCalls[0].url).toContain(`cockpitId=${cockpit.id}`);

        await cockpit.refreshPromise;

        // the owner accessor resolves the parked instance — same reference, every phase
        expect(cockpit.getAgentDetailPane()).toBe(pane)
    });

    test('connect reparents the SAME instance into the vessel viewport; a foreign window is ignored', async () => {
        const pane = await revealDetail();

        vessel = installWindowVessel();
        await cockpit.popOutAgentDetail();

        const popupHost = Neo.create(Container, {});

        // a foreign connect (wrong params) must not claim the pane
        Neo.Main.getByPath = async () => 'http://localhost/index.html?unrelated=1';
        Neo.apps ??= {};
        Neo.apps['unit-popup-window'] = {mainView: popupHost};
        await cockpit.onWindowConnect({windowId: 'unit-popup-window'});
        expect(popupHost.items).toHaveLength(0);

        // ours: the parked instance mounts — same reference, nothing recreated
        Neo.Main.getByPath = async () => `http://localhost/apps/agentos/childapps/widget/index.html?detail=agent-detail&cockpitId=${cockpit.id}`;
        await cockpit.onWindowConnect({windowId: 'unit-popup-window'});

        expect(popupHost.items).toHaveLength(1);
        expect(popupHost.items[0]).toBe(pane);
        expect(cockpit.detachedDetail.windowId).toBe('unit-popup-window');

        // mounted in the vessel's tree, the pane is out of the cockpit's down() reach —
        // the owner accessor is now the only cockpit-side route to it
        expect(cockpit.getReference('agent-detail') ?? null).toBe(null);
        expect(cockpit.getAgentDetailPane()).toBe(pane);

        delete Neo.apps['unit-popup-window'];
        popupHost.remove(pane, false);
        popupHost.destroy()
    });

    test('reattach re-adopts the SAME instance, restores the document and closes the vessel', async () => {
        const pane = await revealDetail();

        pane.record = makeRecord();

        vessel = installWindowVessel();
        await cockpit.popOutAgentDetail();
        await cockpit.refreshPromise;

        const windowName = cockpit.detachedDetail.windowName;
        const result     = await cockpit.reattachAgentDetail();

        expect(result).toEqual({errors: [], reattached: true});

        // document truth restored into the remembered home
        expect(DockZoneModel.findContainingTabsId(cockpit.dockModel, 'detail')).toBe('secondary-rail');

        // the projection re-adopted the very same instance — reparent, never recreate —
        // with its runtime state (the record) intact
        expect(cockpit.getReference('agent-detail')).toBe(pane);
        expect(pane.record.agentId).toBe('neo-fable');
        expect(pane.popOutMode).toBe('docked');
        expect(cockpit.detachedDetail ?? null).toBe(null);
        expect(cockpit.detachedDetailPane ?? null).toBe(null);

        expect(vessel.closeCalls).toHaveLength(1);
        expect(vessel.closeCalls[0].names).toEqual([windowName])
    });

    test('guards: pop-out is rejected while detached or unrevealed; reattach is rejected while docked', async () => {
        vessel = installWindowVessel();

        // never revealed: no projected pane to detach
        const unrevealed = await cockpit.popOutAgentDetail();
        expect(unrevealed.detached).toBe(false);

        await revealDetail();
        expect((await cockpit.reattachAgentDetail()).reattached).toBe(false);

        await cockpit.popOutAgentDetail();
        const second = await cockpit.popOutAgentDetail();

        expect(second.detached).toBe(false);
        expect(vessel.openCalls).toHaveLength(1)
    });

    test('a vessel failure rolls back commit-or-neither: docked state restored, same instance', async () => {
        const pane = await revealDetail();

        vessel = installWindowVessel({openError: new Error('popup blocked')});

        const result = await cockpit.popOutAgentDetail();

        expect(result.detached).toBe(false);
        expect(result.errors[0]).toContain('popup blocked');

        // the document re-trees the item and the projection re-adopted the parked instance
        expect(DockZoneModel.findContainingTabsId(cockpit.dockModel, 'detail')).toBe('secondary-rail');
        expect(cockpit.detachedDetail ?? null).toBe(null);
        expect(cockpit.detachedDetailPane ?? null).toBe(null);

        await cockpit.refreshPromise;
        expect(cockpit.getReference('agent-detail')).toBe(pane);
        expect(pane.popOutMode).toBe('docked')
    });

    test('vessel disconnect brings the inspector home without a second close call', async () => {
        const pane = await revealDetail();

        vessel = installWindowVessel();
        await cockpit.popOutAgentDetail();

        cockpit.detachedDetail.windowId = 'unit-popup-window';
        cockpit.onWindowDisconnect({windowId: 'unit-popup-window'});

        // the disconnect-triggered reattach is async; settle it
        await new Promise(resolve => setTimeout(resolve, 50));
        await cockpit.refreshPromise;

        expect(DockZoneModel.findContainingTabsId(cockpit.dockModel, 'detail')).toBe('secondary-rail');
        expect(cockpit.getReference('agent-detail')).toBe(pane);
        expect(cockpit.detachedDetail ?? null).toBe(null);
        expect(vessel.closeCalls).toHaveLength(0)
    });

    test('reattach falls back to the first tabs node when the remembered home left the tree', async () => {
        const pane = await revealDetail();

        vessel = installWindowVessel();
        await cockpit.popOutAgentDetail();

        cockpit.detachedDetail.homeTabsNodeId = 'a-node-a-preset-retired';

        const result = await cockpit.reattachAgentDetail();

        expect(result.reattached).toBe(true);

        const landed = DockZoneModel.findContainingTabsId(cockpit.dockModel, 'detail');

        expect(landed).toBeTruthy();
        expect(cockpit.dockModel.nodes[landed].type).toBe('tabs');
        expect(cockpit.getReference('agent-detail')).toBe(pane)
    });

    test('an external re-tree while detached renders the stand-in; reattach swaps it for the live pane', async () => {
        const pane = await revealDetail();

        vessel = installWindowVessel();
        await cockpit.popOutAgentDetail();
        await cockpit.refreshPromise;

        // a preset restore / NL-driven addTab resurrects the item while the pane is windowed
        const resurrect = cockpit.applyDockZoneOperation({operation: 'addTab', itemId: 'detail', tabsNodeId: 'secondary-rail'});

        expect(resurrect.errors).toEqual([]);
        cockpit.onDockZoneDocumentChange(resurrect.document);
        await cockpit.refreshPromise;

        // the slot renders an honest stand-in — never a steal of the windowed instance
        const standin = cockpit.getReference('agent-detail-standin');

        expect(standin).toBeTruthy();
        expect(standin).not.toBe(pane);
        expect(standin.parent.items).not.toContain(pane);
        expect(cockpit.getAgentDetailPane()).toBe(pane);

        const result = await cockpit.reattachAgentDetail();

        expect(result.reattached).toBe(true);
        expect(cockpit.getReference('agent-detail-standin') ?? null).toBe(null);
        expect(cockpit.getReference('agent-detail')).toBe(pane);
        expect(standin.isDestroyed).toBe(true)
    });

    test('record mutation and the drill accessor keep feeding the detached inspector', async () => {
        const pane   = await revealDetail();
        const record = makeRecord();

        vessel = installWindowVessel();

        cockpit.detailRecord = record;
        pane.record          = record;

        await cockpit.popOutAgentDetail();

        let   applied             = 0;
        const originalApplyRecord = pane.applyRecord;

        pane.applyRecord = function(...args) { applied++; return originalApplyRecord.apply(this, args) };

        // the roster's recordChange routing reaches the windowed pane through the accessor
        cockpit.onDetailRecordChange({record});
        expect(applied).toBe(1);

        // a different record's mutation stays ignored (unchanged contract)
        cockpit.onDetailRecordChange({record: {agentId: 'someone-else'}});
        expect(applied).toBe(1);

        pane.applyRecord = originalApplyRecord
    });

    test('destroying the cockpit while detached closes the vessel and destroys the owned pane', async () => {
        const pane = await revealDetail();

        vessel = installWindowVessel();
        await cockpit.popOutAgentDetail();

        const windowName = cockpit.detachedDetail.windowName;

        cockpit.destroy();

        expect(vessel.closeCalls).toHaveLength(1);
        expect(vessel.closeCalls[0].names).toEqual([windowName]);
        expect(pane.isDestroyed).toBe(true);

        cockpit = null
    })
});
