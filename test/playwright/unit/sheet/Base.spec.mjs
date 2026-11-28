import {setup} from '../../setup.mjs';

const appName = 'SheetBaseTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Handle         from '../../../../src/sheet/Handle.mjs';
import Sheet          from '../../../../src/sheet/Base.mjs';
import '../../../../src/manager/Instance.mjs';

test.describe('Neo.sheet.Base', () => {
    let addon, instances, measured, original;

    test.beforeEach(() => {
        addon     = Neo.main.addon.DragDrop;
        instances = [];
        measured  = [];

        original = {
            measure       : Neo.main.DomAccess.measure,
            registerZone  : addon.registerZone,
            unregisterZone: addon.unregisterZone
        };

        addon.registerZone   = () => {};
        addon.unregisterZone = () => {};

        // 50dvh and 90dvh of an 844px phone window
        Neo.main.DomAccess.measure = async ({value}) => {
            measured.push(value);
            return {'50dvh': 422, '90dvh': 760}[value] ?? Number.NaN
        }
    });

    test.afterEach(() => {
        instances.forEach(instance => !instance.isDestroyed && instance.destroy());

        addon.registerZone         = original.registerZone;
        addon.unregisterZone       = original.unregisterZone;
        Neo.main.DomAccess.measure = original.measure
    });

    /**
     * @param {Object} [config]
     * @returns {Neo.sheet.Base}
     */
    function createSheet(config) {
        let instance = Neo.create(Sheet, {appName, ...config});
        instances.push(instance);
        return instance
    }

    test('paints at its snap point from the first render, bounded by the first and the last point', () => {
        let sheet = createSheet({snapIndex: 1});

        expect(sheet.cls).toContain('neo-sheet');
        expect(sheet.style).toMatchObject({height: '50dvh', maxHeight: '90dvh', minHeight: '96px'})
    });

    test('holds a header with the handle and the button before a body with the items, which take no layout', () => {
        let sheet          = createSheet({items: [{module: Component, reference: 'content'}]}),
            [header, body] = sheet.items;

        expect(header.cls).toContain('neo-sheet-header');
        expect(header.layout).toBeNull();
        expect(sheet.handle).toBe(header.items[0]);
        expect(sheet.handle).toBeInstanceOf(Handle);
        expect(sheet.handle.target).toBe(sheet);
        expect(sheet.toggleButton).toBe(header.items[1]);
        expect(sheet.toggleButton.cls).toContain('neo-sheet-toggle');

        expect(body.cls).toContain('neo-sheet-body');
        expect(body.layout).toBeNull();
        expect(body.items[0].reference).toBe('content')
    });

    test('clamps snapIndex to the points, and refuses a percentage', () => {
        let sheet   = createSheet(),
            errors  = [],
            {error} = console;

        sheet.snapIndex = 7;
        expect(sheet.snapIndex).toBe(2);
        sheet.snapIndex = -3;
        expect(sheet.snapIndex).toBe(0);
        sheet.snapIndex = 1.4;
        expect(sheet.snapIndex).toBe(1);

        console.error = (...args) => errors.push(args);

        try {
            sheet.snapPoints = [96, '50%']
        } finally {
            console.error = error
        }

        expect(errors).toHaveLength(1);
        expect(sheet.snapPoints).toEqual([96, '50dvh', '90dvh']);

        sheet.snapIndex  = 2;
        sheet.snapPoints = [80, '20rem'];

        expect(sheet.snapIndex, 'the index follows the shorter points').toBe(1);
        expect(sheet.style).toMatchObject({height: '20rem', maxHeight: '20rem', minHeight: '80px'})
    });

    test('the handle keys and the button reach every point, and the handle and the button follow', () => {
        let sheet                  = createSheet(),
            {handle, toggleButton} = sheet,
            changes                = [];

        sheet.on('snapIndexChange', ({oldValue, value}) => changes.push([oldValue, value]));

        expect(handle.valueMax).toBe(2);
        expect(handle.valueNow).toBe(0);
        expect(toggleButton.ariaLabel).toBe('Expand sheet');

        handle.onArrowUp();
        expect(sheet.snapIndex).toBe(1);

        handle.onEnd();
        expect(sheet.snapIndex).toBe(2);
        expect(handle.valueNow).toBe(2);
        expect(toggleButton.ariaLabel).toBe('Collapse sheet');
        expect(toggleButton.iconCls).toContain('fa-chevron-down');

        handle.onArrowUp();
        expect(sheet.snapIndex, 'clamped at the top').toBe(2);

        handle.onHome();
        expect(sheet.snapIndex).toBe(0);

        // The button's string handler binds to the sheet when it fires
        toggleButton.bindCallback(toggleButton.handler, 'handler', toggleButton.handlerScope);

        toggleButton.handler();
        expect(sheet.snapIndex).toBe(1);
        toggleButton.handler();
        expect(sheet.snapIndex).toBe(2);
        toggleButton.handler();
        expect(sheet.snapIndex, 'from the top back to the first point').toBe(0);

        expect(changes).toEqual([[0, 1], [1, 2], [2, 0], [0, 1], [1, 2], [2, 0]])
    });

    test('settles a release: Main restores an unchanged point, and App moves to a changed one', async () => {
        let sheet    = createSheet({snapIndex: 1}),
            {handle} = sheet,
            settles  = [];

        handle.settle = restore => settles.push(restore);

        sheet.onHandleDragStart();
        await sheet.onHandleRelease({height: 380, velocity: 0});

        expect(settles).toEqual([true]);
        expect(sheet.snapIndex).toBe(1);

        sheet.onHandleDragStart();
        await sheet.onHandleRelease({height: 380, velocity: -0.9});

        expect(settles).toEqual([true, false]);
        expect(sheet.snapIndex).toBe(0);
        expect(sheet.style.height).toBe('96px');

        expect(measured, 'a px point is never measured').toEqual(['50dvh', '90dvh', '50dvh', '90dvh'])
    });

    test('a release without a measurable height keeps the point and has Main restore it', async () => {
        let sheet    = createSheet({snapIndex: 1}),
            {handle} = sheet,
            settles  = [];

        handle.settle = restore => settles.push(restore);

        await sheet.onHandleRelease({height: Number.NaN, velocity: 2});

        expect(settles).toEqual([true]);
        expect(sheet.snapIndex).toBe(1)
    });

    test('a name makes the sheet a region landmark', () => {
        let sheet = createSheet({ariaLabel: 'Places nearby'});

        expect(sheet.vdom).toMatchObject({'aria-label': 'Places nearby', role: 'region'});

        sheet.ariaLabel = null;

        expect(sheet.vdom.role).toBeUndefined();
        expect(sheet.vdom['aria-label']).toBeUndefined()
    })
});
