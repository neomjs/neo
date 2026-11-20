import {setup} from '../../setup.mjs';

const appName = 'NeoPluginWindowIdPropagationUnitTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Animate          from '../../../../src/list/plugin/Animate.mjs';
import Button           from '../../../../src/button/Base.mjs';
import Component        from '../../../../src/component/Base.mjs';
import Container        from '../../../../src/container/Base.mjs';
import CssUtil          from '../../../../src/util/Css.mjs';
import ListBase         from '../../../../src/list/Base.mjs';
import Plugin           from '../../../../src/plugin/Base.mjs';
import Popover          from '../../../../src/plugin/Popover.mjs';
import PrefixField      from '../../../../src/plugin/PrefixField.mjs';
import Resizable        from '../../../../src/plugin/Resizable.mjs';
import TableCellEditing from '../../../../src/table/plugin/CellEditing.mjs';
import TextField        from '../../../../src/form/field/Text.mjs';
import '../../../../src/manager/Instance.mjs';

class TrackedPlugin extends Plugin {
    static config = {
        className: 'Test.Unit.Plugin.WindowIdPropagation.TrackedPlugin',
        ntype    : 'plugin-window-id-tracked'
    }
}
TrackedPlugin = Neo.setupClass(TrackedPlugin);

class AnimatedPlainList extends ListBase {
    static config = {
        className : 'Test.Unit.Plugin.WindowIdPropagation.AnimatedPlainList',
        itemHeight: 40,
        itemWidth : 200
    }
}
AnimatedPlainList = Neo.setupClass(AnimatedPlainList);

class MockTableOwner extends Component {
    static config = {
        className: 'Test.Unit.Plugin.WindowIdPropagation.MockTableOwner'
    }

    body           = {keys: {add: Neo.emptyFn}}
    selectionModel = null
}
MockTableOwner = Neo.setupClass(MockTableOwner);

class ObservableBareOwner extends core.Base {
    static observable = true

    static config = {
        className: 'Test.Unit.Plugin.WindowIdPropagation.ObservableBareOwner'
    }
}
ObservableBareOwner = Neo.setupClass(ObservableBareOwner);

/**
 * @summary Verifies `Neo.plugin.Base` tracks `owner.windowId` across headless construction, late mount,
 * cross-window moves, standalone `{owner}` plugins, and `plugin.destroy()` unsubscription.
 */
