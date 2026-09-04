import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockActionTooltipsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';
import Reconciler     from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * @summary A committed document with a center tabs node and one auto-hidden edge item, so the
 * projection carries every engine header action AND a rail with its reveal overlay.
 * @returns {Object}
 */
function createDocument() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            alpha : {componentRef: 'alpha',  title: 'Alpha',  kind: 'panel'},
            beta  : {componentRef: 'beta',   title: 'Beta',   kind: 'panel'},
            pinned: {componentRef: 'pinned', title: 'Pinned', kind: 'panel'},
            railed: {componentRef: 'railed', title: 'Railed', kind: 'panel', autoHidden: true}
        },
        nodes: {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, right: {nodeId: 'edge-tabs', extent: 0.25}}},
            'main-tabs': {type: 'tabs', items: ['alpha', 'beta'],    activeItemId: 'alpha'},
            'edge-tabs': {type: 'tabs', items: ['pinned', 'railed'], activeItemId: 'pinned'}
        }
    }
}

/**
 * @summary Workspace fixture that mounts the real projected composition once.
 */
class TooltipWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockActionTooltips.Workspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

TooltipWorkspace = Neo.setupClass(TooltipWorkspace);

/**
 * The tooltip TEXT an action offers: the plain string until the tooltip module has loaded, the
 * shared-instance config object after — the same read `Workspace#readDockActionTooltip` makes.
 * @param {Neo.component.Base} action
 * @returns {String|null}
 */
const tipText = action => typeof action.tooltip === 'string' ? action.tooltip : (action.tooltip?.text ?? null);

test.describe('dock header action tooltips', () => {
    let workspace = null;

    test.afterEach(() => {
        workspace?.destroy();
        workspace = null
    });

    const create = (config={}) => (workspace = Neo.create(TooltipWorkspace, {
        dockModel           : createDocument(),
        enableDockLockAction: true,
        ...config
    }));

    const tabsOf = nodeId => Reconciler.collectProjectedTabs(workspace.items[0]).get(nodeId);

    test('the projection stamps the engine defaults onto every header action and the reveal pin', () => {
        create();

        const main     = tabsOf('main-tabs'),
              expected = {
                  close    : 'Close',
                  lock     : 'Lock pane',
                  maximize : 'Maximize',
                  pin      : 'Unpin into the rail',
                  'pop-out': 'Pop out into a window',
                  reload   : 'Reload pane'
              };

        for (const [action, text] of Object.entries(expected)) {
            expect(tipText(main.getActionItem(action)), `${action} names itself`).toBe(text)
        }

        const rail    = workspace.down({ntype: 'dashboard-dock-rail'}),
              overlay = rail.items.at(-1),
              pin     = overlay.items[0].getActionItem('pin');

        expect(rail.revealPinTooltip, 'the rail carries the text for its overlay').toBe('Pin back into the layout');
        expect(overlay.pinTooltip).toBe('Pin back into the layout');
        expect(tipText(pin), 'the reveal pin names itself').toBe('Pin back into the layout')
    });

    test('a consumer override deep-merges over the defaults, and a null key withholds one tooltip', () => {
        const overridden = create({dockActionTooltips: {lock: 'Sperren', reload: null}}),
              main       = tabsOf('main-tabs');

        expect(overridden.dockActionTooltips.lock,  'the overridden key').toBe('Sperren');
        expect(overridden.dockActionTooltips.close, 'an untouched key keeps the engine default').toBe('Close');
        expect(tipText(main.getActionItem('lock'))).toBe('Sperren');
        expect(tipText(main.getActionItem('close'))).toBe('Close');
        expect(main.getActionItem('reload').tooltip, 'a null key writes no tooltip at all').toBeNull();

        overridden.destroy();

        // The merge lands on the instance, never on the class default.
        create();
        expect(workspace.dockActionTooltips.lock, 'a fresh workspace keeps the engine default').toBe('Lock pane');
        expect(tipText(tabsOf('main-tabs').getActionItem('reload'))).toBe('Reload pane')
    });

    test('lock ↔ unlock flips tooltip, icon and accessible name together on the retained instance', () => {
        create();

        const main   = tabsOf('main-tabs'),
              action = main.getActionItem('lock');

        expect(tipText(action)).toBe('Lock pane');

        expect(workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer: main}).errors).toEqual([]);

        expect(main.getActionItem('lock'), 'the same instance').toBe(action);
        expect(action.iconCls).toBe(workspace.dockUnlockIconCls);
        expect(action.vdom['aria-label']).toBe('unlock');
        expect(tipText(action)).toBe('Unlock pane');

        expect(workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer: main}).errors).toEqual([]);

        expect(action.iconCls).toBe(workspace.dockLockIconCls);
        expect(action.vdom['aria-label']).toBe('lock');
        expect(tipText(action)).toBe('Lock pane')
    });

    test('a null key on one half of a toggle clears the tooltip in that state, and the other half restores it', () => {
        create({dockActionTooltips: {restore: null, unlock: null}});

        const main     = tabsOf('main-tabs'),
              lock     = main.getActionItem('lock'),
              maximize = main.getActionItem('maximize');

        expect(tipText(lock)).toBe('Lock pane');
        expect(workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer: main}).errors).toEqual([]);
        expect(lock.iconCls, 'the icon follows the toggle').toBe(workspace.dockUnlockIconCls);
        expect(tipText(lock), 'the opted-out state has no tooltip — not the one the button just left').toBeNull();
        expect(lock.cls, 'and no longer joins the shared tooltip').not.toContain('neo-uses-shared-tooltip');

        expect(workspace.handleDockLockAction({dockNodeId: 'main-tabs', tabContainer: main}).errors).toEqual([]);
        expect(tipText(lock), 'the other half restores its text').toBe('Lock pane');

        const plugin = workspace.getPlugin('dock-maximize');

        expect(tipText(maximize)).toBe('Maximize');
        plugin.syncActionPresentation(main, true);
        expect(maximize.iconCls).toBe(plugin.restoreIconCls);
        expect(tipText(maximize), 'restore opted out: no tooltip while maximized').toBeNull();

        plugin.syncActionPresentation(main, false);
        expect(tipText(maximize)).toBe('Maximize')
    });

    test('maximize ↔ restore flips tooltip, icon and accessible name on the retained instance', () => {
        create();

        const main   = tabsOf('main-tabs'),
              action = main.getActionItem('maximize'),
              plugin = workspace.getPlugin('dock-maximize');

        expect(action.vdom['aria-label'], 'the derived name before any toggle').toBe('maximize');
        expect(tipText(action)).toBe('Maximize');

        plugin.syncActionPresentation(main, true);

        expect(main.getActionItem('maximize'), 'the same instance').toBe(action);
        expect(action.iconCls).toBe(plugin.restoreIconCls);
        expect(action.vdom['aria-label'], 'the restore glyph is announced as restore').toBe('restore');
        expect(tipText(action)).toBe('Restore');

        plugin.syncActionPresentation(main, false);

        expect(action.iconCls).toBe(plugin.iconCls);
        expect(action.vdom['aria-label']).toBe('maximize');
        expect(tipText(action)).toBe('Maximize')
    })
});
