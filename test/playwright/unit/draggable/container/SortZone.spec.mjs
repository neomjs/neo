import {setup} from '../../../setup.mjs';

const appName = 'SortZoneTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import SortZone        from '../../../../../src/draggable/container/SortZone.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import Container       from '../../../../../src/container/Base.mjs';

/**
 * @summary Tests for Neo.draggable.container.SortZone
 */
test.describe.serial('Neo.draggable.container.SortZone', () => {
    let container, sortZone;

    test.beforeEach(() => {
        // Mock Neo.main.addon.DragDrop
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {
            setConfigs: () => Promise.resolve({boundaryContainerRect: {}})
        };

        // Mock Neo.applyDeltas
        Neo.applyDeltas = () => Promise.resolve();

        // Create a Mock Container
        container = Neo.create(Container, {
            items: [
                {id: 'btnA', ntype: 'component', cls: ['neo-draggable']}, // Sortable
                {id: 'btnB', ntype: 'component', cls: ['neo-draggable']}, // Sortable
                {id: 'sep1', ntype: 'component'},                         // Non-sortable
                {id: 'btnC', ntype: 'component'},                         // Non-sortable
                {id: 'btnD', ntype: 'component', cls: ['neo-draggable']}  // Sortable
            ],
            sortable: true
        });

        // Create the SortZone attached to the container
        sortZone = Neo.create(SortZone, {
            owner: container,
            // We use a selector to identify sortable items, mimicking the real usage
            dragHandleSelector: '.neo-draggable'
        });

        // Mock the critical methods that usually depend on DOM interactions
        // We only want to test the logic of index calculations and moveTo calls
        container.getDomRect = (ids) => {
            // Return a dummy rect for each requested ID (owner + items)
            return Promise.resolve(ids.map(() => ({
                x: 0, y: 0, width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100,
                clone: () => ({x: 0, y: 0, width: 100, height: 100})
            })));
        };
        sortZone.timeout = () => Promise.resolve();
        sortZone.dragStart = () => Promise.resolve();
        sortZone.dragEnd = () => Promise.resolve();
    });

    test.afterEach(() => {
        sortZone?.destroy();
        container?.destroy();
    });

    test('Initializes correctly with mixed content', async () => {
        // Simulate drag start to populate internal state
        const data = {
            path: [{id: 'btnA', cls: ['neo-draggable']}]
        };

        await sortZone.onDragStart(data);

        // Check if sortableItems are correctly filtered
        expect(sortZone.sortableItems.length).toBe(3);
        expect(sortZone.sortableItems[0].id).toBe('btnA');
        expect(sortZone.sortableItems[1].id).toBe('btnB');
        expect(sortZone.sortableItems[2].id).toBe('btnD');
    });

    test('Correctly moves item from end to start (skipping non-sortables)', async () => {
        // Drag BtnD (index 4 in owner, index 2 in sortable)
        const data = {
            path: [{id: 'btnD', cls: ['neo-draggable']}]
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
        // Drag BtnA (index 0 in owner, index 0 in sortable)
        const data = {
            path: [{id: 'btnA', cls: ['neo-draggable']}]
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
        // Drag BtnB (index 1 in owner, index 1 in sortable)
        const data = {
            path: [{id: 'btnB', cls: ['neo-draggable']}]
        };

        // Inject a fake placeholder to simulate the dragProxy creation side-effect
        sortZone.dragPlaceholder = {id: 'placeholder', vdom: {}};

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
});
