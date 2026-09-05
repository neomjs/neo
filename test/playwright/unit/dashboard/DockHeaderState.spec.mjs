import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockHeaderStateTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DockWorkspace      from '../../../../src/dashboard/dock/Workspace.mjs';
import HeaderActionPolicy from '../../../../src/dashboard/dock/projection/HeaderActionPolicy.mjs';
import Reconciler         from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * Every formatter evaluation, as `[workspaceId, 'nodeId:action.key']`. Module-scoped: a plain class
 * field on a Neo class enters the config machinery, and a probe belongs outside the class anyway.
 */
const evaluations = [];

const evaluationsOf = workspace => evaluations.filter(([id]) => id === workspace.id).map(([, entry]) => entry).sort();

/**
 * The engine policy with its formatters counted — the instrument AC-2 asks for: executed
 * header-policy evaluations, not source lines.
 */
class CountingPolicy extends HeaderActionPolicy {
    static config = {className: 'Test.Unit.Dashboard.DockHeaderState.CountingPolicy'}

    createActionBindings(nodeId) {
        const me       = this,
              bindings = super.createActionBindings(nodeId);

        Object.entries(bindings).forEach(([action, keys]) => {
            Object.entries(keys).forEach(([key, formatter]) => {
                keys[key] = function(data) {
                    evaluations.push([me.workspace.id, `${nodeId}:${action}.${key}`]);

                    return formatter.call(this, data)
                }
            })
        });

        return bindings
    }

    createNodeLockBinding(nodeId) {
        const me        = this,
              formatter = super.createNodeLockBinding(nodeId);

        return function(data) {
            evaluations.push([me.workspace.id, `${nodeId}:dockLockedItemIds`]);

            return formatter.call(this, data)
        }
    }
}

Neo.setupClass(CountingPolicy);

class ContractPane extends Component {
    static config = {className: 'Test.Unit.Dashboard.DockHeaderState.ContractPane'}

    dockReload() {}
}

Neo.setupClass(ContractPane);

/**
 * The minimal consumer with every engine action on: the document arrives as a config, the shell is
 * projected statically at construction — the never-refreshed boot path — and nothing is overridden
 * except the pane resolver, which gives `alpha` a reload contract and the others none.
 */
class HeaderStateWorkspace extends DockWorkspace {
    static config = {
        className             : 'Test.Unit.Dashboard.DockHeaderState.Workspace',
        dockHeaderActionPolicy: {module: CountingPolicy},
        enableDockCloseAction : true,
        enableDockLockAction  : true,
        enableDockPinAction   : true,
        enableDockPopOutAction: true,
        enableDockReloadAction: true,
        layout                : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }

    resolvePane(itemId, item) {
        return itemId === 'alpha' ? {module: ContractPane} : super.resolvePane(itemId, item)
    }
}

HeaderStateWorkspace = Neo.setupClass(HeaderStateWorkspace);

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'},
        beta : {componentRef: 'beta',  title: 'Beta',  kind: 'panel', closable: false},
        side : {componentRef: 'side',  title: 'Side',  kind: 'panel'}
    },
    nodes: {
        root: {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'center-tabs'},
                right : {nodeId: 'side-tabs', extent: 0.25, resizable: true}
            }
        },
        'center-tabs': {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'},
        'side-tabs'  : {type: 'tabs', items: ['side'],          activeItemId: 'side'}
    }
});

const ENGINE_KEYS = ['close.hidden', 'lock.hidden', 'lock.pressed', 'pin.hidden', 'pop-out.hidden', 'reload.disabled', 'reload.hidden'],
      // The engine actions' seven formatters plus the node container's own lock binding.
      NODE_KEYS   = [...ENGINE_KEYS, 'dockLockedItemIds'];

const commit = (workspace, descriptor) => {
    const result = workspace.applyDockZoneOperation(descriptor);

    expect(result.errors, `${descriptor.operation} commits cleanly`).toEqual([]);
    workspace.onDockZoneDocumentChange(result.document, descriptor);

    return workspace.refreshPromise
};

/**
 * Header state lives on the workspace's dock state provider and the projected actions bind to it:
 * a commit publishes committed truth once, and only the formatters whose inputs changed run. These
 * arms count them — executed header-policy evaluations are the measure, source lines are not — and
 * pin the provider chain the binding rides on.
 */
