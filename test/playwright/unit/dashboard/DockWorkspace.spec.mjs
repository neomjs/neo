import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockWorkspaceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import '../../../../src/tab/Container.mjs';    // registers the `tab-container` ntype the projection emits
import Container                from '../../../../src/container/Base.mjs';
import DockLayoutAdapter        from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockProjectionReconciler from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockService              from '../../../../src/ai/client/DockService.mjs';
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import Document                 from '../../../../src/dashboard/dock/model/Document.mjs';
import Operations               from '../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence              from '../../../../src/dashboard/dock/model/Persistence.mjs';
import DomApiVnodeCreator       from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper               from '../../../../src/vdom/Helper.mjs';

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        editor  : {componentRef: 'Editor',   title: 'Editor',   kind: 'panel'},
        preview : {componentRef: 'Preview',  title: 'Preview',  kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}}},
        'root-split' : {type: 'split', orientation: 'horizontal', children: ['editor-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'editor-tabs': {type: 'tabs', items: ['editor'],              activeItemId: 'editor'},
        'side-tabs'  : {type: 'tabs', items: ['preview', 'terminal'], activeItemId: 'preview'}
    }
});

const createEmptyDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {},
    nodes : {
        root        : {type: 'edge-zone', zones: {center: {nodeId: 'empty-tabs'}}},
        'empty-tabs': {type: 'tabs', items: []}
    }
});

const createEdgeDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        center   : {componentRef: 'Center',    title: 'Center',    kind: 'panel'},
        inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel'}
    },
    nodes: {
        root            : {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'center-tabs'},
                right : {nodeId: 'inspector-tabs', extent: 0.25, resizable: true}
            }
        },
        'center-tabs'   : {type: 'tabs', items: ['center'], activeItemId: 'center'},
        'inspector-tabs': {type: 'tabs', items: ['inspector'], activeItemId: 'inspector'}
    }
});

/**
 * A host that projects its OWN header actions through the documented options hook — the seam a real
 * application uses, exercised end to end rather than through the adapter in isolation.
 */
const hostResolverCalls = [];

class HostActionWorkspace extends DockWorkspace {
    static config = {
        className            : 'Test.Unit.Dashboard.DockWorkspace.HostActionWorkspace',
        enableDockCloseAction: false,
        enableDockPinAction  : false,
        layout               : {ntype: 'vbox', align: 'stretch'}
    }

    // Module-scoped rather than an instance field: a plain class field on a Neo class enters the
    // config machinery and fails its descriptor lookup. State belongs in `static config`, and a test
    // probe belongs outside the class entirely.
    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }

    getDockProjectionOptions() {
        return {
            resolveDockHeaderActions: nodeId => {
                hostResolverCalls.push(nodeId);
                return [{action: 'pin', iconCls: 'fa fa-thumbtack'}]
            }
        }
    }
}

/**
 * A host that owns BOTH engine names while both opt-ins are off. Separate from
 * {@link HostActionWorkspace} because the name-reservation contract is per-action — `close` and `pin`
 * each belong to the host exactly while their own flag is off — and one fixture claiming both is the
 * only way to show the two guards are symmetric rather than one being a special case.
 */
class HostBothActionsWorkspace extends DockWorkspace {
    static config = {
        className            : 'Test.Unit.Dashboard.DockWorkspace.HostBothActionsWorkspace',
        enableDockCloseAction: false,
        enableDockPinAction  : false,
        layout               : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }

    getDockProjectionOptions() {
        return {
            resolveDockHeaderActions: () => [
                {action: 'close', iconCls: 'fa fa-xmark'},
                {action: 'pin',   iconCls: 'fa fa-thumbtack'}
            ]
        }
    }
}

/**
 * The minimal consumer: the document arrives as a config-assigned field, the projection sits at
 * shell index 0 of the workspace itself, and nothing is overridden.
 */
class PlainWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspace.PlainWorkspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

/**
 * A consumer with app chrome ahead of the shell and every hook overridden.
 */
class ChromeWorkspace extends DockWorkspace {
    static config = {
        className           : 'Test.Unit.Dashboard.DockWorkspace.ChromeWorkspace',
        dockProjectionConfig: {flex: 1},
        dockShellIndex      : 1,
        flipMarkerPrefix    : 'chrome-pane-',
        layout              : {ntype: 'vbox', align: 'stretch'}
    }

    beforeRefreshCalls = []
    preserved          = ['terminal']

    construct(config) {
        super.construct(config);
        this.add([{module: Container, cls: ['chrome-bar'], flex: 'none'}, this.projectDockModel()])
    }

    beforeRefreshDockWorkspace(document, refreshOptions) {
        this.beforeRefreshCalls.push({document, refreshOptions})
    }

    getDockProjectionOptions() {
        return {autoHideRevealOnHover: true}
    }

    getPreservedItemIds() {
        return this.preserved
    }

    getRefreshOptions(descriptor) {
        return {geometryOnly: descriptor?.operation === 'resizeSplit'}
    }

    resolvePane(itemId, item) {
        return {cls: ['custom-pane'], ntype: 'component', text: item.title}
    }
}

/**
 * A consumer whose configured dock-host reference resolves to nothing — the loud-failure control.
 */
class BrokenHostWorkspace extends DockWorkspace {
    static config = {
        className        : 'Test.Unit.Dashboard.DockWorkspace.BrokenHostWorkspace',
        dockHostReference: 'gone',
        layout           : {ntype: 'vbox', align: 'stretch'}
    }
}

/**
 * A consumer mounting the projection into a dedicated dock-host child beside persistent siblings.
 */
class HostedWorkspace extends DockWorkspace {
    static config = {
        className        : 'Test.Unit.Dashboard.DockWorkspace.HostedWorkspace',
        dockHostReference: 'dock-host',
        layout           : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add([{module: Container, cls: ['chrome-bar'], flex: 'none'}, {
            module   : Container,
            layout   : {ntype: 'fit'},
            reference: 'dock-host',
            items    : [this.projectDockModel(), {module: Container, cls: ['overlay-sibling']}]
        }])
    }
}

/**
 * The minimal tear-out consumer: platform open/close, optional grant and pane embodiment are
 * hooks; every admission, document, connection, return and teardown transition stays inherited.
 */
class TearOutWorkspace extends DockWorkspace {
    static config = {
        className                 : 'Test.Unit.Dashboard.DockWorkspace.TearOutWorkspace',
        enableDockTearOutLifecycle: true,
        layout                    : {ntype: 'vbox', align: 'stretch'},
        tearOutConnectWindowMs    : 20
    }

    closeRequests     = []
    closeResult       = true
    grant             = null
    lifecycleEvents   = []
    openDeferred      = null
    openRequests      = []
    unhandledConnects = []

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }

    admitTearOutConnection(context) {
        return this.grant ? this.grant(context) : true
    }

    afterTearOutPaneReturn(data) {
        const landed = data.returned && this.getReference(`tearout-pane-${data.itemId}`) === data.pane;

        this.lifecycleEvents.push(`return:${data.returned}:${Boolean(landed)}`)
    }

    afterTearOutWindowDisconnect() {
        this.lifecycleEvents.push('disconnect')
    }

    closeTearOutVessel(vessel) {
        this.closeRequests.push(vessel);
        this.onClose?.(vessel);
        return this.closeResult
    }

    onUnhandledWindowConnect(data) {
        this.unhandledConnects.push(data)
    }

    openTearOutVessel(request) {
        this.openRequests.push(request);

        return this.openDeferred || {
            admissionToken: request.admissionToken,
            popupHeight   : 360,
            popupWidth    : 480,
            windowName    : `tearout-${request.itemId}-${this.id}`
        }
    }

    resolvePane(itemId) {
        return {module: Container, reference: `tearout-pane-${itemId}`}
    }

    resolveTearOutPane(itemId) {
        return this.tearOutPaneHandles[itemId] || this.getReference(`tearout-pane-${itemId}`)
    }
}

Neo.setupClass(PlainWorkspace);
Neo.setupClass(ChromeWorkspace);
Neo.setupClass(HostedWorkspace);
Neo.setupClass(BrokenHostWorkspace);
Neo.setupClass(TearOutWorkspace);
Neo.setupClass(HostActionWorkspace);
Neo.setupClass(HostBothActionsWorkspace);

/**
 * Observes the boot sweep on BOTH axes: when it ran, and what it did.
 *
 * The log alone is not a witness — it survives deleting the consumed `super` call, so it certifies
 * scheduling and nothing else. Every arm below therefore also reads the projected `reload` action,
 * whose row is projection-CONSTANT while its `hidden` state is pane-dependent: a placeholder pane
 * owns no `dockReload()`, so the action projects visible and only this sweep can hide it. Deleting
 * the `super` call leaves the log intact and reds the state assertions, which is the point.
 */
class SweepWitnessWorkspace extends PlainWorkspace {
    static config = {
        className             : 'Test.Unit.Dashboard.DockWorkspace.SweepWitnessWorkspace',
        enableDockCloseAction : true,
        enableDockReloadAction: true
    }

    sweepLog = []

    syncDockHeaderActions() {
        this.sweepLog.push('sweep');
        return super.syncDockHeaderActions()
    }
}

Neo.setupClass(SweepWitnessWorkspace);

/**
 * Records the scheduled projection repair instead of running it. The contract under test is WHAT gets
 * scheduled and how often, not what a second projection then does — the reconciler's own spec owns that.
 */
class RepairWitnessWorkspace extends PlainWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspace.RepairWitnessWorkspace'
    }

    repairLog = []

    refreshDockWorkspace(tabInsertDescriptor, document, refreshOptions) {
        this.repairLog.push(refreshOptions);
        return Promise.resolve()
    }
}

Neo.setupClass(RepairWitnessWorkspace);

/**
 * The recreate fallback wired (`resolveFreshPane` overridden), so `reload` is offered on every node
 * with an active item while no pane carries `dockReload()` — the Workstation's shape. Which nodes the
 * post-settle sweep REACHES is then the only thing deciding whether the action shows.
 */
class RecreateFallbackWorkspace extends PlainWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspace.RecreateFallbackWorkspace'
    }

    resolveFreshPane(itemId, item) {
        return this.resolvePane(itemId, item)
    }
}

Neo.setupClass(RecreateFallbackWorkspace);

/**
 * A consumer minting deterministic pane ids from a config — the shape every dock component fixture
 * uses. Reveal and flow resolve from the same config, so the reveal pane and the flow pane compete
 * for one id across the pin escape.
 */
class FixedIdWorkspace extends RecreateFallbackWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspace.FixedIdWorkspace'
    }

    resolvePane(itemId, item) {
        return {ntype: 'component', id: `fixed-id-pane-${itemId}`, text: item?.title || itemId}
    }
}

Neo.setupClass(FixedIdWorkspace);


const
    tabsOf = shell => DockProjectionReconciler.collectProjectedTabs(shell),
    railOf = shell => {
        let found = null;

        const visit = component => {
            if (!component || found) return;

            if (component.dockNodeType === 'edge-rail') {
                found = component;
                return
            }

            component.items?.forEach(visit)
        };

        visit(shell);

        return found
    },
    collect = (config, predicate, out=[]) => {
        if (config && typeof config === 'object') {
            predicate(config) && out.push(config);
            (config.items || []).forEach(item => collect(item, predicate, out))
        }

        return out
    };

/**
 * @summary Contract specs for the engine-owned dock workspace host: the holder contract, the
 * single mutation path, the atomic deferred re-projection chain, the hooks a consumer owns, the
 * dock-host indirection, and teardown.
 */
