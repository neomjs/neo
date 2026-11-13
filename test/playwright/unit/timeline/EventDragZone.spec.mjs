import {setup} from '../../setup.mjs';

const appName = 'EventDragZoneTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DragZone       from '../../../../src/draggable/DragZone.mjs';
import EventDragZone  from '../../../../src/timeline/draggable/EventDragZone.mjs';
import EventStore     from '../../../../src/timeline/store/Events.mjs';
import TimeAxis       from '../../../../src/timeline/TimeAxis.mjs';

test.describe('Neo.timeline.draggable.EventDragZone', () => {
    let setConfigsCalls = 0;

    test.beforeEach(() => {
        setConfigsCalls = 0;
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {
            setConfigs         : () => { setConfigsCalls++; return Promise.resolve({}) },
            setDragProxyElement: () => Promise.resolve()
        }
    });

    test('extends Neo.draggable.DragZone, runs base DragZone#dragStart, and commits one reactive record.set on drop', async () => {
        expect(core.Base.prototype.isPrototypeOf(EventDragZone.prototype)).toBe(true);
        expect(DragZone.prototype.isPrototypeOf(EventDragZone.prototype)).toBe(true);

        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 18, 0, 0, 0),
            pxPerMinute: 2, // 120px per hour
            snapMinutes: 15
        });

        const store = Neo.create(EventStore, {
            data: [{
                id        : 'ev-1',
                title     : 'Deploy Window',
                resourceId: 'res-a',
                startDate : new Date(2026, 10, 9, 9, 0, 0, 0),  // offset 120px
                endDate   : new Date(2026, 10, 9, 10, 0, 0, 0)  // offset 240px
            }, {
                id        : 'ev-2',
                title     : 'Checkup',
                resourceId: 'res-a',
                startDate : new Date(2026, 10, 9, 10, 30, 0, 0),
                endDate   : new Date(2026, 10, 9, 11, 0, 0, 0)
            }]
        });

        const record    = store.get('ev-1');
        let   recordChg = 0,
              baseStarted = 0;
        store.on('recordChange', () => { recordChg++ });

        const owner = {cls: []};
        const zone  = Neo.create(EventDragZone, {
            appName,
            axis,
            eventRecord: record,
            owner,
            store
        });

        zone.on('dragStart', () => { baseStarted++ });

        // Grab 20px inside the bar (at 140px) and drag to 380px (bar start -> 360px = 11:00) over resource 'res-b'
        await zone.dragStart({
            axisOffset: 140,
            targetPath: [{id: 'row-a', cls: ['neo-timeline-row'], resourceId: 'res-a'}]
        });

        // Witness base DragZone#dragStart executed: setConfigs handshake, 'dragStart' event, and 'neo-is-dragging' class
        expect(setConfigsCalls).toBe(1);
        expect(baseStarted).toBe(1);
        expect(owner.cls).toContain('neo-is-dragging');

        zone.dragMove({
            axisOffset: 380,
            targetPath: [{id: 'row-b', cls: ['neo-timeline-row'], resourceId: 'res-b'}]
        });

        // Record is NOT mutated during dragMove
        expect(record.startDate.getTime()).toBe(new Date(2026, 10, 9, 9, 0, 0, 0).getTime());
        expect(recordChg).toBe(0);

        zone.dragEnd({});

        expect(owner.cls).not.toContain('neo-is-dragging');

        // Committed in one reactive record.set (not setSilent) and re-sorted in store
        expect(recordChg).toBe(1);
        expect(record.startDate.getTime()).toBe(new Date(2026, 10, 9, 11, 0, 0, 0).getTime());
        expect(record.endDate.getTime()).toBe(new Date(2026, 10, 9, 12, 0, 0, 0).getTime());
        expect(record.resourceId).toBe('res-b');
        expect(store.getAt(0).id).toBe('ev-2');
        expect(store.getAt(1).id).toBe('ev-1');

        zone.destroy();
        store.destroy();
        axis.destroy();
    });

    test('a refused drop leaves the original record unchanged and emits no commit', async () => {
        const axis = Neo.create(TimeAxis, {
            start: '2026-11-09T08:00Z', end: '2026-11-09T18:00Z', pxPerMinute: 2
        });
        const store = Neo.create(EventStore, {data: [{
            id: 'event', startDate: '2026-11-09T09:00Z', endDate: '2026-11-09T10:00Z'
        }]});
        const record = store.get('event'), calls = [], commits = [];
        const zone   = Neo.create(EventDragZone, {appName, axis, store, eventRecord: record, owner: {
            cls: [],
            commitTimelineEdit(item, dates, meta) {
                calls.push({item, dates, meta});
                return false
            }
        }});

        try {
            zone.on('dropCommit', event => commits.push(event));
            await zone.dragStart({axisOffset: 120});
            zone.dragMove({axisOffset: 360});
            zone.dragEnd({});
            expect(calls).toHaveLength(1);
            expect(calls[0].item).toBe(record);
            expect(calls[0].dates.startDate.toISOString()).toBe('2026-11-09T11:00:00.000Z');
            expect(calls[0].meta.source).toBe('drag');
            expect(commits).toEqual([]);
            expect(record.startDate.toISOString()).toBe('2026-11-09T09:00:00.000Z');
            expect(zone.pendingDrop).toBeNull()
        } finally {
            zone.destroy();
            store.destroy();
            axis.destroy()
        }
    });

    test('leaves the record untouched when onDragCancel (Escape) fires after dragMove', async () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 18, 0, 0, 0),
            pxPerMinute: 2,
            snapMinutes: 15
        });

        const store = Neo.create(EventStore, {
            data: [{
                id        : 'ev-cancel',
                title     : 'Immutable on Escape',
                resourceId: 'res-a',
                startDate : new Date(2026, 10, 9, 9, 0, 0, 0),
                endDate   : new Date(2026, 10, 9, 10, 0, 0, 0)
            }]
        });

        const record = store.get('ev-cancel');
        const zone   = Neo.create(EventDragZone, {
            appName,
            axis,
            eventRecord: record,
            owner      : {cls: ['neo-is-dragging']},
            store
        });

        await zone.dragStart({axisOffset: 120});
        zone.dragMove({
            axisOffset: 360,
            targetPath: [{id: 'row-b', cls: ['neo-timeline-row'], resourceId: 'res-b'}]
        });

        expect(zone.pendingDrop).not.toBeNull();

        // Escape triggers onDragCancel -> dragEnd({cancelled: true})
        zone.onDragCancel({});

        expect(record.startDate.getTime()).toBe(new Date(2026, 10, 9, 9, 0, 0, 0).getTime());
        expect(record.endDate.getTime()).toBe(new Date(2026, 10, 9, 10, 0, 0, 0).getTime());
        expect(record.resourceId).toBe('res-a');
        expect(zone.pendingDrop).toBeNull();

        zone.destroy();
        store.destroy();
        axis.destroy();
    });

    test('resizes start and end edges with minimumDuration clamping and opposite-edge flip', async () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 18, 0, 0, 0),
            pxPerMinute: 2,
            snapMinutes: 15
        });

        const store = Neo.create(EventStore, {
            data: [{
                id        : 'ev-resize',
                title     : 'Resizable Window',
                resourceId: 'res-a',
                startDate : new Date(2026, 10, 9, 9, 0, 0, 0),  // 120px
                endDate   : new Date(2026, 10, 9, 10, 0, 0, 0)  // 240px
            }]
        });

        const record = store.get('ev-resize');
        const zone   = Neo.create(EventDragZone, {
            appName,
            axis,
            eventRecord    : record,
            minimumDuration: 30,
            owner          : {cls: ['neo-is-dragging']},
            resizeEdge     : 'end',
            store
        });

        // Resize end edge from 10:00 (240px) to 11:30 (420px)
        await zone.dragStart({axisOffset: 240});
        zone.dragMove({axisOffset: 420});
        zone.dragEnd({});

        expect(record.startDate.getTime()).toBe(new Date(2026, 10, 9, 9, 0, 0, 0).getTime());
        expect(record.endDate.getTime()).toBe(new Date(2026, 10, 9, 11, 30, 0, 0).getTime());

        // Resize start edge past end edge (flip) when enableResizingAcrossOppositeEdge is true
        zone.resizeEdge = 'start';
        await zone.dragStart({axisOffset: 120});
        zone.dragMove({axisOffset: 540}); // 12:30 (past 11:30 end)
        zone.dragEnd({});

        expect(record.startDate.getTime()).toBe(new Date(2026, 10, 9, 11, 30, 0, 0).getTime());
        expect(record.endDate.getTime()).toBe(new Date(2026, 10, 9, 12, 30, 0, 0).getTime());

        zone.destroy();
        store.destroy();
        axis.destroy();
    });

    test('preserves exact duration on moves (5-min, milestone, axis-spanning) and honors minimumDuration on axis-end start flip', async () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 18, 0, 0, 0),
            pxPerMinute: 2,
            snapMinutes: 15
        });

        const zone = Neo.create(EventDragZone, {
            appName,
            axis,
            minimumDuration: 15,
            owner          : {cls: []}
        });

        // 1. 5-min event (09:00–09:05) moved to offset 360 (11:00) keeps 5-min duration (11:00–11:05)
        zone.initialSnapshot = {
            startDate : new Date(2026, 10, 9, 9, 0, 0, 0),
            endDate   : new Date(2026, 10, 9, 9, 5, 0, 0),
            resourceId: 'res-a'
        };
        zone.resizeEdge = null;
        const moveShort = zone.datesFor(360);
        expect(moveShort.startDate.getTime()).toBe(new Date(2026, 10, 9, 11, 0, 0, 0).getTime());
        expect(moveShort.endDate.getTime()).toBe(new Date(2026, 10, 9, 11, 5, 0, 0).getTime());

        // 2. 0-min milestone (09:00–09:00) moved to offset 360 (11:00) keeps 0-min duration (11:00–11:00)
        zone.initialSnapshot = {
            startDate : new Date(2026, 10, 9, 9, 0, 0, 0),
            endDate   : new Date(2026, 10, 9, 9, 0, 0, 0),
            resourceId: 'res-a'
        };
        const moveMilestone = zone.datesFor(360);
        expect(moveMilestone.startDate.getTime()).toBe(new Date(2026, 10, 9, 11, 0, 0, 0).getTime());
        expect(moveMilestone.endDate.getTime()).toBe(new Date(2026, 10, 9, 11, 0, 0, 0).getTime());

        // 3. 720-min axis-spanning event (07:00–19:00) moved to offset 0 (08:00) keeps 720-min duration (08:00–20:00)
        zone.initialSnapshot = {
            startDate : new Date(2026, 10, 9, 7, 0, 0, 0),
            endDate   : new Date(2026, 10, 9, 19, 0, 0, 0),
            resourceId: 'res-a'
        };
        const moveSpanning = zone.datesFor(0);
        expect(moveSpanning.startDate.getTime()).toBe(new Date(2026, 10, 9, 8, 0, 0, 0).getTime());
        expect(moveSpanning.endDate.getTime()).toBe(new Date(2026, 10, 9, 20, 0, 0, 0).getTime());

        // 4. Start-edge resize past axis end (17:00–18:00 -> offset 1260) never collapses below minimumDuration (17:45–18:00)
        zone.initialSnapshot = {
            startDate : new Date(2026, 10, 9, 17, 0, 0, 0),
            endDate   : new Date(2026, 10, 9, 18, 0, 0, 0),
            resourceId: 'res-a'
        };
        zone.resizeEdge = 'start';
        const flipAtEnd = zone.datesFor(1260);
        expect(flipAtEnd.startDate.getTime()).toBe(new Date(2026, 10, 9, 17, 45, 0, 0).getTime());
        expect(flipAtEnd.endDate.getTime()).toBe(new Date(2026, 10, 9, 18, 0, 0, 0).getTime());

        zone.destroy();
        axis.destroy();
    });
});
