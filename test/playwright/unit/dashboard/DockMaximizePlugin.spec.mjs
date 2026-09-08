import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockMaximizePluginTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockWorkspace     from '../../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceDocument from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import WorkspaceSet      from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import Transaction       from '../../../../src/manager/Transaction.mjs';
import Maximize          from '../../../../src/dashboard/dock/plugin/Maximize.mjs';
import Plugin            from '../../../../src/plugin/Base.mjs';
import Reconciler        from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import '../../../../src/vdom/Helper.mjs';

/**
 * @summary A committed document with two tabs nodes in a split, so an operation can reach beyond
 * one of them.
 * @returns {Object}
 */
function createDocument() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'},
            beta : {componentRef: 'beta',  title: 'Beta',  kind: 'panel'},
            gamma: {componentRef: 'gamma', title: 'Gamma', kind: 'panel'}
        },
        nodes: {
            root       : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
            'main-tabs': {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'},
            'side-tabs': {type: 'tabs', items: ['gamma'],         activeItemId: 'gamma'}
        }
    }
}

/**
 * @summary Workspace fixture that mounts the real projected composition once.
 */
class PluginWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockMaximizePlugin.Workspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

PluginWorkspace = Neo.setupClass(PluginWorkspace);

/**
 * @summary A consumer that overrides a collaborator's projection key through the hook.
 */
class HookWorkspace extends PluginWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockMaximizePlugin.HookWorkspace'
    }

    getDockProjectionOptions() {
        return {...super.getDockProjectionOptions(), dockMaximizeIconCls: 'fa fa-host'}
    }
}

HookWorkspace = Neo.setupClass(HookWorkspace);

/**
 * @summary A second collaborator that claims a key the maximize plugin contributes.
 */
class RivalPlugin extends Plugin {
    static config = {
        className: 'Test.Unit.Dashboard.DockMaximizePlugin.Rival',
        ntype    : 'plugin-dock-maximize-rival'
    }

    getDockProjectionOptions() {
        return {enableDockMaximizeAction: false}
    }
}

RivalPlugin = Neo.setupClass(RivalPlugin);

/**
 * @summary A collaborator whose refresh-owned sync rejects.
 */
class FaultyPlugin extends Plugin {
    static config = {
        className: 'Test.Unit.Dashboard.DockMaximizePlugin.Faulty',
        ntype    : 'plugin-dock-faulty'
    }

    async syncDockProjection() {
        throw new Error('faulty collaborator')
    }
}

FaultyPlugin = Neo.setupClass(FaultyPlugin);

