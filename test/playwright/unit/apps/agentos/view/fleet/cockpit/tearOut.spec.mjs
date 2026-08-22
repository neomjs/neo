import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'FleetCockpitTearOutTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import Container     from '../../../../../../../../src/container/Base.mjs';
import DockZoneModel from '../../../../../../../../src/dashboard/DockZoneModel.mjs';
import FleetCockpit  from '../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs';
import FleetRoster   from '../../../../../../../../apps/agentos/store/FleetRoster.mjs';
import StateProvider from '../../../../../../../../src/state/Provider.mjs';

/**
 * @summary Installs deterministic popup-vessel seams — the same call grammar the pop-out suite
 * pins (`Neo.Main.windowOpen` resolves a **Boolean**; a blocked popup resolves `false`, never
 * throws), reused here for the GESTURE tear-out pathway.
 * @param {Object} [options={}]
 * @returns {Object} spy state + `restore()`.
 */
function installWindowVessel({openResult = true, popupUrl = null} = {}) {
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
    Neo.Main.getWindowData = async () => ({innerHeight: 900, outerHeight: 960, screenLeft: 10, screenTop: 20});
    Neo.Main.windowOpen    = data => {
        state.openCalls.push(data);
        return Promise.resolve(openResult)
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
 * Contract specs for the cockpit's seam consumption: the cockpit rides the EPIC's gesture tear-out
 * machinery (`createDockTearOutHandlers` + the projected boundary grammar) instead of any
 * cockpit-local gesture system. The pins:
 *
 * 1. the projection ARMS the landed grammar (`enableProxyToPopup` + `allowOverdrag` on every
 *    projected tab strip) and threads the four gesture handlers;
 * 2. admission is fail-closed on the cockpit's own preconditions — placeholder panes, items
 *    already vessel-owned on EITHER pathway, and the Boolean `windowOpen` grammar;
 * 3. the detached terminal commits document truth while the LIVE pane is captured, parked
 *    across the re-projection, and adopted by its vessel in BOTH connect/terminal orders —
 *    reparent-never-recreate;
 * 4. cancel retires the vessel with ZERO document mutation and no leaked capture;
 * 5. convergence-by-guard with the click pop-out: the toggle goes inert while `detail` is torn,
 *    a torn item re-treed mid-flight renders a stand-in (never steals the instance), and the
 *    accessor still resolves the live pane;
 * 6. vessel death brings the item HOME — a disconnect is a render-target signal, never implicit
 *    destruction: the SAME live instance returns to the projection at its stored position
 *    (semantic fallback when the home node left the tree), every record is consumed exact-once,
 *    and destruction remains only the no-home fallback terminal;
 * 7. the owner-destroy exit: cockpit teardown closes admitted vessels and settles every
 *    owner-held pane exactly once (idempotent).
 *
 * The real two-window journey stays the E2E witness tier's; these seams isolate the choreography
 * without weakening the call contract (the pop-out suite's proven discipline).
 */
test.describe.serial('AgentOS.view.fleet.cockpit.Container — gesture tear-out seam consumption', () => {
    let cockpit, vessel;

    const sortZoneStub = () => {
        const calls = {ended: 0, started: []};

        return {
            calls,
            endWindowDrag  : () => calls.ended++,
            startWindowDrag: data => calls.started.push(data)
        }
    };

    const proxyRect = {x: 40, y: 50, width: 640, height: 420};

    /**
     * Drives the seam's exit → (optional) terminal for one item through the REAL handler set the
     * projection threads, against the stubbed vessel grammar.
     * @param {String} itemId
     * @returns {Promise<Object>} the zone stub
     */
    async function tearOutExit(itemId) {
        const zone = sortZoneStub();

        await cockpit.tearOutHandlers.onDockTearOutExit({itemId, proxyRect, sortZone: zone});
        return zone
    }

    test.beforeEach(() => {
        cockpit = Neo.create(FleetCockpit, {
            stateProvider: {
                module: StateProvider,
                stores: {fleetRoster: {module: FleetRoster, autoLoad: false}}
            }
        })
    });

    test.afterEach(() => {
        cockpit?.destroy();
        cockpit = null;
        vessel?.restore();
        vessel = null;
        Neo.apps = {}
    });

    test('the projection arms the landed boundary grammar on every tab strip and threads the seam handlers', () => {
        const config    = cockpit.projectDockModel(),
              sortZones = [];

        (function walk(node) {
            if (!node || typeof node !== 'object') return;
            node.sortZoneConfig && sortZones.push(node.sortZoneConfig);
            [].concat(node.items || [], node.headerToolbar || []).forEach(walk);
            Object.values(node).forEach(value => {
                Array.isArray(value) && value.forEach(walk);
                value?.sortZoneConfig && !sortZones.includes(value.sortZoneConfig) && sortZones.push(value.sortZoneConfig)
            })
        })(config);

        expect(sortZones.length, 'the projection carries at least one tab-strip sort zone').toBeGreaterThan(0);
        sortZones.forEach(zoneConfig => {
            expect(zoneConfig.enableProxyToPopup, 'the tear-out grammar is armed').toBe(true);
            expect(zoneConfig.allowOverdrag, 'overdrag pairs with the boundary grammar').toBe(true)
        });

        // the four seam handlers are the cockpit's OWN handler set — no parallel gesture system
        ['onDockTearOutCancel', 'onDockTearOutEntry', 'onDockTearOutExit', 'onDockTearOutTerminal'].forEach(name => {
            expect(typeof cockpit.tearOutHandlers[name]).toBe('function')
        })
    });

    test('admission fails CLOSED: placeholder panes and already-owned items never open a vessel; a blocked popup degrades in-window', async () => {
        vessel = installWindowVessel();

        // 'perspectives' resolves to an unreferenced placeholder — not embodiable
        const zonePlaceholder = await tearOutExit('perspectives');

        expect(vessel.openCalls, 'no vessel for a placeholder pane').toHaveLength(0);
        expect(zonePlaceholder.calls.ended, 'the gesture degrades to its in-window fallback').toBe(1);

        // a click-detached detail is already vessel-owned on the OTHER pathway
        cockpit.detachedDetail = {windowName: 'x'};
        const zoneDetail = await tearOutExit('detail');

        expect(vessel.openCalls).toHaveLength(0);
        expect(zoneDetail.calls.ended).toBe(1);
        cockpit.detachedDetail = null;

        // Boolean grammar: windowOpen resolving false degrades the same way
        vessel.restore();
        vessel = installWindowVessel({openResult: false});
        const zoneBlocked = await tearOutExit('stream');

        expect(vessel.openCalls, 'the host WAS asked').toHaveLength(1);
        expect(zoneBlocked.calls.ended).toBe(1);
        expect(zoneBlocked.calls.started, 'no pointer-follow without a vessel').toHaveLength(0);
        expect(cockpit.tearOutPaneHandles.stream, 'no capture without admission').toBeUndefined()
    });

    test('exit + terminal: document truth commits, the LIVE pane is captured, parked across the re-projection, and adopted (terminal-first order)', async () => {
        vessel = installWindowVessel();

        const streamPane = cockpit.getReference('activity-stream');

        expect(streamPane).toBeTruthy();

        const zone = await tearOutExit('stream');

        expect(vessel.openCalls).toHaveLength(1);
        expect(vessel.openCalls[0].url).toContain('tearout=stream');
        expect(vessel.openCalls[0].url).toContain(`cockpitId=${cockpit.id}`);
        expect(zone.calls.started, 'an admitted vessel engages the pointer-follow').toHaveLength(1);

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'stream', sortZone: zone});

        // document truth: absent from every node, preserved in the catalog
        const doc = cockpit.getDockZoneDocument();

        expect(Object.values(doc.nodes).some(node => node.items?.includes('stream'))).toBe(false);
        expect(doc.items.stream).toBeTruthy();

        // the capture parked the SAME live instance; the re-projection did not destroy it
        expect(cockpit.tearOutPaneHandles.stream).toBe(streamPane);
        await cockpit.refreshPromise;
        expect(streamPane.isDestroyed).toBeFalsy();
        expect(cockpit.tearOutPanes.stream).toMatchObject({windowId: null});

        // the vessel connects AFTER the terminal: the connect branch reparents the captured pane
        vessel.restore();
        vessel = installWindowVessel({popupUrl: `https://unit.test/widget/index.html?tearout=stream&cockpitId=${cockpit.id}`});

        const mainView = Neo.create(Container, {});
        Neo.apps ??= {};
        Neo.apps['tearout-win-1'] = {mainView};

        await cockpit.onWindowConnect({windowId: 'tearout-win-1'});

        expect(mainView.items, 'reparent-never-recreate').toContain(streamPane);
        expect(cockpit.tearOutPanes.stream.windowId).toBe('tearout-win-1')
    });

    test('connect-first order: a vessel connecting mid-gesture is recorded and adopted at the terminal', async () => {
        vessel = installWindowVessel({popupUrl: `https://unit.test/widget/index.html?tearout=fleet&cockpitId=WILL-BE-SET`});

        const fleetPane = cockpit.getReference('fleet-grid');
        const zone      = await tearOutExit('fleet');

        expect(vessel.openCalls).toHaveLength(1);

        // the vessel connects BEFORE the terminal (long drag)
        vessel.restore();
        vessel = installWindowVessel({popupUrl: `https://unit.test/widget/index.html?tearout=fleet&cockpitId=${cockpit.id}`});

        const mainView = Neo.create(Container, {});
        Neo.apps ??= {};
        Neo.apps['tearout-win-2'] = {mainView};

        await cockpit.onWindowConnect({windowId: 'tearout-win-2'});

        expect(cockpit.tearOutConnects.fleet, 'mid-gesture connect recorded, not adopted').toMatchObject({windowId: 'tearout-win-2'});
        expect(mainView.items).not.toContain(fleetPane);

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'fleet', sortZone: zone});

        expect(mainView.items, 'the terminal consumed the recorded connect').toContain(fleetPane);
        expect(cockpit.tearOutPanes.fleet.windowId).toBe('tearout-win-2')
    });

    test('cancel while detached: the vessel retires with ZERO document mutation and no leaked capture', async () => {
        vessel = installWindowVessel();

        const before = JSON.stringify(cockpit.getDockZoneDocument());
        const zone   = await tearOutExit('stream');

        expect(vessel.openCalls).toHaveLength(1);

        cockpit.tearOutHandlers.onDockTearOutCancel({itemId: 'stream', sortZone: zone});
        await Promise.resolve();

        expect(JSON.stringify(cockpit.getDockZoneDocument()), 'zero-mutation by guard').toBe(before);
        expect(vessel.closeCalls).toHaveLength(1);
        expect(cockpit.tearOutPaneHandles.stream, 'the capture never happened — nothing to leak').toBeUndefined();
        expect(cockpit.tearOutPanes.stream).toBeUndefined()
    });

    test('convergence-by-guard: a torn detail disables the click toggle, re-treeing renders a stand-in, and the accessor resolves the live pane', async () => {
        vessel = installWindowVessel();

        // reveal the auto-hidden inspector so it is a projected, tearable pane
        const reveal = cockpit.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'detail', autoHidden: false});
        cockpit.onDockZoneDocumentChange(reveal.document);
        await cockpit.refreshPromise;

        const detailPane = cockpit.getReference('agent-detail');
        const zone       = await tearOutExit('detail');

        expect(vessel.openCalls).toHaveLength(1);
        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'detail', sortZone: zone});
        await cockpit.refreshPromise;

        // the click affordance is inert while the gesture vessel owns the pane
        const toggle = cockpit.getAgentDetailPane().getReference('detail-window-toggle');

        expect(toggle.disabled).toBe(true);
        expect(toggle.text).toBe('Detail torn out');

        // the accessor still reaches the live instance (the drill stays live)
        expect(cockpit.getAgentDetailPane()).toBe(detailPane);

        // re-treeing the torn item renders a STAND-IN — the live instance is never stolen back
        const readd = cockpit.applyDockZoneOperation({operation: 'addTab', itemId: 'detail', tabsNodeId: 'secondary-rail'});

        expect(readd.errors).toEqual([]);
        cockpit.onDockZoneDocumentChange(readd.document);
        await cockpit.refreshPromise;

        expect(cockpit.tearOutPaneHandles.detail).toBe(detailPane);
        expect(detailPane.isDestroyed).toBeFalsy()
    });

    test('vessel death brings the item HOME — same instance, no orphan under the dead view, semantic fallback placement', async () => {
        vessel = installWindowVessel();

        // 'fleet' lives ALONE in fleet-tabs — detaching it empties and collapses its node,
        // which is exactly the pre-state the semantic-fallback return path exists for
        const fleetPane = cockpit.getReference('fleet-grid');
        const zone      = await tearOutExit('fleet');

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'fleet', sortZone: zone});

        // capture rode the detach commit: 'fleet' lived alone in fleet-tabs at index 0
        expect(cockpit.tearOutPlacements.fleet).toEqual({tabsNodeId: 'fleet-tabs', index: 0});

        vessel.restore();
        vessel = installWindowVessel({popupUrl: `https://unit.test/widget/index.html?tearout=fleet&cockpitId=${cockpit.id}`});

        const mainView = Neo.create(Container, {});
        Neo.apps ??= {};
        Neo.apps['tearout-win-3'] = {mainView};

        await cockpit.onWindowConnect({windowId: 'tearout-win-3'});
        expect(cockpit.tearOutPanes.fleet.windowId).toBe('tearout-win-3');
        expect(mainView.items).toContain(fleetPane);

        cockpit.onWindowDisconnect({windowId: 'tearout-win-3'});
        await cockpit.refreshPromise;

        // A window disconnect does NOT destroy the popup application or its view tree — the
        // worker only fires the event — so the captured pane survives LIVE and comes HOME:
        // the same instance, out of the dead vessel's view, back in the projection. The
        // emptied fleet-tabs node collapsed at detach, so placement recovery is the SEMANTIC
        // fallback (a surviving tabs node), never a resurrected node, never geometry.
        expect(mainView.items, 'the dead vessel view keeps no pane').not.toContain(fleetPane);
        expect(fleetPane.isDestroyed, 'same-instance return: the pane is never destroyed').toBeFalsy();
        expect(cockpit.getReference('fleet-grid'), 'the projection resolves the ORIGINAL instance').toBe(fleetPane);
        expect(DockZoneModel.findContainingTabsId(cockpit.dockModel, 'fleet'), 'the item is back in the tree').toBeTruthy();

        // every record is consumed exact-once
        expect(cockpit.tearOutPanes.fleet).toBeUndefined();
        expect(cockpit.tearOutConnects.fleet).toBeUndefined();
        expect(cockpit.tearOutPaneHandles.fleet).toBeUndefined();
        expect(cockpit.tearOutPlacements.fleet).toBeUndefined();
        expect(cockpit.returningTearOutPanes.fleet).toBeUndefined()
    });

    test('the main-view recall verb returns a GESTURE-torn detail — same instance home (the memories twin\'s grammar)', async () => {
        vessel = installWindowVessel();

        // reveal the auto-hidden inspector so it is a projected, tearable pane
        const reveal = cockpit.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'detail', autoHidden: false});
        cockpit.onDockZoneDocumentChange(reveal.document);
        await cockpit.refreshPromise;

        const detailPane = cockpit.getAgentDetailPane(),
              zone       = await tearOutExit('detail');

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'detail', sortZone: zone});
        await cockpit.refreshPromise;

        // an ADOPTED gesture vessel (the connect already correlated) — the recall verb's target
        cockpit.tearOutPanes.detail = {windowName: `fm-tearout-detail-${cockpit.id}`, windowId: 'recall-win-1'};

        // the MAIN view's recall routes through the same toggle verb the pane carries
        const result = await cockpit.onDetailWindowToggle();

        expect(result).toEqual({returned: true, errors: []});
        expect(vessel.closeCalls).toHaveLength(1);
        expect(vessel.closeCalls[0].names).toEqual([`fm-tearout-detail-${cockpit.id}`]);

        // vessel death completes the return: the SAME live instance lands back in the tree
        cockpit.onWindowDisconnect({windowId: 'recall-win-1'});
        await cockpit.refreshPromise;

        expect(detailPane.isDestroyed, 'same-instance return: the pane is never destroyed').toBeFalsy();
        expect(cockpit.getAgentDetailPane(), 'the accessor resolves the ORIGINAL instance').toBe(detailPane);
        expect(DockZoneModel.findContainingTabsId(cockpit.dockModel, 'detail'), 'the item is back in the tree').toBeTruthy()
    });

    test('a surviving home node gets the EXACT stored position back — not append order', async () => {
        vessel = installWindowVessel();

        // the south strip ships 'stream' at index 0 AHEAD of four reading-surface
        // siblings — the surviving-node pre-state where an append-shaped return cannot hide
        expect(cockpit.dockModel.nodes['stream-tabs'].items).toEqual(['stream', 'tasks', 'memories', 'operator', 'catchUp']);

        const zone = await tearOutExit('stream');

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'stream', sortZone: zone});
        expect(cockpit.tearOutPlacements.stream).toEqual({tabsNodeId: 'stream-tabs', index: 0});
        expect(cockpit.dockModel.nodes['stream-tabs'].items).toEqual(['tasks', 'memories', 'operator', 'catchUp']);

        cockpit.tearOutPanes.stream = {windowName: `fm-tearout-stream-${cockpit.id}`, windowId: 'tearout-win-5'};
        cockpit.onWindowDisconnect({windowId: 'tearout-win-5'});
        await cockpit.refreshPromise;

        expect(cockpit.dockModel.nodes['stream-tabs'].items, 'identical order, not append order').toEqual(['stream', 'tasks', 'memories', 'operator', 'catchUp'])
    });

    test('the no-home terminal still settles ownership: a closed-out item\'s pane is destroyed, never orphaned', async () => {
        vessel = installWindowVessel();

        const streamPane = cockpit.getReference('activity-stream');
        const zone       = await tearOutExit('stream');

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'stream', sortZone: zone});

        vessel.restore();
        vessel = installWindowVessel({popupUrl: `https://unit.test/widget/index.html?tearout=stream&cockpitId=${cockpit.id}`});

        const mainView = Neo.create(Container, {});
        Neo.apps ??= {};
        Neo.apps['tearout-win-6'] = {mainView};

        await cockpit.onWindowConnect({windowId: 'tearout-win-6'});
        expect(mainView.items).toContain(streamPane);

        // the catalog record leaves while the item is vessel-owned: no home exists to return to
        const closed = cockpit.applyDockZoneOperation({operation: 'closeItem', itemId: 'stream'});

        expect(closed.errors).toEqual([]);
        cockpit.onDockZoneDocumentChange(closed.document);
        await cockpit.refreshPromise;
        expect(cockpit.dockModel.items.stream).toBeUndefined();

        cockpit.onWindowDisconnect({windowId: 'tearout-win-6'});

        // the fallback terminal: ownership settles by destruction — nothing orphans, nothing returns
        expect(streamPane.isDestroyed).toBeTruthy();
        expect(mainView.items).not.toContain(streamPane);
        expect(cockpit.returningTearOutPanes.stream).toBeUndefined();
        expect(cockpit.tearOutPlacements.stream).toBeUndefined()
    });

    test('the owner-destroy exit: cockpit teardown closes admitted vessels and settles every owner-held pane exactly once', async () => {
        vessel = installWindowVessel();

        const streamPane = cockpit.getReference('activity-stream');
        const zone       = await tearOutExit('stream');

        cockpit.tearOutHandlers.onDockTearOutTerminal({itemId: 'stream', sortZone: zone});

        vessel.restore();
        vessel = installWindowVessel({popupUrl: `https://unit.test/widget/index.html?tearout=stream&cockpitId=${cockpit.id}`});

        const mainView = Neo.create(Container, {});
        Neo.apps ??= {};
        Neo.apps['tearout-win-4'] = {mainView};

        await cockpit.onWindowConnect({windowId: 'tearout-win-4'});
        expect(mainView.items).toContain(streamPane);

        // count disposals so "exactly once" is a measurement, not an inference
        const originalDestroy = streamPane.destroy.bind(streamPane);
        let   disposals       = 0;

        streamPane.destroy = (...args) => {
            disposals++;
            return originalDestroy(...args)
        };

        const vesselWindowName = cockpit.tearOutPanes.stream.windowName;

        cockpit.destroy();

        // the admitted OS vessel is closed, the pane is settled exactly once, nothing is orphaned
        expect(vessel.closeCalls.some(call => call.names?.includes(vesselWindowName)), 'route/app teardown closes the OS vessel').toBeTruthy();
        expect(disposals).toBe(1);
        expect(streamPane.isDestroyed).toBeTruthy();
        expect(mainView.items).not.toContain(streamPane);

        // idempotent: a second retirement pass finds settled state and disposes nothing again
        cockpit.retireTearOutState();
        expect(disposals).toBe(1);

        cockpit = null
    })
});
