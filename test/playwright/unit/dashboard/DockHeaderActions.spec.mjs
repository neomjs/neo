import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockHeaderActionsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';
import HeaderActions  from '../../../../src/dashboard/dock/plugin/HeaderActions.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * @summary The minimal committed document the engine-owned actions operate on.
 * @returns {Object}
 */
function createDocument() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'main-tabs',
        items : {
            alpha: {reference: 'alpha', title: 'Alpha'},
            beta : {reference: 'beta',  title: 'Beta'}
        },
        nodes: {
            'main-tabs': {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'}
        }
    }
}

/**
 * @summary Workspace fixture that mounts the real projected tab composition once.
 */
class ActionsWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockHeaderActions.Workspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

ActionsWorkspace = Neo.setupClass(ActionsWorkspace);

/**
 * @summary The header-actions plugin as the façade's declinable collaborator: installed by default,
 * never doubled over a consumer-supplied instance, and — once declined — leaving every engine action
 * to the host through the re-emitted `dockHeaderAction` event, with no engine handler running.
 */
test.describe('Neo.dashboard.dock.plugin.HeaderActions — the declinable owner of the engine actions', () => {
    const
        appName = 'NeoDashboardDockHeaderActionsTest',
        create  = config => Neo.create(ActionsWorkspace, {appName, dockModel: createDocument(), ...config}),
        tabsOf  = workspace => workspace.down({dockNodeId: 'main-tabs'});

    test('the default installs exactly one plugin, and its dispatch answers the engine set', () => {
        const
            workspace = create(),
            plugin    = workspace.getPlugin('dock-header-actions');

        expect(plugin).toBeInstanceOf(HeaderActions);
        expect(workspace.plugins.filter(item => item.ntype === 'plugin-dock-header-actions')).toHaveLength(1);

        // a lock through the façade's dispatch commits through the plugin: the document advances
        const result = workspace.onDockHeaderAction({action: 'lock', dockNodeId: 'main-tabs', tabContainer: tabsOf(workspace)});

        expect(result.errors).toEqual([]);
        expect(workspace.dockModel.items.alpha.locked).toBe(true);

        workspace.destroy()
    });

    test('a consumer-supplied instance is kept, not doubled', () => {
        const
            workspace = create({plugins: [{module: HeaderActions, id: 'consumer-header-actions'}]}),
            plugins   = workspace.plugins.filter(item => item.ntype === 'plugin-dock-header-actions');

        expect(plugins).toHaveLength(1);
        expect(plugins[0].id).toBe('consumer-header-actions');
        expect(workspace.getPlugin('dock-header-actions').id).toBe('consumer-header-actions');

        workspace.destroy()
    });

    test('declined: no plugin, no engine handler — every engine action re-emits for the host, and the document stays', () => {
        const
            workspace = create({enableDockHeaderActionsPlugin: false}),
            received  = [];

        expect(workspace.getPlugin('dock-header-actions')).toBeFalsy();

        workspace.on('dockHeaderAction', data => received.push(data.action));

        for (const action of ['close', 'lock', 'pin', 'pop-out', 'reload']) {
            expect(workspace.onDockHeaderAction({action, dockNodeId: 'main-tabs', tabContainer: tabsOf(workspace)}), action).toBeNull()
        }

        // the host received every intent, in order, and nothing committed or reloaded
        expect(received).toEqual(['close', 'lock', 'pin', 'pop-out', 'reload']);
        expect(workspace.dockModel.items.alpha.locked, 'the lock never reached the reducer').toBeUndefined();
        expect(workspace.dockModel.nodes['main-tabs'].items, 'the close never reached the reducer').toEqual(['alpha', 'beta']);

        // a consumer that declined the plugin serves no recreate either: the façade seam answers null
        expect(workspace.recreateDockPane('alpha', null)).toBeNull();

        workspace.destroy()
    });

    test('an action the plugin does not own still re-emits with the plugin installed', () => {
        const
            workspace = create(),
            received  = [];

        workspace.on('dockHeaderAction', data => received.push(data.action));

        expect(workspace.onDockHeaderAction({action: 'host-only', dockNodeId: 'main-tabs', tabContainer: tabsOf(workspace)})).toBeNull();
        expect(received).toEqual(['host-only']);

        workspace.destroy()
    })
});