test.describe('Neo.dashboard.dock.Workspace — header state as bound data', () => {
    let workspace, other;

    test.beforeEach(() => {
        evaluations.length = 0
    });

    test.afterEach(() => {
        workspace?.destroy();
        other?.destroy();
        workspace = other = null
    });

    test('the first paint evaluates each bound formatter once per header; a geometry-only commit evaluates nothing', async () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        const expected = ['center-tabs', 'side-tabs'].flatMap(nodeId => NODE_KEYS.map(key => `${nodeId}:${key}`)).sort();

        expect(evaluationsOf(workspace), 'eight formatters per node, each run once on creation').toEqual(expected);

        const tabs   = Reconciler.collectProjectedTabs(workspace.items[0]),
              center = tabs.get('center-tabs');

        expect(center.getActionItem('close').hidden, 'alpha is closable').toBe(false);
        expect(center.getActionItem('reload').hidden, 'alpha carries a dockReload() contract').toBe(false);
        expect(center.getActionItem('pin').hidden, 'center never rails').toBe(true);
        expect(tabs.get('side-tabs').getActionItem('pin').hidden, 'an edge-owned item can collapse').toBe(false);

        evaluations.length = 0;

        await commit(workspace, {operation: 'resizeEdgeZone', edgeZoneId: 'root', edge: 'right', extent: 0.4});

        expect(workspace.dockModel.nodes.root.zones.right.extent, 'the geometry moved').toBe(0.4);
        expect(evaluationsOf(workspace), 'no header input changed, so nothing was evaluated').toEqual([])
    });

    test('a lock toggle evaluates exactly the formatters that read the item\'s lock, on the header presenting it — and reaches the pane', async () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        const center = Reconciler.collectProjectedTabs(workspace.items[0]).get('center-tabs'),
              pane   = center.getActiveCard(),
              lock   = center.getActionItem('lock'),
              close  = center.getActionItem('close');

        evaluations.length = 0;

        expect(workspace.handleDockLockAction({dockNodeId: 'center-tabs', tabContainer: center}).errors).toEqual([]);

        expect(evaluationsOf(workspace), 'close reads locked, lock reads locked for pressed, the node re-derives its locked items; nothing else, nowhere else')
            .toEqual(['center-tabs:close.hidden', 'center-tabs:dockLockedItemIds', 'center-tabs:lock.pressed']);
        expect(lock.pressed).toBe(true);
        expect(close.hidden, 'a locked item is not closable').toBe(true);
        expect(center.dockLockedItemIds, 'the node binds its locked items').toBe('alpha');
        expect(pane.vdom.inert, 'and presented the pane at the commit boundary').toBe(true);

        await workspace.refreshPromise;

        expect(evaluationsOf(workspace), 'the settled refresh re-evaluated nothing')
            .toEqual(['center-tabs:close.hidden', 'center-tabs:dockLockedItemIds', 'center-tabs:lock.pressed']);

        evaluations.length = 0;

        expect(workspace.handleDockLockAction({dockNodeId: 'center-tabs', tabContainer: center}).errors).toEqual([]);
        await workspace.refreshPromise;

        expect(lock.pressed).toBe(false);
        expect(close.hidden).toBe(false);
        expect(Object.hasOwn(pane.vdom, 'inert'), 'exact restore: the pane never owned inert').toBe(false);
        expect(evaluationsOf(workspace)).toEqual(['center-tabs:close.hidden', 'center-tabs:dockLockedItemIds', 'center-tabs:lock.pressed'])
    });

    test('an activation re-evaluates the header that switched, and only that header', async () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        const center = Reconciler.collectProjectedTabs(workspace.items[0]).get('center-tabs'),
              close  = center.getActionItem('close'),
              reload = center.getActionItem('reload');

        evaluations.length = 0;

        await center.set({activeIndex: 1});

        expect(evaluationsOf(workspace), 'every formatter of the switched header reads its active item')
            .toEqual(ENGINE_KEYS.map(key => `center-tabs:${key}`).sort());
        expect(close.hidden, 'beta is not closable').toBe(true);
        expect(reload.hidden, 'beta has no contract, but the engine recreate default serves it').toBe(false);

        await workspace.refreshPromise;

        // The other header's ACTIONS were not touched. Its container may be re-parented into the
        // refreshed shell, and `container.Base#insert` re-registers a moved component's bindings —
        // one run of the node's own lock formatter, the framework's re-registration, not a header
        // re-derivation.
        expect(evaluationsOf(workspace).filter(entry => entry.startsWith('side-tabs') && !entry.endsWith('dockLockedItemIds')),
            'no action formatter of the other header ran').toEqual([])
    });

    test('a second workspace\'s transaction in the same worker evaluates nothing on the first', async () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});
        other     = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        evaluations.length = 0;

        const otherCenter = Reconciler.collectProjectedTabs(other.items[0]).get('center-tabs');

        expect(other.handleDockLockAction({dockNodeId: 'center-tabs', tabContainer: otherCenter}).errors).toEqual([]);
        await other.refreshPromise;
        await commit(other, {operation: 'setActiveItem', tabsNodeId: 'center-tabs', itemId: 'beta'});

        expect(evaluationsOf(other).length, 'the other workspace evaluated its own headers').toBeGreaterThan(0);
        expect(evaluationsOf(workspace), 'this workspace evaluated nothing').toEqual([]);
        expect(Reconciler.collectProjectedTabs(workspace.items[0]).get('center-tabs').getActionItem('lock').pressed).toBe(false)
    });

    test('reload follows the published pane contract, the recreate fallback and the flight', async () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        const center   = Reconciler.collectProjectedTabs(workspace.items[0]).get('center-tabs'),
              reload   = center.getActionItem('reload'),
              provider = workspace.stateProvider;

        expect(provider.getData('dock.items.alpha.reloadable'), 'the resolver published alpha\'s contract').toBe(true);
        expect(provider.getData('dock.items.beta.reloadable'), 'and beta\'s absence of one').toBe(false);
        expect(provider.getData('dock.recreateFallback'), 'the engine default recreates').toBe(true);

        await center.set({activeIndex: 1});
        expect(reload.hidden, 'beta: no contract, recreate available').toBe(false);

        workspace.hasDockRecreateFallback = () => false;
        workspace.dockHeaderActionPolicy.publishDocument(workspace.dockModel);
        expect(reload.hidden, 'beta: no contract, recreate declared unavailable → hidden').toBe(true);

        await center.set({activeIndex: 0});
        expect(reload.hidden, 'alpha keeps its own contract').toBe(false);
        expect(reload.disabled).toBe(false);

        provider.setData('dock.flights.alpha', 'reload');
        expect(reload.disabled, 'a flight on the active item disables').toBe(true);

        await center.set({activeIndex: 1});
        expect(reload.disabled, 'the flight belongs to alpha, not to the header').toBe(false);

        provider.setData('dock.flights.alpha', null);
        await center.set({activeIndex: 0});
        expect(reload.disabled, 'settled').toBe(false)
    });

    test('header truth lives on the workspace\'s own provider — engine default or consumer-owned — inside the app\'s provider hierarchy', () => {
        // A consumer-owned provider on the workspace hosts the engine's `dock` keys beside its own,
        // and an ancestor's provider stays reachable through the ordinary hierarchy.
        const host = Neo.create(Container, {
            appName      : 'NeoDashboardDockHeaderStateTest',
            stateProvider: {data: {appTheme: 'dark'}},
            items        : [{
                module       : HeaderStateWorkspace,
                dockModel    : createDocument(),
                stateProvider: {data: {panelTitle: 'Inspector'}}
            }]
        });

        workspace = host.items[0];

        const center   = Reconciler.collectProjectedTabs(workspace.items[0]).get('center-tabs'),
              lock     = center.getActionItem('lock'),
              pane     = center.getActiveCard(),
              provider = workspace.stateProvider;

        expect(provider.getData('panelTitle'), 'the consumer\'s own key').toBe('Inspector');
        expect(provider.getData('dock.nodes.center-tabs.activeItemId'), 'beside the engine\'s').toBe('alpha');
        expect(provider.getData('appTheme'), 'and the ancestor\'s, through the hierarchy').toBe('dark');
        expect(provider.getParent(), 'the workspace provider\'s parent is the host\'s').toBe(host.stateProvider);
        expect(lock.getStateProvider(), 'an action resolves the workspace\'s provider through the tree').toBe(provider);
        expect(pane.getStateProvider(), 'so does a pane').toBe(provider);
        expect(Object.keys(host.stateProvider.data), 'nothing engine-owned leaked upward').toEqual(['appTheme']);

        host.destroy();
        workspace = null
    });

    test('the engine default provider is created when a consumer supplies none', () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        expect(workspace.stateProvider?.className).toBe('Neo.state.Provider');
        expect(workspace.stateProvider.getData('dock.items.beta.closable'), 'and carries the header truth').toBe(false)
    });

    test('a header retired by a commit takes its bindings with it', async () => {
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});

        const side = Reconciler.collectProjectedTabs(workspace.items[0]).get('side-tabs');

        await commit(workspace, {operation: 'closeItem', itemId: 'side'});

        expect(side.isDestroyed, 'the last item left, the header is gone').toBe(true);
        expect(Reconciler.collectProjectedTabs(workspace.items[0]).get('side-tabs')).toBeUndefined();

        evaluations.length = 0;

        workspace.stateProvider.setData('dock.nodes.side-tabs.activeItemId', null);

        expect(evaluationsOf(workspace), 'no retired formatter ran').toEqual([])
    });

    test('a rail binds whether the item it reveals is committed locked', () => {
        const document = createDocument();

        document.items.side.autoHidden = true;
        document.items.side.locked     = true;

        workspace = Neo.create(HeaderStateWorkspace, {dockModel: createDocument()});
        workspace.destroy();
        workspace = Neo.create(HeaderStateWorkspace, {dockModel: document});

        let rail = null;

        workspace.forEachDockRail(candidate => rail = candidate);

        expect(rail, 'the auto-hidden item projected its rail').toBeTruthy();
        expect(rail.dockNodeId).toBe('root:edge-rail:right');
        expect(rail.dockRevealLocked, 'nothing revealed yet').toBe(false);

        // The rail publishes what it reveals; the binding reads that leaf and the item's lock.
        rail.publishRevealedItem('side');
        expect(rail.dockRevealLocked, 'the revealed item is locked').toBe(true);

        workspace.dockModel.items.side.locked = false;
        workspace.dockHeaderActionPolicy.publishDocument(workspace.dockModel);
        expect(rail.dockRevealLocked, 'and follows the commit').toBe(false);

        rail.publishRevealedItem(null);
        expect(rail.dockRevealLocked, 'dismissed: nothing revealed').toBe(false)
    })
});
