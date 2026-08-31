import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockLockActionTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';
import LayoutAdapter  from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import Reconciler     from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * @summary Creates the minimal committed document for the engine-owned lock action.
 * @returns {Object}
 */
function createDocument() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'main-tabs',
        items : {
            alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'},
            beta : {componentRef: 'beta',  title: 'Beta',  kind: 'panel'}
        },
        nodes: {
            'main-tabs': {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'}
        }
    }
}

/**
 * @summary Workspace fixture that mounts the real projected tab composition once.
 */
class LockWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockLockAction.Workspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

LockWorkspace = Neo.setupClass(LockWorkspace);

/**
 * @summary Returns the first projected tabs config from a projection tree.
 * @param {Object} config
 * @returns {Object|null}
 */
function findTabsConfig(config) {
    if (config?.dockNodeType === 'tabs') {
        return config
    }

    for (const child of config?.items || []) {
        const match = findTabsConfig(child);

        if (match) {
            return match
        }
    }

    return null
}

/**
 * @summary Returns the first projected config carrying one dock node type.
 * @param {Object} config
 * @param {String} dockNodeType
 * @returns {Object|null}
 */
function findDockConfig(config, dockNodeType) {
    if (config?.dockNodeType === dockNodeType) {
        return config
    }

    for (const child of config?.items || []) {
        const match = findDockConfig(child, dockNodeType);

        if (match) {
            return match
        }
    }

    return null
}

