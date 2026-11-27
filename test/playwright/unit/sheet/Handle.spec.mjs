import {setup} from '../../setup.mjs';

const appName = 'SheetHandleTest';

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
import '../../../../src/manager/Instance.mjs';

const heights            = [120, 422, 760],
      {resolveSnapIndex} = Handle;

test.describe('Neo.sheet.Handle', () => {
    let addon, instances, original, settled;

    test.beforeEach(() => {
        addon     = Neo.main.addon.DragDrop;
        instances = [];
        settled   = [];

        original = {
            registerZone  : addon.registerZone,
            setConfigs    : addon.setConfigs,
            settleResize  : addon.settleResize,
            unregisterZone: addon.unregisterZone
        };

        Object.assign(addon, {
            registerZone  : () => {},
            setConfigs    : async () => ({boundaryContainerRect: null}),
            settleResize  : async data => {settled.push(data); return true},
            unregisterZone: () => {}
        })
    });

    test.afterEach(() => {
        instances.forEach(instance => !instance.isDestroyed && instance.destroy());
        Object.assign(addon, original)
    });

    /**
     * @param {Neo.core.Base} module
     * @param {Object} [config]
     * @returns {Neo.core.Base}
     */
    function create(module, config) {
        let instance = Neo.create(module, {appName, ...config});
        instances.push(instance);
        return instance
    }

    /**
     * Opens a drag the way the main thread's `drag:start` does: the path names the handle with its rect.
     * @param {Neo.sheet.Handle} handle
     * @returns {Promise<void>}
     */
    function startDrag(handle) {
        return handle.onDragStart({
            clientX   : 195,
            clientY   : 446,
            path      : [{id: handle.id, rect: {height: 48, left: 0, top: 422, width: 390}}],
            targetPath: []
        })
    }

    test.describe('resolveSnapIndex()', () => {
        test('a slow release settles on the nearest point', () => {
            expect(resolveSnapIndex({heights, size: 130})).toBe(0);
            expect(resolveSnapIndex({heights, size: 300})).toBe(1);
            expect(resolveSnapIndex({heights, size: 600})).toBe(2);
            expect(resolveSnapIndex({heights, size: 590, velocity: 0.49}), 'just below the threshold').toBe(1)
        });

        test('a fast release moves exactly one point in its direction, however fast', () => {
            expect(resolveSnapIndex({heights, size: 180, velocity: 0.9}), 'up from the first point').toBe(1);
            expect(resolveSnapIndex({heights, size: 482, velocity: 0.9})).toBe(2);
            expect(resolveSnapIndex({heights, size: 700, velocity: -0.9}), 'down from the last point').toBe(1);
            expect(resolveSnapIndex({heights, size: 362, velocity: -0.9})).toBe(0);
            expect(resolveSnapIndex({heights, size: 430, velocity: 5})).toBe(2)
        });

        test('a fast release on a point moves past it, and the outermost point holds one beyond it', () => {
            expect(resolveSnapIndex({heights, size: 422, velocity: 1})).toBe(2);
            expect(resolveSnapIndex({heights, size: 422, velocity: -1})).toBe(0);
            expect(resolveSnapIndex({heights, size: 760, velocity: 1})).toBe(2);
            expect(resolveSnapIndex({heights, size: 120, velocity: -1})).toBe(0)
        });

        test('flingVelocity sets the threshold', () => {
            expect(resolveSnapIndex({flingVelocity: 1,   heights, size: 482, velocity: 0.9})).toBe(1);
            expect(resolveSnapIndex({flingVelocity: 0.2, heights, size: 200, velocity: 0.3})).toBe(1)
        })
    });

    test('projects its position, its label and its target as separator ARIA', () => {
        let target = create(Component),
            handle = create(Handle, {target, valueMax: 2, valueNow: 1}),
            {vdom} = handle;

        expect(handle.cls).toContain('neo-draggable');
        expect(vdom).toMatchObject({
            'aria-controls'   : target.id,
            'aria-label'      : 'Sheet height',
            'aria-orientation': 'horizontal',
            'aria-valuemax'   : '2',
            'aria-valuemin'   : '0',
            'aria-valuenow'   : '1',
            role              : 'separator',
            tabIndex          : 0
        });

        handle.set({ariaLabel: 'Places height', valueNow: 0});

        expect(handle.vdom['aria-valuenow'], 'position 0 still renders').toBe('0');
        expect(handle.vdom['aria-label']).toBe('Places height')
    });

    test('resizes the height of its target on the main thread, and App settles the release', () => {
        let target = create(Component),
            handle = create(Handle, {target});

        expect(handle.dragZone.useProxy).toBe(false);
        expect(handle.dragZone.resizeConfig).toEqual({
            awaitWorkerSettlement: true,
            axis                 : 'height',
            parentId             : 'document.body',
            preview              : true,
            resizeNext           : true,
            targetId             : target.id
        })
    });

    test('forwards an optional preview property on initial and refreshed registration', () => {
        const registrations = [];

        addon.registerZone = data => registrations.push(data.resizeConfig);

        const target     = create(Component),
              nextTarget = create(Component),
              handle     = create(Handle, {previewProperty: '--sheet-preview-height', target});

        expect(registrations.at(-1)).toMatchObject({previewProperty: '--sheet-preview-height', targetId: target.id});

        handle.target = nextTarget;
        expect(registrations.at(-1)).toMatchObject({previewProperty: '--sheet-preview-height', targetId: nextTarget.id});

        handle.target = null;
        expect(registrations.at(-1)).toBeNull()
    });

    test('fires release with the height and velocity Main measured, and settles it once', async () => {
        let target   = create(Component),
            handle   = create(Handle, {target}),
            releases = [];

        handle.on('release', data => releases.push(data));

        handle.onDragEnd({resizeSize: 500});
        expect(releases, 'no drag, no release').toHaveLength(0);

        await startDrag(handle);

        handle.onDragEnd({resizeGeneration: 3, resizeSize: 622, resizeTargetId: target.id, resizeVelocity: 1.2});

        expect(releases).toHaveLength(1);
        expect(releases[0]).toMatchObject({component: handle, height: 622, velocity: 1.2});
        expect(handle.cls, 'the drag class is gone').not.toContain('neo-is-dragging');

        handle.settle(true);
        handle.settle(true);

        expect(settled).toHaveLength(1);
        expect(settled[0]).toMatchObject({
            dragZoneId      : handle.dragZone.id,
            resizeGeneration: 3,
            resizeTargetId  : target.id,
            restore         : true
        })
    });

    test('a cancelled drag fires cancel once and leaves nothing to settle', async () => {
        let handle  = create(Handle, {target: create(Component)}),
            cancels = 0;

        handle.on('cancel', () => cancels++);

        await startDrag(handle);

        handle.onDragCancel({});
        handle.onDragCancel({});
        handle.settle();

        expect(cancels).toBe(1);
        expect(settled).toEqual([])
    });

    test('Arrow Up and Arrow Down step, Home and End reach the first and the last position', () => {
        let handle = create(Handle, {target: create(Component)}),
            steps  = [];

        handle.on('step', ({delta, to}) => steps.push(delta ?? to));

        expect(handle.keys.keys.map(({fn, key}) => [key, fn])).toEqual([
            ['Down', 'onArrowDown'],
            ['End',  'onEnd'],
            ['Home', 'onHome'],
            ['Up',   'onArrowUp']
        ]);

        handle.onArrowUp();
        handle.onArrowDown();
        handle.onHome();
        handle.onEnd();

        expect(steps).toEqual([1, -1, 'first', 'last'])
    })
});
