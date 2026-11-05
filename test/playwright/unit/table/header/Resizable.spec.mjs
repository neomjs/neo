import {setup} from '../../../setup.mjs';

const appName = 'TableHeaderResizableTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import HeaderButton    from '../../../../../src/table/header/Button.mjs';
import HeaderToolbar   from '../../../../../src/table/header/Toolbar.mjs';
import ResizablePlugin from '../../../../../src/table/header/plugin/Resizable.mjs';

/**
 * @summary Verifies drag-and-drop column resizing support in `Neo.table.header.Toolbar`,
 * `Neo.table.header.Button`, and `Neo.table.header.plugin.Resizable`.
 */
test.describe('Neo.table.header.plugin.Resizable', () => {
    let toolbar;

    test.afterEach(() => {
        toolbar?.destroy();
        toolbar = null
    });

    test('Toolbar passes resizable config to header buttons and lazy-loads ResizablePlugin', async () => {
        toolbar = Neo.create({
            module: HeaderToolbar,
            appName,
            items : [{
                dataField: 'id',
                text     : 'ID',
                width    : 150
            }, {
                dataField: 'name',
                resizable: false,
                text     : 'Name',
                width    : 200
            }]
        });

        await toolbar.timeout(20);

        const [idButton, nameButton] = toolbar.items;

        expect(idButton.resizable).toBe(true);
        expect(nameButton.resizable).toBe(false);

        const idPlugin = idButton.getPlugin('plugin-table-header-resizable');
        expect(idPlugin).toBeInstanceOf(ResizablePlugin);
        expect(idPlugin.delegationCls).toBe('neo-table-header-button');
        expect(idPlugin.directions).toEqual(['r']);
        expect(idPlugin.minWidth).toBe(100);

        expect(nameButton.getPlugin('plugin-table-header-resizable')).toBeNull();
        expect(idButton.toJSON().resizable).toBe(true);
        expect(nameButton.toJSON().resizable).toBe(false)
    });

    test('Toggling Toolbar#resizable updates child buttons and removes active resize handles when disabled', async () => {
        toolbar = Neo.create({
            module: HeaderToolbar,
            appName,
            items : [{
                dataField: 'country',
                text     : 'Country',
                width    : 200
            }]
        });

        await toolbar.timeout(20);

        const [button] = toolbar.items;
        const plugin   = button.getPlugin('plugin-table-header-resizable');

        expect(plugin).toBeInstanceOf(ResizablePlugin);

        // Simulate hovering the right edge to inject the resize handle node
        const buttonVdom = button.getVdomRoot();
        plugin.onMouseMove({
            clientX: 198,
            clientY: 15,
            path   : [{
                id  : buttonVdom.id,
                cls : buttonVdom.cls,
                rect: {x: 0, y: 0, width: 200, height: 30, right: 200, bottom: 30}
            }]
        });

        expect(plugin.nodeRight).toBeTruthy();

        // Disable resizing at the toolbar level
        toolbar.resizable = false;

        expect(button.resizable).toBe(false);
        expect(plugin.nodeRight).toBeNull();

        // Hovering while resizable is false must not re-add the handle node
        plugin.onMouseMove({
            clientX: 198,
            clientY: 15,
            path   : [{
                id  : buttonVdom.id,
                cls : buttonVdom.cls,
                rect: {x: 0, y: 0, width: 200, height: 30, right: 200, bottom: 30}
            }]
        });

        expect(plugin.nodeRight).toBeNull()
    });

    test('Clicking a .neo-resizable handle does not sort the column, and SortZone ignores .neo-resizable', async () => {
        toolbar = Neo.create({
            module: HeaderToolbar,
            appName,
            items : [{
                dataField: 'price',
                text     : 'Price',
                width    : 180
            }]
        });

        const [button] = toolbar.items;
        expect(button.isSorted).toBeNull();

        button.onClick({
            path: [{
                id : 'resize-handle-1',
                cls: ['neo-resizable', 'neo-resizable-right']
            }]
        });

        expect(button.isSorted).toBeNull();

        const sortZoneConfigs = [];
        const origCreate      = Neo.create;
        Neo.create = config => {
            sortZoneConfigs.push(config);
            return {id: 'mock-sort-zone', destroy() {}}
        };

        try {
            toolbar.createSortZone({module: HeaderToolbar});
        } finally {
            Neo.create = origCreate
        }

        expect(sortZoneConfigs[0].ignoreDragSelector).toBe('.neo-resizable')
    });

    test('onDragStart, onDragMove, and onDragEnd resize column width/wrapperStyle and recalculate docked offsets', async () => {
        let bodyRefreshCount = 0;

        const parentContainer = {
            id  : 'mock-table-container',
            body: {
                store: {getCount: () => 2},
                createViewData() {
                    bodyRefreshCount++
                }
            }
        };

        toolbar = Neo.create({
            module: HeaderToolbar,
            appName,
            items : [{
                dataField: 'code',
                dock     : 'left',
                text     : 'Code',
                width    : 160
            }, {
                dataField: 'actions',
                dock     : 'right',
                text     : 'Actions',
                width    : 100
            }, {
                dataField: 'city',
                dock     : 'left',
                text     : 'City',
                width    : 200
            }]
        });

        toolbar.parentComponent = parentContainer;

        await toolbar.timeout(20);

        const [firstButton, rightButton, secondButton] = toolbar.items;
        const plugin                                   = firstButton.getPlugin('plugin-table-header-resizable');

        expect(firstButton.wrapperStyle.left).toBe('0px');
        expect(rightButton.wrapperStyle.right).toBe('0px');
        expect(secondButton.wrapperStyle.left).toBe('161px');

        // Stub dragZone and base lifecycle methods that depend on main-thread DragDrop
        const mockProxy = {
            style       : {width: '160px'},
            wrapperStyle: {
                height   : '29px',
                left     : '10px',
                position : 'absolute',
                top      : '20px',
                transform: 'translate3d(0,0,0)',
                width    : '160px'
            }
        };

        plugin.dragZone = {
            dragProxy: mockProxy,
            dragStart() {},
            dragEnd() {},
            destroy() {}
        };
        plugin.addBodyCursorCls    = () => {};
        plugin.removeBodyCursorCls = () => {};

        const buttonVdom = firstButton.getVdomRoot();
        plugin.currentNodeName       = 'right';
        plugin.initialRect           = {left: 0, right: 160, top: 0, bottom: 29, width: 160, height: 29};
        plugin.boundaryContainerRect = {left: 0, right: 1000, top: 0, bottom: 600, width: 1000, height: 600};

        plugin.onDragStart({
            path: [{
                id     : buttonVdom.id,
                cls    : buttonVdom.cls,
                rect   : plugin.initialRect,
                tagName: 'button'
            }, {
                id     : 'document.body',
                cls    : [],
                rect   : plugin.boundaryContainerRect,
                tagName: 'body'
            }]
        });

        expect(toolbar.cls).toContain('neo-is-resizing');
        expect(toolbar.dragResortable).toBe(false);

        // Drag narrower to 120px (below default 200px, above minWidth 100px)
        plugin.onDragMove({
            clientX: 120,
            clientY: 15
        });

        expect(mockProxy.style.width).toBeUndefined();
        expect(firstButton.width).toBe(120);
        expect(firstButton.wrapperStyle.width).toBe('120px');
        expect(firstButton.wrapperStyle.minWidth).toBe('120px');
        expect(firstButton.wrapperStyle.maxWidth).toBe('120px');
        expect(secondButton.wrapperStyle.left).toBe('121px');
        expect(bodyRefreshCount).toBe(1);

        // Drag wider to 240px and end drag
        plugin.onDragMove({
            clientX: 240,
            clientY: 15
        });

        expect(firstButton.width).toBe(240);

        plugin.onDragEnd({});

        expect(firstButton.width).toBe(240);
        expect(firstButton.wrapperStyle.width).toBe('240px');
        expect(firstButton.wrapperStyle.minWidth).toBe('240px');
        expect(firstButton.wrapperStyle.maxWidth).toBe('240px');
        expect(firstButton.wrapperStyle.position).toBeNull();
        expect(firstButton.wrapperStyle.top).toBeNull();
        expect(firstButton.wrapperStyle.height).toBeNull();
        expect(firstButton.wrapperStyle.left).toBe('0px');
        expect(secondButton.wrapperStyle.left).toBe('241px');
        expect(toolbar.cls).not.toContain('neo-is-resizing');

        await toolbar.timeout(20);
        expect(toolbar.dragResortable).toBe(true)
    })
});
