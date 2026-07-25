import {setup} from '../../../setup.mjs';

const appName = 'SortZoneTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import VdomHelper      from '../../../../../src/vdom/Helper.mjs';
import Container       from '../../../../../src/container/Base.mjs';
import SortZone        from '../../../../../src/draggable/container/SortZone.mjs';

/**
 * @summary Tests for Neo.draggable.container.SortZone
 */
test.describe.serial('Neo.draggable.container.SortZone', () => {
    let container, sortZone;

    const
        realApplyDeltas = Neo.applyDeltas,
        realGetDomRect  = Container.prototype.getDomRect;

    test.beforeEach(() => {
        // Mock Neo.main.addon.DragDrop
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {
            setConfigs         : () => Promise.resolve({boundaryContainerRect: {}}),
            setDragProxyElement: () => Promise.resolve()
        };

        // Mock Neo.applyDeltas
        Neo.applyDeltas = () => Promise.resolve();

        // Mock the critical methods that usually depend on DOM interactions
        // We only want to test the logic of index calculations and moveTo calls
        Container.prototype.getDomRect = (ids) => {
            // Return a dummy rect for each requested ID (owner + items)
            return Promise.resolve(ids.map(() => ({
                x: 0, y: 0, width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100,
                clone: () => ({x: 0, y: 0, width: 100, height: 100})
            })));
        };

        // Create a Mock Container
        container = Neo.create(Container, {
            appName,
            items: [
                {id: 'btnA', ntype: 'component', cls: ['neo-draggable']}, // Sortable
                {id: 'btnB', ntype: 'component', cls: ['neo-draggable']}, // Sortable
                {id: 'sep1', ntype: 'component'},                         // Non-sortable
                {id: 'btnC', ntype: 'component'},                         // Non-sortable
                {id: 'btnD', ntype: 'component', cls: ['neo-draggable']}  // Sortable
            ],
            dragResortable: true,
            sortZoneConfig: {
                module: SortZone, // Pass module directly
                // We use a selector to identify sortable items, mimicking the real usage
                dragHandleSelector: '.neo-draggable',
                timeout: () => Promise.resolve()
            }
        });

        // Get the automatically created sortZone
        // Since it's async, we might need to wait or access it differently if it's not ready immediately.
        // But for unit tests running in Node/Playwright, promises resolve on next tick usually.
        // We will wait for a tick.
    });

    test.afterEach(() => {
        sortZone?.destroy();
        container?.destroy();

        // The prototype patch leaks exactly as far as the namespace one does: Playwright reuses the
        // worker, so a later spec's real getDomRect would stay replaced by this file's dummy rects.
        Neo.applyDeltas               = realApplyDeltas;
        Container.prototype.getDomRect = realGetDomRect;
    });

    test('Initializes correctly with mixed content', async () => {
        // Wait for sortZone to be created (async import/create)
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;
        expect(sortZone).toBeDefined();

        // Simulate drag start to populate internal state
        const data = {
            path: [{id: 'btnA', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        };

        await sortZone.onDragStart(data);

        // Check if sortableItems are correctly filtered
        expect(sortZone.sortableItems.length).toBe(3);
        expect(sortZone.sortableItems[0].id).toBe('btnA');
        expect(sortZone.sortableItems[1].id).toBe('btnB');
        expect(sortZone.sortableItems[2].id).toBe('btnD');
    });

    test('Correctly moves item from end to start (skipping non-sortables)', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;

        // Drag BtnD (index 4 in owner, index 2 in sortable)
        const data = {
            path: [{id: 'btnD', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        };

        await sortZone.onDragStart(data);

        expect(sortZone.startIndex).toBe(2); // Index in sortableItems
        expect(sortZone.currentIndex).toBe(2);

        // Simulate moving to index 0 (BtnA's position)
        sortZone.currentIndex = 0;

        // Trigger drag end logic (we call the logic block directly or simulate onDragEnd)
        // Since we mocked onDragEnd's super call (dragEnd), we can rely on the side effects of onDragEnd
        await sortZone.onDragEnd({});

        // owner.moveTo should have been called.
        // BtnD was at index 4. BtnA was at index 0.
        // We expect: [BtnD, BtnA, BtnB, Sep, BtnC]
        // This means index 4 moved to index 0.

        expect(container.items[0].id).toBe('btnD');
        expect(container.items[1].id).toBe('btnA');
        expect(container.items[2].id).toBe('btnB');
        expect(container.items[3].id).toBe('sep1');
        expect(container.items[4].id).toBe('btnC');
    });

    test('Correctly moves item from start to end (skipping non-sortables)', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;

        // Drag BtnA (index 0 in owner, index 0 in sortable)
        const data = {
            path: [{id: 'btnA', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        };

        await sortZone.onDragStart(data);

        expect(sortZone.startIndex).toBe(0);

        // Simulate moving to index 2 (BtnD's position)
        sortZone.currentIndex = 2;

        await sortZone.onDragEnd({});

        // BtnA was at 0. BtnD was at 4.
        // Move 0 to 4.
        // Expected: [BtnB, Sep, BtnC, BtnD, BtnA]

        expect(container.items[0].id).toBe('btnB');
        expect(container.items[1].id).toBe('sep1');
        expect(container.items[2].id).toBe('btnC');
        expect(container.items[3].id).toBe('btnD');
        expect(container.items[4].id).toBe('btnA');
    });

    test('drag:cancel restores the captured index and commits no reorder', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;

        await sortZone.onDragStart({
            path: [{id: 'btnA', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        });

        sortZone.currentIndex = 2;

        await sortZone.onDragCancel({key: 'Escape'});

        expect(container.items.map(item => item.id)).toEqual(['btnA', 'btnB', 'sep1', 'btnC', 'btnD']);
        expect(sortZone.currentIndex).toBe(-1);
        expect(sortZone.dragProxy).toBeNull()
    });

     test('Correctly handles placeholder in index calculation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;

        // Drag BtnB (index 1 in owner, index 1 in sortable)
        const data = {
            path: [{id: 'btnB', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        };

        // Inject a fake placeholder to simulate the dragProxy creation side-effect
        sortZone.dragPlaceholder = {id: 'placeholder', vdom: {}, destroy: () => {}};

        await sortZone.onDragStart(data);

        // In a real scenario, the sortableItems array would now contain the placeholder at index 1
        // We manually simulate this since we mocked createDragProxy/dragStart
        sortZone.sortableItems[1] = sortZone.dragPlaceholder;

        // Move to index 2 (BtnD's position)
        sortZone.currentIndex = 2;

        await sortZone.onDragEnd({});

        // BtnB was at 1. BtnD was at 4.
        // Move 1 to 4.
        // Expected: [BtnA, Sep, BtnC, BtnD, BtnB]

        expect(container.items[0].id).toBe('btnA');
        expect(container.items[1].id).toBe('sep1');
        expect(container.items[2].id).toBe('btnC');
        expect(container.items[3].id).toBe('btnD');
        expect(container.items[4].id).toBe('btnB');
    });

    test('Treats non-reversed vertical layouts as forward sort direction', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;
        container.layout.direction = 'column';

        await sortZone.onDragStart({
            path: [{id: 'btnA', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        });

        expect(sortZone.sortDirection).toBe('vertical');
        expect(sortZone.reversedLayoutDirection).toBe(false);
        expect(sortZone.currentIndex).toBe(0)
    });

    test('Keeps explicit column-reverse layouts on the reverse sort path', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sortZone = container.sortZone;
        container.layout.direction = 'column-reverse';

        await sortZone.onDragStart({
            path: [{id: 'btnA', cls: ['neo-draggable'], rect: {left: 0, top: 0, width: 100, height: 100}}]
        });

        expect(sortZone.sortDirection).toBe('vertical');
        expect(sortZone.reversedLayoutDirection).toBe(true);
        expect(sortZone.currentIndex).toBe(0)
    });

    test('Drag-trace ring buffer records events, caps per-drag size and trims old drags (#12886)', () => {
        const zone = Object.create(SortZone.prototype);

        SortZone.traces.length = 0;
        SortZone.activeTrace   = null;

        // No active trace -> events are dropped silently
        zone.traceEvent({t: 'move', x: 1});
        expect(SortZone.traces.length).toBe(0);

        // Active trace -> events accumulate with timestamps
        SortZone.activeTrace = {events: [], startedAt: Date.now(), zoneId: 'zone-1'};
        SortZone.traces.push(SortZone.activeTrace);

        zone.traceEvent({t: 'move', x: 100, i: 0});
        zone.traceEvent({t: 'switch', i1: 0, i2: 1});

        expect(SortZone.activeTrace.events.length).toBe(2);
        expect(SortZone.activeTrace.events[0].t).toBe('move');
        expect(typeof SortZone.activeTrace.events[0].ts).toBe('number');

        // Duplicate deliveries count-compress onto the previous event instead of appending
        zone.traceEvent({t: 'dup', x: 100});
        zone.traceEvent({t: 'dup', x: 100});
        expect(SortZone.activeTrace.events.length).toBe(2);
        expect(SortZone.activeTrace.events[1].dup).toBe(2);

        // Per-drag event cap (400) guards unbounded growth — dropping the OLDEST event,
        // keeping the tail (a drag's drop resolution is its most diagnostic part)
        SortZone.activeTrace.events.length = 0;
        for (let i = 0; i < 401; i++) {
            zone.traceEvent({t: 'move', x: i});
        }
        expect(SortZone.activeTrace.events.length).toBe(400);
        expect(SortZone.activeTrace.events[399].x).toBe(400);
        expect(SortZone.activeTrace.events[0].x).toBe(1);

        // Ring trims to traceLimit
        for (let i = 0; i < SortZone.traceLimit + 3; i++) {
            SortZone.traces.push({events: [], zoneId: `zone-${i}`});

            if (SortZone.traces.length > SortZone.traceLimit) {
                SortZone.traces.shift()
            }
        }

        expect(SortZone.traces.length).toBe(SortZone.traceLimit);

        SortZone.traces.length = 0;
        SortZone.activeTrace   = null
    });
});

test.describe('checkWindowBoundary — the re-entry Schmitt trigger (the false-re-entry reap)', () => {
    // Prototype-driven: the hysteresis decision chain is the unit. Geometry helper: a 1000×1000
    // boundary + a 100×100 proxy whose x-position dials the intersection ratio exactly —
    // ratioAt(f) places the proxy so intersectionArea/proxyArea === f.
    const BOUNDARY = {x: 0, y: 0, width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000};

    const proxyAt = f => {
        const x = 1000 - 100 * f;
        return {x, y: 450, width: 100, height: 100, left: x, top: 450, right: x + 100, bottom: 550}
    };

    const zoneFor = () => {
        const fired = [], continued = [];

        const zone = {
            boundaryContainerRect: BOUNDARY,
            detachThreshold      : 0.8,
            dragComponent        : {id: 'dragged'},
            dragPlaceholder      : {wrapperStyle: {}},
            indexMap             : [],
            isWindowDragging     : false,
            itemRects            : [],
            lastIntersectionRatio: 1,
            owner                : {items: []},
            reattachArmed        : false,
            reattachThreshold    : 0.6,
            fire                 : (name, data) => fired.push(name),
            onWindowDragContinue : () => continued.push(1)
        };

        const move = f => SortZone.prototype.checkWindowBoundary.call(zone, {proxyRect: proxyAt(f)});

        return {continued, fired, move, zone}
    };

    test('the reap sequence: exit at the band edge + one inward-jitter sample fires NO re-entry (the newborn popup survives)', () => {
        const {continued, fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.85;

        move(0.79);                                     // crossing under detachThreshold, moving out
        expect(fired).toEqual(['dragBoundaryExit']);
        expect(zone.isWindowDragging).toBe(true);
        expect(zone.reattachArmed, 'slow exit inside the reattach zone starts UNarmed').toBe(false);

        move(0.795);                                    // the single post-exit jitter that used to reap
        move(0.85);                                     // even sustained inward drift without leaving
        expect(fired, 'no false dragBoundaryEntry — the pre-fix reap path').toEqual(['dragBoundaryExit']);
        expect(continued.length, 'the window drag CONTINUES instead').toBe(2)
    });

    test('genuine re-entry still works: leave below reattachThreshold, then return moving in', () => {
        const {fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.85;

        move(0.79);                                     // exit
        move(0.5);                                      // demonstrably left — arms the trigger
        expect(zone.reattachArmed).toBe(true);

        move(0.65);                                     // rising back above reattachThreshold
        expect(fired).toEqual(['dragBoundaryExit', 'dragBoundaryEntry'])
    });

    test('band wobble between the thresholds never re-enters (hysteresis discipline)', () => {
        const {continued, fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.85;

        move(0.79);
        for (const f of [0.7, 0.65, 0.75, 0.7, 0.78]) move(f);

        expect(fired).toEqual(['dragBoundaryExit']);
        expect(continued.length).toBe(5)
    });

    test('a single-move fling below reattachThreshold is PRE-armed: the direct return re-enters', () => {
        const {fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.9;

        move(0.5);                                      // one move from deep-inside to below reattach
        expect(fired).toEqual(['dragBoundaryExit']);
        expect(zone.reattachArmed, 'exit already below reattachThreshold pre-arms').toBe(true);

        move(0.65);                                     // direct return, moving in
        expect(fired).toEqual(['dragBoundaryExit', 'dragBoundaryEntry'])
    })
});

test.describe('checkWindowBoundary — arming across the proxy-identity swap (the vessel stillbirth)', () => {
    // The move stream swaps proxy IDENTITY mid-window-drag: the in-window DOM proxy until the
    // vessel grant lands, the future vessel's dimensions afterwards. Arming earned in the small
    // proxy's scale must NOT discharge in the vessel's scale — the ratio jump at the swap sample
    // is a geometry artifact, not movement. Same 1000×1000 boundary; smallAt(f) is the 100×100
    // pre-grant proxy, vesselAt(f) the 320×240 post-grant proxy — each placed so
    // intersectionArea/proxyArea === f.
    const BOUNDARY = {x: 0, y: 0, width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000};

    const smallAt = f => {
        const x = 1000 - 100 * f;
        return {x, y: 450, width: 100, height: 100, left: x, top: 450, right: x + 100, bottom: 550}
    };

    const vesselAt = f => {
        const x = 1000 - 320 * f;
        return {x, y: 300, width: 320, height: 240, left: x, top: 300, right: x + 320, bottom: 540}
    };

    const zoneFor = () => {
        const fired = [], continued = [];

        const zone = {
            boundaryContainerRect: BOUNDARY,
            detachThreshold      : 0.8,
            dragComponent        : {id: 'dragged'},
            dragPlaceholder      : {wrapperStyle: {}},
            indexMap             : [],
            isWindowDragging     : false,
            itemRects            : [],
            lastIntersectionRatio: 1,
            owner                : {items: []},
            reattachArmed        : false,
            reattachThreshold    : 0.6,
            fire                 : name => fired.push(name),
            onWindowDragContinue : () => continued.push(1)
        };

        const move = rect => SortZone.prototype.checkWindowBoundary.call(zone, {proxyRect: rect});

        return {continued, fired, move, zone}
    };

    test('the stillbirth sequence: arming earned pre-swap must NOT discharge on the swap sample', () => {
        const {continued, fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.85;

        move(smallAt(0.79));                            // exit — window-drag begins, dims seeded
        move(smallAt(0.5));                             // demonstrably left — arms in the SMALL scale
        expect(zone.reattachArmed).toBe(true);

        move(vesselAt(0.95));                           // the grant lands: vessel dims, ratio jumps
        expect(fired, 'the swap sample must not fire an entry — the vessel has not connected yet')
            .toEqual(['dragBoundaryExit']);
        expect(zone.reattachArmed, 'arming is re-earned in the NEW scale').toBe(false);
        expect(zone.lastProxyDims).toEqual({height: 240, width: 320});

        move(vesselAt(0.9));                            // still high in the new scale, disarmed
        expect(fired, 'no entry until re-entry is earned post-swap').toEqual(['dragBoundaryExit'])
    });

    test('genuine post-swap return still re-enters exactly once', () => {
        const {fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.85;

        move(smallAt(0.79));
        move(smallAt(0.5));                             // armed in the small scale
        move(vesselAt(0.95));                           // swap — reseed + disarm
        move(vesselAt(0.4));                            // leaves below reattachThreshold — re-earns
        expect(zone.reattachArmed).toBe(true);

        move(vesselAt(0.65));                           // rising back across the threshold
        expect(fired).toEqual(['dragBoundaryExit', 'dragBoundaryEntry'])
    });

    test('a swap landing already below reattachThreshold re-arms immediately and skips the continue hook', () => {
        const {continued, fired, move, zone} = zoneFor();

        zone.lastIntersectionRatio = 0.85;

        move(smallAt(0.79));
        move(smallAt(0.3));                             // armed, one continue sample
        expect(continued.length).toBe(1);

        move(vesselAt(0.2));                            // swap sample far outside — reseed, stays armed
        expect(zone.reattachArmed).toBe(true);
        expect(continued.length, 'the swap sample is a reseed, not a movement — no continue call').toBe(1);
        expect(fired).toEqual(['dragBoundaryExit']);

        move(vesselAt(0.65));                           // genuine return in the vessel scale
        expect(fired).toEqual(['dragBoundaryExit', 'dragBoundaryEntry'])
    })
});
