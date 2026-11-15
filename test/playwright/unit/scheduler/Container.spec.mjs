import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Store                  from '../../../../src/data/Store.mjs';
import EventStore             from '../../../../src/timeline/store/Events.mjs';
import SchedulerContainer     from '../../../../src/scheduler/Container.mjs';
import SchedulerEventDragZone from '../../../../src/scheduler/EventDragZone.mjs';
import EventDragZone          from '../../../../src/timeline/draggable/EventDragZone.mjs';
import TimeAxis               from '../../../../src/timeline/TimeAxis.mjs';
import TimeAxisHeader         from '../../../../src/timeline/TimeAxisHeader.mjs';
import TimelineColumn         from '../../../../src/timeline/Column.mjs';

const appName = 'SchedulerContainerUnitTest';
setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

test.describe('Neo.scheduler.Container', () => {
    test('translates snapped proxy geometry to the visible track and pointer', () => {
        const axis = Neo.create(TimeAxis, {start: '2026-11-09T00:00Z', end: '2026-11-10T00:00Z', pxPerMinute: 1});
        const zone = Neo.create(SchedulerEventDragZone, {axis, trackOrigin: -100, offsetY: 12});
        try {
            expect(zone.getDragProxyStyle({startDate: new Date('2026-11-09T04:00Z'), endDate: new Date('2026-11-09T07:00Z')}, {clientY: 250}))
                .toEqual({left: '140px', top: '238px', width: '180px'});
            expect(zone.getDragProxyStyle({startDate: new Date('2026-11-09T04:00Z'), endDate: new Date('2026-11-09T08:00Z')}, {clientY: 250}).width)
                .toBe('240px')
        } finally { zone.destroy(); axis.destroy() }
    });
    let scheduler;
    const getRowTrackBars = (grid, rowIndex = 0) => {
        const row = grid.body.items?.[rowIndex];
        return row?.vdom?.cn?.[0]?.cn?.[0]?.cn?.[0]?.cn || []
    };
    test.beforeEach(() => {
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {setConfigs: () => Promise.resolve({}), setDragProxyElement: () => Promise.resolve()};
        for (const name of ['selectNode', 'syncModalMask', 'trapFocus']) {
            if (!Neo.main.DomAccess[name]) Neo.main.DomAccess[name] = () => {}
        }
    });
    test.afterEach(() => { scheduler?.destroy(); scheduler = null });

    test('failed and cancelled starts leave no preview or edit and the next gesture works', async () => {
        const resources = Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id', type: 'String'}]}, data: [{id: 'r'}]});
        const events    = Neo.create(EventStore, {data: [{id: 'e', resourceId: 'r', title: 'Booking',
            startDate: '2026-11-09T01:00Z', endDate: '2026-11-09T02:00Z'}]});
        scheduler = Neo.create(SchedulerContainer, {appName, store: resources, eventStore: events,
            timeAxis: {start: '2026-11-09T00:00Z', end: '2026-11-09T12:00Z', pxPerMinute: 1, snapMinutes: 15}});
        const zone        = scheduler.eventDragZone, record = events.get('e');
        const bar         = {id: 'failed-start-bar', cls: ['neo-timeline-bar'], data: {eventId: 'e'}, rect: {left: 0, top: 0, x: 0, y: 0, width: 60, height: 24}};
        const input       = {axisOffset: 60, clientX: 60, clientY: 10, path: [bar]};
        const createProxy = zone.createDragProxy.bind(zone);
        let   ends        = 0, writes = 0, allocated;
        const fire        = zone.fire.bind(zone), move = scheduler.moveEvent.bind(scheduler);
        zone.fire = (name, ...args) => { if (name === 'dragEnd') ends++; return fire(name, ...args) };
        scheduler.moveEvent = (...args) => { writes++; return move(...args) };
        zone.createDragProxy = async rect => {
            allocated = await createProxy(rect);
            throw new Error('proxy setup failed')
        };
        try {
            await expect(scheduler.onBarDragStart(input)).rejects.toThrow('proxy setup failed');
            expect(allocated).toBeTruthy();
            expect(zone.dragProxy).toBeNull();
            expect(scheduler.cls).not.toContain('neo-is-dragging');
            expect(zone.initialSnapshot).toBeNull();
            expect(ends).toBe(0);
            expect(writes).toBe(0);

            zone.createDragProxy = createProxy;
            for (const terminal of ['cancel', 'end']) {
                let resolve;
                Neo.main.addon.DragDrop.setConfigs = () => new Promise(done => { resolve = done });
                const starting = scheduler.onBarDragStart(input);
                expect(zone.isDragStarting).toBe(true);
                if (terminal === 'cancel') scheduler.onSchedulerKeyDown({key: 'Escape'});
                else zone.onDragEnd({});
                resolve({});
                await starting;
                expect(zone.initialSnapshot).toBeNull();
                expect(zone.dragProxy).toBeNull();
                expect(scheduler.cls).not.toContain('neo-is-dragging');
                expect(ends).toBe(0);
                expect(writes).toBe(0)
            }
            Neo.main.addon.DragDrop.setConfigs = () => Promise.resolve({});
            let releaseProxy, enteredProxy;
            const entered = new Promise(resolve => { enteredProxy = resolve });
            const gate    = new Promise(resolve => { releaseProxy = resolve });
            zone.createDragProxy = async (...args) => {
                enteredProxy();
                await gate;
                return createProxy(...args)
            };
            const delayed = scheduler.onBarDragStart(input);
            await entered;
            scheduler.onSchedulerKeyDown({key: 'Escape'});
            zone.createDragProxy = createProxy;
            await scheduler.onBarDragStart(input);
            expect(zone.initialSnapshot).toBeTruthy();
            const currentProxy = zone.dragProxy;
            expect(currentProxy).toBeTruthy();
            releaseProxy();
            await delayed;
            expect(zone.dragProxy).toBe(currentProxy);
            expect(zone.initialSnapshot).toBeTruthy();
            zone.onDragMove({axisOffset: 120, clientY: 10});
            zone.onDragEnd({});
            expect(zone.dragProxy).toBeNull();
            expect(writes).toBe(1);
            expect(record.startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z')
        } finally { events.destroy(); resources.destroy() }
    });

    test('an explicit useProxy false overrides the scheduler default', () => {
        scheduler = Neo.create(SchedulerContainer, {appName, eventDragZoneConfig: {useProxy: false}});
        expect(scheduler.eventDragZone.useProxy).toBe(false)
    });

    test('a late move handshake cannot replace a newer resize gesture', async () => {
        const resources = Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id', type: 'String'}]}, data: [{id: 'r'}]});
        const events    = Neo.create(EventStore, {data: [{id: 'e', resourceId: 'r', startDate: '2026-11-09T01:00Z', endDate: '2026-11-09T02:00Z'}]});
        scheduler = Neo.create(SchedulerContainer, {appName, store: resources, eventStore: events,
            eventDragZoneConfig: {useProxy: false},
            timeAxis           : {start: '2026-11-09T00:00Z', end: '2026-11-09T12:00Z', pxPerMinute: 1, snapMinutes: 15}});
        const zone    = scheduler.eventDragZone;
        const bar     = {id: 'overlapping-start-bar', cls: ['neo-timeline-bar'], data: {eventId: 'e'}, rect: {left: 0, top: 0, x: 0, y: 0, width: 60, height: 24}};
        const handle  = {id: 'resize-end', cls: ['neo-timeline-bar-handle', 'neo-resizable', 'neo-resizable-end']};
        const pending = [];
        Neo.main.addon.DragDrop.setConfigs = () => new Promise(resolve => pending.push(resolve));
        try {
            const move   = scheduler.onBarDragStart({axisOffset: 60, path: [bar]});
            const resize = scheduler.onBarDragStart({axisOffset: 120, path: [handle, bar]});
            pending[1]({});
            await resize;
            expect(zone.resizeEdge).toBe('end');
            pending[0]({});
            await move;
            expect(zone.resizeEdge).toBe('end');
            zone.onDragMove({axisOffset: 150});
            zone.onDragEnd({});
            expect(events.get('e').startDate.toISOString()).toBe('2026-11-09T01:00:00.000Z');
            expect(events.get('e').endDate.toISOString()).toBe('2026-11-09T02:30:00.000Z')
        } finally { events.destroy(); resources.destroy() }
    });

    test('assembles locked-start resourceColumns + center Neo.timeline.Column + TimeAxisHeader and projects overlapping bars', () => {
        const
            resourceStore = Neo.create(Store, {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',    type: 'String'},
                        {name: 'name',  type: 'String'},
                        {name: 'squad', type: 'String'}
                    ]
                },
                data: [
                    {id: 'r-1', name: 'Avery 01', squad: 'Core Engine'},
                    {id: 'r-2', name: 'Blake 02', squad: 'Edge Graph'}
                ]
            }),
            eventStore = Neo.create(EventStore, {
                data: [
                    {id: 'ev-1', resourceId: 'r-1', title: 'Slot A', startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T04:00:00Z', percentDone: 50},
                    {id: 'ev-2', resourceId: 'r-1', title: 'Slot B', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T05:00:00Z', percentDone: 25},
                    {id: 'ev-3', resourceId: 'r-2', title: 'Slot C', startDate: '2026-11-09T03:00:00Z', endDate: '2026-11-09T06:00:00Z', percentDone: 100}
                ]
            });

        scheduler = Neo.create(SchedulerContainer, {
            appName,
            bufferPx       : 120,
            eventStore,
            resourceColumns: [
                {dataField: 'name',  text: 'Resource', width: 160, locked: 'start'},
                {dataField: 'squad', text: 'Squad',    width: 120, locked: 'start'}
            ],
            store   : resourceStore,
            timeAxis: {
                start      : '2026-11-09T00:00:00Z',
                end        : '2026-11-09T12:00:00Z',
                tickUnit   : 'hour',
                tickStep   : 1,
                pxPerMinute: 1,
                snapMinutes: 15
            },
            viewportWidth  : 360
        });

        expect(scheduler.lockedStartColumns.length).toBe(2);
        expect(scheduler.centerColumns.length).toBe(1);
        expect(scheduler.timelineColumn).toBeInstanceOf(TimelineColumn);
        expect(scheduler.timelineColumn.headerComponent).toBeInstanceOf(TimeAxisHeader);
        expect(scheduler.timelineColumn.width).toBe(720);

        scheduler.body.set({
            availableHeight: 200,
            containerWidth : 640
        });
        scheduler.timelineColumn.refreshMountedRows();

        const r1Bars = getRowTrackBars(scheduler, 0);
        expect(r1Bars.length).toBe(2);
        expect(r1Bars.map(b => b.data.eventId)).toEqual(['ev-1', 'ev-2']);
        expect(r1Bars[0].data.laneCount).toBe('2');
        expect(r1Bars[1].data.laneCount).toBe('2');
        expect(r1Bars[0].style.top).not.toBe(r1Bars[1].style.top);

        const r2Bars = getRowTrackBars(scheduler, 1);
        expect(r2Bars.map(b => b.data.eventId)).toEqual(['ev-3']);

        eventStore.destroy();
        resourceStore.destroy()
    });

    test('moveEvent() is the single writer: validates/clamps dates, commits one record.set + store.doSort, fires eventChange, and no-ops when unchanged', () => {
        const
            resourceStore = Neo.create(Store, {
                keyProperty: 'id',
                model      : {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
                data       : [
                    {id: 'r-1', name: 'Resource 1'},
                    {id: 'r-2', name: 'Resource 2'}
                ]
            }),
            eventStore = Neo.create(EventStore, {
                data: [
                    {id: 'ev-1', resourceId: 'r-1', title: 'Alpha', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T04:00:00Z'}
                ]
            });

        scheduler = Neo.create(SchedulerContainer, {
            appName,
            eventStore,
            minimumDuration: 30,
            store          : resourceStore,
            timeAxis       : {
                start      : '2026-11-09T00:00:00Z',
                end        : '2026-11-09T12:00:00Z',
                tickUnit   : 'hour',
                tickStep   : 1,
                pxPerMinute: 1,
                snapMinutes: 15
            }
        });

        const
            record     = eventStore.get('ev-1'),
            origSet    = record.set.bind(record),
            origDoSort = eventStore.doSort.bind(eventStore),
            changes    = [];

        let setCalls  = 0,
            sortCalls = 0;

        record.set = updates => {
            setCalls++;
            return origSet(updates)
        };
        eventStore.doSort = (...args) => {
            sortCalls++;
            return origDoSort(...args)
        };
        scheduler.on('eventChange', payload => changes.push(payload));

        // 1. No-op call with identical dates & resourceId writes nothing
        const noopResult = scheduler.moveEvent('ev-1', {
            startDate : '2026-11-09T02:00:00Z',
            endDate   : '2026-11-09T04:00:00Z',
            resourceId: 'r-1'
        });

        expect(noopResult).toBeNull();
        expect(setCalls).toBe(0);
        expect(sortCalls).toBe(0);
        expect(changes.length).toBe(0);

        // 2. Valid move + cross-resource reassignment writes once and fires eventChange
        const moved = scheduler.moveEvent('ev-1', {
            startDate : '2026-11-09T05:00:00Z',
            endDate   : '2026-11-09T07:00:00Z',
            resourceId: 'r-2'
        });

        expect(moved).not.toBeNull();
        expect(setCalls).toBe(1);
        expect(sortCalls).toBe(1);
        expect(changes.length).toBe(1);
        expect(changes[0].action).toBe('move');
        expect(changes[0].record).toBe(record);
        expect(changes[0].changes).toEqual(moved);
        expect(changes[0].updates).toBe(changes[0].changes);
        expect(changes[0].resourceId).toBe('r-2');
        expect(changes[0].startDate.toISOString()).toBe('2026-11-09T05:00:00.000Z');
        expect(changes[0].endDate.toISOString()).toBe('2026-11-09T07:00:00.000Z');
        expect(changes[0].previous).toEqual({
            endDate   : new Date('2026-11-09T04:00:00.000Z'),
            resourceId: 'r-1',
            startDate : new Date('2026-11-09T02:00:00.000Z')
        });
        expect(record.startDate.toISOString()).toBe('2026-11-09T05:00:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T07:00:00.000Z');
        expect(record.resourceId).toBe('r-2');

        // 3. Out-of-bounds move clamps within [axis.start, axis.end] and enforces minimumDuration (30m)
        scheduler.moveEvent(record, {
            startDate: '2026-11-08T22:00:00Z',
            endDate  : '2026-11-08T22:10:00Z'
        });

        expect(record.startDate.toISOString()).toBe('2026-11-09T00:00:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T00:30:00.000Z');

        // 4. F2 falsifier: custom startDateField ('begin') and endDateField ('finish') key both changes and previous by custom field names
        const
            customEventStore = Neo.create(Store, {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',         type: 'String'},
                        {name: 'resourceId', type: 'String'},
                        {name: 'title',      type: 'String'},
                        {name: 'begin',      type: 'Date'},
                        {name: 'finish',     type: 'Date'}
                    ]
                },
                data: [{
                    id        : 'c-1',
                    resourceId: 'r-1',
                    title     : 'Custom Fields',
                    begin     : new Date('2026-11-09T01:00:00.000Z'),
                    finish    : new Date('2026-11-09T03:00:00.000Z')
                }]
            }),
            customScheduler = Neo.create(SchedulerContainer, {
                appName,
                endDateField  : 'finish',
                eventStore    : customEventStore,
                startDateField: 'begin',
                store         : resourceStore,
                timeAxis      : {
                    start      : '2026-11-09T00:00:00Z',
                    end        : '2026-11-09T12:00:00Z',
                    tickUnit   : 'hour',
                    tickStep   : 1,
                    pxPerMinute: 1,
                    snapMinutes: 15
                }
            }),
            customEvents = [];

        customScheduler.on('eventChange', payload => customEvents.push(payload));

        customScheduler.moveEvent('c-1', {
            startDate: '2026-11-09T04:00:00.000Z',
            endDate  : '2026-11-09T06:00:00.000Z'
        });

        expect(customEvents.length).toBe(1);
        expect(customEvents[0].changes).toEqual({
            begin : new Date('2026-11-09T04:00:00.000Z'),
            finish: new Date('2026-11-09T06:00:00.000Z')
        });
        expect(customEvents[0].previous).toEqual({
            begin : new Date('2026-11-09T01:00:00.000Z'),
            finish: new Date('2026-11-09T03:00:00.000Z')
        });
        expect(Object.keys(customEvents[0].previous)).toEqual(Object.keys(customEvents[0].changes));

        const customRec = customEventStore.get('c-1');
        customRec.set(customEvents[0].previous);
        expect(customRec.begin.toISOString()).toBe('2026-11-09T01:00:00.000Z');
        expect(customRec.finish.toISOString()).toBe('2026-11-09T03:00:00.000Z');

        customScheduler.destroy();
        customEventStore.destroy();
        eventStore.destroy();
        resourceStore.destroy()
    });

    test('EventDragZone pointer drag-move, edge resize, cross-resource row drop, and Escape cancel route through moveEvent()', async () => {
        const
            resourceStore = Neo.create(Store, {
                keyProperty: 'id',
                model      : {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
                data       : [
                    {id: 'r-1', name: 'Resource 1'},
                    {id: 'r-2', name: 'Resource 2'}
                ]
            }),
            eventStore = Neo.create(EventStore, {
                data: [
                    {id: 'ev-1', resourceId: 'r-1', title: 'Draggable', startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T02:00:00Z'}
                ]
            });

        scheduler = Neo.create(SchedulerContainer, {
            appName,
            eventStore,
            store   : resourceStore,
            timeAxis: {
                start      : '2026-11-09T00:00:00Z',
                end        : '2026-11-09T12:00:00Z',
                tickUnit   : 'hour',
                tickStep   : 1,
                pxPerMinute: 1,
                snapMinutes: 15
            },
            viewportWidth: 400
        });

        scheduler.body.set({
            availableHeight: 200,
            containerWidth : 600
        });
        scheduler.timelineColumn.refreshMountedRows();

        const
            record        = eventStore.get('ev-1'),
            origMoveEvent = scheduler.moveEvent.bind(scheduler),
            barNode       = getRowTrackBars(scheduler, 0)[0],
            r2Row         = scheduler.body.items[1],
            zone          = scheduler.eventDragZone;

        expect(zone).toBeInstanceOf(SchedulerEventDragZone);
        expect(scheduler.barDraggable).toBe(true);
        expect(scheduler.dragResortable).toBe(false);
        expect(Object.hasOwn(zone, 'dragEnd')).toBe(false);
        expect(Object.hasOwn(zone, 'onDragEnd')).toBe(false);
        expect(Object.hasOwn(zone, 'onDragMove')).toBe(false);
        expect(Object.hasOwn(zone, 'resolveTarget')).toBe(false);

        let moveEventCalls = 0;
        scheduler.moveEvent = (...args) => {
            moveEventCalls++;
            return origMoveEvent(...args)
        };

        // 1. Whole-bar move from 01:00..02:00 (+60px..+120px) by +90px -> 02:30..03:30 onto row r-2
        await scheduler.onBarDragStart({
            axisOffset: 70,
            path      : [
                barNode,
                {id: `${ scheduler.body.items[0].id}__track`, cls: ['neo-timeline-track'], rect: {left: 200}}
            ]
        });

        zone.onDragMove({
            axisOffset: 160,
            path      : [barNode],
            targetPath: [
                {id: r2Row.id, cls: ['neo-grid-row'], data: {recordId: r2Row.vdom.data.recordId}}
            ]
        });

        zone.onDragEnd({
            path: [barNode]
        });

        expect(moveEventCalls).toBe(1);
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:30:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T03:30:00.000Z');
        expect(record.resourceId).toBe('r-2');

        // 2. End-handle resize (.neo-resizable-end) from 03:30 (210px) to 04:15 (255px)
        const r2BarNode = getRowTrackBars(scheduler, 1)[0];
        await scheduler.onBarDragStart({
            axisOffset: 210,
            path      : [
                {id: `${r2BarNode.id}__resize-end`, cls: ['neo-timeline-bar-handle', 'neo-resizable', 'neo-resizable-end']},
                r2BarNode,
                {id: `${r2Row.id}__track`, cls: ['neo-timeline-track'], rect: {left: 200}}
            ]
        });

        zone.onDragMove({
            axisOffset: 255,
            path      : [r2BarNode]
        });

        zone.onDragEnd({
            path: [r2BarNode]
        });

        expect(moveEventCalls).toBe(2);
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:30:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T04:15:00.000Z');

        // 3. Escape mid-drag aborts and leaves record untouched (zero additional moveEvent calls)
        await scheduler.onBarDragStart({
            axisOffset: 150,
            path      : [r2BarNode]
        });

        zone.onDragMove({
            axisOffset: 360,
            path      : [r2BarNode]
        });

        scheduler.onSchedulerKeyDown({key: 'Escape'});
        zone.onDragEnd({path: [r2BarNode]});

        expect(moveEventCalls).toBe(2);
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:30:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T04:15:00.000Z');

        // 4. barDraggable toggle destroys and recreates the zone cleanly
        scheduler.barDraggable = false;
        expect(scheduler.eventDragZone).toBeNull();
        scheduler.barDraggable = true;
        expect(scheduler.eventDragZone).toBeInstanceOf(SchedulerEventDragZone);

        eventStore.destroy();
        resourceStore.destroy()
    });

    test('keyboard ArrowLeft/ArrowRight and Shift+ArrowLeft/ArrowRight reschedule and resize bars by snapMinutes', () => {
        const
            resourceStore = Neo.create(Store, {
                keyProperty: 'id',
                model      : {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
                data       : [{id: 'r-1', name: 'Resource 1'}]
            }),
            eventStore = Neo.create(EventStore, {
                data: [
                    {id: 'ev-1', resourceId: 'r-1', title: 'Keyboard Bar', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T03:00:00Z'}
                ]
            });

        scheduler = Neo.create(SchedulerContainer, {
            appName,
            eventStore,
            store   : resourceStore,
            timeAxis: {
                start      : '2026-11-09T00:00:00Z',
                end        : '2026-11-09T12:00:00Z',
                tickUnit   : 'hour',
                tickStep   : 1,
                pxPerMinute: 1,
                snapMinutes: 15
            }
        });

        scheduler.body.set({
            availableHeight: 200,
            containerWidth : 600
        });
        scheduler.timelineColumn.refreshMountedRows();

        const
            record  = eventStore.get('ev-1'),
            barNode = getRowTrackBars(scheduler, 0)[0];

        // ArrowRight shifts +15m -> 02:15..03:15
        scheduler.onBarKeyDown({
            key     : 'ArrowRight',
            path    : [barNode],
            shiftKey: false
        });
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:15:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T03:15:00.000Z');

        // ArrowLeft shifts -15m -> 02:00..03:00
        scheduler.onBarKeyDown({
            key     : 'ArrowLeft',
            path    : [barNode],
            shiftKey: false
        });
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');

        // Shift+ArrowRight resizes endDate +15m -> 02:00..03:15
        scheduler.onBarKeyDown({
            key     : 'ArrowRight',
            path    : [barNode],
            shiftKey: true
        });
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T03:15:00.000Z');

        // Shift+ArrowLeft resizes endDate -15m -> 02:00..03:00
        scheduler.onBarKeyDown({
            key     : 'ArrowLeft',
            path    : [barNode],
            shiftKey: true
        });
        expect(record.startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z');
        expect(record.endDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');

        eventStore.destroy();
        resourceStore.destroy()
    });

    test('editor shares one writer with configured fields and reuses its dialog', () => {
        const resources = Neo.create(Store, {keyProperty: 'id', data: [{id: 'r-1'}]});
        const events    = Neo.create(Store, {keyProperty: 'id', model: {fields: [
            {name: 'id'}, {name: 'resourceId'}, {name: 'label'}, {name: 'note'},
            {name: 'begin', type: 'Date'}, {name: 'finish', type: 'Date'}
        ]}, data: [{id: 'a', resourceId: 'r-1', label: 'Before', note: 'Old',
            begin: new Date('2026-11-09T02:00Z'), finish: new Date('2026-11-09T04:00Z')}]});
        scheduler = Neo.create(SchedulerContainer, {appName, editable: true, store: resources, eventStore: events,
            titleField: 'label', startDateField: 'begin', endDateField: 'finish',
            timeAxis  : {timeZone: 'UTC', start: '2026-11-09', end: '2026-11-10'}});
        const record = events.get('a'), changes = [];
        scheduler.on('eventChange', event => changes.push(event));
        const editor = scheduler.openEventEditor('a');
        editor.setFieldValue('label', 'After');
        editor.setFieldValue('begin', '2026-11-09T03:00');
        editor.save();
        expect(record.label).toBe('After');
        expect(record.begin.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        expect(changes).toHaveLength(1);
        expect(scheduler.openEventEditor('a')).toBe(editor);
        scheduler.commitTimelineEdit(record, {note: 'New'}, {source: 'editor'});
        expect(record.note).toBe('New');
        scheduler.destroy(); scheduler = null; events.destroy(); resources.destroy()
    });

    test('resource identity agrees across projection, editor options and the writer', () => {
        const resources = Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id'}, {name: 'name'}]},
            data: [{id: 7, name: 'Seven'}, {id: 8, name: 'Eight'}]});
        const events = Neo.create(EventStore, {data: [{id: 'a', resourceId: '7', title: 'Event',
            startDate: '2026-11-09T02:00Z', endDate: '2026-11-09T04:00Z'}]});
        scheduler = Neo.create(SchedulerContainer, {appName, editable: true, store: resources, eventStore: events,
            timeAxis: {start: '2026-11-09T00:00Z', end: '2026-11-10T00:00Z'}});
        const record = events.get('a');
        expect(scheduler.getResourceEvents(7).map(item => item.id)).toEqual(['a']);
        const editor = scheduler.openEventEditor('a');
        expect(editor.getResourceOptions(record)).toEqual([{id: 7, name: 'Seven'}, {id: 8, name: 'Eight'}]);
        expect(scheduler.moveEvent(record, {resourceId: 7})).toBeNull();
        expect(record.resourceId).toBe('7');
        scheduler.moveEvent(record, {resourceId: 8});
        expect(String(record.resourceId)).toBe('8');
        expect(scheduler.getResourceEvents(8).map(item => item.id)).toEqual(['a']);
        scheduler.destroy(); scheduler = null; events.destroy(); resources.destroy()
    });

    test('dispatches one snapped proxy delta in viewport coordinates without changing the vertical base', () => {
        const axis       = Neo.create(TimeAxis, {start: '2026-11-09T00:00Z', end: '2026-11-10T00:00Z', pxPerMinute: 1});
        const next       = {startDate: new Date('2026-11-09T02:00Z'), endDate: new Date('2026-11-09T03:00Z')};
        const horizontal = Neo.create(SchedulerEventDragZone, {appName, axis, trackOrigin: 200, offsetY: 12});
        const vertical   = Neo.create(EventDragZone, {appName, axis, orientation: 'vertical'});
        const original   = Neo.applyDeltas, calls = [];
        Neo.applyDeltas = (...args) => calls.push(args);
        try {
            for (const zone of [horizontal, vertical]) {
                zone.initialSnapshot = {};
                zone.dragProxy = {id: 'proxy'};
                zone.datesFor = () => next;
                zone.dragMove({clientY: 350, axisOffset: 120});
                zone.dragProxy = null
            }
            expect(calls).toHaveLength(2);
            expect(calls[0][1]).toEqual([{id: 'proxy', style: {left: '320px', width: '60px', top: '338px'}}]);
            expect(calls[1][1]).toEqual([{id: 'proxy', style: {top: '120px', height: '60px'}}])
        } finally {
            Neo.applyDeltas = original;
            horizontal.destroy(); vertical.destroy(); axis.destroy()
        }
    });

    test('resolves real owned grid rows with numeric keys and refuses rows from another scheduler', () => {
        const model            = {fields: [{name: 'id', type: 'Number'}]};
        const resources        = Neo.create(Store, {keyProperty: 'id', model, data: [{id: 7}, {id: 8}]});
        const foreignResources = Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id', type: 'Number'}]}, data: [{id: 9}]});
        scheduler = Neo.create(SchedulerContainer, {appName, store: resources, eventStore: {}, timeAxis: {}});
        const foreign = Neo.create(SchedulerContainer, {appName, store: foreignResources, eventStore: {}, timeAxis: {}});
        scheduler.body.set({availableHeight: 150, containerWidth: 600});
        foreign.body.set({availableHeight: 150, containerWidth: 600});
        try {
            const row = scheduler.body.items[1], otherRow = foreign.body.items[0];
            expect(row.record.id).toBe(8);
            expect(scheduler.resolveRowTarget({targetPath: [row.vdom]})).toEqual({id: row.id, resourceId: 8});
            expect(scheduler.resolveRowTarget({targetPath: [otherRow.vdom]})).toBeNull();
            expect(scheduler.resolveRowTarget({targetPath: [{id: 'not-a-row', data: {recordId: 8}}]})).toBeNull();
            const zone = scheduler.ensureEventDragZone();
            zone.targetCls = 'custom-drop-target';
            expect(zone.resolveTarget({targetPath: [{id: 'custom', cls: ['custom-drop-target'], resourceId: 12}]}))
                .toEqual({id: 'custom', resourceId: 12});
            expect(zone.resolveTarget({targetPath: [otherRow.vdom]})).toBeNull()
        } finally {
            foreign.destroy(); resources.destroy(); foreignResources.destroy()
        }
    });

    test('owns configured event stores and axes, but never borrowed instances', () => {
        const resources     = Neo.create(Store, {data: []});
        const borrowedStore = Neo.create(EventStore);
        const borrowedAxis  = Neo.create(TimeAxis, {});
        scheduler = Neo.create(SchedulerContainer, {appName, store: resources, eventStore: {}, timeAxis: {}});
        const ownedStore = scheduler.eventStore, ownedAxis = scheduler.timeAxis;
        scheduler.eventStore = ownedStore;
        scheduler.timeAxis = ownedAxis;
        expect(ownedStore.isDestroyed).not.toBe(true);
        expect(ownedAxis.isDestroyed).not.toBe(true);
        scheduler.eventStore = borrowedStore;
        scheduler.timeAxis = borrowedAxis;
        expect(ownedStore.isDestroyed).toBe(true);
        expect(ownedAxis.isDestroyed).toBe(true);
        scheduler.destroy(); scheduler = null;
        expect(borrowedStore.isDestroyed).not.toBe(true);
        expect(borrowedAxis.isDestroyed).not.toBe(true);
        borrowedStore.destroy(); borrowedAxis.destroy(); resources.destroy()
    });
});
