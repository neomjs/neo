import {setup} from '../../../setup.mjs';

const appName = 'DashboardSortZoneTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';

/**
 * @summary Tests for Neo.draggable.dashboard.SortZone directional thresholds
 */
test.describe.serial('Neo.draggable.dashboard.SortZone Directional Logic', () => {
    let DashboardSortZone, Rectangle, sortZone;

    test.beforeAll(async () => {
        Neo.currentWorker = {
            on         : () => {},
            sendMessage: () => {},
            isSharedWorker: false
        };

        const sortZoneModule = await import('../../../../../src/draggable/dashboard/SortZone.mjs');
        DashboardSortZone = sortZoneModule.default;

        const rectModule = await import('../../../../../src/util/Rectangle.mjs');
        Rectangle = rectModule.default;
    });

    test.beforeEach(() => {
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {
            setConfigs         : () => Promise.resolve({boundaryContainerRect: {}}),
            setDragProxyElement: () => Promise.resolve(),
            startWindowDrag    : () => Promise.resolve()
        };

        const DragCoordinator = Neo.manager?.DragCoordinator;
        if (DragCoordinator) {
            DragCoordinator.onDragMove = () => {};
            DragCoordinator.register = () => {};
            DragCoordinator.unregister = () => {};
        }
    });

    test.afterEach(() => {
        sortZone?.destroy();
    });

    test('Validates Directional Logic with Colliding Thresholds (0.8 / 0.6)', async () => {
        const mockOwner = {
            id: 'mockOwner',
            items: [{
                id: 'item1',
                vdom: {cls: ['neo-draggable']},
                wrapperStyle: {}
            }],
            vdom: {},
            addDomListeners: () => {},
            getDomRect: () => Promise.resolve([{x:0, y:0, width:100, height:100}]),
            on: () => {}
        };

        sortZone = Neo.create(DashboardSortZone, {
            owner: mockOwner,
            detachThreshold  : 0.8,
            reattachThreshold: 0.6,
            enableProxyToPopup: true
        });

        sortZone.boundaryContainerRect = new Rectangle(0, 0, 100, 100);
        sortZone.dragProxy = { id: 'proxy', destroy: () => {} };
        sortZone.dragPlaceholder = { id: 'placeholder', wrapperStyle: {}, destroy: () => {} };

        sortZone.lastIntersectionRatio = 1;
        sortZone.isWindowDragging = false;

        const simulateMove = async (x, y) => {
            const proxyRect = new Rectangle(x, y, 100, 100);
            await sortZone.onDragMove({
                clientX: x,
                clientY: y,
                proxyRect,
                screenX: x,
                screenY: y,
                path: []
            });
        };

        sortZone.itemRects = [{left:0, top:0, width:100, height:100}];
        sortZone.indexMap = {0: 0};
        sortZone.currentIndex = 0;
        sortZone.isScrolling = false;

        sortZone.fire = (event) => {
            if (event === 'dragBoundaryExit') sortZone.isWindowDragging = true;
            if (event === 'dragBoundaryEntry') sortZone.isWindowDragging = false;
        };

        await simulateMove(10, 0);
        expect(sortZone.lastIntersectionRatio).toBe(0.9);
        expect(sortZone.isWindowDragging).toBe(false);

        await simulateMove(25, 0);
        expect(sortZone.lastIntersectionRatio).toBe(0.75);
        expect(sortZone.isWindowDragging).toBe(true);

        await simulateMove(30, 0);
        expect(sortZone.lastIntersectionRatio).toBeCloseTo(0.70);
        expect(sortZone.isWindowDragging).toBe(true);

        await simulateMove(25, 0);
        expect(sortZone.lastIntersectionRatio).toBe(0.75);
        expect(sortZone.isWindowDragging).toBe(false);

        await simulateMove(30, 0);
        expect(sortZone.lastIntersectionRatio).toBeCloseTo(0.70);
        expect(sortZone.isWindowDragging).toBe(true);
    });
});
