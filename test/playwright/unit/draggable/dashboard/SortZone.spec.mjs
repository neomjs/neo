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
    let DashboardContainer, DashboardSortZone, Rectangle, realApplyDeltas, realDragCoordinatorOnDragEnd,
        realDragCoordinatorOnWindowPositionChange, sortZone;

    test.beforeAll(async () => {
        const containerModule = await import('../../../../../src/dashboard/Container.mjs');
        DashboardContainer = containerModule.default;

        const sortZoneModule = await import('../../../../../src/draggable/dashboard/SortZone.mjs');
        DashboardSortZone = sortZoneModule.default;

        const rectModule = await import('../../../../../src/util/Rectangle.mjs');
        Rectangle = rectModule.default;

        realDragCoordinatorOnDragEnd = Object.getPrototypeOf(Neo.manager.DragCoordinator).onDragEnd;
        realDragCoordinatorOnWindowPositionChange = Object.getPrototypeOf(Neo.manager.DragCoordinator).onWindowPositionChange;

        // Captured once, before any test overrides it — two tests below replace `Neo.applyDeltas`
        // with closures over their own `appliedDeltas`. Playwright reuses a worker across spec
        // files, so an unrestored override runs THIS file's fixture against a later spec's
        // components — the tell is a SortZone stack frame surfacing inside an unrelated spec.
        realApplyDeltas = Neo.applyDeltas;
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
        const DragCoordinator = Neo.manager?.DragCoordinator;

        if (DragCoordinator?.nativeWindowDropCandidates) {
            for (const candidate of DragCoordinator.nativeWindowDropCandidates.values()) {
                clearTimeout(candidate.timeoutId)
            }
            DragCoordinator.nativeWindowDropCandidates.clear()
        }
        if (DragCoordinator) {
            DragCoordinator.nativeWindowDropDwellMs  = 450;
            DragCoordinator.nativeWindowDropSettleMs = 250;
            DragCoordinator.sortZones = new Map();
            DragCoordinator.activeTargetZone = null;

            // `beforeEach` stubs five methods as OWN properties on the shared singleton; only
            // `onWindowPositionChange` was ever given back. The other four outlived this file and
            // silently no-opped every later spec in the worker that touched the coordinator — a stub
            // that survives its suite is indistinguishable from the method simply not working.
            // Deleting the own property re-exposes the prototype implementation.
            delete DragCoordinator.onWindowPositionChange;
            delete DragCoordinator.onDragMove;
            delete DragCoordinator.onDragEnd;
            delete DragCoordinator.register;
            delete DragCoordinator.unregister
        }
        if (Neo.manager?.Window) {
            Neo.manager.Window.items = [];
            Neo.manager.Window.map   = new Map()
        }

        // Same principle as the DragCoordinator stubs above: an override that survives its suite
        // is indistinguishable from the method simply not working — except this one is worse,
        // because it does not no-op, it runs dead fixture state against whoever comes next.
        Neo.applyDeltas = realApplyDeltas;

        sortZone?.destroy();
    });

    test('Validates Directional Logic with Colliding Thresholds (0.8 / 0.6)', async () => {
        const mockOwner = {
            id   : 'mockOwner',
            items: [{
                id          : 'item1',
                vdom        : {cls: ['neo-draggable']},
                wrapperStyle: {}
            }],
            vdom           : {},
            addDomListeners: () => {},
            getDomRect     : () => Promise.resolve([{x:0, y:0, width:100, height:100}]),
            on             : () => {}
        };

        sortZone = Neo.create(DashboardSortZone, {
            owner             : mockOwner,
            detachThreshold   : 0.8,
            reattachThreshold : 0.6,
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
                path   : []
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

        // Band-internal return (0.70 → 0.75, never below the 0.6 reattach threshold) is window-drag
        // CONTINUATION, not re-entry: a same-band flap used to fire a false dragBoundaryEntry whose
        // handler closed the newborn popup ~2ms after birth. Re-entry is EARNED — the ratio must
        // drop below the reattach threshold before a rising sample counts (the Schmitt trigger).
        await simulateMove(25, 0);
        expect(sortZone.lastIntersectionRatio).toBe(0.75);
        expect(sortZone.isWindowDragging).toBe(true);

        // Demonstrably leave the reattach zone — arms the trigger, still window-dragging.
        await simulateMove(45, 0);
        expect(sortZone.lastIntersectionRatio).toBeCloseTo(0.55);
        expect(sortZone.isWindowDragging).toBe(true);

        // The EARNED return: rising back above the reattach threshold now re-enters.
        await simulateMove(30, 0);
        expect(sortZone.lastIntersectionRatio).toBeCloseTo(0.70);
        expect(sortZone.isWindowDragging).toBe(false);

        // And the cycle re-exits cleanly below the detach threshold, moving out.
        await simulateMove(40, 0);
        expect(sortZone.lastIntersectionRatio).toBeCloseTo(0.60);
        expect(sortZone.isWindowDragging).toBe(true);
    });

    test('re-entry stays reachable when the window-drag proxy dwarfs the boundary', async () => {
        const mockOwner = {
            id   : 'mockOwner2',
            items: [{
                id          : 'item2',
                vdom        : {cls: ['neo-draggable']},
                wrapperStyle: {}
            }],
            vdom           : {},
            addDomListeners: () => {},
            getDomRect     : () => Promise.resolve([{x:0, y:0, width:100, height:40}]),
            on             : () => {}
        };

        sortZone = Neo.create(DashboardSortZone, {
            owner             : mockOwner,
            detachThreshold   : 0.8,
            reattachThreshold : 0.6,
            enableProxyToPopup: true
        });

        // Strip-scale boundary: during window-drag the move payload's proxy embodies the future
        // vessel and is LARGER than the boundary, so a proxy-area denominator would cap the
        // ratio at boundaryArea/proxyArea (~0.2 here) and 0.6 could never be reached. The
        // re-entry test therefore normalizes by the smaller rect: full boundary cover = 1.
        sortZone.boundaryContainerRect = new Rectangle(0, 0, 314, 49);
        sortZone.dragProxy = { id: 'proxy2', destroy: () => {} };
        sortZone.dragPlaceholder = { id: 'placeholder2', wrapperStyle: {}, destroy: () => {} };

        sortZone.lastIntersectionRatio = 1;
        sortZone.isWindowDragging = false;

        const simulateMove = async (x, y, width, height) => {
            const proxyRect = new Rectangle(x, y, width, height);
            await sortZone.onDragMove({
                clientX: x,
                clientY: y,
                proxyRect,
                screenX: x,
                screenY: y,
                path   : []
            });
        };

        sortZone.itemRects = [{left:0, top:0, width:100, height:40}];
        sortZone.indexMap = {0: 0};
        sortZone.currentIndex = 0;
        sortZone.isScrolling = false;

        sortZone.fire = (event) => {
            if (event === 'dragBoundaryExit') sortZone.isWindowDragging = true;
            if (event === 'dragBoundaryEntry') sortZone.isWindowDragging = false;
        };

        // In-window phase drives an item-scale DOM proxy: leaving the strip fires the exit
        // (proxy-normalized, unchanged semantics) and pre-arms re-entry in coverage scale.
        await simulateMove(300, 60, 100, 40);
        expect(sortZone.isWindowDragging).toBe(true);
        expect(sortZone.reattachArmed).toBe(true);
        expect(sortZone.lastIntersectionRatio).toBe(0);

        // Window-drag phase: the payload proxy is now vessel-sized (320×240 > the boundary).
        // Far outside — coverage 0, still window-dragging.
        await simulateMove(400, 200, 320, 240);
        expect(sortZone.lastIntersectionRatio).toBe(0);
        expect(sortZone.isWindowDragging).toBe(true);

        // Partial return: the vessel covers ~54% of the strip — rising, but below the threshold.
        await simulateMove(100, 10, 320, 240);
        expect(sortZone.lastIntersectionRatio).toBeCloseTo(0.5424, 3);
        expect(sortZone.isWindowDragging).toBe(true);

        // Full strip cover: min-area coverage reads 1 and re-entry fires. Under a proxy-area
        // denominator this sample would read 15386/76800 ≈ 0.2 and re-entry would be unreachable.
        await simulateMove(0, 0, 320, 240);
        expect(sortZone.lastIntersectionRatio).toBe(1);
        expect(sortZone.isWindowDragging).toBe(false);
    });

    test('re-entry fires on placeholder-less zones instead of dying in the layout restore', async () => {
        const mockOwner = {
            id   : 'mockOwner3',
            items: [{
                id          : 'item3',
                vdom        : {cls: ['neo-draggable']},
                wrapperStyle: {}
            }],
            vdom           : {},
            addDomListeners: () => {},
            getDomRect     : () => Promise.resolve([{x:0, y:0, width:100, height:40}]),
            on             : () => {}
        };

        sortZone = Neo.create(DashboardSortZone, {
            owner             : mockOwner,
            detachThreshold   : 0.8,
            reattachThreshold : 0.6,
            enableProxyToPopup: true
        });

        sortZone.boundaryContainerRect = new Rectangle(0, 0, 314, 49);
        sortZone.dragProxy = { id: 'proxy3', destroy: () => {} };
        // Projection-owned zones (dock tab strips) never create a drag placeholder: their
        // in-window layout is owned by the committed model projection, so there is nothing to
        // restore on re-entry — the EVENT is the whole contract. The restore block must not
        // dereference the absent placeholder ahead of the fire.
        sortZone.dragPlaceholder = null;

        sortZone.lastIntersectionRatio = 1;
        sortZone.isWindowDragging = false;

        const simulateMove = async (x, y, width, height) => {
            const proxyRect = new Rectangle(x, y, width, height);
            await sortZone.onDragMove({
                clientX: x,
                clientY: y,
                proxyRect,
                screenX: x,
                screenY: y,
                path   : []
            });
        };

        sortZone.itemRects = [{left:0, top:0, width:100, height:40}];
        sortZone.indexMap = {0: 0};
        sortZone.currentIndex = 0;
        sortZone.isScrolling = false;

        let entryFired = 0;

        sortZone.fire = (event) => {
            if (event === 'dragBoundaryExit') sortZone.isWindowDragging = true;
            if (event === 'dragBoundaryEntry') {
                entryFired++;
                sortZone.isWindowDragging = false
            }
        };

        // Exit past the strip (item-scale in-window proxy), pre-armed in coverage scale.
        await simulateMove(300, 60, 100, 40);
        expect(sortZone.isWindowDragging).toBe(true);
        expect(sortZone.reattachArmed).toBe(true);

        // Window-drag walk-back to full strip cover with the vessel-sized proxy: the crossing
        // sample must FIRE the entry — with an unguarded placeholder dereference it throws
        // before the fire and this await rejects.
        await simulateMove(400, 200, 320, 240);
        await simulateMove(0, 0, 320, 240);

        expect(entryFired).toBe(1);
        expect(sortZone.isWindowDragging).toBe(false);
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

    test('exposes only terminal detached popups as native window drag sources (#13028)', () => {
        const
            item          = {id: 'item1', reference: 'item1'},
            detachedItems = new Map([
                ['item1', {index: 0, terminalDrop: true,  widget: item, windowId: 'popup-item1'}],
                ['item2', {index: 1, terminalDrop: false, widget: {id: 'item2'}, windowId: 'popup-item2'}]
            ]),
            mockOwner     = {
                detachedItems
            },
            nativeSortZone = Object.create(DashboardSortZone.prototype);

        nativeSortZone.owner = mockOwner;

        expect(nativeSortZone.getNativeWindowDrag('popup-item1')).toEqual({
            draggedItem: item,
            widgetName : 'item1'
        });
        expect(nativeSortZone.getNativeWindowDrag('popup-item2')).toBe(null);
        expect(nativeSortZone.getNativeWindowDrag('unknown')).toBe(null)
    });

    test('reintegrates terminal popup after native titlebar dwell/settle (#13028)', async () => {
        const
            DragCoordinator = Neo.manager.DragCoordinator,
            WindowManager   = Neo.manager.Window,
            item            = {id: 'item1', reference: 'item1'},
            calls           = [],
            sourceSortZone  = {
                getNativeWindowDrag: windowId => windowId === 'popup-item1' ? {
                    draggedItem: item,
                    widgetName : 'item1'
                } : null,
                onRemoteDropOut  : draggedItem => calls.push({draggedItem, type: 'dropOut'}),
                sortGroup        : 'dashboards',
                suspendWindowDrag: widgetName => {
                    calls.push({type: 'suspend', widgetName});
                    return Promise.resolve()
                },
                windowId: 'source-window'
            },
            targetSortZone  = {
                acceptsRemoteDrag: (x, y) => x >= 0 && y >= 0 && x <= 300 && y <= 300,
                onRemoteDragMove : data => {
                    calls.push({data, type: 'move'});
                    return Promise.resolve()
                },
                // Resolves to a real operation because this stub stands in for a target that COMMITS —
                // `CrossWindowDragTarget.onRemoteDrop` returns the committed operation, or null when it
                // declines, and source retirement is gated on that answer. Resolving to `undefined`
                // described a target that took the item without saying so, which no real target does.
                onRemoteDrop: draggedItem => {
                    calls.push({draggedItem, type: 'drop'});
                    return Promise.resolve({type: 'transferItem'})
                },
                sortGroup: 'dashboards',
                windowId : 'target-window'
            };

        Object.assign(DragCoordinator, {
            nativeWindowDropDwellMs : 0,
            nativeWindowDropSettleMs: 0,
            onWindowPositionChange  : data => realDragCoordinatorOnWindowPositionChange.call(DragCoordinator, data),
            sortZones               : new Map([['dashboards', new Map([
                ['source-window', sourceSortZone],
                ['target-window', targetSortZone]
            ])]])
        });

        WindowManager.items = [
            {
                id       : 'popup-item1',
                innerRect: new Rectangle(150, 150, 100, 80),
                outerRect: new Rectangle(150, 130, 100, 100)
            },
            {
                id       : 'target-window',
                innerRect: new Rectangle(100, 100, 300, 300),
                outerRect: new Rectangle(100, 100, 300, 300)
            },
            {
                id       : 'source-window',
                innerRect: new Rectangle(600, 100, 300, 300),
                outerRect: new Rectangle(600, 100, 300, 300)
            }
        ];
        WindowManager.map = new Map(WindowManager.items.map(item => [item.id, item]));

        DragCoordinator.onWindowPositionChange({windowId: 'popup-item1'});

        await new Promise(resolve => setTimeout(resolve, 20));

        // The pinned native sequence: the FIRST move is the continuous hover preview, rendered on
        // the geometry event itself (per frame, before any dwell elapses); the commit then runs
        // the landed refresh — suspend, a final move so the preview is current at the drop
        // instant, drop, and outcome-gated source retirement. Dwell/settle still gate the COMMIT
        // only; they no longer gate the preview.
        expect(calls.map(call => call.type)).toEqual(['move', 'suspend', 'move', 'drop', 'dropOut']);

        const move = calls.find(call => call.type === 'move').data;

        expect(move.draggedItem).toBe(item);
        // the anchor is the popup's OUTER top-left corner (150, 130) plus the 8px inset, in the
        // target's local space — not the popup's centre
        expect(move.localX).toBe(58);
        expect(move.localY).toBe(38);
        expect(move.proxyRect.width).toBe(100);
        expect(move.proxyRect.height).toBe(80);
        expect(DragCoordinator.nativeWindowDropCandidates.size).toBe(0)
    });

    test('clears native titlebar candidate when popup leaves before settle (#13028)', async () => {
        const
            DragCoordinator = Neo.manager.DragCoordinator,
            WindowManager   = Neo.manager.Window,
            item            = {id: 'item1', reference: 'item1'},
            calls           = [],
            sourceSortZone  = {
                getNativeWindowDrag: windowId => windowId === 'popup-item1' ? {
                    draggedItem: item,
                    widgetName : 'item1'
                } : null,
                sortGroup        : 'dashboards',
                suspendWindowDrag: () => {
                    calls.push('suspend');
                    return Promise.resolve()
                },
                windowId: 'source-window'
            },
            targetSortZone  = {
                acceptsRemoteDrag: () => true,
                onRemoteDragMove : () => {
                    calls.push('move');
                    return Promise.resolve()
                },
                onRemoteDrop: () => {
                    calls.push('drop');
                    return Promise.resolve()
                },
                sortGroup: 'dashboards',
                windowId : 'target-window'
            };

        Object.assign(DragCoordinator, {
            nativeWindowDropDwellMs : 0,
            nativeWindowDropSettleMs: 50,
            onWindowPositionChange  : data => realDragCoordinatorOnWindowPositionChange.call(DragCoordinator, data),
            sortZones               : new Map([['dashboards', new Map([
                ['source-window', sourceSortZone],
                ['target-window', targetSortZone]
            ])]])
        });

        WindowManager.items = [
            {
                id       : 'popup-item1',
                innerRect: new Rectangle(150, 150, 100, 80),
                outerRect: new Rectangle(150, 130, 100, 100)
            },
            {
                id       : 'target-window',
                innerRect: new Rectangle(100, 100, 300, 300),
                outerRect: new Rectangle(100, 100, 300, 300)
            }
        ];
        WindowManager.map = new Map(WindowManager.items.map(item => [item.id, item]));

        DragCoordinator.onWindowPositionChange({windowId: 'popup-item1'});
        expect(DragCoordinator.nativeWindowDropCandidates.size).toBe(1);

        WindowManager.items[0].innerRect = new Rectangle(700, 700, 100, 80);
        WindowManager.items[0].outerRect = new Rectangle(700, 680, 100, 100);

        DragCoordinator.onWindowPositionChange({windowId: 'popup-item1'});

        await new Promise(resolve => setTimeout(resolve, 70));

        // The single 'move' is the continuous hover preview from the FIRST position event — the
        // per-frame preview renders before dwell by design. The load-bearing assertion is what
        // stays ABSENT after the popup leaves before settle: no suspend, no drop, no retirement —
        // the departure cleared the candidate, so the commit never ran.
        expect(calls).toEqual(['move']);
        expect(DragCoordinator.nativeWindowDropCandidates.size).toBe(0)
    });
});

/**
 * @summary Expanded-layout flex distribution — `flex` is app-supplied, so every CSS spelling arrives.
 *
 * The defect these arms pin is that `calculateExpandedLayout` identified flex items with a truthiness
 * test and then did arithmetic on the raw config. `'none'` is truthy, so `totalFlex += 'none'`
 * concatenated and the division produced `NaN` — written into `style.width` as `'NaNpx'` with nothing
 * thrown.
 *
 * **Finiteness is necessary and not sufficient.** A mixed numeric/string case concatenates into a
 * *finite but wrong* total, which every finiteness assertion passes. So the load-bearing check is that
 * the distributed sizes SUM to the available space — the property the distribution claims — and each
 * arm asserts the shares themselves, never merely that nothing crashed.
 */
test.describe('Neo.draggable.dashboard.SortZone expanded-layout flex distribution (#17353)', () => {
    let DashboardSortZone;

    test.beforeAll(async () => {
        DashboardSortZone = (await import('../../../../../src/draggable/dashboard/SortZone.mjs')).default
    });

    /**
     * Builds a zone whose geometry makes the arithmetic readable: `count` adjacent `slot`-sized slots
     * exactly filling the owner on the main axis.
     *
     * The owner is sized to `count * slot` **deliberately**, so every inferred offset and gap is zero
     * and `availableSpace` is precisely what the fixed items leave. That is what lets each arm assert
     * that the distributed sizes sum to the full span — with a slack owner the sum is a smaller number
     * nobody can read off the fixture, and an assertion nobody can read is one nobody can falsify.
     */
    function layoutZone({flexValues, sortDirection = 'horizontal', slot = 100, cross = 100}) {
        const
            isHorizontal = sortDirection === 'horizontal',
            count        = flexValues.length,
            span         = count * slot,
            itemRects    = Array.from({length: count}, (_, i) => ({
                x     : isHorizontal ? i * slot : 0,
                y     : isHorizontal ? 0 : i * slot,
                width : isHorizontal ? slot : cross,
                height: isHorizontal ? cross : slot
            })),
            zone = Neo.create(DashboardSortZone, {
                owner: {
                    id   : `flexOwner-${sortDirection}-${count}`,
                    items: flexValues.map((flex, i) => {
                        const item = {id: `i${i}`, vdom: {cls: ['neo-draggable']}, wrapperStyle: {}};

                        // Absent is a distinct case from `'none'`: it is the shape most items have,
                        // and it must stay on the fixed branch after the fix as it was before.
                        if (flex !== undefined) {
                            item.flex = flex
                        }

                        return item
                    }),
                    vdom           : {},
                    addDomListeners: () => {},
                    getDomRect     : () => Promise.resolve([{x: 0, y: 0, width: span, height: cross}]),
                    on             : () => {}
                }
            });

        zone.adjustItemRectsToParent = true;
        zone.indexMap                = Object.fromEntries(itemRects.map((_, i) => [i, i]));
        zone.itemRects               = itemRects;
        zone.ownerRect               = {
            x     : 0,
            y     : 0,
            width : isHorizontal ? span : cross,
            height: isHorizontal ? cross : span
        };
        zone.sortDirection = sortDirection;

        return zone
    }

    /** The main-axis size each returned style carries, as a number. */
    const mainSizes = (rects, sortDirection = 'horizontal') =>
        rects.map(({style}) => parseFloat(sortDirection === 'horizontal' ? style.width : style.height));

    test('a `flex: "none"` item produces a finite size instead of NaN geometry', () => {
        const
            zone  = layoutZone({flexValues: ['none', undefined, undefined]}),
            rects = zone.calculateExpandedLayout();

        // Every emitted number, not just the offending item's: a NaN size poisons `currentPos`, so the
        // following items' `left` values inherit it. Asserting only the item that carries the bad flex
        // would pass on a fix that de-NaNs the size and leaves the positions broken.
        for (const {item, style} of rects) {
            for (const [prop, value] of Object.entries(style)) {
                expect(Number.isFinite(parseFloat(value)), `${item.id}.${prop} = ${value}`).toBe(true)
            }
        }

        // `flex: none` is CSS for `0 0 auto`, so the item keeps its measured slot rather than growing.
        expect(mainSizes(rects)).toEqual([100, 100, 100]);

        zone.destroy()
    });

    test('a `flex: "none"` item is finite on the vertical axis too, where height is the poisoned field', () => {
        const
            zone  = layoutZone({flexValues: ['none', undefined], sortDirection: 'vertical'}),
            rects = zone.calculateExpandedLayout();

        expect(mainSizes(rects, 'vertical')).toEqual([100, 100]);
        expect(rects.every(({style}) => Number.isFinite(parseFloat(style.top)))).toBe(true);

        zone.destroy()
    });

    test('numeric flex distributes the full available space in proportion — the positive control', () => {
        const
            zone  = layoutZone({flexValues: [1, 3]}),
            rects = zone.calculateExpandedLayout(),
            sizes = mainSizes(rects);

        // No fixed items, so the whole 200px span is distributed 1:3. These are the values the
        // pre-fix code produced for purely numeric flex, unchanged — the fix must not disable the
        // flex path while removing the string hazard.
        expect(sizes).toEqual([50, 150]);
        expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(200);

        zone.destroy()
    });

    test('a numeric string mixed with a number distributes correctly — finite was never the whole property', () => {
        const
            zone  = layoutZone({flexValues: [2, '3']}),
            rects = zone.calculateExpandedLayout(),
            sizes = mainSizes(rects);

        // Pre-fix this produced FINITE garbage, not NaN: `0 + 2` is 2, then `2 + '3'` concatenates to
        // `'23'`, so the shares came out as 2/23 and 3/23 of the span — under a quarter of the
        // container, silently. A finiteness assertion passes that. The sum is what does not.
        expect(sizes).toEqual([80, 120]);
        expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(200);

        zone.destroy()
    });

    test('flex items and fixed items share one span without double-counting', () => {
        const
            zone  = layoutZone({flexValues: ['none', 1, 1]}),
            rects = zone.calculateExpandedLayout(),
            sizes = mainSizes(rects);

        // The fixed item keeps its 100px slot; the remaining 200px splits evenly.
        expect(sizes).toEqual([100, 100, 100]);
        expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(300);

        zone.destroy()
    });

    test('resolveFlexWeight reads the shorthand grow factor', () => {
        const zone = layoutZone({flexValues: [1]});

        expect(zone.resolveFlexWeight(2)).toBe(2);
        expect(zone.resolveFlexWeight('2')).toBe(2);
        expect(zone.resolveFlexWeight(0.5)).toBe(0.5);

        // Shorthands, which this codebase writes routinely. Grow is the FIRST token.
        expect(zone.resolveFlexWeight('1 1 auto')).toBe(1);
        expect(zone.resolveFlexWeight('1 1 600px')).toBe(1);
        expect(zone.resolveFlexWeight('1 1 100%')).toBe(1);
        expect(zone.resolveFlexWeight('0 1 auto')).toBe(null);   // grow 0 — the common "do not grow" shorthand
        expect(zone.resolveFlexWeight('0 0 200px')).toBe(null);

        // Keywords, expanded as CSS defines them rather than guessed at.
        expect(zone.resolveFlexWeight('none')).toBe(null);       // 0 0 auto
        expect(zone.resolveFlexWeight('initial')).toBe(null);    // 0 1 auto
        expect(zone.resolveFlexWeight('auto')).toBe(1);          // 1 1 auto

        expect(zone.resolveFlexWeight(0)).toBe(null);            // grows nothing; matches the old falsy path
        expect(zone.resolveFlexWeight('0')).toBe(null);          // the truthy spelling of the same thing
        expect(zone.resolveFlexWeight(-1)).toBe(null);
        expect(zone.resolveFlexWeight(undefined)).toBe(null);    // the routine case: no flex declared
        expect(zone.resolveFlexWeight(null)).toBe(null);
        expect(zone.resolveFlexWeight('')).toBe(null);
        expect(zone.resolveFlexWeight('   ')).toBe(null);

        zone.destroy()
    });

    test('CSS-equivalent spellings resolve alike — the leading-number scan they refute', () => {
        const zone = layoutZone({flexValues: [1]});

        // `auto` IS `1 1 auto`. A scan for the first number in the string resolves the pair to null
        // and 1 respectively, which is the defect @neo-gpt-emmy named on review.
        expect(zone.resolveFlexWeight('auto')).toBe(zone.resolveFlexWeight('1 1 auto'));
        // `none` IS `0 0 auto`.
        expect(zone.resolveFlexWeight('none')).toBe(zone.resolveFlexWeight('0 0 auto'));

        zone.destroy()
    });

    test('a weight is never invented from a value that does not carry one', () => {
        const zone = layoutZone({flexValues: [1]});

        // A lone length is a BASIS: CSS grows it by 1. A leading-number scan returns 100 — a
        // hundredfold error that is finite, plausible, and therefore invisible.
        expect(zone.resolveFlexWeight('100px')).toBe(1);
        expect(zone.resolveFlexWeight('50%')).toBe(1);

        // Garbage resolves to fixed rather than to the number it happens to start with.
        expect(zone.resolveFlexWeight('1oops')).toBe(null);
        expect(zone.resolveFlexWeight('px')).toBe(null);
        expect(zone.resolveFlexWeight('1 2 3 4')).toBe(null);

        zone.destroy()
    });

    test('a bad token anywhere invalidates the declaration, not just a bad first one', () => {
        const zone = layoutZone({flexValues: [1]});

        // @neo-gpt-emmy's round-2 RA. A browser drops the WHOLE declaration on one invalid token,
        // so each of these leaves the item not flexible. Validating only position 0 would have read
        // grow 1 off every one of them — the same invent-a-weight defect one position further along.
        expect(zone.resolveFlexWeight('1 oops')).toBe(null);      // shrink is not a number or a basis
        expect(zone.resolveFlexWeight('1 -1 auto')).toBe(null);   // a negative shrink is rejected
        expect(zone.resolveFlexWeight('-1 1 auto')).toBe(null);   // and so is a negative grow
        expect(zone.resolveFlexWeight('1 2 3')).toBe(null);       // a bare 3 is not a basis
        expect(zone.resolveFlexWeight('1 1 none')).toBe(null);    // `none` is not a basis either

        // The valid neighbours, which must survive the same validation.
        expect(zone.resolveFlexWeight('1 2 3px')).toBe(1);
        expect(zone.resolveFlexWeight('1 2')).toBe(1);            // <grow> <shrink>
        expect(zone.resolveFlexWeight('1 auto')).toBe(1);         // <grow> <basis>
        expect(zone.resolveFlexWeight('1 1 0')).toBe(1);          // unitless zero IS a valid basis
        expect(zone.resolveFlexWeight('1 0 content')).toBe(1);

        // Non-string, non-number inputs never reach Number()'s coercions.
        expect(zone.resolveFlexWeight(true)).toBe(null);
        expect(zone.resolveFlexWeight([2])).toBe(null);
        expect(zone.resolveFlexWeight({})).toBe(null);

        zone.destroy()
    })
});