test.describe('Neo.dashboard.dock.Workspace', () => {
    let workspace;

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test.describe('#17947 pop-out dispatches the drag terminal, never a second lifecycle', () => {
        // The whole point of the leaf: a click enters the SAME pair the pointer gesture's terminal
        // calls. These arms assert the dispatch and its ordering, because "no parallel lifecycle" is
        // only provable at the call — a handler that re-implemented `openVessel`/`applyOperation`
        // would satisfy every projection assertion above and still be the thing the ticket forbids.
        // The stub answers in the REAL seam's grammar: `window.TearOut`'s terminal returns a bare
        // Boolean, not an envelope. A stub that returned `{document, errors}` here would be a
        // reconstruction confirming itself — every arm would pass while the production translation
        // of a refusing terminal went unexercised.
        const armWorkspace = (calls, {commits=true, exitResult=undefined}={}) => {
            const ws = Neo.create(PlainWorkspace, {
                dockModel             : createDocument(),
                enableDockPopOutAction: true
            });

            ws.tearOutHandlers = {
                onDockTearOutExit: async data => {
                    calls.push(['exit', data]);
                    return exitResult
                },
                // Production grammar, and the whole point of the pair below: the real terminal
                // resolves `true` on a commit AND `retireVessel(...)` on refusal, which is ALSO true
                // when the retirement succeeds. So the Boolean cannot separate them — it is returned
                // as `true` in BOTH stub modes here, deliberately. What differs is whether the
                // document advances, which is the signal the handler must actually read.
                onDockTearOutTerminal: data => {
                    calls.push(['terminal', data]);

                    if (commits) {
                        ws.dockModel = Operations.applyOperation(
                            ws.dockModel, {operation: 'detachItem', itemId: data.itemId}
                        ).document
                    }

                    return true
                }
            };

            // No main thread in unit mode; the geometry delta is asserted separately from dispatch.
            ws.measureDockPaneRect = async () => ({height: 200, width: 400, x: 10, y: 20});

            return ws
        };

        const tabContainerFor = itemId => ({
            activeIndex: 0,
            getTabBar  : () => ({sortZoneConfig: {dockItemIds: [itemId]}}),
            id         : 'live-tabs'
        });

        test('stable pop-out membership separates explicit opt-out from handler availability', () => {
            // `tabsOf` yields item IDS, not tab nodes — reading `.headerActions` off one is
            // always undefined, which made the two `not.toContain` arms below pass vacuously until
            // the positive arm exposed it. `collect` walks the projection for the real node.
            const projectedAction = (ws, name) => {
                const tabs = collect(ws.projectDockModel(), config => config.dockNodeType === 'tabs')[0];

                expect(tabs, 'the fixture must project a tabs node, or these assertions prove nothing').toBeTruthy();

                return (tabs.headerActions || []).find(action => action.action === name)
            };

            // Default membership is stable, but no handler means the gesture cannot run yet.
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});
            expect(projectedAction(workspace, 'pop-out')).toMatchObject({action: 'pop-out', hidden: true});
            workspace.destroy();

            // Explicit false is the public compatibility escape: membership and name ownership end.
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument(), enableDockPopOutAction: false});
            expect(projectedAction(workspace, 'pop-out')).toBeUndefined();
            workspace.destroy();

            // One host-owned bundle is sufficient; no second base lifecycle is required.
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});
            workspace.tearOutHandlers = {
                onDockTearOutExit    : async () => true,
                onDockTearOutTerminal: async () => true
            };
            expect(workspace.enableDockTearOutLifecycle).toBe(false);
            expect(workspace.dockPopOutActionActive).toBe(true);
            expect(projectedAction(workspace, 'pop-out')).toMatchObject({action: 'pop-out', hidden: false})
        });

        test('the happy path calls exit then terminal, and carries the measured rect', async () => {
            const calls = [];

            workspace = armWorkspace(calls);

            const itemId = [...tabsOf(workspace.items[0])][0] ?? 'item-1';
            await workspace.handleDockPopOutAction({dockNodeId: 'main-tabs', tabContainer: tabContainerFor(itemId)});

            expect(calls.map(entry => entry[0])).toEqual(['exit', 'terminal']);

            // `sortZone: null` is the click's signature — the gesture supplies a live zone, a click
            // has none, and the seam already accepts the difference.
            expect(calls[0][1]).toMatchObject({itemId, sortZone: null});
            expect(calls[0][1].proxyRect).toMatchObject({height: 200, width: 400});
            expect(calls[1][1]).toEqual({itemId})
        });

        test('an admitted vessel whose detach the reducer refuses settles as a refusal, not a Boolean', async () => {
            const calls = [];

            // The terminal's own refusal route: it retired the vessel it had opened and committed
            // nothing. That has to reach the caller as the SAME `{document, errors}` envelope the
            // synchronous rows of the router use — leaking the seam's bare `false` would make a
            // refusal read as a falsy success to anyone checking `result.errors?.length`.
            workspace = armWorkspace(calls, {commits: false});

            const itemId = [...tabsOf(workspace.items[0])][0] ?? 'item-1',
                  result = await workspace.handleDockPopOutAction({dockNodeId: 'main-tabs', tabContainer: tabContainerFor(itemId)});

            expect(calls.map(entry => entry[0])).toEqual(['exit', 'terminal']);
            expect(result.errors?.[0]).toMatch(/refused by the detach commit/)
        });

        test('the handler holds NO lifecycle of its own — asserted from its source, not from behaviour', () => {
            // AC: "no click-specific reintegration branch exists (asserted structurally: one
            // terminal, one retire path)". Behaviour cannot show this — a handler that duplicated
            // the vessel/commit/return sequence would pass every behavioural arm in this file and
            // be exactly what the ticket forbids. Only the source text can witness an ABSENCE.
            const source = DockWorkspace.prototype.handleDockPopOutAction.toString();

            expect(source).toContain('admitDockPopOut');
            expect(source).toContain('onDockTearOutTerminal');

            for (const forbidden of [
                'applyOperation',      // it must not commit detachItem itself
                'applyDockZoneOperation',
                'openTearOutVessel',   // nor acquire a vessel outside the pair
                'acquireTearOutVessel',
                'reintegrateTearOutItem',
                'retireTearOutVessel',
                'onVesselRetired'
            ]) {
                expect(source, `pop-out must reach ${forbidden} only THROUGH the tear-out pair`).not.toContain(forbidden)
            }
        });

        // A COMMITTED pop-out is deliberately not asserted from a stub. The real terminal resolves
        // `true` for a commit and `retireVessel(...)` for a refusal — which is also true when the
        // retirement succeeds — so any stub that models the outcome with a Boolean teaches the wrong
        // grammar, and a handler reading that Boolean would report detaches that never happened.
        // The commit is witnessed against the real lifecycle instead, in the engine tear-out
        // lifecycle matrix below — the arm that drives a real vessel admission and asserts the
        // committed document no longer contains the item. What the stubs above are for is dispatch,
        // ordering, geometry and pre-terminal refusal.

        test('with the lifecycle off, a HOST owns pop-out and the engine re-emits its intent', async () => {
            // The two questions — may a host own the name, and does the engine intercept the intent —
            // must agree. They did not: projection freed the name on both configs while the router
            // intercepted on the action config alone, so a host action named `pop-out` rendered
            // legally and then vanished into an engine handler that had no pipeline to dispatch into.
            workspace = Neo.create(PlainWorkspace, {
                dockModel             : createDocument(),
                enableDockPopOutAction: true   // ...and enableDockTearOutLifecycle deliberately OFF
            });

            expect(workspace.dockPopOutActionActive, 'the engine does not own it without the lifecycle').toBe(false);

            const intents = [];

            workspace.on('dockHeaderAction', data => intents.push(data));

            const tabContainer = {id: 'host-tabs'};

            workspace.onDockHeaderAction({action: 'pop-out', dockNodeId: 'main-tabs', tabContainer});

            expect(intents).toHaveLength(1);
            expect(intents[0]).toMatchObject({action: 'pop-out', dockNodeId: 'main-tabs', tabContainer})
        });

        test('a refused vessel commits NOTHING — terminal is never reached', async () => {
            const calls = [];

            // Admission-first and fail-closed: `onDockTearOutExit` resolving false is the host
            // declining the window, and the pane must stay docked with no detach committed.
            workspace = armWorkspace(calls, {exitResult: false});

            const itemId = [...tabsOf(workspace.items[0])][0] ?? 'item-1',
                  result = await workspace.handleDockPopOutAction({dockNodeId: 'main-tabs', tabContainer: tabContainerFor(itemId)});

            expect(calls.map(entry => entry[0])).toEqual(['exit']);
            expect(result.errors?.[0]).toMatch(/refused by the host vessel seam/)
        });

        test('refuses before dispatch when there is no active item, and when the lifecycle is absent', async () => {
            const calls = [];

            workspace = armWorkspace(calls);

            const noItem = await workspace.handleDockPopOutAction({
                dockNodeId  : 'main-tabs',
                tabContainer: {activeIndex: null, getTabBar: () => ({sortZoneConfig: {dockItemIds: []}}), id: 'live-tabs'}
            });

            expect(noItem.errors?.[0]).toMatch(/requires an active item/);
            expect(calls).toEqual([]);

            // Unreachable through the projection contract — the action is double-gated on the
            // lifecycle that creates these handlers — but the router is reachable by a host
            // re-emitting the intent, so it must refuse rather than throw on a missing pipeline.
            workspace.tearOutHandlers = null;

            const itemId = [...tabsOf(workspace.items[0])][0] ?? 'item-1',
                  noPipe = await workspace.handleDockPopOutAction({dockNodeId: 'main-tabs', tabContainer: tabContainerFor(itemId)});

            expect(noPipe.errors?.[0]).toMatch(/requires a tear-out handler bundle/);
            expect(calls).toEqual([])
        })
    });

    test('the holder contract: a config-assigned document is readable before any operation', () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        expect(workspace.getDockZoneDocument()).toBe(document);
        expect(workspace.getDockHost()).toBe(workspace);
        expect(tabsOf(workspace.items[0]).size).toBe(2)
    });

    test('a Workspace-backed projection bounds every tab sort zone to the Workspace root without arming tear-out', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const projectedTabs = tabsOf(workspace.projectDockModel());

        expect(projectedTabs.size).toBe(2);

        projectedTabs.forEach(tabContainer => {
            expect(tabContainer.headerToolbar.sortZoneConfig).toMatchObject({
                allowOverdrag      : false,
                boundaryContainerId: workspace.id,
                enableProxyToPopup : false
            })
        })
    });

    test('an action the workspace does not own is re-emitted to the host with its node id', () => {
        workspace = Neo.create(PlainWorkspace, {
            dockModel          : createDocument(),
            enableDockPinAction: false
        });

        const received     = [],
              tabContainer = {id: 'live-tabs'};

        workspace.on('dockHeaderAction', data => received.push(data));

        // No close opt-in here on purpose: a host projecting only its OWN actions must still receive
        // their intent. Swallowing it — which the class did for everything but `close` — is what made
        // the header slot unusable for anyone else.
        const result = workspace.onDockHeaderAction({action: 'pin', dockNodeId: 'main-tabs', tabContainer});

        expect(result, 'the workspace still declines to act on an action it does not own').toBeNull();
        expect(received).toEqual([{
            action    : 'pin',
            dockNodeId: 'main-tabs',
            source    : workspace.id,
            tabContainer
        }]);

        // The WIRING, not just the method. Projecting without the close opt-in must still bind the
        // seam onto every tabs node, which is the half that was conditional.
        const findTabs = config => config?.dockNodeType === 'tabs'
            ? config
            : (config?.items || []).reduce((found, child) => found || findTabs(child), null);

        const tabsNode = findTabs(workspace.projectDockModel());

        expect(tabsNode, 'the projection exposes a tabs node to wire').toBeTruthy();
        tabsNode.listeners.headerAction({action: 'pin', tabContainer});

        expect(received).toHaveLength(2)
    });

    test('a host resolver reaches the live toolbar, routes its intent, and survives reprojection', async () => {
        hostResolverCalls.length = 0;
        workspace = Neo.create(HostActionWorkspace, {dockModel: createDocument()});

        const received = [];
        workspace.on('dockHeaderAction', data => received.push(data));

        // `side-tabs` deliberately, not the first node: `editor-tabs` holds ONE item already at
        // index 0, so the activation below would be a no-op and the identity assertion would hold
        // across nothing happening.
        const nodeId       = 'side-tabs',
              tabContainer = tabsOf(workspace.items[0]).get(nodeId),
              action       = tabContainer.getActionItem('pin');

        // The adapter-level arms prove the projection CONFIG carries the action. This proves the
        // config became a real toolbar item on a live workspace that supplied the resolver through
        // the documented hook — the layer a host actually touches.
        expect(action, 'the host action materialized as a live toolbar item').toBeTruthy();
        expect(hostResolverCalls, 'the resolver is asked per tabs node').toContain(nodeId);
        expect(workspace.enableDockCloseAction, 'host actions work with the close action OFF').toBe(false);

        // Dispatch the action itself rather than calling the projected listener by hand: the handler
        // is what a press runs, and it is the part that was previously wired only under the close
        // opt-in.
        action.handler({component: action});

        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({action: 'pin', dockNodeId: nodeId, source: workspace.id});

        // AC-5, which the first round asserted by reasoning rather than by evidence: a commit and
        // reprojection must not REPLACE the action instance, or `actionVisibilityChange` consumers
        // such as tab Overflow lose the component they are bound to.
        //
        // The transition has to be REAL, and the three guards below exist because an identity
        // assertion is trivially true when nothing happened: the index actually moves, the COMMITTED
        // document records the new active item, and a fresh refresh is scheduled.
        const refreshBefore   = workspace.refreshPromise,
              resolvesForNode = () => hostResolverCalls.filter(id => id === nodeId).length,
              resolvesBefore  = resolvesForNode();

        expect(tabContainer.activeIndex, 'starts on the first item').toBe(0);

        await tabContainer.set({activeIndex: 1});
        await workspace.refreshPromise;

        expect(workspace.getDockZoneDocument().nodes[nodeId].activeItemId,
            'the activation committed to the document, not just the view').toBe('terminal');
        expect(workspace.refreshPromise,
            'a reprojection was actually scheduled by that commit').not.toBe(refreshBefore);

        const afterReproject = [...tabsOf(workspace.items[0]).entries()]
            .find(([id]) => id === nodeId)?.[1]?.getActionItem('pin');

        expect(afterReproject, 'the action survives reprojection').toBeTruthy();
        expect(afterReproject, 'and it is the SAME instance, not a rebuilt group').toBe(action);

        // This is what makes the identity assertion mean something. The projection path DID run
        // again — the resolver was asked a second time for this node — and the retained node kept
        // its existing action instance anyway. So the stability above is reconciliation winning over
        // a real re-projection, not an absence of one.
        //
        // It is also why `node-static` is the honest contract rather than a convenience: a resolver
        // returning a DIFFERENT action set on that second call does not take effect, so promising
        // per-active-item lists would have been a promise the machinery cannot keep.
        expect(resolvesForNode(),
            'the projection path really re-ran for this node').toBeGreaterThan(resolvesBefore)
    });

    test('#17681 owns the reusable tear-out lifecycle on DockWorkspace, not on application hosts', () => {
        for (const method of [
            'adoptTearOutPane',
            'applyTearOutOperation',
            'onWindowConnect',
            'onWindowDisconnect',
            'reintegrateTearOutItem',
            'reparentTearOutPane'
        ]) {
            expect(typeof DockWorkspace.prototype[method], `${method} is engine-owned`).toBe('function')
        }

        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});
        expect(workspace.tearOutHandlers).toBeNull();
        expect(workspace.getDockProjectionOptions()).toEqual({})
    });

    test.describe('#17681 engine tear-out lifecycle matrix', () => {
        let previousApps, previousGetByPath, urls;

        const createSortZone = () => {
            const calls = {ended: 0, started: []};

            return {
                calls,
                endWindowDrag  : () => calls.ended++,
                startWindowDrag: data => calls.started.push(data)
            }
        };

        const vesselUrl = (request, itemId, {
            flow  = 'tear-out',
            hostId = workspace.id,
            token = request.admissionToken
        } = {}) => {
            const url = new URL('https://unit.test/widget/index.html');

            url.searchParams.set('tearout', itemId);
            url.searchParams.set('hostId', hostId);
            flow !== null && url.searchParams.set('vesselFlow', flow);
            token !== null && url.searchParams.set('vesselAdmission', String(token));

            return url.href
        };

        const addWindow = (windowId, url) => {
            const mainView = Neo.create(Container, {});

            Neo.apps[windowId] = {mainView};
            urls[windowId] = url;

            return mainView
        };

        const beginExit = async itemId => {
            const zone = createSortZone();

            await workspace.tearOutHandlers.onDockTearOutExit({
                itemId,
                proxyRect: {x: 20, y: 30, width: 480, height: 360},
                sortZone : zone
            });

            return {request: workspace.openRequests.at(-1), zone}
        };

        test.beforeEach(() => {
            previousApps      = Neo.apps;
            previousGetByPath = Neo.Main.getByPath;
            urls              = {};
            Neo.apps          = {};
            Neo.Main.getByPath = async ({windowId}) => urls[windowId]
        });

        test.afterEach(() => {
            workspace?.destroy?.();
            workspace = null;
            Neo.apps = previousApps;
            Neo.Main.getByPath = previousGetByPath
        });

        test('#17947 pop-out commits detachItem through the REAL lifecycle, not a stubbed pair', async () => {
            // The handler arms elsewhere in this file stub `tearOutHandlers` to assert dispatch and
            // ordering. This one drives the real thing: real admission, real reducer, real committed
            // document — which is the AC that matters, because dispatching correctly into a broken
            // pipeline would satisfy every ordering assertion and still detach nothing.
            workspace = Neo.create(TearOutWorkspace, {
                dockModel             : createDocument(),
                enableDockPopOutAction: true
            });

            const tabContainer = {
                activeIndex: 0,
                getTabBar  : () => ({sortZoneConfig: {dockItemIds: ['preview']}}),
                id         : 'popout-tabs'
            };

            // `measureDockPaneRect` finds no `Neo.main.DomAccess` here and resolves null. That is the
            // documented degradation — the vessel opens at the host's default geometry rather than a
            // wrong one — so the commit path is exercised exactly as it is in production.
            const result = await workspace.handleDockPopOutAction({dockNodeId: 'main-tabs', tabContainer});

            expect(result, 'the terminal must return a result, not a refusal envelope').toBeTruthy();
            expect(result.errors ?? []).toEqual([]);

            await workspace.refreshPromise;

            // The committed document is the witness: the item left the dock through `detachItem`.
            const committed = workspace.getDockZoneDocument();

            expect(Document.findOwningEdge(committed, 'preview'), 'a detached item owns no edge').toBeFalsy();
            expect(workspace.tearOutPanes.preview, 'the vessel holds the pane').toBeTruthy()
        });

        test('#17947 a REDUCER refusal reaches the caller as a refusal, though the terminal resolved TRUE', async () => {
            // The falsifier this arm exists for: `window.TearOut`'s terminal returns `true` on a
            // committed detach AND `retireVessel(vessel)` on a reducer refusal — which is ALSO true
            // when the retirement succeeds. Reading that Boolean as success reports a detach that
            // never happened.
            //
            // The sibling stub arm injects `terminalResult` and therefore certifies a grammar the
            // production terminal never emits. This one drives the REAL pair: real admission, the
            // real `createDockTearOutHandlers` terminal, the real `applyTearOutOperation` wrapper
            // (including its placement capture and rollback), and a real vessel retirement whose
            // success is what makes the Boolean lie.
            workspace = Neo.create(TearOutWorkspace, {
                dockModel             : createDocument(),
                enableDockPopOutAction: true
            });

            // The refusal enters at the reducer — the one seam a refusal actually comes from in
            // production. Everything above it stays real, which is the point: the wrapper must
            // reach its verdict from the committed document, not from what the pair returned.
            workspace.applyDockZoneOperation = descriptor => descriptor?.operation === 'detachItem'
                ? {document: null, errors: ['detachItem refused by the reducer']}
                : {document: workspace.dockModel, errors: []};

            // The document seam must never fire on a refusal. Counted rather than inferred from the
            // document: a sync that ran and committed the SAME document would be invisible to a
            // content comparison, and it is the call that is forbidden here.
            const syncs        = [],
                  realSync     = workspace.onTearOutDocumentChange.bind(workspace),
                  realTerminal = workspace.tearOutHandlers.onDockTearOutTerminal;

            workspace.onTearOutDocumentChange = (...args) => {
                syncs.push(args);
                return realSync(...args)
            };

            // Captured so the arm can assert the Boolean was genuinely `true` — without that, a
            // refusal envelope proves nothing, because a terminal returning `false` would produce
            // the same envelope for an entirely different reason.
            let terminalResult;

            workspace.tearOutHandlers.onDockTearOutTerminal = async data => {
                terminalResult = await realTerminal(data);
                return terminalResult
            };

            const tabContainer = {
                activeIndex: 0,
                getTabBar  : () => ({sortZoneConfig: {dockItemIds: ['preview']}}),
                id         : 'popout-tabs'
            };

            const result = await workspace.handleDockPopOutAction({dockNodeId: 'main-tabs', tabContainer});

            // The lie, witnessed: the retirement succeeded, so the terminal reports `true`.
            expect(terminalResult, 'a refusal whose cleanup succeeded still resolves true').toBe(true);

            // And the caller is told the truth anyway.
            expect(result.errors?.[0]).toMatch(/refused by the detach commit/);

            // Zero document sync, on both readings: the seam never fired, and the item is still
            // exactly where it was — `wasInTree` was true going in, so this is an observed
            // non-transition rather than the absence of any evidence.
            expect(syncs, 'a refused detach commits nothing').toEqual([]);
            expect(Document.findContainingTabsId(workspace.getDockZoneDocument(), 'preview'))
                .toBe('side-tabs');

            // The vessel the refusal opened is retired — once. This is what made the Boolean true,
            // so an arm that did not assert it would not have reproduced the falsifier at all.
            expect(workspace.closeRequests.filter(vessel => vessel.itemId === 'preview'))
                .toHaveLength(1);

            // The rollback half of the real wrapper: a refused detach keeps no placement record,
            // which is what lets a later attempt capture a fresh one.
            expect(workspace.tearOutPlacements.preview, 'a refused detach records no placement').toBeUndefined()
        });

        // A click is asynchronous across two awaits while `destroy()` is synchronous, so the window
        // between them is reachable in production: the pane is measured through the main thread, and
        // the host's vessel seam can take arbitrarily long to answer. These two arms drive a REAL
        // `destroy()` into each gap. The stub harness cannot host them — `destroy()` only nulls
        // `tearOutHandlers` under `enableDockTearOutLifecycle`, so a stubbed pair would be testing a
        // teardown that never happens.
        const popOutTabContainer = () => ({
            activeIndex: 0,
            getTabBar  : () => ({sortZoneConfig: {dockItemIds: ['preview']}}),
            id         : 'popout-tabs'
        });

        test('#17947 a pop-out whose MEASUREMENT outlives the workspace never asks for a vessel', async () => {
            const ws = Neo.create(TearOutWorkspace, {
                dockModel             : createDocument(),
                enableDockPopOutAction: true
            });

            workspace = null;   // this arm owns the teardown; afterEach must not destroy twice

            // Collected test-side, not read off the instance: `destroy()` clears the harness fields,
            // so `ws.openRequests` is gone by the time the assertion runs and would read as an empty
            // observation rather than as an observed absence.
            const opens = [];

            ws.openTearOutVessel = request => {
                opens.push(request);

                return {admissionToken: request.admissionToken, windowName: 'tearout-unreachable'}
            };

            // Teardown lands inside the FIRST await. Nothing has been admitted yet, so the only
            // correct outcome is to refuse before the seam is ever called: opening a vessel for a
            // workspace that is already gone is the orphan this guard exists to prevent.
            ws.measureDockPaneRect = async () => {
                ws.destroy();
                return null
            };

            const result = await ws.handleDockPopOutAction({
                dockNodeId: 'main-tabs', tabContainer: popOutTabContainer()
            });

            // Settles as an envelope. A rejection here would surface as an unhandled rejection in
            // production, because the projection listener discards this promise.
            expect(result, 'the abandoned path must settle, never reject').toBeTruthy();
            expect(result.errors?.[0]).toMatch(/destroyed before admission/);
            expect(opens, 'no vessel may be requested for a workspace that is gone').toEqual([])
        });

        test('#17947 an ADMISSION that lands after teardown closes its vessel exactly once', async () => {
            const ws = Neo.create(TearOutWorkspace, {
                dockModel             : createDocument(),
                enableDockPopOutAction: true
            });

            workspace = null;

            let admitLate, reachedSeam;

            const
                atSeam   = new Promise(resolve => {reachedSeam = resolve}),
                admitted = new Promise(resolve => {admitLate = resolve}),
                opens    = [],
                closes   = [];

            // Both collected test-side: `destroy()` clears the harness fields, and the close under
            // test happens on the far side of that teardown — recording into the instance would
            // either throw or be swept away with it.
            ws.closeTearOutVessel = vessel => {
                closes.push(vessel);

                return true
            };

            // Deterministic, not timed: the seam itself signals that the handler is parked in the
            // admission await, so the teardown below lands in the gap every run rather than when a
            // sleep happens to be long enough.
            ws.openTearOutVessel = request => {
                opens.push(request);
                reachedSeam();

                return admitted
            };

            // The terminal is the ONLY commit seam, so watching it is how "no post-destroy commit"
            // is observed directly rather than inferred from a document that teardown already took.
            const
                terminals    = [],
                realTerminal = ws.tearOutHandlers.onDockTearOutTerminal;

            ws.tearOutHandlers.onDockTearOutTerminal = data => {
                terminals.push(data);

                return realTerminal(data)
            };

            const pending = ws.handleDockPopOutAction({
                dockNodeId: 'main-tabs', tabContainer: popOutTabContainer()
            });

            await atSeam;

            // The vessel is REAL and open by the time the workspace goes away.
            ws.destroy();

            admitLate({
                admissionToken: opens[0]?.admissionToken,
                popupHeight   : 360,
                popupWidth    : 480,
                windowName    : 'tearout-late-preview'
            });

            const result = await pending;

            // Settles as an envelope rather than rejecting: the projection listener discards this
            // promise, so a rejection here is an unhandled rejection in production.
            expect(result, 'the abandoned path must settle, never reject').toBeTruthy();

            // The refusal is REAL but its attribution is the seam's, not the workspace's: the
            // coordinator refuses because its own state was retired underneath it, which arrives at
            // the handler indistinguishable from a host declining the window. The handler's
            // "destroyed after admission" branch is therefore not reached on this path — the
            // admission never resolves truthy for it to check.
            expect(result.errors?.[0]).toMatch(/refused by the host vessel seam/);

            // No commit and no terminal: whatever the attribution, teardown must not advance the
            // document. This is the half that is unambiguously contractual.
            expect(terminals, 'a destroyed workspace reaches no commit seam').toEqual([]);

            // EXACTLY ONCE. The host opened a real OS window on the far side of teardown, so the
            // only correct outcome is that it is asked to close it — once. `toHaveLength(1)` is the
            // whole assertion: zero is the orphan this guard exists to prevent, and two is a
            // double-close of a window the host has already disposed of.
            //
            // Measured across BOTH close collectors rather than inferred — the harness seam and the
            // instance override are each recorded, so a close landing on either is counted.
            //
            // Note the attribution above: the coordinator still reports a seam refusal, because
            // `acquireTearOutVessel` refuses on behalf of a destroyed workspace. The cleanup is the
            // workspace's own, taken before that refusal is handed back.
            expect(closes.filter(vessel => vessel.windowName === 'tearout-late-preview'))
                .toHaveLength(1)
        });

        test('terminal-first connect lands one admitted live pane, then returns it before observers fire', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            const
                pane            = workspace.getReference('tearout-pane-preview'),
                {request, zone} = await beginExit('preview');

            expect(workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'preview', sortZone: zone})).toBe(true);
            expect(workspace.tearOutPanes.preview).toMatchObject({windowId: null});
            expect(workspace.tearOutPaneHandles.preview).toBe(pane);
            await workspace.refreshPromise;

            const mainView = addWindow('terminal-first', vesselUrl(request, 'preview'));

            await workspace.onWindowConnect({windowId: 'terminal-first'});

            expect(mainView.items).toContain(pane);
            expect(workspace.tearOutPanes.preview.windowId).toBe('terminal-first');
            expect(workspace.tearOutAdmissions.has('preview')).toBe(false);

            await workspace.onWindowDisconnect({windowId: 'terminal-first'});

            expect(mainView.items).not.toContain(pane);
            expect(workspace.getReference('tearout-pane-preview')).toBe(pane);
            expect(workspace.dockModel.nodes['side-tabs'].items).toEqual(['preview', 'terminal']);
            expect(workspace.lifecycleEvents).toEqual(['return:true:true', 'disconnect'])
        });

        test.describe('#18077 the host opens the geometry stream for its window and for every admitted vessel', () => {
            let calls, originalSetConfigs, originalWindowPosition, windowPosition;

            test.beforeEach(() => {
                originalWindowPosition = Neo.main?.addon?.WindowPosition;
                windowPosition         = originalWindowPosition ?? Neo.ns('Neo.main.addon.WindowPosition', true);
                originalSetConfigs     = windowPosition.setConfigs;
                calls                  = [];

                windowPosition.setConfigs = data => {
                    calls.push(data);
                    return Promise.resolve()
                }
            });

            test.afterEach(() => {
                if (originalWindowPosition) {
                    originalSetConfigs
                        ? windowPosition.setConfigs = originalSetConfigs
                        : delete windowPosition.setConfigs
                } else {
                    delete Neo.main.addon.WindowPosition
                }
            });

            test('construction opens movement AND resize for the host render target; a realm without the addon opens nothing and throws nothing', () => {
                workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument(), windowId: 'host-window'});

                expect(calls, 'one stream, both observations, the host window').toEqual([
                    {observeMovement: true, observeResize: true, windowId: 'host-window'}
                ]);

                // A host running its own admission (no engine lifecycle) docks across windows too:
                // the arming is not gated on the lifecycle flag.
                const plain = Neo.create(PlainWorkspace, {dockModel: createDocument(), windowId: 'plain-window'});

                try {
                    expect(calls.at(-1), 'every dock host opens its stream').toEqual(
                        {observeMovement: true, observeResize: true, windowId: 'plain-window'}
                    )
                } finally {
                    plain.destroy()
                }

                // The app's opt-in is the addon itself: without it the call is a no-op, never a throw.
                const addon = Neo.main.addon.WindowPosition;

                delete Neo.main.addon.WindowPosition;

                try {
                    const bare = Neo.create(PlainWorkspace, {dockModel: createDocument(), windowId: 'bare-window'});

                    bare.destroy();
                    expect(calls, 'no addon, no stream').toHaveLength(2)
                } finally {
                    Neo.main.addon.WindowPosition = addon
                }
            });

            test('an admitted vessel opens its stream before the connection reaches any ownership branch', async () => {
                workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument(), windowId: 'host-window'});

                const {request, zone} = await beginExit('preview');

                expect(workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'preview', sortZone: zone})).toBe(true);
                await workspace.refreshPromise;

                const mainView = addWindow('vessel-window', vesselUrl(request, 'preview'));

                workspace.afterTearOutWindowConnect = () => calls.push('afterTearOutWindowConnect');

                await workspace.onWindowConnect({windowId: 'vessel-window'});

                expect(calls, 'host at construction, vessel on admission, observers last').toEqual([
                    {observeMovement: true, observeResize: true, windowId: 'host-window'},
                    {observeMovement: true, observeResize: true, windowId: 'vessel-window'},
                    'afterTearOutWindowConnect'
                ]);
                expect(mainView.items, 'the pane entered its vessel after the stream opened').toHaveLength(1)
            });
        });

        test('connect-first keeps exact admission identity until the detached terminal consumes it', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            const
                pane            = workspace.getReference('tearout-pane-preview'),
                {request, zone} = await beginExit('preview'),
                mainView        = addWindow('connect-first', vesselUrl(request, 'preview'));

            await workspace.onWindowConnect({windowId: 'connect-first'});

            expect(workspace.tearOutConnects.preview).toMatchObject({windowId: 'connect-first'});
            expect(workspace.tearOutAdmissions.get('preview')).toMatchObject({connected: true, timerId: null});
            expect(mainView.items).not.toContain(pane);

            expect(workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'preview', sortZone: zone})).toBe(true);

            expect(mainView.items).toContain(pane);
            expect(workspace.tearOutPanes.preview.windowId).toBe('connect-first');
            expect(workspace.tearOutAdmissions.has('preview')).toBe(false)
        });

        test('a worker may connect before platform-open settlement without being misclosed as stale', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            let resolveOpen;

            workspace.openDeferred = new Promise(resolve => {resolveOpen = resolve});

            const zone = createSortZone(),
                  exit = workspace.tearOutHandlers.onDockTearOutExit({
                      itemId: 'preview', proxyRect: {}, sortZone: zone
                  });

            await expect.poll(() => workspace.openRequests.length).toBe(1);

            const
                request  = workspace.openRequests[0],
                mainView = addWindow('early-connect', vesselUrl(request, 'preview'));

            await workspace.onWindowConnect({windowId: 'early-connect'});
            expect(workspace.tearOutAdmissions.get('preview')).toMatchObject({connected: true});

            resolveOpen({
                admissionToken: request.admissionToken,
                popupHeight   : 360,
                popupWidth    : 480,
                windowName    : `tearout-preview-${workspace.id}`
            });
            await exit;

            expect(workspace.closeRequests).toEqual([]);
            expect(workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'preview', sortZone: zone})).toBe(true);
            expect(mainView.items).toContain(workspace.tearOutPaneHandles.preview)
        });

        test('wrong host, missing/wrong flow and wrong token never reach product continuation or ownership', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            const {request} = await beginExit('preview'),
                  cases     = [
                      ['wrong-host', vesselUrl(request, 'preview', {hostId: 'other'})],
                      ['missing-flow', vesselUrl(request, 'preview', {flow: null})],
                      ['wrong-flow', vesselUrl(request, 'preview', {flow: 'transfer'})],
                      ['wrong-token', vesselUrl(request, 'preview', {token: request.admissionToken + 1})]
                  ];

            for (const [windowId, url] of cases) {
                addWindow(windowId, url);
                await workspace.onWindowConnect({windowId})
            }

            expect(workspace.unhandledConnects).toEqual([]);
            expect(workspace.tearOutConnects.preview).toBeUndefined();
            expect(workspace.tearOutAdmissions.get('preview').token).toBe(request.admissionToken);

            await workspace.tearOutHandlers.onDockTearOutCancel({itemId: 'preview'})
        });

        test('an async grant cannot publish a connection after its exact admission was retired', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            let releaseGrant;

            workspace.grant = () => new Promise(resolve => {releaseGrant = resolve});

            const {request} = await beginExit('preview'),
                  mainView  = addWindow('grant-race', vesselUrl(request, 'preview')),
                  connect   = workspace.onWindowConnect({windowId: 'grant-race'});

            await expect.poll(() => typeof releaseGrant).toBe('function');

            workspace.clearTearOutAdmission('preview', workspace.tearOutAdmissions.get('preview'));
            releaseGrant(true);
            await connect;

            expect(workspace.tearOutConnects.preview).toBeUndefined();
            expect(mainView.items).toEqual([]);

            await workspace.tearOutHandlers.onDockTearOutCancel({itemId: 'preview'})
        });

        test('a refused detach retires the vessel and leaves no placement or pane ownership', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            const
                before          = JSON.stringify(workspace.dockModel),
                {request, zone} = await beginExit('preview');

            workspace.applyDockZoneOperation = () => ({document: null, errors: ['refused']});

            await workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'preview', sortZone: zone});

            expect(JSON.stringify(workspace.dockModel)).toBe(before);
            expect(workspace.closeRequests).toHaveLength(1);
            expect(workspace.closeRequests[0].admissionToken).toBe(request.admissionToken);
            expect(workspace.tearOutPlacements.preview).toBeUndefined();
            expect(workspace.tearOutPaneHandles.preview).toBeUndefined()
        });

        test('a pre-terminal disconnect retires only provisional ownership with zero document mutation', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            const
                before          = JSON.stringify(workspace.dockModel),
                {request, zone} = await beginExit('preview');

            addWindow('preterminal-disconnect', vesselUrl(request, 'preview'));
            await workspace.onWindowConnect({windowId: 'preterminal-disconnect'});
            await workspace.onWindowDisconnect({windowId: 'preterminal-disconnect'});

            expect(JSON.stringify(workspace.dockModel)).toBe(before);
            expect(workspace.tearOutConnects.preview).toBeUndefined();
            expect(workspace.tearOutAdmissions.has('preview')).toBe(false);
            expect(workspace.tearOutHandlers.activeVessel).toBeNull();
            expect(zone.calls.ended).toBe(1);
            expect(workspace.lifecycleEvents).toEqual(['disconnect'])
        });

        test('connect timeout closes and ends the in-window embodiment, while explicit close refusal retains authority', async () => {
            workspace = Neo.create(TearOutWorkspace, {
                dockModel: createDocument(), tearOutConnectWindowMs: 1
            });

            let observeClose;

            const closed = new Promise(resolve => {observeClose = resolve});

            workspace.onClose = observeClose;

            const {zone} = await beginExit('preview');

            await closed;
            await expect.poll(() => workspace.tearOutAdmissions.has('preview')).toBe(false);

            expect(zone.calls.ended).toBe(1);
            expect(workspace.tearOutHandlers.activeVessel).toBeNull();

            workspace.destroy();
            workspace = Neo.create(TearOutWorkspace, {
                dockModel: createDocument(), tearOutConnectWindowMs: 1
            });
            workspace.closeResult = false;

            const refused = new Promise(resolve => {workspace.onClose = resolve});
            const second  = await beginExit('preview');

            await refused;

            expect(workspace.tearOutAdmissions.has('preview')).toBe(true);
            expect(workspace.tearOutHandlers.activeVessel).toBeTruthy();
            expect(second.zone.calls.ended).toBe(0);

            workspace.closeResult = true;
            await workspace.tearOutHandlers.onDockTearOutCancel({itemId: 'preview'})
        });

        test('stale-open close refusal remains tracked and blocks a successor until exact retry succeeds', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});
            workspace.closeResult = false;
            workspace.openTearOutVessel = request => ({
                admissionToken: request.admissionToken + 1,
                popupHeight   : 360,
                popupWidth    : 480,
                windowName    : `stale-preview-${workspace.id}`
            });

            const vessel = await workspace.acquireTearOutVessel({admissionToken: 7, itemId: 'preview'});

            expect(vessel).toBeNull();
            expect(workspace.tearOutRetirements.size).toBe(1);
            expect(workspace.tearOutAdmissions.has('preview')).toBe(true);

            const closeCount = workspace.closeRequests.length;

            expect(await workspace.acquireTearOutVessel({admissionToken: 8, itemId: 'preview'})).toBeNull();
            expect(workspace.closeRequests.length).toBe(closeCount + 1);

            workspace.closeResult = true;
            expect(await workspace.retryTearOutRetirements('preview')).toBe(true);
            expect(workspace.tearOutRetirements.size).toBe(0);
            expect(workspace.tearOutAdmissions.has('preview')).toBe(false)
        });

        test('failed reparent rejects loudly, retracts vessel ownership and returns the live pane', async () => {
            workspace = Neo.create(TearOutWorkspace, {dockModel: createDocument()});

            const
                pane            = workspace.getReference('tearout-pane-preview'),
                {request, zone} = await beginExit('preview');

            workspace.tearOutHandlers.onDockTearOutTerminal({itemId: 'preview', sortZone: zone});
            await workspace.refreshPromise;

            const mainView = addWindow('reparent-failure', vesselUrl(request, 'preview'));

            mainView.add = () => {throw new Error('reparent refused')};
            workspace.closeResult = false;

            await expect(workspace.onWindowConnect({windowId: 'reparent-failure'})).rejects.toThrow(/could not enter/);
            await expect.poll(() => workspace.dockModel.nodes['side-tabs'].items.includes('preview')).toBe(true);
            await workspace.refreshPromise;
            await expect.poll(() => workspace.tearOutRetirements.size).toBe(1);

            expect(workspace.tearOutPanes.preview).toBeUndefined();
            expect(workspace.getReference('tearout-pane-preview')).toBe(pane);
            expect(pane.isDestroyed).toBeFalsy();
            expect(workspace.closeRequests).toHaveLength(1);

            workspace.closeResult = true;
            expect(await workspace.retryTearOutRetirements('preview')).toBe(true);
            expect(workspace.tearOutRetirements.size).toBe(0);
            expect(workspace.closeRequests).toHaveLength(2)
        })
    });

    test('DockService resolves the class as a holder without any service change', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            dockService = Neo.create(DockService, {}),
            result      = await dockService.executeDockOperation({
                componentId: workspace.id,
                descriptor : {operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1}
            });

        await workspace.refreshPromise;

        expect(result.applied).toBe(true);
        expect(workspace.getDockZoneDocument().nodes['editor-tabs'].items).toEqual(['editor', 'terminal']);

        dockService.destroy()
    });

    test('applyDockZoneOperation is the pure reducer: fail-closed result, no self-mutation', () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        const before = JSON.stringify(document),
              result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'ghost', targetNodeId: 'editor-tabs', index: 0});

        expect(result.errors.length).toBeGreaterThan(0);
        expect(workspace.getDockZoneDocument()).toBe(document);
        expect(JSON.stringify(document)).toBe(before)
    });

    test('the opt-in close action resolves live identity, commits once, preserves its instance and focuses after refresh', async () => {
        const document = createDocument();

        document.items.terminal.closable = false;

        workspace = Neo.create(PlainWorkspace, {
            dockModel            : document,
            enableDockCloseAction: true
        });

        const
            tabs         = tabsOf(workspace.items[0]),
            side         = tabs.get('side-tabs'),
            closeAction  = side.getActionItem('close'),
            terminalTab  = side.getTabButtons()[1],
            focusTargets = [],
            commits      = [],
            apply        = workspace.applyDockZoneOperation.bind(workspace);

        workspace.applyDockZoneOperation = descriptor => {
            commits.push(descriptor);
            return apply(descriptor)
        };
        terminalTab.focus = () => focusTargets.push('terminal');

        expect(closeAction).toBeTruthy();
        expect(closeAction.hidden).toBe(false);

        await side.set({activeIndex: 1});
        expect(closeAction.hidden, 'explicit false is projected into live availability').toBe(true);
        await workspace.refreshPromise;

        expect(workspace.getDockZoneDocument().nodes['side-tabs'].activeItemId).toBe('terminal');

        const refused = workspace.onDockHeaderAction({action: 'close', dockNodeId: 'side-tabs', tabContainer: side});

        expect(refused.errors).toEqual(['item "terminal" is not closable']);
        expect(workspace.getDockZoneDocument().nodes['side-tabs'].activeItemId).toBe('terminal');
        expect(side.activeIndex).toBe(1);
        expect(side.getActionItem('close')).toBe(closeAction);
        expect(focusTargets).toEqual([]);

        const activationRefresh = workspace.refreshPromise;

        workspace.dockModel = null;

        const noDocument = workspace.onDockHeaderAction({action: 'close', dockNodeId: 'side-tabs', tabContainer: side});

        expect(noDocument.errors).toEqual(['Dock close action requires a committed document']);
        expect(workspace.refreshPromise).toBe(activationRefresh);
        expect(focusTargets).toEqual([]);

        workspace.dockModel = document;

        await side.set({activeIndex: 0});
        expect(closeAction.hidden).toBe(false);

        closeAction.handler({component: closeAction});
        await workspace.refreshPromise;

        const retainedSide = tabsOf(workspace.items[0]).get('side-tabs');

        expect(commits.map(item => [item.operation, item.itemId])).toEqual([
            ['setActiveItem', 'terminal'],
            ['closeItem',     'terminal'],
            ['closeItem',     'preview']
        ]);
        expect(workspace.getDockZoneDocument().nodes['side-tabs'].items).toEqual(['terminal']);
        expect(retainedSide).toBe(side);
        expect(retainedSide.getActionItem('close')).toBe(closeAction);
        expect(closeAction.hidden).toBe(true);
        expect(focusTargets).toEqual(['terminal'])
    });

    test('the opt-in pin action commits §2.7\'s two-step collapse through the write seam and rails the pane', async () => {
        const document = createEdgeDocument();

        // A PINNED edge pane is the two-step case: the model refuses `autoHidden` on a pinned item,
        // so the unpin is the collapse's precondition rather than an extra courtesy.
        document.items.inspector.pinned = true;

        workspace = Neo.create(PlainWorkspace, {
            dockModel          : document,
            enableDockPinAction: true
        });

        const
            tabs      = tabsOf(workspace.items[0]),
            inspector = tabs.get('inspector-tabs'),
            pinAction = inspector.getActionItem('pin'),
            commits   = [],
            apply     = workspace.applyDockZoneOperation.bind(workspace);

        workspace.applyDockZoneOperation = descriptor => {
            commits.push(descriptor);
            return apply(descriptor)
        };

        expect(pinAction, 'the engine set projects into the live header').toBeTruthy();
        expect(pinAction.hidden, 'an edge-owned pinnable pane can collapse').toBe(false);

        // Merely RENDERING the action changes no committed state — the projection is view-only.
        expect(workspace.getDockZoneDocument().items.inspector).toEqual({
            componentRef: 'Inspector', title: 'Inspector', kind: 'panel', pinned: true
        });

        pinAction.handler({component: pinAction});
        await workspace.refreshPromise;

        // Both steps are INDEPENDENT commits and both went through the class's own write seam — the
        // one `DockService` and `DockSplitter` reach a holder through. A folded single commit would
        // have shown only one of them here.
        expect(commits.map(descriptor => [descriptor.operation, descriptor.itemId])).toEqual([
            ['setItemPinned',     'inspector'],
            ['setItemAutoHidden', 'inspector']
        ]);

        const committed = workspace.getDockZoneDocument();

        expect(committed.items.inspector.pinned).toBe(false);
        expect(committed.items.inspector.autoHidden).toBe(true);

        // The collapse is not merely a flag: the pane leaves its tab flow and the owning edge grows a
        // rail. `right` is the band `findOwningEdge` named, so the derivation and the result agree.
        const projected = workspace.projectDockModel(),
              rails     = collect(projected, config => config.ntype === 'dashboard-dock-rail');

        expect(rails.length).toBe(1);
        expect(rails[0].edge).toBe('right');
        expect(rails[0].railItems.map(item => item.dockItemId)).toEqual(['inspector']);
        expect(tabsOf(projected).get('inspector-tabs'), 'an all-railed band keeps no tab flow').toBeUndefined()
    });

    test('an UNPINNED pane collapses in a single commit — the second step is a precondition, not a ritual', async () => {
        workspace = Neo.create(PlainWorkspace, {
            dockModel          : createEdgeDocument(),
            enableDockPinAction: true
        });

        const
            inspector = tabsOf(workspace.items[0]).get('inspector-tabs'),
            commits   = [],
            apply     = workspace.applyDockZoneOperation.bind(workspace);

        workspace.applyDockZoneOperation = descriptor => {
            commits.push(descriptor);
            return apply(descriptor)
        };

        inspector.getActionItem('pin').handler({component: inspector.getActionItem('pin')});
        await workspace.refreshPromise;

        expect(commits.map(descriptor => descriptor.operation)).toEqual(['setItemAutoHidden']);
        expect(workspace.getDockZoneDocument().items.inspector.autoHidden).toBe(true)
    });

    /**
     * `reload` is projected `hidden: true` by the stable-instance rule and revealed only by the
     * post-settle sweep. A railed item projects no tabs node; pinning it back CREATES one beside the
     * retained center — a node the reconciler's map (the OLD shell's tabs) never held. The sweep has
     * to reach it anyway, or the returned pane comes back without the one action the round trip owes it.
     */
    test('a pane pinned back from the rail returns with its reload action — the sweep reaches the FRESH node', async () => {
        const document = createEdgeDocument();

        // Committed auto-hidden: the right band projects a rail and no `inspector-tabs` node.
        document.items.inspector.autoHidden = true;

        workspace = Neo.create(RecreateFallbackWorkspace, {dockModel: document});

        expect(tabsOf(workspace.items[0]).get('inspector-tabs'), 'an all-railed band keeps no tab flow')
            .toBeUndefined();

        // The reveal overlay's pin control commits exactly this; the model clears `autoHidden` itself.
        const descriptor = {operation: 'setItemPinned', itemId: 'inspector', pinned: true},
              result     = workspace.applyDockZoneOperation(descriptor);

        expect(result.errors, 'the restore is a clean commit').toEqual([]);
        expect(result.document.items.inspector.autoHidden, 'and it un-hides the item').not.toBe(true);

        workspace.onDockZoneDocumentChange(result.document, descriptor);
        await workspace.refreshPromise;

        const tabs     = tabsOf(workspace.items[0]),
              returned = tabs.get('inspector-tabs');

        expect(returned, 'the band is back with a tabs node').toBeTruthy();

        // ONE post-settle sweep ran. It reached the retained node — that is the control — and it
        // has to reach the node the projection just created.
        expect(tabs.get('center-tabs').getActionItem('reload').hidden,
            'the post-settle sweep reached the retained node').toBe(false);
        expect(returned.getActionItem('reload')?.hidden,
            'the returned node offers reload exactly like a never-railed one').toBe(false)
    });

    /**
     * The reveal pane is a SEPARATE materialization of the item: a consumer resolving reveal and flow
     * from one config mints the same id for both. The refresh that returns the item to flow releases
     * the cached reveal pane BEFORE it mints the flow pane — otherwise the old rail's teardown
     * unregisters the id under the live flow pane, the refresh throws mid-teardown, and the post-settle
     * sweep never runs.
     */
    test('the pin escape returns a consumer-fixed-id pane to flow without an id collision, and the refresh settles', async () => {
        const document = createEdgeDocument();

        document.items.inspector.autoHidden = true;

        workspace = Neo.create(FixedIdWorkspace, {dockModel: document});

        const rail = railOf(workspace.items[0]);

        expect(rail, 'the right band projects a rail').toBeTruthy();

        // Reveal from the rail tab: the overlay materializes the pane from the consumer's config.
        rail.onTabClick({component: rail.items[0]});

        const revealPane = rail.revealPaneCache.inspector;

        expect(revealPane?.id, 'the reveal pane carries the consumer-minted id').toBe('fixed-id-pane-inspector');

        // The overlay's pin control: commits through the workspace reducer and dismisses the reveal.
        expect(rail.onRevealPinRequested({itemId: 'inspector'}).errors).toEqual([]);

        await workspace.refreshPromise;

        const tabs     = tabsOf(workspace.items[0]),
              returned = tabs.get('inspector-tabs'),
              flowPane = returned?.getCard(0);

        expect(flowPane?.id, 'the flow pane took the id').toBe('fixed-id-pane-inspector');
        expect(flowPane.isDestroyed, 'and it is alive').toBeFalsy();
        expect(Neo.get('fixed-id-pane-inspector'), 'registered under it — the only holder').toBe(flowPane);
        expect(revealPane.isDestroyed, 'the reveal pane was released before the flow pane was minted').toBe(true);
        expect(returned.getActionItem('reload')?.hidden, 'and the post-settle sweep ran on the returned node').toBe(false)
    });

    /**
     * The leave paths that bypass the rail (a restored perspective, a transfer) reach the reveal pane
     * only through the workspace's pre-projection sweep. The state machine's contract names those
     * transitions `itemCleared`, so the sweep retires the reveal STATE with the pane: an overlay whose
     * `revealPaneItemId` still named the departed item would short-circuit onto an empty slot the
     * next time that item is revealed.
     */
    test('the pre-projection sweep retires an open reveal with its pane — state, pointer and slot', async () => {
        const document = createEdgeDocument();

        document.items.inspector.autoHidden = true;

        workspace = Neo.create(FixedIdWorkspace, {dockModel: document});

        const rail = railOf(workspace.items[0]);

        rail.onTabClick({component: rail.items[0]});

        const revealPane = rail.revealPaneCache.inspector,
              overlay    = rail.revealOverlay;

        expect(rail.revealMachine.state, 'revealed').toBe('revealed-focused');
        expect(overlay.revealPaneItemId, 'the overlay names the revealed item').toBe('inspector');
        expect(overlay.paneSlot.items.includes(revealPane), 'and hosts its pane').toBe(true);

        // A restore that un-rails the item: the rail is never asked, only the sweep sees it leave.
        const restored = structuredClone(workspace.getDockZoneDocument());

        delete restored.items.inspector.autoHidden;

        await workspace.releaseStaleRevealPanes(restored);

        expect(rail.revealPaneCache.inspector, 'the cache forgot the pane').toBeUndefined();
        expect(revealPane.isDestroyed, 'the pane is destroyed').toBe(true);
        expect(rail.revealMachine.state, 'the reveal state is idle for the departed item').toBe('idle');
        expect(overlay.revealPaneItemId, 'the overlay no longer names it').toBeNull();
        expect(overlay.paneSlot.items, 'and its slot is empty').toHaveLength(0);

        // An item that stays railed is untouched by the same sweep.
        rail.onTabClick({component: rail.items[0]});
        await workspace.releaseStaleRevealPanes(workspace.getDockZoneDocument());

        expect(rail.revealPaneCache.inspector, 'a still-railed item keeps its reveal pane').toBeTruthy();
        expect(rail.revealMachine.state, 'and its reveal').toBe('revealed-focused')
    });

    test('the pin action refuses fail-closed where the collapse cannot complete, and moves by hidden on ONE instance', async () => {
        const document = createEdgeDocument();

        // Two items in the same edge band, opposite policies — so the action's availability changes
        // with the ACTIVE item inside one tabs node, which is what the sync has to get right.
        document.items.notes = {componentRef: 'Notes', title: 'Notes', kind: 'panel', pinnable: false};
        document.nodes['inspector-tabs'].items.push('notes');

        // A SECOND center item, so activating it drives the workspace's own policy sync over a
        // center-owned pane. With only one center item the sync never runs there and the assertion
        // below would only re-read what the adapter computed at projection time.
        document.items.readme = {componentRef: 'Readme', title: 'Readme', kind: 'panel'};
        document.nodes['center-tabs'].items.push('readme');

        workspace = Neo.create(PlainWorkspace, {
            dockModel          : document,
            enableDockPinAction: true
        });

        const
            tabs       = tabsOf(workspace.items[0]),
            inspector  = tabs.get('inspector-tabs'),
            center     = tabs.get('center-tabs'),
            pinAction  = inspector.getActionItem('pin'),
            visibility = [],
            // The EMITTER of each signal, not just its payload. "The group was not replaced" is a
            // claim about which instance spoke, and a rebuilt group would announce itself here by
            // emitting from a different object while the payload looked identical.
            signalSources = [];

        inspector.getTabBar().on('actionVisibilityChange', data => {
            visibility.push([data.action, data.component.hidden]);
            signalSources.push(data.component)
        });

        // Center-owned: §2.7's fail-safe — main content never rails, so the affordance is not offered.
        // Asserted BOTH where the adapter computed it and, below, after the workspace recomputes it:
        // the two derive it independently, and only the switch exercises the workspace's own sync.
        expect(center.getActionItem('pin').hidden, 'a center-owned pane cannot collapse').toBe(true);

        await center.set({activeIndex: 1});

        expect(center.getActionItem('pin').hidden, 'still no collapse after the workspace re-syncs a center pane')
            .toBe(true);

        expect(pinAction.hidden).toBe(false);

        await inspector.set({activeIndex: 1});

        expect(pinAction.hidden, '`pinnable: false` is refused by the model, so it is not offered').toBe(true);
        expect(inspector.getActionItem('pin'), 'the SAME instance moved, the group was not replaced').toBe(pinAction);
        expect(visibility, 'Overflow gets its signal from the instance, not a rebuilt group')
            .toEqual([['pin', true]]);

        // And the refusal holds if the intent is dispatched anyway — the model is the authority, not
        // the hidden flag, which a host could always bypass.
        const refused = workspace.onDockHeaderAction({
            action: 'pin', dockNodeId: 'inspector-tabs', tabContainer: inspector
        });

        expect(refused.errors).toEqual(['item "notes" is not pinnable']);
        expect(workspace.getDockZoneDocument().items.notes.autoHidden).toBeUndefined();

        await inspector.set({activeIndex: 0});
        expect(pinAction.hidden).toBe(false);

        // AC-3's actual boundary. Everything above resolved when the container's own `set()` did,
        // and the reconciler had not run yet — so a group replacement performed BY reconciliation
        // was exactly what the identity assertion could not observe. `refreshPromise` is the seam
        // the workspace chains that work onto, so awaiting it and re-resolving both the container
        // and the action FROM the refreshed tree is what makes "the same instance" a claim about
        // the lifetime the retained action actually has.
        await workspace.refreshPromise;

        const reconciledTabs = tabsOf(workspace.items[0]).get('inspector-tabs');

        expect(reconciledTabs, 'the tabs node is retained across reconciliation').toBe(inspector);
        expect(reconciledTabs.getActionItem('pin'), 'and so is the action instance on it')
            .toBe(pinAction);
        expect(pinAction.hidden, 'converging on the active item\'s real policy').toBe(false);

        // The load-bearing half, and the reason this counts emitters rather than signals. The refresh
        // QUEUE replays each pending refresh in order, and refresh #1 reconciles chrome to the
        // document as it stood when it was queued — so its sweep re-hides the action before refresh
        // #2 settles it, and the post-refresh signal COUNT is not 0. Those extra signals are a
        // property of the queue, not of this action: `close` lags identically, and nothing here
        // could fix it without changing refresh sequencing for every consumer. What AC-3 actually
        // claims is that no group was ever rebuilt behind them — every signal, before and after
        // reconciliation, came from the one retained instance.
        expect(new Set(signalSources).size, 'one emitter across every signal, not a rebuilt group')
            .toBe(1);
        expect(signalSources[0], 'and it is the instance the assertions above held').toBe(pinAction)
    });

    /**
     * AC-5, exercised at the seam it names. The claim is about what `Persistence.capturePerspective`
     * WRITES, so inferring it from the source document proves nothing: capture normalizes, validates
     * and fingerprints, and any of those three could have made rendering an action observable in a
     * saved layout. Rendering is a projection concern and must leave layout truth byte-identical;
     * the gesture is a model concern and must move exactly the two committed fields §2.7 names.
     */
    test('capturing a perspective is unmoved by rendering the action, and moves only pinned/autoHidden on the gesture', async () => {
        const document = createEdgeDocument();

        document.items.inspector.pinned = true;

        const capture = () => {
            const {layout, errors} = Persistence.capturePerspective(workspace.getDockZoneDocument(), {
                layoutId: 'ac5', title: 'AC-5'
            });

            expect(errors, 'the capture seam itself stays clean').toEqual([]);
            return layout
        };

        // Captured from a workspace with the action OFF, then from one with it ON: the difference
        // between the two runs is precisely "the action was rendered".
        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        const before = capture();

        workspace.destroy();
        workspace = Neo.create(PlainWorkspace, {
            dockModel          : createEdgeDocument(),
            enableDockPinAction: true
        });

        workspace.dockModel.items.inspector.pinned = true;

        const tabs      = tabsOf(workspace.items[0]),
              inspector = tabs.get('inspector-tabs'),
              pinAction = inspector.getActionItem('pin');

        expect(pinAction, 'the action really was projected in the second run').toBeTruthy();

        const afterRender = capture();

        expect(JSON.stringify(afterRender), 'rendering an action writes nothing into layout truth')
            .toBe(JSON.stringify(before));

        // Now the gesture, through the real handler.
        pinAction.handler({component: pinAction});
        await workspace.refreshPromise;

        const afterGesture = capture();

        expect(JSON.stringify(afterGesture), 'the gesture is not a no-op — otherwise the diff below is vacuous')
            .not.toBe(JSON.stringify(before));

        // The diff is exactly §2.7's two committed fields, on the one item, and nothing else.
        const beforeItem = before.dockZone.items.inspector,
              afterItem  = afterGesture.dockZone.items.inspector;

        expect({...afterItem, pinned: beforeItem.pinned, autoHidden: beforeItem.autoHidden},
            'no field outside pinned/autoHidden moved on the captured item')
            .toEqual({...beforeItem});
        expect([beforeItem.pinned, beforeItem.autoHidden], 'the captured item started pinned and visible')
            .toEqual([true, undefined]);
        expect([afterItem.pinned, afterItem.autoHidden], 'and ends unpinned and auto-hidden')
            .toEqual([false, true]);

        expect({...afterGesture.dockZone, items: null}, 'and the node tree itself is untouched')
            .toEqual({...before.dockZone, items: null})
    });

    test('the pin action reports its own missing preconditions, and stays inert while its opt-in is off', () => {
        workspace = Neo.create(PlainWorkspace, {
            dockModel          : createEdgeDocument(),
            enableDockPinAction: true
        });

        const inspector = tabsOf(workspace.items[0]).get('inspector-tabs');

        workspace.dockModel = null;

        expect(workspace.onDockHeaderAction({
            action: 'pin', dockNodeId: 'inspector-tabs', tabContainer: inspector
        }).errors).toEqual(['Dock pin action requires a committed document']);

        workspace.dockModel = createEdgeDocument();

        expect(workspace.onDockHeaderAction({action: 'pin', dockNodeId: 'inspector-tabs'}).errors)
            .toEqual(['Dock pin action requires an active item']);

        // With the opt-in off the name belongs to the host again: the intent is re-emitted, not acted
        // on, and nothing is committed.
        workspace.destroy();

        const emitted = [];

        workspace = Neo.create(PlainWorkspace, {
            dockModel          : createEdgeDocument(),
            enableDockPinAction: false
        });
        workspace.on('dockHeaderAction', data => emitted.push(data.action));

        const offTabs = tabsOf(workspace.items[0]).get('inspector-tabs');

        expect(offTabs.getActionItem('pin'), 'nothing is projected while the opt-in is off').toBeFalsy();
        expect(workspace.onDockHeaderAction({
            action: 'pin', dockNodeId: 'inspector-tabs', tabContainer: offTabs
        })).toBe(null);
        expect(emitted).toEqual(['pin']);
        expect(workspace.getDockZoneDocument().items.inspector.autoHidden).toBeUndefined()
    });

    /**
     * "Default off" has to mean behaviorally inert, not merely unprojected. A host legitimately owns
     * the names `close` and `pin` while their opt-ins are off, and the POLICY SYNC — not the
     * projection, not the dispatch — is the third seam that has to honor that. It runs on every
     * active-item change and every reconciliation sweep, so an unguarded sync moves a host's `hidden`
     * with no gesture involved at all: the action simply drifts under the host's feet.
     *
     * `center-tabs` is where the engine's own predicate disagrees loudest. No edge owns a center item
     * (§2.7 — main content never rails), so the engine would compute `hidden: true` for `pin` and
     * commit it to an instance it does not own.
     */
    test('a host keeps its own close and pin actions while both engine opt-ins are off', () => {
        const document = createEdgeDocument();

        // Both halves need the engine's predicate to DISAGREE with the host's value, or the arm
        // passes without exercising anything. `pin` disagrees on a center item for free — no edge
        // owns it. `close` does not: it hides only on `closable: false`, so the fixture states it.
        document.items.center.closable = false;

        workspace = Neo.create(HostBothActionsWorkspace, {dockModel: document});

        const tabs        = tabsOf(workspace.items[0]),
              center      = tabs.get('center-tabs'),
              pinAction   = center.getActionItem('pin'),
              closeAction = center.getActionItem('close');

        expect(pinAction,   'the host projected `pin` through the documented hook').toBeTruthy();
        expect(closeAction, 'and `close` beside it').toBeTruthy();
        expect([closeAction.hidden, pinAction.hidden], 'the host owns their initial visibility')
            .toEqual([false, false]);

        workspace.syncDockHeaderActions();

        expect([closeAction.hidden, pinAction.hidden], 'the reconciliation sweep leaves host names alone')
            .toEqual([false, false]);

        workspace.onDockActiveIndexChange({dockNodeId: 'center-tabs', tabContainer: center});

        expect([closeAction.hidden, pinAction.hidden], 'and so does an active-item change')
            .toEqual([false, false]);
        expect(center.getActionItem('pin'), 'the same host instances, never replaced').toBe(pinAction)
    });

    /**
     * The chrome that emitted an intent is a projection of the document as it stood at the LAST sweep,
     * and the sweep is deferred behind reconciliation. Between a commit that moves an item to the root
     * center and the refresh that re-hides its action, the retained action is still visible and still
     * dispatchable — and collapsing a center item is exactly what §2.7 forbids.
     *
     * Committed here through the real write seam rather than by assigning `dockModel`, because the
     * defect only exists in the window that seam opens: `onDockZoneDocumentChange` advances the model
     * synchronously and chains the sweep onto `refreshPromise`. Firing before that promise settles is
     * not a contrived race; it is one click landing inside it.
     */
    test('a retained pin action refuses after the model moved its item to the center, before the sweep runs', async () => {
        workspace = Neo.create(PlainWorkspace, {
            dockModel          : createEdgeDocument(),
            enableDockPinAction: true
        });

        const tabs      = tabsOf(workspace.items[0]),
              inspector = tabs.get('inspector-tabs'),
              pinAction = inspector.getActionItem('pin');

        expect(pinAction.hidden, 'an edge-owned pane can collapse, so the action is live').toBe(false);

        const descriptor = {operation: 'moveItem', itemId: 'inspector', targetNodeId: 'center-tabs'},
              moved      = workspace.applyDockZoneOperation(descriptor);

        expect(moved.errors, 'the move itself is a clean commit').toEqual([]);
        workspace.onDockZoneDocumentChange(moved.document, descriptor, inspector);

        // The stale window: the model says center, the chrome still says right, and the action that
        // reads `false` above has not been re-synced yet.
        expect(Document.findOwningEdge(workspace.dockModel, 'inspector'), 'the model moved it to center')
            .toBe(null);
        expect(pinAction.hidden, 'the retained action is still visible — that is the window').toBe(false);

        const refused = workspace.onDockHeaderAction({
            action: 'pin', dockNodeId: 'inspector-tabs', tabContainer: inspector
        });

        expect(refused.errors, 'dispatch decides from the CURRENT document, not from the chrome')
            .toEqual(['Dock pin action requires an item owned by an edge zone']);
        expect(workspace.getDockZoneDocument().items.inspector.autoHidden, 'and commits nothing')
            .toBeUndefined();

        // Once the deferred sweep does run, the action agrees with the document on its own.
        await workspace.refreshPromise;
        workspace.syncDockHeaderActions();

        expect(tabs.get('center-tabs')?.getActionItem('pin')?.hidden ?? true,
            'a center-owned pane offers no collapse').toBe(true)
    });

    test('tab activation commits with close actions disabled and survives unrelated re-projection', async () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {
            dockModel            : document,
            enableDockCloseAction: false
        });

        const tabs  = tabsOf(workspace.items[0]),
            side    = tabs.get('side-tabs'),
            commits = [],
            apply   = workspace.applyDockZoneOperation.bind(workspace);

        workspace.applyDockZoneOperation = descriptor => {
            commits.push(descriptor);
            return apply(descriptor)
        };

        expect(side.getActionItem?.('close')).toBeFalsy();

        await side.set({activeIndex: 1});
        await workspace.refreshPromise;

        expect(commits).toEqual([{
            operation : 'setActiveItem',
            tabsNodeId: 'side-tabs',
            itemId    : 'terminal'
        }]);
        expect(workspace.dockModel.nodes['side-tabs'].activeItemId).toBe('terminal');
        expect(tabsOf(workspace.items[0]).get('side-tabs')).toBe(side);
        expect(side.activeIndex).toBe(1);

        const resized = workspace.applyDockZoneOperation({
            operation  : 'resizeSplit',
            splitNodeId: 'root-split',
            sizes      : [0.7, 0.3]
        });

        workspace.onDockZoneDocumentChange(resized.document, {operation: 'resizeSplit'}, workspace);
        await workspace.refreshPromise;

        expect(workspace.dockModel.nodes['side-tabs'].activeItemId).toBe('terminal');
        expect(side.activeIndex).toBe(1);
        expect(commits).toHaveLength(2)
    });

    test('a model-ahead close targets live chrome but focuses the model-selected successor', async () => {
        const document = createDocument();

        document.items.aux = {componentRef: 'Aux', title: 'Aux', kind: 'panel'};
        document.nodes['side-tabs'].items.push('aux');

        workspace = Neo.create(PlainWorkspace, {
            dockModel            : document,
            enableDockCloseAction: true
        });

        const
            side       = tabsOf(workspace.items[0]).get('side-tabs'),
            modelAhead = workspace.applyDockZoneOperation({
                operation: 'moveItem', itemId: 'preview', targetNodeId: 'side-tabs', index: 2
            }),
            focusTargets = [];

        expect(side.getTabBar().sortZoneConfig.dockItemIds).toEqual(['preview', 'terminal', 'aux']);
        expect(modelAhead.document.nodes['side-tabs'].items).toEqual(['terminal', 'aux', 'preview']);

        // Model commits are synchronous while projection is deferred. Preserve that exact window:
        // live chrome still targets preview, while semantic successor policy already lives in the
        // reordered document.
        workspace.dockModel = modelAhead.document;
        workspace.focusDockCloseTarget = data => focusTargets.push(data.itemId);

        const closed = workspace.onDockHeaderAction({
            action: 'close', dockNodeId: 'side-tabs', tabContainer: side
        });

        await workspace.refreshPromise;

        expect(closed.errors).toEqual([]);
        expect(closed.document.items.preview).toBeUndefined();
        expect(closed.document.nodes['side-tabs'].activeItemId).toBe('aux');
        expect(focusTargets).toEqual(['aux'])
    });

    test('closing a node\'s only item focuses the surviving DockWorkspace root after normalization prunes the tab shell', async () => {
        const document = createDocument();

        document.nodes['side-tabs'].items        = ['terminal'];
        document.nodes['side-tabs'].activeItemId = 'terminal';

        workspace = Neo.create(PlainWorkspace, {
            dockModel            : document,
            enableDockCloseAction: true
        });

        const
            side         = tabsOf(workspace.items[0]).get('side-tabs'),
            closeAction  = side.getActionItem('close'),
            focusTargets = [];

        workspace.focus = () => focusTargets.push('workspace');

        closeAction.handler({component: closeAction});
        await workspace.refreshPromise;

        expect(workspace.getDockZoneDocument().nodes['side-tabs']).toBeUndefined();
        expect(tabsOf(workspace.items[0]).has('side-tabs')).toBe(false);
        expect(focusTargets).toEqual(['workspace']);
        expect(workspace.vdom.tabIndex).toBe(-1)
    });

    test('rapid commits advance the document synchronously and stage one transaction at a time', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            first    = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1}),
            second   = workspace.applyDockZoneOperation.call({dockModel: first.document}, {operation: 'moveItem', itemId: 'preview', targetNodeId: 'editor-tabs', index: 0}),
            timeline = [],
            original = workspace.refreshDockWorkspace.bind(workspace);

        let inFlight = 0;

        workspace.refreshDockWorkspace = async (...args) => {
            timeline.push(`start:${++inFlight}`);
            const result = await original(...args);

            timeline.push(`end:${inFlight--}`);

            return result
        };

        workspace.onDockZoneDocumentChange(first.document, {operation: 'moveItem'});
        workspace.onDockZoneDocumentChange(second.document, {operation: 'moveItem'});

        // the committed document is truth immediately; the projection follows one tick later
        expect(workspace.getDockZoneDocument()).toBe(second.document);

        await workspace.refreshPromise;

        expect(timeline).toEqual(['start:1', 'end:1', 'start:1', 'end:1']);
        expect(workspace.items.length).toBe(1);
        expect(tabsOf(workspace.items[0]).get('editor-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['preview', 'editor', 'terminal'])
    });

    test('a deferred first document does not stage a second shell before the workspace mounts', async () => {
        const
            allowVdomUpdatesInTests = Neo.config.allowVdomUpdatesInTests,
            useDomApiRenderer       = Neo.config.useDomApiRenderer,
            domAccessAlign          = Neo.main.DomAccess.align,
            enteredRefresh          = Promise.withResolvers();

        Neo.config.allowVdomUpdatesInTests = true;
        Neo.config.useDomApiRenderer       = true;
        Neo.main.DomAccess.align           = async () => {};
        workspace = Neo.create(PlainWorkspace, {
            appName  : 'DashboardDockWorkspaceTest',
            dockModel: createEmptyDocument(),
            windowId : 1
        });

        const refreshDockWorkspace = workspace.refreshDockWorkspace.bind(workspace);

        workspace.refreshDockWorkspace = (...args) => {
            enteredRefresh.resolve();
            return refreshDockWorkspace(...args)
        };

        try {
            // Build the first vnode without mounting it. This is the real boot window: the app's
            // main-view mount is still pending while an async catalog can commit the real document.
            await workspace.initVnode();
            expect(workspace.mounted).toBe(false);

            const initialShell = workspace.items[0];

            workspace.onDockZoneDocumentChange(createDocument());

            await enteredRefresh.promise;
            await Promise.resolve();

            // Reconciler may not insert its hidden staging shell until the initial tree exists in
            // the DOM. Otherwise initVnode can serialize old + staged shells as the first mount.
            expect(workspace.items).toHaveLength(1);
            expect(workspace.items[0]).toBe(initialShell)
        } finally {
            workspace.mounted = true;
            await workspace.refreshPromise?.catch(() => {});
            Neo.config.allowVdomUpdatesInTests = allowVdomUpdatesInTests;
            Neo.config.useDomApiRenderer       = useDomApiRenderer;
            Neo.main.DomAccess.align           = domAccessAlign
        }

        expect(workspace.items).toHaveLength(1);
        expect(tabsOf(workspace.items[0]).has('editor-tabs')).toBe(true)
    });

    test('a staged edge resize transfers fixed dimensions onto retained tab chrome', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createEdgeDocument()});

        const inspector = tabsOf(workspace.items[0]).get('inspector-tabs');

        expect(inspector.width).toBe('25%');

        const result = workspace.applyDockZoneOperation({
            operation : 'resizeEdgeZone',
            edgeZoneId: 'root',
            edge      : 'right',
            extent    : 0.33
        });

        workspace.onDockZoneDocumentChange(result.document, {operation: 'resizeEdgeZone'}, workspace);
        await workspace.refreshPromise;

        const retainedInspector = tabsOf(workspace.items[0]).get('inspector-tabs');

        expect(retainedInspector).toBe(inspector);
        expect(retainedInspector.width).toBe('33%');
        expect(retainedInspector.vdom.width).toBe('33%')
    });

    test('a destroyed workspace drops its pending refresh without throwing', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

        workspace.onDockZoneDocumentChange(result.document);

        const pending = workspace.refreshPromise;

        workspace.destroy();
        workspace = null;

        await expect(pending).resolves.toBeUndefined()
    });

    test('a rejected refresh stays observable and never suppresses the next transaction', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        let hookCalls = 0;

        workspace.beforeRefreshDockWorkspace = () => {
            if (++hookCalls === 1) {
                throw new Error('chrome sync failed')
            }
        };

        const first = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

        workspace.onDockZoneDocumentChange(first.document, {operation: 'moveItem'});

        const firstRefresh = workspace.refreshPromise;

        // the first transaction's failure belongs to whoever awaits its snapshot …
        await expect(firstRefresh).rejects.toThrow('chrome sync failed');

        // … and the next commit still projects: scheduling chains off the settled tail
        const second = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'preview', targetNodeId: 'editor-tabs', index: 0});

        workspace.onDockZoneDocumentChange(second.document, {operation: 'moveItem'});

        expect(workspace.refreshPromise).not.toBe(firstRefresh);
        await workspace.refreshPromise;

        expect(hookCalls).toBe(2);
        expect(tabsOf(workspace.items[0]).get('editor-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['preview', 'editor', 'terminal'])
    });

    test('a configured dock host that resolves to no live host rejects loudly, never silently', async () => {
        workspace = Neo.create(BrokenHostWorkspace, {dockModel: createDocument()});

        const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

        workspace.onDockZoneDocumentChange(result.document);

        // the committed truth advanced …
        expect(workspace.getDockZoneDocument()).toBe(result.document);

        // … so the missing render target must reject, not settle over frozen chrome
        await expect(workspace.refreshPromise).rejects.toThrow(/resolved to no live dock host/)
    });

    test('a null document projects the ledgered empty shell and reconciles every pane away', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        // the ledgered fallback at the projection surface: dockModel === null → empty projection
        expect(workspace.projectDockModel(null, null, null)).toEqual({ntype: 'container', cls: ['neo-dashboard'], items: []});

        // and through a commit: every pane retires, the shell itself survives
        workspace.onDockZoneDocumentChange(null);
        await workspace.refreshPromise;

        expect(workspace.getDockZoneDocument()).toBeNull();
        expect(workspace.items.length).toBe(1);
        expect(tabsOf(workspace.items[0]).size).toBe(0)
    });

    test('the FLIP first-snapshot precedes the consumer chrome hook', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            order    = [],
            hadMain  = Object.prototype.hasOwnProperty.call(Neo, 'main'),
            mainNs   = Neo.main = Neo.main || {},
            hadAddon = Object.prototype.hasOwnProperty.call(mainNs, 'addon'),
            addonNs  = mainNs.addon = mainNs.addon || {},
            previous = addonNs.DockFlip;

        addonNs.DockFlip = {
            captureFirst: () => {order.push('captureFirst')},
            play        : () => {order.push('play')}
        };

        workspace.beforeRefreshDockWorkspace = () => {order.push('chromeHook')};

        try {
            const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise
        } finally {
            if (previous === undefined) {
                delete addonNs.DockFlip
            } else {
                addonNs.DockFlip = previous
            }
            !hadAddon && delete mainNs.addon;
            !hadMain  && delete Neo.main
        }

        expect(order).toEqual(['captureFirst', 'chromeHook', 'play'])
    });

    test('both FLIP dispatches carry the host windowId — the key generateRemote swaps the destination on', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument(), windowId: 'flip-realm-7'});

        const
            payloads = [],
            hadMain  = Object.prototype.hasOwnProperty.call(Neo, 'main'),
            mainNs   = Neo.main = Neo.main || {},
            hadAddon = Object.prototype.hasOwnProperty.call(mainNs, 'addon'),
            addonNs  = mainNs.addon = mainNs.addon || {},
            previous = addonNs.DockFlip;

        addonNs.DockFlip = {
            captureFirst: data => {payloads.push(['captureFirst', data])},
            play        : data => {payloads.push(['play', data])}
        };

        try {
            const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

            const hostWindowId = workspace.getDockHost().windowId;

            // a both-undefined match would be vacuous: the routing key must actually exist
            expect(hostWindowId).not.toBeNull();
            expect(hostWindowId).toBeDefined();

            expect(payloads).toHaveLength(2);

            for (const [method, data] of payloads) {
                expect(data.windowId, `${method} routes to the host realm`).toBe(hostWindowId);
                expect(data.hostId).toBe(workspace.getDockHost().id)
            }
        } finally {
            if (previous === undefined) {
                delete addonNs.DockFlip
            } else {
                addonNs.DockFlip = previous
            }
            !hadAddon && delete mainNs.addon;
            !hadMain  && delete Neo.main
        }
    });

    test('a persisted title renders as escaped text, never as markup', async () => {
        const
            evil     = '<img src=x onerror="window.__pwned = 1">',
            document = createDocument();

        document.items.editor.title = evil;

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        // the default resolution carries the title under `text` — no `html` key exists to persist markup
        const config = workspace.resolveProjectedPane('editor', document.items.editor);

        expect(config.text).toBe(evil);
        expect(config.html).toBeUndefined();

        // and the mounted default pane holds it as component text, not markup
        const findPlaceholder = component => {
            if (component.cls?.includes?.('neo-dock-workspace-placeholder')) {
                return component
            }

            for (const child of component.items || []) {
                const hit = findPlaceholder(child);

                if (hit) {
                    return hit
                }
            }

            return null
        };

        const pane = findPlaceholder(workspace.items[0]);

        expect(pane.text).toBe(evil);
        expect(pane.html ?? null).toBeNull()
    });

    test('a string cls survives marker decoration as one class, not characters', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        expect(workspace.decorateFlipMarker({cls: 'custom-pane'}, 'editor').cls).toEqual(['custom-pane', 'dock-flip-item-editor']);
        expect(workspace.decorateFlipMarker({ntype: 'component'}, 'editor').cls).toEqual(['dock-flip-item-editor'])
    });

    test('a commit-scoped preserveItemIds merges with the standing owner-held set', async () => {
        workspace = Neo.create(ChromeWorkspace, {dockModel: createDocument()});

        let preservedSeen = null;

        const reconcile = DockProjectionReconciler.reconcileProjection;

        DockProjectionReconciler.reconcileProjection = options => {
            preservedSeen = [...options.preserveItemIds];
            return reconcile.call(DockProjectionReconciler, options)
        };

        try {
            const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'preview', targetNodeId: 'editor-tabs', index: 0});

            workspace.getRefreshOptions = () => ({preserveItemIds: ['editor', 'terminal']});
            workspace.onDockZoneDocumentChange(result.document, {operation: 'moveItem'});
            await workspace.refreshPromise
        } finally {
            DockProjectionReconciler.reconcileProjection = reconcile
        }

        // the standing hook holds 'terminal'; the commit adds 'editor' and repeats 'terminal' —
        // the merge deduplicates, standing set first
        expect(preservedSeen).toEqual(['terminal', 'editor'])
    });

    test('the reconciler\'s ACTUAL path reaches the FLIP play, never the requested one', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            playArgs  = [],
            hadMain   = Object.prototype.hasOwnProperty.call(Neo, 'main'),
            mainNs    = Neo.main = Neo.main || {},
            hadAddon  = Object.prototype.hasOwnProperty.call(mainNs, 'addon'),
            addonNs   = mainNs.addon = mainNs.addon || {},
            previous  = addonNs.DockFlip,
            reconcile = DockProjectionReconciler.reconcileProjection;

        addonNs.DockFlip = {
            captureFirst: () => {},
            play        : config => {playArgs.push(config)}
        };

        let landInPlace = true;

        DockProjectionReconciler.reconcileProjection = () => ({landedInPlace: landInPlace});

        try {
            const first = workspace.applyDockZoneOperation({operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.5, 0.5]});

            workspace.onDockZoneDocumentChange(first.document, {operation: 'resizeSplit'});
            await workspace.refreshPromise;

            landInPlace = false;

            const second = workspace.applyDockZoneOperation({operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.6, 0.4]});

            workspace.onDockZoneDocumentChange(second.document, {operation: 'resizeSplit'});
            await workspace.refreshPromise
        } finally {
            DockProjectionReconciler.reconcileProjection = reconcile;
            if (previous === undefined) {
                delete addonNs.DockFlip
            } else {
                addonNs.DockFlip = previous
            }
            !hadAddon && delete mainNs.addon;
            !hadMain  && delete Neo.main
        }

        expect(playArgs.map(config => config.geometryOnly)).toEqual([true, false])
    });

    test('the reconcile hook passes only its sanctioned seams; a hostile override cannot displace the identity keys', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        let captured = null;

        const
            staged    = () => {},
            overflow  = () => {},
            hostileFn = () => {throw new Error('hostile')},
            reconcile = DockProjectionReconciler.reconcileProjection;

        // every class-owned identity key supplied hostilely, beside the three sanctioned seams
        workspace.getReconcileOptions = () => ({
            geometryOnly             : true,
            host                     : {id: 'hostile-host'},
            nextConfig               : {ntype: 'container', cls: ['hostile']},
            onProjectionStaged       : staged,
            placeholders             : new Map([['x', 'hostile']]),
            preserveItemIds          : ['hostile-item'],
            resolveItem              : hostileFn,
            retainTopology           : true,
            shellIndex               : 99,
            waitForOverflowProjection: overflow
        });

        DockProjectionReconciler.reconcileProjection = options => {
            captured = options;
            return reconcile.call(DockProjectionReconciler, options)
        };

        try {
            const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

            workspace.onDockZoneDocumentChange(result.document, {operation: 'moveItem'});
            await workspace.refreshPromise
        } finally {
            DockProjectionReconciler.reconcileProjection = reconcile
        }

        // the sanctioned seams arrive …
        expect(captured.onProjectionStaged).toBe(staged);
        expect(captured.retainTopology).toBe(true);
        expect(captured.waitForOverflowProjection).toBe(overflow);

        // … and every identity key stays class-owned
        expect(captured.host).toBe(workspace);
        expect(captured.shellIndex).toBe(0);
        expect(captured.geometryOnly).toBe(false);
        expect(captured.nextConfig.cls).not.toContain('hostile');
        expect(captured.placeholders.get('x')).toBeUndefined();
        expect(captured.preserveItemIds).not.toContain('hostile-item');
        expect(captured.resolveItem).not.toBe(hostileFn)
    });

    test('the post-refresh hook is awaited and receives the outcome and the play promise', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            sequence = [],
            hadMain  = Object.prototype.hasOwnProperty.call(Neo, 'main'),
            mainNs   = Neo.main = Neo.main || {},
            hadAddon = Object.prototype.hasOwnProperty.call(mainNs, 'addon'),
            addonNs  = mainNs.addon = mainNs.addon || {},
            previous = addonNs.DockFlip;

        let received = null;

        addonNs.DockFlip = {
            captureFirst: () => {},
            play        : () => Promise.resolve('motion-done')
        };

        workspace.afterRefreshDockWorkspace = async data => {
            received = data;
            sequence.push(['played', await data.played]);
            await workspace.timeout(5);
            sequence.push(['hook-done'])
        };

        try {
            const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

            workspace.onDockZoneDocumentChange(result.document, {operation: 'moveItem'});
            await workspace.refreshPromise;
            sequence.push(['refresh-settled'])
        } finally {
            if (previous === undefined) {
                delete addonNs.DockFlip
            } else {
                addonNs.DockFlip = previous
            }
            !hadAddon && delete mainNs.addon;
            !hadMain  && delete Neo.main
        }

        // the refresh AWAITED the hook: it finished before the public promise settled
        expect(sequence).toEqual([['played', 'motion-done'], ['hook-done'], ['refresh-settled']]);
        expect(received.document).toBe(workspace.getDockZoneDocument());
        expect(received.refreshOptions).toEqual({});
        expect(received.result).toBeTruthy();

        // without a dispatched play the hook still runs, with `played` null
        workspace.afterRefreshDockWorkspace = data => {received = data};

        const next = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'side-tabs', index: 0});

        workspace.onDockZoneDocumentChange(next.document, {operation: 'moveItem'});
        await workspace.refreshPromise;

        expect(received.played).toBeNull()
    });

    test('the add-tab correlation is minted only for a globally absent header', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            withNewItem = createDocument(),
            relocated   = createDocument();

        withNewItem.items.notes = {componentRef: 'Notes', title: 'Notes'};
        withNewItem.nodes['editor-tabs'].items.push('notes');
        relocated.nodes['side-tabs'].items = ['terminal'];
        relocated.nodes['editor-tabs'].items.push('preview');

        expect(workspace.getTabInsertProjectionDescriptor(withNewItem, {operation: 'addTab', itemId: 'notes', tabsNodeId: 'editor-tabs', extra: true}))
            .toEqual({itemId: 'notes', operation: 'addTab', tabsNodeId: 'editor-tabs'});
        // an item that already lives in a tabs node relocates by identity — FLIP alone
        expect(workspace.getTabInsertProjectionDescriptor(relocated, {operation: 'addTab', itemId: 'preview', tabsNodeId: 'editor-tabs'})).toBeNull();
        expect(workspace.getTabInsertProjectionDescriptor(relocated, {operation: 'moveItem', itemId: 'preview', tabsNodeId: 'editor-tabs'})).toBeNull();
        expect(workspace.getTabInsertProjectionDescriptor(withNewItem, null)).toBeNull()
    });

    test('the default resolver renders a titled placeholder stamped with the FLIP marker', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const config = workspace.resolveProjectedPane('editor', workspace.dockModel.items.editor);

        expect(config.ntype).toBe('component');
        expect(config.text).toBe('Editor');
        expect(config.cls).toEqual(['neo-dock-workspace-placeholder', 'dock-flip-item-editor']);
        // live instances are never stamped — their identity resolves through the document
        expect(workspace.decorateFlipMarker(workspace, 'editor')).toBe(workspace)
    });

    test('a consumer owns its panes, chrome sync, preserved ids, projection options and refresh options', async () => {
        workspace = Neo.create(ChromeWorkspace, {dockModel: createDocument()});

        const
            shell = workspace.items[1],
            panes = collect(shell, config => Array.isArray(config.cls) && config.cls.includes('custom-pane'));

        expect(workspace.items[0].cls).toContain('chrome-bar');
        expect(shell.flex).toBe(1);
        expect(panes.length).toBe(3);
        panes.forEach(pane => expect(pane.cls.some(cls => cls.startsWith('chrome-pane-'))).toBe(true));

        let captured      = null,
            preservedSeen = null;

        const
            project   = DockLayoutAdapter.project,
            reconcile = DockProjectionReconciler.reconcileProjection;

        DockLayoutAdapter.project = (model, options) => {
            captured = options;
            return project.call(DockLayoutAdapter, model, options)
        };
        DockProjectionReconciler.reconcileProjection = options => {
            preservedSeen = [...options.preserveItemIds];
            return reconcile.call(DockProjectionReconciler, options)
        };

        try {
            const result = workspace.applyDockZoneOperation({operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.5, 0.5]});

            workspace.onDockZoneDocumentChange(result.document, {operation: 'resizeSplit'});
            await workspace.refreshPromise
        } finally {
            DockLayoutAdapter.project                 = project;
            DockProjectionReconciler.reconcileProjection = reconcile
        }

        expect(workspace.beforeRefreshCalls.length).toBe(1);
        expect(workspace.beforeRefreshCalls[0].document.nodes['root-split'].sizes).toEqual([0.5, 0.5]);
        expect(workspace.beforeRefreshCalls[0].refreshOptions).toEqual({geometryOnly: true});
        expect(captured.autoHideRevealOnHover).toBe(true);
        expect(typeof captured.applyDockZoneOperation).toBe('function');
        expect(typeof captured.onDockZoneDocumentChange).toBe('function');
        expect(preservedSeen).toEqual(['terminal']);
        expect(workspace.items.length).toBe(2)
    });

    test('the projection mounts into the referenced dock host and leaves its siblings alone', async () => {
        workspace = Neo.create(HostedWorkspace, {dockModel: createDocument()});

        const
            host    = workspace.getReference('dock-host'),
            sibling = host.items[1];

        expect(workspace.getDockHost()).toBe(host);
        expect(tabsOf(host.items[0]).size).toBe(2);

        const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

        workspace.onDockZoneDocumentChange(result.document);
        await workspace.refreshPromise;

        expect(host.items.length).toBe(2);
        expect(host.items[1]).toBe(sibling);
        expect(workspace.items.length).toBe(2);
        expect(tabsOf(host.items[0]).get('editor-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['editor', 'terminal'])
    });

    test('a cross-zone release over another zone commits exactly one semantic operation', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const commits = [],
              apply   = workspace.applyDockZoneOperation.bind(workspace);

        // two zones side by side: editor-tabs on the left, side-tabs on the right
        workspace.getDomRect = async ids => ids.map((id, index) => ({x: index * 500, y: 0, width: 500, height: 600}));
        workspace.applyDockZoneOperation = descriptor => {
            commits.push(descriptor);
            return apply(descriptor)
        };

        // `terminal` leaves side-tabs; the only other zone is editor-tabs, whose rect starts at x=0
        await workspace.onDockCrossZoneDrop({clientX: 250, clientY: 300, itemId: 'terminal', sourceNodeId: 'side-tabs'});
        await workspace.refreshPromise;

        expect(commits.length).toBe(1);
        expect(commits[0].itemId).toBe('terminal');
        expect(workspace.getDockZoneDocument().nodes['side-tabs'].items).toEqual(['preview']);

        // a release over no zone commits nothing
        await workspace.onDockCrossZoneDrop({clientX: 5000, clientY: 5000, itemId: 'preview', sourceNodeId: 'side-tabs'});

        expect(commits.length).toBe(1)
    });

    test('destroy tears down the producer and the refresh chain with the workspace', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const producer = workspace.dockPreviewProducer;

        expect(producer).toBeTruthy();

        workspace.destroy();
        workspace = null;

        expect(producer.isDestroyed).toBe(true)
    });

    /**
     * Reads the projected engine actions on one tabs node: how many carry each name, and the
     * `hidden` state of `reload`. Arity answers the duplicate-chrome question directly, and
     * `reload` is the state probe because its row is projection-constant while its visibility is
     * pane-dependent — a placeholder pane owns no `dockReload()`, so it projects VISIBLE and only
     * the sweep can hide it.
     */
    const readActions = tabContainer => {
        const items = tabContainer.getTabBar()?.getActionItems() || [];

        return {
            arity: ['close', 'reload'].map(name => items.filter(item => item.action === name).length),
            close: tabContainer.getActionItem('close')?.hidden
        }
    };

    test('the boot sweep defers to a refresh that begins inside its mount window, then writes', async () => {
        workspace = Neo.create(SweepWitnessWorkspace, {dockModel: createDocument()});

        const side = tabsOf(workspace.items[0]).get('side-tabs');

        // The state control: the projection computed `close` from the model as it stood, then the
        // model changed underneath it. Only the sweep can reconcile the two, so this assertion dies
        // if the consumed `super.syncDockHeaderActions()` is removed — a log-only witness would not.
        expect(readActions(side), 'projected: one of each, close visible for a closable item')
            .toEqual({arity: [1, 1], close: false});

        workspace.dockModel.items.preview.closable = false;

        // The never-refreshed boot path: nothing owns the application train when the hook samples.
        workspace.refreshPromise = null;

        const sweepChain = workspace.afterSetMounted(true, false);

        expect(sweepChain, 'the boot sweep must be awaitable, or a witness cannot observe it').toBeTruthy();

        // A refresh BEGINS inside the deferral window — after the mount-time sample, before the
        // write. A thenable records whether the sweep consults it at all: the mount-time read
        // proves only that nothing had started 100ms earlier, so a sweep that never re-derives
        // writes straight into an open application train.
        let awaited = false;

        workspace.refreshPromise = {
            then(onFulfilled) {
                awaited = true;
                workspace.sweepLog.push('settled');
                onFulfilled?.();
                return Promise.resolve()
            }
        };

        await sweepChain;

        expect(awaited, 'the sweep must re-derive refreshPromise at WRITE time, not trust the mount-time sample').toBe(true);
        expect(workspace.sweepLog, 'the sweep runs on the settled tail, never ahead of it').toEqual(['settled', 'sweep']);
        expect(readActions(side), 'and it WROTE: still exactly one of each, close now hidden per the model')
            .toEqual({arity: [1, 1], close: true})
    });

    test('a tail REPLACED while the sampled one is pending does not authorize the write', async () => {
        workspace = Neo.create(SweepWitnessWorkspace, {dockModel: createDocument()});

        const side = tabsOf(workspace.items[0]).get('side-tabs');

        workspace.dockModel.items.preview.closable = false;
        workspace.refreshPromise = null;

        const sweepChain = workspace.afterSetMounted(true, false);

        // `refreshPromise` is a MUTABLE field, so a settled promise is not the settled TAIL.
        //
        // Staging both promises up front proves nothing: the deferral has not fired yet, so the
        // sweep would simply sample the replacement and never enter the contested state. The
        // replacement has to land WHILE the sweep is awaiting its sample, so P1 performs it from
        // inside its own `then` — the sweep has sampled P1, P2 becomes the tail, P1 settles under it.
        //
        // The discriminator is P2's `then`: it fires only if the sweep goes back and consults the
        // CURRENT tail. A sweep that trusts one snapshot writes on P1's settlement and never reaches
        // P2 at all, leaving `observedAtP2` null. No wall-clock anywhere.
        let observedAtP2 = null;

        const p2 = {
            then(onFulfilled) {
                observedAtP2 = [...workspace.sweepLog];
                onFulfilled?.();
                return Promise.resolve()
            }
        };

        workspace.refreshPromise = {
            then(onFulfilled) {
                workspace.refreshPromise = p2;
                onFulfilled?.();
                return Promise.resolve()
            }
        };

        await sweepChain;

        expect(observedAtP2, 'the sweep must re-read the field and await the tail that replaced its sample')
            .not.toBe(null);
        expect(observedAtP2, 'and it must not have written before reaching that tail').toEqual([]);
        expect(workspace.sweepLog, 'exactly one sweep, on the current tail').toEqual(['sweep']);
        expect(readActions(side), 'which wrote, once').toEqual({arity: [1, 1], close: true})
    });

    test('the never-refreshed boot path still sweeps — the hook keeps doing its original job', async () => {
        workspace = Neo.create(SweepWitnessWorkspace, {dockModel: createDocument()});

        const side = tabsOf(workspace.items[0]).get('side-tabs');

        workspace.dockModel.items.preview.closable = false;
        workspace.refreshPromise = null;

        // No refresh ever appears. Awaiting `null` is a no-op, so the static-boot consumer this
        // hook exists for still gets its one sync; a repair that skipped the sweep whenever it
        // could not prove the train was clear would re-open exactly that defect.
        await workspace.afterSetMounted(true, false);

        expect(workspace.sweepLog).toEqual(['sweep']);
        expect(readActions(side), 'the static-boot consumer gets its correction').toEqual({arity: [1, 1], close: true})
    });

    test('a refresh already open at mount time still suppresses the boot sweep entirely', async () => {
        workspace = Neo.create(SweepWitnessWorkspace, {dockModel: createDocument()});

        // The pre-existing contract: a boot that DID run the refresh already synced on settled
        // chrome, so the mount hook must not schedule a second pass at all — not merely defer it.
        workspace.refreshPromise = Promise.resolve();

        expect(workspace.afterSetMounted(true, false)).toBe(null);
        expect(workspace.sweepLog).toEqual([])
    });

    test.describe('#18143 a failed projection is observable and repaired exactly once', () => {
        const failure = recovery => Object.assign(
            new Error('util.VNode.getVnode: Component not found for id: neo-tab-header-button-10'),
            {isDockProjectionFailure: true, projectionRecovery: recovery}
        );

        test('it warns, fires dockProjectionFailed, and schedules ONE repair carrying the retry flag', async () => {
            workspace = Neo.create(RepairWitnessWorkspace, {dockModel: createDocument()});

            const events = [];

            workspace.on('dockProjectionFailed', event => events.push(event));

            const error  = failure('retired-staged'),
                  result = workspace.onDockProjectionFailed(error, createDocument(), null, {});

            // null is the caller's signal that this cycle is over and handled — the maximize sync and
            // the FLIP must not run over a shell the committed document does not describe.
            expect(result, 'the caller is told the cycle was handled').toBe(null);

            expect(events.length, 'the failure reaches consumers as an event').toBe(1);
            expect(events[0]).toMatchObject({component: workspace, error, isRetry: false, recovery: 'retired-staged'});

            await workspace.refreshPromise;

            expect(workspace.repairLog.length, 'exactly one repair is scheduled').toBe(1);
            expect(workspace.repairLog[0].isDockProjectionRetry, 'the repair is marked so it cannot recurse').toBe(true)
        });

        test('a failure DURING the repair surfaces without scheduling a third attempt', async () => {
            workspace = Neo.create(RepairWitnessWorkspace, {dockModel: createDocument()});

            const events = [];

            workspace.on('dockProjectionFailed', event => events.push(event));

            workspace.onDockProjectionFailed(failure('completed-swap'), createDocument(), null, {isDockProjectionRetry: true});

            await workspace.refreshPromise;

            // The hot-loop guard: a deterministic fault would otherwise re-project forever, and the
            // symptom of that is far worse than the stranded shell this whole path exists to fix.
            expect(events.length, 'the second failure is still reported').toBe(1);
            expect(events[0].isRetry, 'and is reported AS a retry').toBe(true);
            expect(workspace.repairLog, 'no third attempt is scheduled').toEqual([])
        });

        test('an error that is not the transaction\'s own failure keeps its loud path', () => {
            workspace = Neo.create(RepairWitnessWorkspace, {dockModel: createDocument()});

            const foreign = new Error('a bug in the projection inputs');

            // Only the typed failure is recoverable this way. Swallowing anything else would turn a
            // genuine projection bug into a silent re-projection loop.
            expect(() => workspace.onDockProjectionFailed(foreign, createDocument(), null, {})).toThrow(foreign);
            expect(workspace.repairLog).toEqual([])
        })
    });

    test.describe('#18153 the engine resolves its own tear-out pane', () => {
        test('a workspace that overrides nothing resolves the live projected pane', () => {
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

            const pane = workspace.resolveTearOutPane('editor');

            // Before this default the hook returned null, and the decline was not survivable:
            // captureTearOutPane stores nothing, reparentTearOutPane finds no pane and returns false,
            // and compensateFailedTearOutAdoption CLOSES the vessel the consumer was asked to open.
            expect(pane, 'the engine finds the projected pane without a consumer hook').toBeTruthy();
            expect(pane.dockItemId, 'and it is the pane for the requested item').toBe('editor')
        });

        test('it returns the PANE, never the tab header button that carries the same identity', () => {
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

            // LayoutAdapter stamps dockItemId on the header it builds from the pane's own config, so
            // the button carries the identity structurally too. An unqualified down() can return it,
            // and a header button reparented into a vessel would look like a success.
            const host    = workspace.getDockHost(),
                  matches = host?.down({dockItemId: 'editor'}, false) || [],
                  buttons = matches.filter(component => component.ntype === 'tab-header-button');

            expect(matches.length, 'the identity is stamped on more than one component').toBeGreaterThan(1);
            expect(buttons.length, 'and one of them is a tab header button — the arm is not vacuous').toBeGreaterThan(0);

            expect(workspace.resolveTearOutPane('editor').ntype,
                'the resolver skips the button').not.toBe('tab-header-button')
        });

        test('captureTearOutPane now retains a handle, which is what makes the vessel survivable', () => {
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

            workspace.captureTearOutPane('editor');

            // The whole failure chain starts here: an empty handle map is what makes the reparent
            // fail and the engine close its own vessel.
            expect(workspace.tearOutPaneHandles.editor, 'the handle map is populated').toBeTruthy();
            expect(workspace.releaseTearOutPane('editor'), 'and the pane is releasable for return').toBeTruthy()
        });

        test('an unknown itemId still resolves to null rather than an arbitrary component', () => {
            workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

            expect(workspace.resolveTearOutPane('no-such-item')).toBeNull()
        })
    })
});
