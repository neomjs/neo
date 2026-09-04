import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockMaximizePluginTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';
import Maximize       from '../../../../src/dashboard/dock/plugin/Maximize.mjs';
import Reconciler     from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

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

test.describe('dock maximize as a declinable plugin', () => {
    let workspace = null;

    test.afterEach(() => {
        !workspace?.isDestroyed && workspace?.destroy();
        workspace = null
    });

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
        expect(tabsOf('main-tabs').getActionItem('maximize').iconCls).toBe(plugin.iconCls);

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
        expect(tabsOf('main-tabs').getActionItem('maximize').iconCls, 'its options reached the projection').toBe('fa fa-expand')
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

    test('destroying the owner destroys the plugin', () => {
        create();

        const plugin = workspace.getPlugin('dock-maximize');

        workspace.destroy();

        expect(plugin.isDestroyed).toBe(true);
        expect(Neo.get(plugin.id), 'released from the instance registry').toBeFalsy()
    })
});
