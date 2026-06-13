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
    let DashboardContainer, DashboardSortZone, Rectangle, realDragCoordinatorOnDragEnd, sortZone;

    test.beforeAll(async () => {
        const containerModule = await import('../../../../../src/dashboard/Container.mjs');
        DashboardContainer = containerModule.default;

        const sortZoneModule = await import('../../../../../src/draggable/dashboard/SortZone.mjs');
        DashboardSortZone = sortZoneModule.default;

        const rectModule = await import('../../../../../src/util/Rectangle.mjs');
        Rectangle = rectModule.default;

        realDragCoordinatorOnDragEnd = Object.getPrototypeOf(Neo.manager.DragCoordinator).onDragEnd;
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

    test('keeps a terminal popup drop detached instead of running remote-drop cleanup (#13025)', async () => {
        const
            appliedDeltas   = [],
            terminalDrops   = [],
            DragCoordinator = Neo.manager.DragCoordinator,
            item            = {
                id          : 'item1',
                reference   : 'item1',
                vdom        : {cls: ['neo-draggable']},
                wrapperStyle: {}
            },
            placeholder     = {
                id          : 'placeholder',
                vdom        : {cls: []},
                wrapperStyle: {},
                destroy     : () => {}
            },
            detachedItems   = new Map([['item1', {
                index   : 0,
                widget  : item,
                windowId: 'popup-item1'
            }]]),
            mockOwner       = {
                id                      : 'mockOwner',
                cls                     : [],
                detachedItems,
                dragResortable          : true,
                items                   : [item, placeholder],
                style                   : {},
                vdom                    : {},
                addDomListeners         : () => {},
                getDomRect              : () => Promise.resolve([{x:0, y:0, width:200, height:100}]),
                getVdomItemsRoot        : () => ({id: 'mockOwner-items'}),
                on                      : () => {},
                onWindowDragTerminalDrop: data => terminalDrops.push(data)
            };

        Neo.applyDeltas = (windowId, deltas) => {
            appliedDeltas.push(...deltas);
            return Promise.resolve()
        };

        DragCoordinator.activeTargetZone = null;
        DragCoordinator.onDragEnd = data => realDragCoordinatorOnDragEnd.call(DragCoordinator, data);

        sortZone = Neo.create(DashboardSortZone, {
            owner  : mockOwner,
            timeout: () => Promise.resolve()
        });

        Object.assign(sortZone, {
            currentIndex    : 1,
            dragComponent   : item,
            dragPlaceholder : placeholder,
            dragProxy       : {id: 'proxy', cls: [], destroy: () => {}},
            isWindowDragging: true,
            itemRects       : [
                {height: 100, left: 0, top: 0, width: 100},
                {height: 100, left: 100, top: 0, width: 100}
            ],
            itemStyles: [
                {height: '100px', width: '100px'},
                {height: '100px', width: '100px'}
            ],
            ownerStyle   : {},
            sortableItems: [item, placeholder],
            startIndex   : 0,
            windowId     : 1
        });

        await sortZone.processDragEnd({type: 'drag:end'});

        expect(terminalDrops).toHaveLength(1);
        expect(terminalDrops[0].draggedItem).toBe(item);
        expect(terminalDrops[0].sortZone).toBe(sortZone);
        expect(detachedItems.has('item1')).toBe(true);
        expect(appliedDeltas.some(delta => delta.action === 'moveNode' && delta.id === item.id)).toBe(false);
        expect(appliedDeltas.some(delta => delta.action === 'removeNode' && delta.id === placeholder.id)).toBe(true);
        expect(sortZone.isWindowDragging).toBe(false)
    });

    test('does not classify an ordinary source-window drag end as a terminal popup drop (#13025)', () => {
        const
            DragCoordinator = Neo.manager.DragCoordinator,
            sourceSortZone  = {
                isWindowDragging    : false,
                onTerminalWindowDrop: () => {
                    throw new Error('ordinary drag-end should not terminal-drop')
                }
            };

        DragCoordinator.activeTargetZone = null;

        realDragCoordinatorOnDragEnd.call(DragCoordinator, {
            draggedItem: {id: 'item1'},
            sourceSortZone
        })
    });

    test('marks dashboard detached items as terminal popup drops (#13025)', () => {
        const
            item          = {id: 'item1', reference: 'item1'},
            detachedItem  = {index: 0, widget: item, windowId: 'popup-item1'},
            detachedItems = new Map([['item1', detachedItem]]),
            events        = [],
            container     = Object.create(DashboardContainer.prototype);

        Object.assign(container, {
            detachedItems,
            fire: (event, data) => events.push({data, event})
        });

        container.onWindowDragTerminalDrop({
            draggedItem: item,
            sortZone   : {id: 'source-zone'}
        });

        expect(detachedItems.get('item1')).toBe(detachedItem);
        expect(detachedItem.terminalDrop).toBe(true);
        expect(events).toHaveLength(1);
        expect(events[0].event).toBe('windowDragTerminalDrop');
        expect(events[0].data.detachedItem).toBe(detachedItem)
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
