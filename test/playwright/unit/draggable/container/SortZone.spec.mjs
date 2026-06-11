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