test.describe('Neo.plugin.Base windowId propagation', () => {
    let originalDeleteRules,
        originalGetAddon,
        originalInsertRules,
        originalInsertThemeFiles,
        originalPopoverAddon;

    test.beforeEach(() => {
        originalDeleteRules      = CssUtil.deleteRules;
        originalGetAddon         = Neo.currentWorker.getAddon;
        originalInsertRules      = CssUtil.insertRules;
        originalInsertThemeFiles = Neo.currentWorker.insertThemeFiles;
        originalPopoverAddon     = Neo.main?.addon?.Popover
    });

    test.afterEach(() => {
        CssUtil.deleteRules                = originalDeleteRules;
        CssUtil.insertRules                = originalInsertRules;
        Neo.currentWorker.getAddon         = originalGetAddon;
        Neo.currentWorker.insertThemeFiles = originalInsertThemeFiles;

        if (Neo.main?.addon) {
            if (originalPopoverAddon === undefined) {
                delete Neo.main.addon.Popover
            } else {
                Neo.main.addon.Popover = originalPopoverAddon
            }
        }
    });

    test('AC-1: Popover deletes onOwnerMounted, loads theme files on late windowId, and forwards windowId to addon show/hide', () => {
        const themeCalls   = [],
              popoverCalls = [];

        Neo.currentWorker.insertThemeFiles = (windowId, proto) => {
            themeCalls.push({windowId, className: proto.className})
        };

        Neo.ns('Neo.main.addon', true);
        Neo.main.addon.Popover = {
            hide: payload => popoverCalls.push({op: 'hide', ...payload}),
            show: payload => popoverCalls.push({op: 'show', ...payload})
        };

        expect(Object.hasOwn(Popover.prototype, 'onOwnerMounted')).toBe(false);

        const host = Neo.create(Container, {
            appName,
            windowId: null,
            items   : [{
                module : Button,
                text   : 'Info',
                plugins: [{
                    module: Popover,
                    items : [{ntype: 'component', text: 'Details'}]
                }]
            }]
        });

        const button        = host.items[0],
              popoverPlugin = button.getPlugin('popover');

        expect(popoverPlugin.windowId).toBeNull();
        expect(themeCalls.filter(c => c.className === 'Neo.plugin.Popover')).toHaveLength(0);

        host.windowId = 2;

        expect(popoverPlugin.windowId).toBe(2);
        expect(themeCalls).toContainEqual({windowId: 2, className: 'Neo.plugin.Popover'});

        popoverPlugin.onTargetMouseOver({component: button});
        popoverPlugin.onTargetMouseOut({component: button});

        expect(popoverCalls).toEqual([
            {op: 'show', id: button.id, windowId: 2},
            {op: 'hide', id: button.id, windowId: 2}
        ]);

        host.destroy()
    });

    test('AC-2: Resizable, table.plugin.CellEditing, and list.plugin.Animate follow owner windowId across late mount and window moves', () => {
        const themeCalls = [],
              cssCalls   = [];

        Neo.currentWorker.insertThemeFiles = (windowId, proto) => {
            themeCalls.push({windowId, className: proto.className})
        };
        CssUtil.insertRules = (windowId, rules) => cssCalls.push({op: 'insert', windowId, rules});
        CssUtil.deleteRules = (windowId, rules) => cssCalls.push({op: 'delete', windowId, rules});

        // 1. Resizable: null -> 1 -> null -> 3 updates dragZone.windowId and theme injection
        const resizableComp   = Neo.create(Component, {appName, windowId: null, plugins: [{module: Resizable}]}),
              resizablePlugin = resizableComp.getPlugin('resizable');

        resizablePlugin.dragZone = {windowId: null, destroy: Neo.emptyFn};

        resizableComp.windowId = 1;
        expect(resizablePlugin.windowId).toBe(1);
        expect(resizablePlugin.dragZone.windowId).toBe(1);
        expect(themeCalls).toContainEqual({windowId: 1, className: 'Neo.plugin.Resizable'});

        resizableComp.windowId = null;
        expect(resizablePlugin.windowId).toBeNull();
        expect(resizablePlugin.dragZone.windowId).toBeNull();

        resizableComp.windowId = 3;
        expect(resizablePlugin.windowId).toBe(3);
        expect(resizablePlugin.dragZone.windowId).toBe(3);
        expect(themeCalls).toContainEqual({windowId: 3, className: 'Neo.plugin.Resizable'});

        resizablePlugin.dragZone = null;
        resizableComp.destroy();

        // 2. table.plugin.CellEditing: cached column editors follow owner.windowId
        const tableOwner  = Neo.create(MockTableOwner, {appName, windowId: 1, plugins: [{module: TableCellEditing}]}),
              cellEditing = tableOwner.getPlugin('table-cell-editing'),
              nameEditor  = Neo.create(TextField, {appName, windowId: 1});

        cellEditing.editors.name = nameEditor;

        tableOwner.windowId = 4;
        expect(cellEditing.windowId).toBe(4);
        expect(nameEditor.windowId).toBe(4);

        tableOwner.destroy();

        // 3. list.plugin.Animate: initial {plugins, windowId: 2} inserts directly into window 2, and 2 -> 5 migrates CSS rules
        cssCalls.length = 0;

        const list = Neo.create(AnimatedPlainList, {
            appName,
            plugins : [{module: Animate, transitionDuration: 50}],
            windowId: 2
        });

        expect(list.getPlugin('list-animate').windowId).toBe(2);
        expect(cssCalls).toEqual([{
            op      : 'insert',
            windowId: 2,
            rules   : [
                `#${list.id} {position:relative}`,
                `#${list.id} .neo-list-item {transition: opacity 50ms ease-in-out, transform 50ms ease-in-out}`
            ]
        }]);

        cssCalls.length = 0;
        list.windowId   = 5;

        expect(cssCalls).toEqual([
            {
                op      : 'delete',
                windowId: 2,
                rules   : [`#${list.id}`, `#${list.id} .neo-list-item`]
            },
            {
                op      : 'insert',
                windowId: 5,
                rules   : [
                    `#${list.id} {position:relative}`,
                    `#${list.id} .neo-list-item {transition: opacity 50ms ease-in-out, transform 50ms ease-in-out}`
                ]
            }
        ]);

        cssCalls.length = 0;
        const listId = list.id;
        list.destroy();

        expect(cssCalls).toEqual([{
            op      : 'delete',
            windowId: 5,
            rules   : [`#${listId}`, `#${listId} .neo-list-item`]
        }])
    });

    test('AC-4: standalone Neo.create(Plugin, {owner}) follows owner.windowId and stops observing after plugin.destroy()', () => {
        const themeCalls = [];

        Neo.currentWorker.insertThemeFiles = (windowId, proto) => {
            themeCalls.push({windowId, className: proto.className})
        };

        const owner      = Neo.create(Component, {appName, windowId: null}),
              standalone = Neo.create(TrackedPlugin, {owner});

        expect(standalone.windowId).toBeNull();

        owner.windowId = 7;
        expect(standalone.windowId).toBe(7);
        expect(themeCalls).toContainEqual({windowId: 7, className: 'Test.Unit.Plugin.WindowIdPropagation.TrackedPlugin'});

        standalone.destroy();
        themeCalls.length = 0;

        owner.windowId = 8;
        expect(standalone.windowId).toBe(7);
        expect(themeCalls.filter(c => c.className === 'Test.Unit.Plugin.WindowIdPropagation.TrackedPlugin')).toHaveLength(0);

        // A bare Neo.core.Base mock owner lacking a reactive windowId_ config emits zero observeConfig warnings
        const warnings     = [],
              originalWarn = console.warn;

        console.warn = (...args) => warnings.push(args.join(' '));
        try {
            const bareOwner  = Neo.create(ObservableBareOwner),
                  mockPlugin = Neo.create(TrackedPlugin, {owner: bareOwner});

            expect(mockPlugin.windowId).toBeNull();
            expect(warnings).toEqual([]);

            mockPlugin.destroy();
            bareOwner.destroy()
        } finally {
            console.warn = originalWarn
        }

        owner.destroy()
    })
});