test.describe('dock maximize as a declinable plugin', () => {
    let workspace = null,
        getAddonBefore,
        resizeObserverBefore;

    test.beforeEach(() => {
        getAddonBefore       = Neo.currentWorker.getAddon;
        resizeObserverBefore = Neo.main.addon.ResizeObserver
    });

    test.afterEach(() => {
        !workspace?.isDestroyed && workspace?.destroy();
        workspace                     = null;
        Neo.currentWorker.getAddon    = getAddonBefore;
        Neo.main.addon.ResizeObserver = resizeObserverBefore
    });

    /**
     * Records every addon call the plugin makes: `register` / `unregister` through the
     * window-scoped addon the async path resolves, `release` through the synchronous proxy. Only
     * the resize observer stub is replaced — the harness's other main-thread stubs stay.
     * @param {Function} [resolve] Optional deferral: called with the resolver instead of resolving.
     * @param {Object[]} [calls=[]] The list to append to, so a re-stub keeps one record.
     * @returns {Object[]} The recorded calls.
     */
    const recordAddon = (resolve, calls=[]) => {
        Neo.currentWorker.getAddon = (name, windowId) => {
            const addon = {
                register  : tuple => calls.push(['register',   windowId, {...tuple}]),
                unregister: tuple => calls.push(['unregister', windowId, {...tuple}])
            };

            return resolve ? new Promise(done => resolve(() => done(addon))) : Promise.resolve(addon)
        };

        Neo.main.addon.ResizeObserver = {unregister: tuple => calls.push(['release', tuple.windowId, {...tuple}])};

        return calls
    };

    const create = (config={}) => (workspace = Neo.create(PluginWorkspace, {
        dockModel: createDocument(),
        ...config
    }));

    const tabsOf          = nodeId => Reconciler.collectProjectedTabs(workspace.items[0]).get(nodeId);
    const maximizePlugins = () => (workspace.plugins || []).filter(plugin => plugin instanceof Maximize);
    const actionNames     = nodeId => tabsOf(nodeId).headerActions.map(action => action.action);

    test('the default workspace installs exactly one maximize plugin, which projects the toggle and binds Escape', () => {
        create();

        const plugin = workspace.getPlugin('dock-maximize');

        expect(plugin, 'installed at construction').toBeInstanceOf(Maximize);
        expect(maximizePlugins(), 'once').toHaveLength(1);
        expect(plugin.owner).toBe(workspace);
        expect(plugin.maximizedNodeId, 'the transient lives on the plugin').toBeNull();
        expect(plugin.resizeObserved, 'no observation before a presentation exists').toBe(false);

        expect(actionNames('main-tabs').slice(-2), 'the toggle sits in its frozen slot before close').toEqual(['maximize', 'close']);
        expect(tabsOf('main-tabs').getAction('maximize').iconCls).toBe(plugin.iconCls);

        const escape = workspace.keys.keys.find(entry => entry.key === 'Escape');

        expect(escape, 'Escape is bound on the owner\'s key navigation').toMatchObject({fn: 'onEscape', scope: plugin.id});
        expect(workspace.keys.component, 'the navigation created by the plugin registered itself').toBe(workspace)
    });

    test('a workspace that declines maximize has no plugin, no toggle and no key binding', () => {
        create({enableDockMaximizeAction: false});

        const names = actionNames('main-tabs');

        expect(workspace.getPlugin('dock-maximize')).toBeNull();
        expect(maximizePlugins()).toHaveLength(0);
        expect(names, 'the rail projects without the toggle').not.toContain('maximize');
        expect(names.at(-1), 'and close keeps its last slot').toBe('close');
        expect(workspace.keys, 'no navigation was created for a binding nobody owns').toBeNull();
        expect(workspace.getDockCollaboratorOptions(), 'nothing contributes maximize into the projection').toEqual({})
    });

    test('a consumer-supplied maximize plugin is honoured instead of the engine default', () => {
        create({plugins: [{module: Maximize, iconCls: 'fa fa-expand'}]});

        const plugin = workspace.getPlugin('dock-maximize');

        expect(maximizePlugins(), 'the switch installs nothing beside the supplied instance').toHaveLength(1);
        expect(plugin.iconCls).toBe('fa fa-expand');
        expect(tabsOf('main-tabs').getAction('maximize').iconCls, 'its options reached the projection').toBe('fa fa-expand')
    });

    test('a committed operation is announced to collaborators before it applies', () => {
        create();

        const
            plugin     = workspace.getPlugin('dock-maximize'),
            before     = workspace.dockModel,
            descriptor = {operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'beta'},
            document   = structuredClone(before),
            seen       = [];

        document.nodes['main-tabs'].activeItemId = 'beta';

        workspace.on('beforeDockZoneDocumentChange', data => {
            seen.push({descriptor: data.descriptor, stillOutgoing: workspace.dockModel === before})
        });

        workspace.onDockZoneDocumentChange(document, descriptor, workspace);

        expect(seen, 'fired once, with the descriptor, while the outgoing document is still committed')
            .toEqual([{descriptor, stillOutgoing: true}]);
        expect(plugin.isNeutralOperation(descriptor), 'an operation confined to the node it would own').toBe(false);

        plugin.maximizedNodeId = 'main-tabs';
        expect(plugin.isNeutralOperation(descriptor)).toBe(true);
        expect(plugin.isNeutralOperation({operation: 'splitNode', nodeId: 'side-tabs'}), 'a topology mutation reaches beyond it').toBe(false)
    });

    for (const [name, target, expected] of [
        ['catalog-only', undefined, 'main-tabs'],
        ['inside the maximized pane', {operation: 'addTab', tabsNodeId: 'main-tabs', itemId: 'gamma'}, 'main-tabs'],
        ['inside another pane', {operation: 'addTab', tabsNodeId: 'side-tabs'}, null],
        ['splitting the maximized pane', {operation: 'splitNode', targetNodeId: 'main-tabs', orientation: 'horizontal'}, null]
    ]) {
        test(`addItem ${name} preserves only neutral maximize state through the commit hook`, async () => {
            create();

            const plugin     = workspace.getPlugin('dock-maximize'),
                  descriptor = {operation: 'addItem', itemId: 'created', item: {componentRef: 'created'},
                      ...(target === undefined ? {} : {target})},
                  result = workspace.applyDockZoneOperation(descriptor);

            expect(result.errors).toEqual([]);
            // Isolate the pre-projection state decision from DOM measurement and animation.
            plugin._maximizedNodeId = 'main-tabs';
            workspace.refreshDockView = async () => {};
            await workspace.onDockZoneDocumentChange(result.document, descriptor, workspace);

            expect(workspace.dockModel.items.created).toEqual(descriptor.item);
            expect(plugin.maximizedNodeId).toBe(expected)
        })
    }

    for (const [name, operations, expected] of [
        ['local add and reorder', [
            {operation: 'addItem', itemId: 'created', item: {componentRef: 'created'}},
            {operation: 'addTab', itemId: 'created', tabsNodeId: 'main-tabs'},
            {operation: 'moveItem', itemId: 'beta', targetNodeId: 'main-tabs', index: 0}
        ], 'main-tabs'],
        ['ordered creation and removal', [
            {operation: 'addItem', itemId: 'created', item: {componentRef: 'created'}, target: {operation: 'addTab', tabsNodeId: 'main-tabs'}},
            {operation: 'closeItem', itemId: 'created'}
        ], 'main-tabs'],
        ['cross-node move into the maximized pane', [{operation: 'moveItem', itemId: 'gamma', targetNodeId: 'main-tabs'}], null],
        ['mixed local and cross-node changes', [
            {operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'beta'},
            {operation: 'moveItem', itemId: 'gamma', targetNodeId: 'main-tabs'}
        ], null]
    ]) {
        test(`Group batch ${name} uses ordered captured state for maximize`, async () => {
            create();
            const binding = Transaction.bind({windowId: workspace.id, workspaceKey: 'main'}),
                  set     = Neo.create(WorkspaceSet, {manager: Transaction, getGroupId: () => binding.groupId, documentModel: WorkspaceDocument}),
                  plugin  = workspace.getPlugin('dock-maximize'),
                  before  = workspace.dockModel,
                  events  = [];
            Transaction.setHistoryDepth({groupId: binding.groupId, depth: 5});
            set.register('main', {getDocument: () => workspace.dockModel, setDocument: value => workspace.dockModel = value,
                project: context => workspace.projectDockCommit(context)});
            workspace.refreshDockWorkspace = async () => {};
            plugin._maximizedNodeId = 'main-tabs';
            workspace.on('beforeDockZoneDocumentChange', event => events.push(event));
            try {
                await set.commit('main', operations);
                await expect.poll(() => events.length).toBe(1);
                await workspace.refreshPromise;
                expect(plugin.maximizedNodeId).toBe(expected);
                expect(events[0].commitContext.captured.value).toEqual(before);
                expect(Transaction.get(binding.groupId).history.count).toBe(1);

                const committed = workspace.dockModel;
                await expect(set.commit('main', [{operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'missing'}]))
                    .rejects.toThrow('not a member');
                expect(workspace.dockModel).toBe(committed);
                expect(plugin.maximizedNodeId).toBe(expected);
                expect(events).toHaveLength(1);
                expect(Transaction.get(binding.groupId).history.count).toBe(1)
            } finally {
                set.destroy();
                Transaction.retireGroup(binding.groupId)
            }
        })
    }

    test('a Group batch without matching capture context remains non-neutral', () => {
        create();
        const plugin     = workspace.getPlugin('dock-maximize'),
              descriptor = {workspaceKey: 'main', operations: [{operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'beta'}]};
        plugin._maximizedNodeId = 'main-tabs';
        expect(plugin.isNeutralChange(descriptor)).toBe(false);
        expect(plugin.isNeutralChange(descriptor, {workspaceKey: 'other', captured: {value: workspace.dockModel}})).toBe(false)
    });

    test('the observation follows the owner across render windows, and an await retired by the hop arms nothing', async () => {
        create({windowId: 1});

        const
            plugin = workspace.getPlugin('dock-maximize'),
            calls  = recordAddon(),
            tuple  = windowId => ({componentId: workspace.id, id: workspace.id, windowId});

        // The transient is written to its backing field on purpose: the reactive setter starts
        // the async apply, and this arm is about the observation alone.
        plugin._maximizedNodeId = 'main-tabs';
        await plugin.registerResizeObserver(true);

        expect(calls).toEqual([['register', 1, tuple(1)]]);
        expect(plugin.observation).toEqual(tuple(1));

        workspace.windowId = 2;

        await expect.poll(() => calls.length, 'the hop releases window 1 and re-arms in window 2').toBe(3);
        expect(calls.slice(1)).toEqual([['release', 1, tuple(1)], ['register', 2, tuple(2)]]);
        expect(plugin.observation).toEqual(tuple(2));

        // A registration still awaiting the addon when the owner hops must not arm the old window.
        const pending = [];

        plugin.releaseObservation();
        calls.length = 0;
        recordAddon(resolveLater => pending.push(resolveLater), calls);

        const stale = plugin.registerResizeObserver(true);

        workspace.windowId = 3;

        await expect.poll(() => pending.length, 'the hop queued its own registration').toBe(2);
        pending[0]();
        await stale;
        expect(calls.filter(([verb]) => verb === 'register'), 'the retired await armed nothing').toEqual([]);

        pending[1]();
        await expect.poll(() => calls.filter(([verb]) => verb === 'register')).toEqual([['register', 3, tuple(3)]]);
        expect(plugin.observation).toEqual(tuple(3))
    });

    test('a plugin destroyed while its owner lives leaves the owner as it found it', async () => {
        create({windowId: 1});

        const
            plugin      = workspace.getPlugin('dock-maximize'),
            calls       = recordAddon(),
            main        = tabsOf('main-tabs'),
            hasListener = () => workspace.domListeners.some(entry => entry.scope === plugin),
            escapeBound = () => !!workspace.keys.keys.find(entry => entry.key === 'Escape');

        plugin._maximizedNodeId = 'main-tabs';
        await plugin.registerResizeObserver(true);

        // A presentation is live on the node, exactly as an apply leaves it.
        plugin.restoreSnapshot = {nodeId: 'main-tabs', zone: null, zoneId: null};
        main.set({cls: [...main.cls, 'neo-dock-maximized'], wrapperStyle: {height: '10px', left: '1px', top: '1px', width: '10px'}});

        expect(hasListener()).toBe(true);
        expect(escapeBound()).toBe(true);

        plugin.destroy();

        expect(plugin.isDestroyed).toBe(true);
        expect(workspace.isDestroyed, 'the owner lives on').toBeFalsy();
        expect(calls.at(-1), 'the exact tuple is released in its window').toEqual(['release', 1, {componentId: workspace.id, id: workspace.id, windowId: 1}]);
        expect(hasListener(), 'the resize dom listener is gone').toBe(false);
        expect(escapeBound(), 'the Escape binding is gone').toBe(false);
        expect(workspace.plugins, 'no dead collaborator remains').not.toContain(plugin);
        expect(workspace.getDockCollaboratorOptions(), 'nothing projects the toggle any more').toEqual({});
        expect(main.cls, 'the node is reset').not.toContain('neo-dock-maximized');
        expect(main.wrapperStyle?.height ?? null).toBeNull();
        expect(() => workspace.fire('dockHeaderAction', {action: 'maximize', dockNodeId: 'main-tabs', tabContainer: main}),
            'the re-emitted intent finds no listener and no error').not.toThrow()
    });

    test('two collaborators claiming one projection option collide loudly, and the consumer hook wins over a collaborator', () => {
        expect(() => create({plugins: [{module: Maximize}, {module: RivalPlugin}]}))
            .toThrow(/"enableDockMaximizeAction" is contributed by two collaborators: Neo\.dashboard\.dock\.plugin\.Maximize and Test\.Unit\.Dashboard\.DockMaximizePlugin\.Rival/);

        workspace = Neo.create(HookWorkspace, {dockModel: createDocument()});

        expect(tabsOf('main-tabs').getAction('maximize').iconCls, 'the hook overrides the collaborator key').toBe('fa fa-host')
    });

    test('a collaborator whose refresh sync rejects is reported and skipped, and the refresh still settles', async () => {
        create();

        const
            failed     = [],
            warnBefore = console.warn,
            warnings   = [];

        workspace.plugins = [...workspace.plugins, {module: FaultyPlugin}];
        workspace.on('dockCollaboratorSyncFailed', data => failed.push(data));
        console.warn = (...args) => warnings.push(args);

        try {
            await workspace.refreshDockWorkspace()
        } finally {
            console.warn = warnBefore
        }

        expect(failed).toHaveLength(1);
        expect(failed[0].plugin.ntype).toBe('plugin-dock-faulty');
        expect(failed[0].error.message).toBe('faulty collaborator');
        expect(failed[0].component).toBe(workspace);
        expect(warnings.some(args => String(args[0]).includes('Test.Unit.Dashboard.DockMaximizePlugin.Faulty')), 'reported by class name').toBe(true)
    });

    test('destroying the owner destroys the plugin and releases its observation at the addon', () => {
        create();

        const
            plugin       = workspace.getPlugin('dock-maximize'),
            unregistered = [];

        // The plugin's fields die with the instance, so the witness is the addon call itself; the
        // tuple is what an armed registration leaves behind.
        Neo.main.addon.ResizeObserver = {unregister: data => unregistered.push(data)};
        plugin.observation            = {componentId: workspace.id, id: workspace.id, windowId: workspace.windowId};
        plugin.resizeObserved         = true;

        workspace.destroy();

        expect(plugin.isDestroyed).toBe(true);
        expect(Neo.get(plugin.id), 'released from the instance registry').toBeFalsy();
        expect(unregistered, 'the owner destroy reaches the addon with the owner id')
            .toEqual([{componentId: workspace.id, id: workspace.id, windowId: workspace.windowId}])
    })
});
