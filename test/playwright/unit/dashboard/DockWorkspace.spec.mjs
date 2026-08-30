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

/**
 * A host that projects its OWN header actions through the documented options hook — the seam a real
 * application uses, exercised end to end rather than through the adapter in isolation.
 */
const hostResolverCalls = [];

class HostActionWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspace.HostActionWorkspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
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

const
    tabsOf  = shell => DockProjectionReconciler.collectProjectedTabs(shell),
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

    test('the holder contract: a config-assigned document is readable before any operation', () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        expect(workspace.getDockZoneDocument()).toBe(document);
        expect(workspace.getDockHost()).toBe(workspace);
        expect(tabsOf(workspace.items[0]).size).toBe(2)
    });

    test('an action the workspace does not own is re-emitted to the host with its node id', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

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

        const [nodeId, tabContainer] = [...tabsOf(workspace.items[0]).entries()][0],
              action                 = tabContainer.getActionItem('pin');

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
        await tabContainer.set({activeIndex: 0});
        await workspace.refreshPromise;

        const afterReproject = [...tabsOf(workspace.items[0]).entries()]
            .find(([id]) => id === nodeId)?.[1]?.getActionItem('pin');

        expect(afterReproject, 'the action survives reprojection').toBeTruthy();
        expect(afterReproject, 'and it is the SAME instance, not a rebuilt group').toBe(action)
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

    test('tab activation commits with close actions disabled and survives unrelated re-projection', async () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

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
    })
});
