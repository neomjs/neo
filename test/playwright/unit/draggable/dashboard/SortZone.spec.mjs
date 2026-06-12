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
            DragCoordinator.onDragEnd = () => {};
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

    test('does not move a remote drag visitor into the target when it leaves (#8162)', async () => {
        const appliedDeltas = [];

        Neo.applyDeltas = (windowId, deltas) => {
            appliedDeltas.push(...deltas);
            return Promise.resolve()
        };

        const existingItem = {
            id          : 'target-item',
            vdom        : {cls: ['neo-draggable']},
            wrapperStyle: {}
        };
        const placeholder = {
            id          : 'placeholder',
            vdom        : {cls: []},
            wrapperStyle: {},
            destroy     : () => {}
        };
        const remoteItem = {
            id          : 'remote-item',
            wrapperStyle: {}
        };

        const mockOwner = {
            id              : 'mockOwner',
            cls             : [],
            dragResortable  : true,
            items           : [existingItem, placeholder],
            style           : {},
            vdom            : {},
            addDomListeners : () => {},
            getDomRect      : () => Promise.resolve([{x:0, y:0, width:200, height:100}]),
            getVdomItemsRoot: () => ({id: 'mockOwner-items'}),
            on              : () => {}
        };

        sortZone = Neo.create(DashboardSortZone, {
            owner  : mockOwner,
            timeout: () => Promise.resolve()
        });

        Object.assign(sortZone, {
            currentIndex    : 1,
            dragComponent   : remoteItem,
            dragPlaceholder : placeholder,
            dragProxy       : {id: 'proxy', cls: [], destroy: () => {}},
            isRemoteDragging: true,
            itemRects       : [
                {height: 100, left: 0, top: 0, width: 100},
                {height: 100, left: 100, top: 0, width: 100}
            ],
            itemStyles: [
                {height: '100px', width: '100px'},
                {height: '100px', width: '100px'}
            ],
            ownerStyle   : {},
            sortableItems: [existingItem, placeholder],
            startIndex   : 1,
            windowId     : 1
        });

        await sortZone.onRemoteDragLeave({});

        expect(appliedDeltas.some(delta => delta.action === 'moveNode' && delta.id === remoteItem.id)).toBe(false);
        expect(sortZone.isRemoteDragging).toBe(false);
        expect(sortZone.isWindowDragging).toBe(false)
    });

    test('latches dashboard drag-end coordinator notification (#12895)', async () => {
        const
            dragEndCalls    = [],
            DragCoordinator = Neo.manager.DragCoordinator,
            item            = {
                id          : 'item1',
                vdom        : {cls: ['neo-draggable']},
                wrapperStyle: {}
            },
            mockOwner       = {
                id              : 'mockOwner',
                cls             : [],
                dragResortable  : true,
                items           : [item],
                style           : {},
                vdom            : {},
                addDomListeners : () => {},
                getDomRect      : () => Promise.resolve([{x:0, y:0, width:100, height:100}]),
                getVdomItemsRoot: () => ({id: 'mockOwner-items'}),
                on              : () => {}
            };

        DragCoordinator.onDragEnd = data => dragEndCalls.push(data);

        sortZone = Neo.create(DashboardSortZone, {
            owner  : mockOwner,
            timeout: () => Promise.resolve()
        });

        Object.assign(sortZone, {
            currentIndex   : 0,
            dragComponent  : item,
            dragPlaceholder: null,
            itemRects      : [{height: 100, left: 0, top: 0, width: 100}],
            itemStyles     : [{height: '100px', width: '100px'}],
            ownerStyle     : {},
            sortableItems  : [item],
            startIndex     : 0,
            windowId       : 1
        });

        await Promise.all([
            sortZone.onDragEnd({source: 'first'}),
            sortZone.onDragEnd({source: 'second'})
        ]);

        expect(dragEndCalls).toHaveLength(1);
        expect(sortZone.dragEndActive).toBe(false)
    });
});
