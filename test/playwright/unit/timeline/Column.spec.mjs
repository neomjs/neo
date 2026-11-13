import {setup} from '../../setup.mjs';

const appName = 'TimelineColumnTest';

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
import BaseColumn     from '../../../../src/grid/column/Base.mjs';
import GridContainer  from '../../../../src/grid/Container.mjs';
import Store          from '../../../../src/data/Store.mjs';
import EventStore     from '../../../../src/timeline/store/Events.mjs';
import TimeAxis       from '../../../../src/timeline/TimeAxis.mjs';
import TimeAxisHeader from '../../../../src/timeline/TimeAxisHeader.mjs';
import TimelineColumn from '../../../../src/timeline/Column.mjs';

test.describe('Neo.timeline.Column', () => {
    test('extends Neo.grid.column.Base and registers Neo.timeline.Column', () => {
        expect(Neo.ns('Neo.timeline.Column')).toBe(TimelineColumn);
        expect(BaseColumn.prototype.isPrototypeOf(TimelineColumn.prototype)).toBe(true);
    });

    test('projects horizontally windowed, lane-packed bars from the event store and updates on scrollLeft', () => {
        // 24 hours = 1440 minutes @ 1px/min => 1440px total width
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 0, 0, 0, 0),
            end        : new Date(2026, 10, 10, 0, 0, 0, 0),
            pxPerMinute: 1,
            tickUnit   : 'hour'
        });

        const eventStore = Neo.create(EventStore, {
            data: [
                {
                    id        : 'ev-early-a',
                    resourceId: 'r-1',
                    title     : 'Morning A',
                    startDate : new Date(2026, 10, 9, 1, 0, 0, 0), // 60px..180px
                    endDate   : new Date(2026, 10, 9, 3, 0, 0, 0)
                },
                {
                    id        : 'ev-early-b',
                    resourceId: 'r-1',
                    title     : 'Morning B (Overlapping)',
                    startDate : new Date(2026, 10, 9, 2, 0, 0, 0), // 120px..240px (overlaps ev-early-a)
                    endDate   : new Date(2026, 10, 9, 4, 0, 0, 0)
                },
                {
                    id        : 'ev-late',
                    resourceId: 'r-1',
                    title     : 'Evening Shift',
                    startDate : new Date(2026, 10, 9, 20, 0, 0, 0), // 1200px..1320px (outside initial window)
                    endDate   : new Date(2026, 10, 9, 22, 0, 0, 0)
                }
            ]
        });

        const col = Neo.create(TimelineColumn, {
            appName,
            bufferPx     : 60,
            eventStore,
            scrollLeft   : 0,
            timeAxis     : axis,
            viewportWidth: 300 // visible window [0, 360px] = [00:00, 06:00]
        });

        const cellVdom = col.cellRenderer({
            record: {id: 'r-1', name: 'Generator 1'},
            row   : {id: 'test-row-1'}
        });

        const trackNode = cellVdom.cn[0];
        expect(trackNode.cls).toContain('neo-timeline-track');
        expect(trackNode.style.width).toBe('1440px');
        // Only the 2 morning events intersect [0, 360px]; ev-late at 1200px is culled
        expect(trackNode.cn.length).toBe(2);

        const [barA, barB] = trackNode.cn;
        expect(barA.id).toBe('test-row-1__bar__ev-early-a');
        expect(barA.data.eventId).toBe('ev-early-a');
        expect(barA.data.resourceId).toBe('r-1');
        expect(barA.data.lane).toBe('0');
        expect(barA.data.laneCount).toBe('2');
        expect(barA.style.left).toBe('60px');
        expect(barA.style.width).toBe('120px');
        expect(barA.style.top).toBe('8%');
        expect(barA.style.height).toBe('42%');

        expect(barB.id).toBe('test-row-1__bar__ev-early-b');
        expect(barB.data.lane).toBe('1');
        expect(barB.data.laneCount).toBe('2');
        expect(barB.style.left).toBe('120px');
        expect(barB.style.width).toBe('120px');
        expect(barB.style.top).toBe('50%');
        expect(barB.style.height).toBe('42%');

        // Scroll horizontally to 1080px: window is [1020px, 1440px] => only ev-late is rendered
        col.scrollLeft = 1080;
        const lateCellVdom = col.cellRenderer({
            record: {id: 'r-1', name: 'Generator 1'},
            row   : {id: 'test-row-1'}
        });

        const lateBars = lateCellVdom.cn[0].cn;
        expect(lateBars.length).toBe(1);
        expect(lateBars[0].data.eventId).toBe('ev-late');
        expect(lateBars[0].style.left).toBe('1200px');
        expect(lateBars[0].style.width).toBe('120px');
        expect(lateBars[0].style.top).toBe('8%');
        expect(lateBars[0].style.height).toBe('84%');

        col.destroy();
        eventStore.destroy();
        axis.destroy();
    });

    test('keeps a visible bar in its row-wide lane as overlapping bars leave the window', () => {
        const axis = Neo.create(TimeAxis, {
            start: '2026-11-09T00:00:00Z', end: '2026-11-09T12:00:00Z', pxPerMinute: 1
        });
        const eventStore = Neo.create(EventStore, {data: [
            {id: 'a', resourceId: 'r', startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T03:00:00Z'},
            {id: 'b', resourceId: 'r', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T05:00:00Z'}
        ]});
        const col    = Neo.create(TimelineColumn, {appName, timeAxis: axis, eventStore, bufferPx: 0, viewportWidth: 180});
        const render = () => col.cellRenderer({record: {id: 'r'}, row: {id: 'row'}}).cn[0].cn;

        try {
            const first = render();
            expect(first.map(bar => bar.data.eventId)).toEqual(['a', 'b']);
            const before = first[1];
            expect([before.data.lane, before.data.laneCount, before.style.top, before.style.height]).toEqual(['1', '2', '50%', '42%']);

            col.scrollLeft = 180;
            const second = render();
            expect(second.map(bar => bar.data.eventId)).toEqual(['b']);
            expect([second[0].data.lane, second[0].data.laneCount, second[0].style.top, second[0].style.height])
                .toEqual([before.data.lane, before.data.laneCount, before.style.top, before.style.height]);
        } finally {
            col.destroy(); eventStore.destroy(); axis.destroy()
        }
    });

    test('renders an inline milestone at the visible window start', () => {
        const axis = Neo.create(TimeAxis, {start: '2026-11-09T00:00:00Z', end: '2026-11-09T12:00:00Z', pxPerMinute: 1});
        const col  = Neo.create(TimelineColumn, {appName, timeAxis: axis, scrollLeft: 180, bufferPx: 0, viewportWidth: 180});

        try {
            const bars = col.cellRenderer({
                record: {id: 'milestone', startDate: '2026-11-09T03:00:00Z', endDate: '2026-11-09T03:00:00Z'},
                row   : {id: 'row'}
            }).cn[0].cn;
            expect(bars.map(bar => bar.data.eventId)).toEqual(['milestone'])
        } finally { col.destroy(); axis.destroy() }
    });

    test('renders inline task records with percentDone progress fill when the row is its own event', () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 18, 0, 0, 0),
            pxPerMinute: 2
        });

        const col = Neo.create(TimelineColumn, {
            appName,
            bufferPx            : 100,
            highlightedRecordIds: ['task-42'],
            timeAxis            : axis,
            viewportWidth       : 1200
        });

        const cellVdom = col.cellRenderer({
            record: {
                id         : 'task-42',
                title      : 'Foundation Pour',
                startDate  : new Date(2026, 10, 9, 9, 0, 0, 0),  // 60 mins * 2 = 120px
                endDate    : new Date(2026, 10, 9, 11, 0, 0, 0), // 180 mins * 2 = 360px => width 240px
                percentDone: 65
            },
            row: {id: 'gantt-row-1'}
        });

        const bars = cellVdom.cn[0].cn;
        expect(bars.length).toBe(1);

        const bar = bars[0];
        expect(bar.cls).toContain('neo-timeline-bar-highlighted');
        expect(bar.data.highlighted).toBe('true');
        expect(bar.id).toBe('gantt-row-1__bar__task-42');
        expect(bar.style.left).toBe('120px');
        expect(bar.style.width).toBe('240px');

        const progressNode = bar.cn.find(child => child.cls?.includes('neo-timeline-bar-progress'));
        expect(progressNode).toBeTruthy();
        expect(progressNode.style.width).toBe('65%');
        col.highlightedRecordIds = [];
        const unmarked = col.cellRenderer({
            record: {id: 'task-42', startDate: axis.start, endDate: axis.end}, row: {id: 'row'}
        }).cn[0].cn[0];
        expect(unmarked.cls).not.toContain('neo-timeline-bar-highlighted');
        expect(unmarked.data.highlighted).toBeUndefined();

        col.destroy();
        axis.destroy();
    });

    test('integrates inside a multi-body Neo.grid.Container without toolbar patching, skips re-projection within bufferPx, and observes bodyEnd', () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 0, 0, 0, 0),
            end        : new Date(2026, 10, 11, 0, 0, 0, 0), // 48 hours = 2880 minutes @ 1px/min => 2880px
            pxPerMinute: 1,
            tickUnit   : 'hour'
        });

        const resourceStore = Neo.create(Store, {
            keyProperty: 'id',
            model      : {
                fields: [{name: 'id'}, {name: 'name'}, {name: 'owner'}]
            },
            data       : [
                {id: 'r-1', name: 'Track Alpha', owner: 'Ops'},
                {id: 'r-2', name: 'Track Beta',  owner: 'Core'}
            ]
        });

        const eventStore = Neo.create(EventStore, {
            data: [
                {
                    id        : 'ev-1',
                    resourceId: 'r-1',
                    title     : 'Alpha Window 1',
                    startDate : new Date(2026, 10, 9, 2, 0, 0, 0),
                    endDate   : new Date(2026, 10, 9, 5, 0, 0, 0)
                }
            ]
        });

        const grid = Neo.create(GridContainer, {
            appName,
            rowHeight: 40,
            store    : resourceStore,
            columns  : [
                {
                    dataField: 'name',
                    text     : 'Resource',
                    locked   : 'start',
                    width    : 200
                },
                {
                    module       : TimelineColumn,
                    ntype        : 'timeline-header',
                    dataField    : 'timeline',
                    text         : 'Schedule',
                    timeAxis     : axis,
                    eventStore,
                    bufferPx     : 120,
                    viewportWidth: 480
                },
                {
                    dataField: 'owner',
                    text     : 'Owner',
                    locked   : 'end',
                    width    : 120
                }
            ]
        });

        grid.body.set({
            availableHeight: 200,
            containerWidth : 480
        });

        const timelineCol    = grid.columns.get('timeline');
        const timelineHeader = grid.headerToolbar.getColumn('timeline');

        expect(Object.hasOwn(grid.headerToolbar, 'createItems')).toBe(false);

        expect(grid.headerWrapper.headerStart).toBeTruthy();
        expect(grid.headerWrapper.headerEnd).toBeTruthy();
        expect(grid.view.bodyStart).toBeTruthy();
        expect(grid.view.bodyEnd).toBeTruthy();
        expect(timelineCol instanceof TimelineColumn).toBe(true);
        expect(timelineHeader instanceof TimeAxisHeader).toBe(true);
        expect(timelineHeader.width).toBe(2880);
        expect(grid.body.availableWidth).toBe(2880);
        expect(grid.body.columnPositions.get('timeline').width).toBe(2880);

        // Verify r-1's mounted row actually renders ev-1's bar
        const r1Row  = grid.body.items.find(row => row.record?.id === 'r-1');
        const r1Bars = r1Row?.vdom.cn[0]?.cn[0]?.cn[0]?.cn || [];
        expect(r1Bars.length).toBe(1);
        expect(r1Bars[0].data.eventId).toBe('ev-1');

        // Ten small scroll steps stay inside the 120px buffer.
        let bodyRenders   = 0;
        let headerUpdates = 0;

        const origCreateViewData = grid.body.createViewData.bind(grid.body);
        const origHeaderUpdate   = timelineHeader.update.bind(timelineHeader);

        grid.body.createViewData = (...args) => {
            bodyRenders++;
            return origCreateViewData(...args);
        };
        timelineHeader.update = (...args) => {
            headerUpdates++;
            return origHeaderUpdate(...args);
        };

        for (let step = 1; step <= 10; step++) {
            grid.headerToolbar.scrollLeft = step;
        }

        expect(timelineHeader.scrollLeft).toBe(10);
        expect(timelineCol.scrollLeft).toBe(10);
        expect(bodyRenders).toBe(0);
        expect(headerUpdates).toBe(0);

        // One step beyond the initial [0, 600px] projected window (scrollLeft = 121 => visMaxPx = 601 > 600) re-projects once
        grid.headerToolbar.scrollLeft = 121;
        expect(bodyRenders).toBe(1);
        expect(headerUpdates).toBe(1);

        // Subsequent small step inside the new [1, 721px] projected window triggers 0 additional re-renders
        grid.headerToolbar.scrollLeft = 130;
        expect(bodyRenders).toBe(1);
        expect(headerUpdates).toBe(1);

        // Verify bodyEnd.availableWidth observer triggers re-projection when center clip width changes
        grid.body.containerWidth       = 1000;
        grid.bodyStart.availableWidth  = 200;
        const rendersBeforeBodyEnd = bodyRenders;
        const updatesBeforeBodyEnd = headerUpdates;

        grid.bodyEnd.availableWidth = 160;
        expect(timelineHeader.effectiveViewportWidth).toBe(640);
        expect(timelineCol.effectiveViewportWidth).toBe(640);
        expect(bodyRenders).toBe(rendersBeforeBodyEnd + 1);
        expect(headerUpdates).toBe(updatesBeforeBodyEnd + 1);

        // Changing TimeAxis scale updates both header width and center body availableWidth
        axis.pxPerMinute = 2;
        expect(timelineHeader.width).toBe(5760);
        expect(timelineCol.width).toBe(5760);
        expect(grid.body.availableWidth).toBe(5760);

        grid.destroy();
        eventStore.destroy();
        resourceStore.destroy();
        axis.destroy();
    });

    test('single-row renders (recordChange and startIndex) do not advance the Column projected window ahead of other mounted rows', () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 0, 0, 0, 0),
            end        : new Date(2026, 10, 11, 0, 0, 0, 0), // 2880px @ 1px/min
            pxPerMinute: 1,
            tickUnit   : 'hour'
        });

        const resources = [];
        const events    = [];

        for (let i = 1; i <= 15; i++) {
            const resourceId = `r-${i}`;
            resources.push({id: resourceId, name: `Resource ${i}`, owner: `Team ${i}`});
            // Each bar starts at 610px (10h 10m), 10px past the initial [0, 600px] window
            events.push({
                id       : `ev-${i}`,
                resourceId,
                title    : `Event ${i}`,
                startDate: new Date(2026, 10, 9, 10, 10, 0, 0),
                endDate  : new Date(2026, 10, 9, 11, 40, 0, 0)
            });
        }

        const resourceStore = Neo.create(Store, {
            keyProperty: 'id',
            model      : {
                fields: [{name: 'id'}, {name: 'name'}, {name: 'owner'}]
            },
            data       : resources
        });

        const eventStore = Neo.create(EventStore, {data: events});

        const grid = Neo.create(GridContainer, {
            appName,
            bufferRowRange: 2,
            rowHeight     : 40,
            store         : resourceStore,
            columns       : [
                {dataField: 'name', text: 'Resource', locked: 'start', width: 200},
                {
                    module       : TimelineColumn,
                    ntype        : 'timeline-header',
                    dataField    : 'timeline',
                    text         : 'Schedule',
                    timeAxis     : axis,
                    eventStore,
                    bufferPx     : 120,
                    viewportWidth: 480
                },
                {dataField: 'owner', text: 'Owner', locked: 'end', width: 120}
            ]
        });

        grid.body.set({
            availableHeight: 240,
            containerWidth : 480
        });

        const getRowBars = resourceId => {
            const row = grid.body.items.find(item => !item.vdom.removeDom && item.record?.id === resourceId);
            return row?.vdom.cn[0]?.cn[0]?.cn[0]?.cn || [];
        };

        // At scrollLeft = 0 (window [0, 600px]), bars at [610px, 700px] are outside the window
        expect(getRowBars('r-1').length).toBe(0);
        expect(getRowBars('r-2').length).toBe(0);
        expect(getRowBars('r-3').length).toBe(0);

        // 1. Record-change falsifier: scroll to 50 (inside buffer), mutate r-2 (single-row repaint), then scroll to 140
        grid.headerToolbar.scrollLeft = 50;
        resourceStore.get('r-2').owner = 'Updated Team 2';

        // Still at window [0, 600px] for all mounted rows
        expect(getRowBars('r-2').length).toBe(0);

        // Scrolling to 140 (visMaxPx = 620 > 600) must re-project ALL mounted rows
        grid.headerToolbar.scrollLeft = 140;
        expect(getRowBars('r-1').length).toBe(1);
        expect(getRowBars('r-2').length).toBe(1);
        expect(getRowBars('r-3').length).toBe(1);

        // 2. startIndex falsifier: reset to scrollLeft = 0, step to 50, move startIndex 0 -> 4, then scroll to 140
        grid.headerToolbar.scrollLeft = 0;
        expect(getRowBars('r-5').length).toBe(0);

        grid.headerToolbar.scrollLeft = 50;
        grid.body.startIndex = 4;

        // Neither still-mounted r-5 nor newly recycled r-11 should show the 610px bar yet
        expect(getRowBars('r-5').length).toBe(0);
        expect(getRowBars('r-11').length).toBe(0);

        // Scrolling to 140 (visMaxPx = 620 > 600) must re-project both still-mounted r-5 and recycled r-11
        grid.headerToolbar.scrollLeft = 140;
        expect(getRowBars('r-5').length).toBe(1);
        expect(getRowBars('r-11').length).toBe(1);

        grid.destroy();
        eventStore.destroy();
        resourceStore.destroy();
        axis.destroy();
    });
});