test.describe('Neo.dashboard.dock.Workspace lock action', () => {
    let workspace;

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test('projects byte-identically while off, then owns the frozen leading slot and name while on', () => {
        const document = createDocument(),
              project  = extra => LayoutAdapter.project(document, {
                  resolveComponentRef: () => ({ntype: 'component'}),
                  ...extra
              }),
              baseline = project({}),
              off      = project({enableDockLockAction: false});

        expect(JSON.stringify(off)).toBe(JSON.stringify(baseline));
        expect(findTabsConfig(project({
            enableDockCloseAction   : true,
            enableDockLockAction    : true,
            enableDockMaximizeAction: true
        })).headerActions.map(action => action.action)).toEqual(['lock', 'maximize', 'close']);

        expect(findTabsConfig(project({
            resolveDockHeaderActions: () => [{action: 'lock'}]
        })).headerActions.map(action => action.action)).toEqual(['lock']);

        expect(() => project({
            enableDockLockAction    : true,
            resolveDockHeaderActions: () => [{action: 'lock'}]
        })).toThrow(/"lock" is reserved while enableDockLockAction is on/)
    });

    test('derives initial icon, policy visibility, and locked close state from the committed item', () => {
        const document = createDocument();

        document.items.alpha.locked = true;

        let tabs = findTabsConfig(LayoutAdapter.project(document, {
            dockLockIconCls    : 'lock-action',
            dockUnlockIconCls  : 'unlock-action',
            enableDockCloseAction: true,
            enableDockLockAction : true,
            resolveComponentRef  : () => ({ntype: 'component'})
        }));

        expect(tabs.headerActions.find(action => action.action === 'lock'))
            .toMatchObject({hidden: false, iconCls: 'unlock-action'});
        expect(tabs.headerActions.find(action => action.action === 'close').hidden).toBe(true);

        document.items.alpha.lockable = false;
        tabs = findTabsConfig(LayoutAdapter.project(document, {
            enableDockLockAction: true,
            resolveComponentRef : () => ({ntype: 'component'})
        }));

        expect(tabs.headerActions.find(action => action.action === 'lock').hidden).toBe(true)
    });

    test('threads committed lock truth to a railed reveal pane without suppressing reveal', () => {
        const document = {
                  schema: 'neo.dock.zone.v1',
                  root  : 'root',
                  items : {
                      railed: {
                          componentRef: 'railed',
                          title       : 'Railed',
                          kind        : 'panel',
                          autoHidden  : true,
                          locked      : true
                      }
                  },
                  nodes: {
                      root        : {type: 'edge-zone', zones: {right: {nodeId: 'edge-tabs'}}},
                      'edge-tabs' : {type: 'tabs', items: ['railed'], activeItemId: 'railed'}
                  }
              },
              syncPane = () => {},
              rail     = findDockConfig(LayoutAdapter.project(document, {
                  resolveComponentRef: () => ({ntype: 'component'}),
                  syncDockLockPane   : syncPane
              }), 'edge-rail');

        expect(rail, 'the locked auto-hidden item still projects its reveal affordance').toBeTruthy();
        expect(rail.railItems).toEqual([{
            dockEdge  : 'right',
            dockItemId: 'railed',
            restorable: true,
            title     : 'Railed'
        }]);
        expect(rail.syncDockLockPane).toBe(syncPane)
    });

    test('an empty retained-tabs map falls back to the fresh projected shell', () => {
        const document = createDocument();

        document.items.alpha.locked = true;
        workspace = Neo.create(LockWorkspace, {
            dockModel           : document,
            enableDockLockAction: true
        });

        const tabContainer = Reconciler.collectProjectedTabs(workspace.items[0]).get('main-tabs'),
              pane         = tabContainer.getActiveCard();

        expect(Object.hasOwn(pane.vdom, 'inert')).toBe(false);

        workspace.syncDockHeaderActions(new Map());

        expect(pane.vdom.inert).toBe(true);
        expect(pane.cls).toContain('neo-dock-pane-locked')
    });

    test('locks and unlocks the real pane, action, close affordance, and tab drag source', () => {
        workspace = Neo.create(LockWorkspace, {
            dockModel             : createDocument(),
            dockLockIconCls       : 'lock-action',
            dockUnlockIconCls     : 'unlock-action',
            enableDockCloseAction : true,
            enableDockLockAction  : true
        });

        const tabContainer = Reconciler.collectProjectedTabs(workspace.items[0]).get('main-tabs'),
              pane         = tabContainer.getActiveCard(),
              tabButton    = tabContainer.getTabButtons()[0],
              lockAction   = tabContainer.getActionItem('lock'),
              closeAction  = tabContainer.getActionItem('close');

        pane.vdom.inert = false;
        tabButton.addWrapperCls('neo-draggable');
        workspace.syncDockHeaderActions();

        expect(tabButton.wrapperCls).toContain('neo-draggable');

        const locked = workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer});

        expect(locked.errors).toEqual([]);
        expect(workspace.dockModel.items.alpha.locked).toBe(true);
        expect(pane.vdom.inert).toBe(true);
        expect(pane.cls).toContain('neo-dock-pane-locked');
        expect(tabButton.wrapperCls).not.toContain('neo-draggable');
        expect(lockAction.iconCls).toBe('unlock-action');
        expect(closeAction.hidden).toBe(true);

        const unlocked = workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer});

        expect(unlocked.errors).toEqual([]);
        expect(workspace.dockModel.items.alpha.locked).toBe(false);
        expect(Object.hasOwn(pane.vdom, 'inert')).toBe(true);
        expect(pane.vdom.inert).toBe(false);
        expect(pane.cls).not.toContain('neo-dock-pane-locked');
        expect(tabButton.wrapperCls).toContain('neo-draggable');
        expect(lockAction.iconCls).toBe('lock-action');
        expect(closeAction.hidden).toBe(false)
    });

    test('restores absent inert ownership and fails closed for lockable false', () => {
        const document = createDocument();

        document.items.alpha.lockable = false;
        workspace = Neo.create(LockWorkspace, {
            dockModel           : document,
            enableDockLockAction: true
        });

        const tabContainer = Reconciler.collectProjectedTabs(workspace.items[0]).get('main-tabs'),
              pane         = tabContainer.getActiveCard(),
              refused      = workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer});

        expect(refused.document).toBe(workspace.dockModel);
        expect(refused.errors.join(' ')).toContain('not lockable');
        expect(Object.hasOwn(pane.vdom, 'inert')).toBe(false);

        workspace.dockModel.items.alpha.lockable = true;
        workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer});
        workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer});

        expect(Object.hasOwn(pane.vdom, 'inert')).toBe(false)
    })
});
