import {test, expect} from '@playwright/test';
import {setup}        from '../../setup.mjs';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';
import GanttContainer  from '../../../../src/gantt/Container.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';
import TimeAxis        from '../../../../src/timeline/TimeAxis.mjs';

const appName = 'GanttContainerTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

test.describe('Neo.gantt.Container', () => {
    let gantt;

    const getRowTrackBars = (grid, rowIndex) => grid.body.items[rowIndex].vdom.cn[0].cn[0].cn[0].cn;

    test.beforeEach(() => {
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {setConfigs: async () => ({})}
    });

    test.afterEach(() => {
        gantt?.destroy();
        gantt = null
    });

    test('moveTask() is the single writer and executes cycle-safe topological dependency cascade across FS, SS, FF, SF, lag, and cyclic graphs', () => {
        const
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 't-a', parentId: null, isLeaf: true, title: 'Task A', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T04:00:00Z', duration: 2, durationUnit: 'hour'},
                    {id: 't-b', parentId: null, isLeaf: true, title: 'Task B (FS+1h)', startDate: '2026-11-09T05:00:00Z', endDate: '2026-11-09T07:00:00Z', duration: 2, durationUnit: 'hour'},
                    {id: 't-c', parentId: null, isLeaf: true, title: 'Task C (SS)',    startDate: '2026-11-09T05:00:00Z', endDate: '2026-11-09T06:00:00Z', duration: 1, durationUnit: 'hour'},
                    {id: 't-d', parentId: null, isLeaf: true, title: 'Task D (FF)',    startDate: '2026-11-09T05:00:00Z', endDate: '2026-11-09T07:00:00Z', duration: 2, durationUnit: 'hour'}
                ]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'd-ab', fromId: 't-a', toId: 't-b', type: 'FS', lag: 1, lagUnit: 'hour'},
                    {id: 'd-bc', fromId: 't-b', toId: 't-c', type: 'SS', lag: 0, lagUnit: 'hour'},
                    {id: 'd-bd', fromId: 't-b', toId: 't-d', type: 'FF', lag: 1, lagUnit: 'hour'},
                    // Deliberate cycle edge t-d -> t-a to verify cycle detection and reporting
                    {id: 'd-da', fromId: 't-d', toId: 't-a', type: 'FS', lag: 0, lagUnit: 'hour'}
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            dependencyStore,
            store   : taskStore,
            timeAxis: {
                start      : '2026-11-09T00:00:00Z',
                end        : '2026-11-10T00:00:00Z',
                tickUnit   : 'hour',
                tickStep   : 1,
                pxPerMinute: 1,
                snapMinutes: 15
            }
        });


        const
            events      = [],
            cycleEvents = [];

        gantt.on('taskChange',      payload => events.push(payload));
        gantt.on('dependencyCycle', payload => cycleEvents.push(payload));

        expect(gantt.moveTask('t-a', {
            startDate: '2026-11-09T02:00:00Z',
            endDate  : '2026-11-09T04:00:00Z'
        })).toBeNull();
        expect(events.length).toBe(0);

        expect(gantt.moveTask({
            id       : 'plain-task',
            startDate: new Date('2026-11-09T02:00:00Z'),
            endDate  : new Date('2026-11-09T04:00:00Z')
        }, {
            startDate: '2026-11-09T03:00:00Z',
            endDate  : '2026-11-09T05:00:00Z'
        })).toBeNull();

        const result = gantt.moveTask('t-a', {
            startDate: '2026-11-09T04:00:00Z',
            endDate  : '2026-11-09T06:00:00Z'
        });

        expect(result).not.toBeNull();
        expect(result.cascaded.length).toBe(3);
        expect(result.cycles).toEqual(['d-da']);
        expect(events.length).toBe(1);
        expect(events[0]).toMatchObject({changeSource: 'api', source: gantt.id});
        expect(events[0].action).toBe('move');
        expect(events[0].record).toBe(taskStore.get('t-a'));
        expect(events[0].changes).toBe(result.updates);
        expect(events[0].previous).toEqual({
            endDate  : new Date('2026-11-09T04:00:00.000Z'),
            startDate: new Date('2026-11-09T02:00:00.000Z')
        });
        expect(Object.keys(events[0].previous)).toEqual(Object.keys(events[0].changes));
        expect(Object.keys(events[0].changesById).sort()).toEqual(['t-a', 't-b', 't-c', 't-d']);
        expect(Object.keys(events[0].previousById).sort()).toEqual(['t-a', 't-b', 't-c', 't-d']);
        expect(events[0].cycles).toEqual(['d-da']);
        expect(cycleEvents.length).toBe(1);
        expect(cycleEvents[0].cycles).toEqual(['d-da']);

        expect(taskStore.get('t-a').startDate.toISOString()).toBe('2026-11-09T04:00:00.000Z');
        expect(taskStore.get('t-a').endDate.toISOString()).toBe('2026-11-09T06:00:00.000Z');
        expect(taskStore.get('t-b').startDate.toISOString()).toBe('2026-11-09T07:00:00.000Z');
        expect(taskStore.get('t-b').endDate.toISOString()).toBe('2026-11-09T09:00:00.000Z');
        expect(taskStore.get('t-c').startDate.toISOString()).toBe('2026-11-09T07:00:00.000Z');
        expect(taskStore.get('t-c').endDate.toISOString()).toBe('2026-11-09T08:00:00.000Z');
        expect(taskStore.get('t-d').startDate.toISOString()).toBe('2026-11-09T08:00:00.000Z');
        expect(taskStore.get('t-d').endDate.toISOString()).toBe('2026-11-09T10:00:00.000Z');

        const resizeResult = gantt.moveTask('t-a', {
            endDate: '2026-11-09T07:00:00Z'
        }, {
            resizeEdge: 'end',
            source    : 'resize'
        });

        expect(resizeResult).not.toBeNull();
        expect(events.length).toBe(2);
        expect(events[1]).toMatchObject({changeSource: 'resize', source: gantt.id});
        expect(events[1].changes).toEqual({
            duration: 3,
            endDate : new Date('2026-11-09T07:00:00.000Z')
        });
        expect(events[1].previous).toEqual({
            duration: 2,
            endDate : new Date('2026-11-09T06:00:00.000Z')
        });
        expect(Object.keys(events[1].previous)).toEqual(Object.keys(events[1].changes));

        // Applying previousById across root and cascaded records restores all pre-resize values including duration
        for (const [id, prev] of Object.entries(events[1].previousById)) {
            expect(Object.keys(prev)).toEqual(Object.keys(events[1].changesById[id]));
            taskStore.get(id).set(prev)
        }
        expect(taskStore.get('t-a').endDate.toISOString()).toBe('2026-11-09T06:00:00.000Z');
        expect(taskStore.get('t-a').duration).toBe(2);
        expect(taskStore.get('t-b').startDate.toISOString()).toBe('2026-11-09T07:00:00.000Z');

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('converging dependencies update once and preserve buffered scroll and escaped SVG output', () => {
        const
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 'A', parentId: null, isLeaf: true, title: 'Task A', startDate: '2026-11-09T00:00:00Z', endDate: '2026-11-09T10:00:00Z', duration: 10, durationUnit: 'hour'},
                    {id: 'B', parentId: null, isLeaf: true, title: 'Task B', startDate: '2026-11-09T10:00:00Z', endDate: '2026-11-09T20:00:00Z', duration: 10, durationUnit: 'hour'},
                    {id: 'C', parentId: null, isLeaf: true, title: 'Task C', startDate: '2026-11-09T20:00:00Z', endDate: '2026-11-10T06:00:00Z', duration: 10, durationUnit: 'hour'}
                ]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'x"><img src=x onerror=alert(1)>', fromId: 'A', toId: 'B', type: 'FS', lag: 0, lagUnit: 'hour'},
                    {id: 'dep-ac',                          fromId: 'A', toId: 'C', type: 'FS', lag: 0, lagUnit: 'hour'},
                    {id: 'dep-bc',                          fromId: 'B', toId: 'C', type: 'FS', lag: 0, lagUnit: 'hour'}
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            bufferPx: 240,
            dependencyStore,
            store   : taskStore,
            timeAxis: {
                start      : '2026-11-09T00:00:00Z',
                end        : '2026-11-12T00:00:00Z',
                tickUnit   : 'hour',
                tickStep   : 1,
                pxPerMinute: 1,
                snapMinutes: 15
            },
            viewportWidth: 600
        });

        gantt.body.set({
            availableHeight: 400,
            containerWidth : 600
        });
        gantt.timelineColumn.refreshMountedRows();
        gantt.syncDependencyLayer();

        // HTML injection characters in dependency id are escaped in vdom.html
        const html = gantt.dependencyLayer.vdom.html;
        expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img');

        // 50 one-pixel scroll steps inside bufferPx (240px) trigger 0 body.update() and 0 layer.project() calls
        let bodyUpdates   = 0,
            layerProjects = 0,
            rowRefreshes  = 0;

        const
            origBodyUpdate   = gantt.body.update.bind(gantt.body),
            origLayerProject = gantt.dependencyLayer.project.bind(gantt.dependencyLayer),
            origRowRefresh   = gantt.timelineColumn.refreshMountedRows.bind(gantt.timelineColumn);

        gantt.body.update                          = (...args) => { bodyUpdates++;   return origBodyUpdate(...args) };
        gantt.dependencyLayer.project              = (...args) => { layerProjects++; return origLayerProject(...args) };
        gantt.timelineColumn.refreshMountedRows    = (...args) => { rowRefreshes++;  return origRowRefresh(...args) };

        for (let px = 1; px <= 50; px++) {
            gantt.headerToolbar.scrollLeft = px
        }

        expect(bodyUpdates).toBe(0);
        expect(layerProjects).toBe(0);

        // Scrolling past the 240px buffer window triggers 1 layer.project() (and 1 TimelineColumn row refresh)
        gantt.headerToolbar.scrollLeft = 300;
        expect(layerProjects).toBe(1);
        expect(rowRefreshes).toBe(1);

        // B and C each depend on A. C must see B’s final dates in the same pass.
        bodyUpdates   = 0;
        layerProjects = 0;
        rowRefreshes  = 0;

        const moveRes = gantt.moveTask('A', {
            startDate: '2026-11-09T05:00:00Z',
            endDate  : '2026-11-09T15:00:00Z'
        });

        expect(moveRes).not.toBeNull();
        expect(moveRes.cycles).toEqual([]);
        expect(taskStore.get('B').startDate.toISOString()).toBe('2026-11-09T15:00:00.000Z');
        expect(taskStore.get('B').endDate.toISOString()).toBe('2026-11-10T01:00:00.000Z');
        expect(taskStore.get('C').startDate.toISOString()).toBe('2026-11-10T01:00:00.000Z');
        expect(taskStore.get('C').endDate.toISOString()).toBe('2026-11-10T11:00:00.000Z');

        expect(bodyUpdates).toBe(0);
        expect(rowRefreshes).toBe(0);
        expect(layerProjects).toBe(1);

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('EventDragZone pointer drag-move, edge resize, Escape cancel, and keyboard ArrowLeft/Right route through moveTask()', async () => {
        const
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 't-1', parentId: null, isLeaf: true, title: 'Task 1', startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T02:00:00Z', duration: 1, durationUnit: 'hour'},
                    {id: 't-2', parentId: null, isLeaf: true, title: 'Task 2', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T03:00:00Z', duration: 1, durationUnit: 'hour'}
                ]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'd-12', fromId: 't-1', toId: 't-2', type: 'FS', lag: 0, lagUnit: 'minute'}
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            dependencyStore,
            store   : taskStore,
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

        gantt.body.set({
            availableHeight: 200,
            containerWidth : 600
        });
        gantt.timelineColumn.refreshMountedRows();
        gantt.syncDependencyLayer();

        const
            t1      = taskStore.get('t-1'),
            t2      = taskStore.get('t-2'),
            barNode = getRowTrackBars(gantt, 0)[0],
            zone    = gantt.eventDragZone;

        const changes = [];
        gantt.on('taskChange', payload => changes.push(payload));

        await gantt.onBarDragStart({
            axisOffset: 75,
            path      : [
                barNode,
                {id: `${gantt.body.items[0].id}__track`, cls: ['neo-timeline-track'], rect: {left: 260}}
            ]
        });

        zone.onDragMove({
            axisOffset: 135,
            path      : [barNode]
        });

        zone.onDragEnd({
            path: [barNode]
        });

        expect(t1.startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z');
        expect(t1.endDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        expect(t2.startDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        expect(t2.endDate.toISOString()).toBe('2026-11-09T04:00:00.000Z');

        await gantt.onBarDragStart({
            axisOffset: 120,
            path      : [barNode]
        });
        zone.onDragMove({
            axisOffset: 300,
            path      : [barNode]
        });
        gantt.onSchedulerKeyDown({key: 'Escape'});
        zone.onDragEnd({path: [barNode]});

        expect(t1.startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z');
        expect(t2.startDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');

        gantt.onBarKeyDown({
            key     : 'ArrowRight',
            path    : [barNode],
            shiftKey: false
        });
        expect(t1.startDate.toISOString()).toBe('2026-11-09T02:15:00.000Z');
        expect(t1.endDate.toISOString()).toBe('2026-11-09T03:15:00.000Z');
        expect(t2.startDate.toISOString()).toBe('2026-11-09T03:15:00.000Z');

        gantt.onBarKeyDown({
            key     : 'ArrowRight',
            path    : [barNode],
            shiftKey: true
        });
        expect(t1.endDate.toISOString()).toBe('2026-11-09T03:30:00.000Z');
        expect(t1.duration).toBe(1.25);
        expect(t2.startDate.toISOString()).toBe('2026-11-09T03:30:00.000Z');

        expect(changes.map(({action, changeSource, source}) => ({action, changeSource, source}))).toEqual([
            {action: 'move',   changeSource: 'drag',     source: gantt.id},
            {action: 'move',   changeSource: 'keyboard', source: gantt.id},
            {action: 'resize', changeSource: 'keyboard', source: gantt.id}
        ]);

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('renders .neo-timeline-non-working shading bands and cascades FS/SS/FF/SF dependencies with positive/negative lag across non-working days when useWorkingTime is true', () => {
        const
            friStart  = TimeAxis.parseDayKey('2026-11-13', 0, 0),
            friNoon   = TimeAxis.parseDayKey('2026-11-13', 12, 0),
            satStart  = TimeAxis.parseDayKey('2026-11-14', 0, 0),
            monStart  = TimeAxis.parseDayKey('2026-11-16', 0, 0),
            tueStart  = TimeAxis.parseDayKey('2026-11-17', 0, 0),
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 't-root', parentId: null, isLeaf: true, title: 'Root Task', startDate: friStart, endDate: satStart, duration: 24, durationUnit: 'hour'},
                    {id: 't-fs',   parentId: null, isLeaf: true, title: 'FS +6h',    startDate: monStart, endDate: tueStart, duration: 24, durationUnit: 'hour'},
                    {id: 't-ss',   parentId: null, isLeaf: true, title: 'SS +12h',   startDate: friStart, endDate: satStart, duration: 24, durationUnit: 'hour'},
                    {id: 't-ff',   parentId: null, isLeaf: true, title: 'FF -6h',    startDate: friNoon,  endDate: satStart, duration: 12, durationUnit: 'hour'},
                    {id: 't-sf',   parentId: null, isLeaf: true, title: 'SF +36h',   startDate: friNoon,  endDate: satStart, duration: 12, durationUnit: 'hour'}
                ]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'dep-fs', fromId: 't-root', toId: 't-fs', type: 'FS', lag: 360,  lagUnit: 'minute'}, // +6h working lag
                    {id: 'dep-ss', fromId: 't-root', toId: 't-ss', type: 'SS', lag: 720,  lagUnit: 'minute'}, // +12h working lag
                    {id: 'dep-ff', fromId: 't-root', toId: 't-ff', type: 'FF', lag: -360, lagUnit: 'minute'}, // -6h working lead
                    {id: 'dep-sf', fromId: 't-root', toId: 't-sf', type: 'SF', lag: 2160, lagUnit: 'minute'}  // +36h working lag
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            bufferPx: 400,
            dependencyStore,
            store   : taskStore,
            timeAxis: {
                start          : TimeAxis.parseDayKey('2026-11-12', 0, 0),
                end            : TimeAxis.parseDayKey('2026-11-21', 0, 0),
                nonWorkingDates: ['2026-11-18'], // Wednesday holiday
                nonWorkingDays : [0, 6],         // Saturday & Sunday
                pxPerMinute    : 0.5,
                snapMinutes    : 30,
                tickStep       : 6,
                tickUnit       : 'hour'
            },
            useWorkingTime: true,
            viewportWidth : 5000
        });


        gantt.body.set({
            availableHeight: 400,
            containerWidth : 5000
        });
        gantt.timelineColumn.refreshMountedRows();
        gantt.syncDependencyLayer();

        expect(gantt.showNonWorkingTime).toBe(true);
        expect(gantt.timelineColumn.showNonWorkingTime).toBe(true);
        expect(gantt.timelineColumn.headerComponent.showNonWorkingTime).toBe(true);

        const
            rowTrackChildren = getRowTrackBars(gantt, 0),
            rowBands         = rowTrackChildren.filter(node => node.cls?.includes('neo-timeline-non-working')),
            headerMinorCn    = gantt.timelineColumn.headerComponent.vdom.cn[1].cn,
            headerBands      = headerMinorCn.filter(node => node.cls?.includes('neo-timeline-non-working'));

        // Weekend (2026-11-14..2026-11-15 coalesced) + Wednesday holiday (2026-11-18) = 2 bands
        expect(rowBands.length).toBe(2);
        expect(headerBands.length).toBe(2);
        expect(rowBands[0].data.dayKey).toBe('2026-11-14');
        expect(rowBands[0].style).toMatchObject({left: '1440px', width: '1440px'});
        expect(rowBands[1].data.dayKey).toBe('2026-11-18');
        expect(rowBands[1].style).toMatchObject({left: '4320px', width: '720px'});

        const events = [];
        gantt.on('taskChange', payload => events.push(payload));

        const res = gantt.moveTask('t-root', {
            startDate: TimeAxis.parseDayKey('2026-11-14', 8, 0),
            endDate  : TimeAxis.parseDayKey('2026-11-15', 8, 0)
        });

        expect(res).not.toBeNull();
        expect(TimeAxis.dayKey(taskStore.get('t-root').startDate)).toBe('2026-11-16');
        expect(taskStore.get('t-root').startDate.getHours()).toBe(0);
        expect(TimeAxis.dayKey(taskStore.get('t-root').endDate)).toBe('2026-11-17');
        expect(taskStore.get('t-root').endDate.getHours()).toBe(0);
        expect(taskStore.get('t-root').duration).toBe(24);

        expect(TimeAxis.dayKey(taskStore.get('t-fs').startDate)).toBe('2026-11-17');
        expect(taskStore.get('t-fs').startDate.getHours()).toBe(6);
        expect(TimeAxis.dayKey(taskStore.get('t-fs').endDate)).toBe('2026-11-19');
        expect(taskStore.get('t-fs').endDate.getHours()).toBe(6);

        expect(TimeAxis.dayKey(taskStore.get('t-ss').startDate)).toBe('2026-11-16');
        expect(taskStore.get('t-ss').startDate.getHours()).toBe(12);
        expect(TimeAxis.dayKey(taskStore.get('t-ss').endDate)).toBe('2026-11-17');
        expect(taskStore.get('t-ss').endDate.getHours()).toBe(12);

        expect(TimeAxis.dayKey(taskStore.get('t-ff').startDate)).toBe('2026-11-16');
        expect(taskStore.get('t-ff').startDate.getHours()).toBe(6);
        expect(TimeAxis.dayKey(taskStore.get('t-ff').endDate)).toBe('2026-11-16');
        expect(taskStore.get('t-ff').endDate.getHours()).toBe(18);

        expect(TimeAxis.dayKey(taskStore.get('t-sf').startDate)).toBe('2026-11-17');
        expect(taskStore.get('t-sf').startDate.getHours()).toBe(0);
        expect(TimeAxis.dayKey(taskStore.get('t-sf').endDate)).toBe('2026-11-17');
        expect(taskStore.get('t-sf').endDate.getHours()).toBe(12);

        for (const [id, prev] of Object.entries(events[0].previousById)) {
            expect(Object.keys(prev)).toEqual(Object.keys(events[0].changesById[id]));
            taskStore.get(id).set(prev)
        }
        expect(taskStore.get('t-root').startDate.getTime()).toBe(friStart.getTime());
        expect(taskStore.get('t-root').endDate.getTime()).toBe(satStart.getTime());
        expect(taskStore.get('t-fs').startDate.getTime()).toBe(monStart.getTime());

        // Dragging across the weekend preserves the 12 working hours.
        const
            thuStart = TimeAxis.parseDayKey('2026-11-12', 0, 0),
            p3Task   = taskStore.add({
                id          : 't1',
                parentId    : null,
                isLeaf      : true,
                title       : '48h Task',
                startDate   : thuStart,
                endDate     : satStart,
                duration    : 48,
                durationUnit: 'hour'
            })[0];

        gantt.moveTask('t1', {
            startDate: '2026-11-14T10:00:00',
            endDate  : '2026-11-16T12:00:00'
        });

        expect(TimeAxis.dayKey(p3Task.startDate)).toBe('2026-11-16');
        expect(p3Task.startDate.getHours()).toBe(0);
        expect(TimeAxis.dayKey(p3Task.endDate)).toBe('2026-11-16');
        expect(p3Task.endDate.getHours()).toBe(12);
        expect(p3Task.duration).toBe(12);

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('working-calendar flip rolls structural children before the parent successor in one batch', () => {
        const at        = (day, hour) => TimeAxis.parseDayKey(`2026-11-${day}`, hour, 0),
              taskStore = Neo.create(TaskStore, {rollupParents:true, data:[
                  {id:'P', isLeaf:false, startDate:at('13', 0), endDate:at('14', 12)},
                  {id:'A', parentId:'P', isLeaf:true, startDate:at('13', 0), endDate:at('14', 0)},
                  {id:'C', parentId:'P', isLeaf:true, startDate:at('13', 12), endDate:at('14', 12)},
                  {id:'B', isLeaf:true, startDate:at('14', 12), endDate:at('15', 12)}
              ]}),
              dependencyStore = Neo.create(DependencyStore, {data:[{id:'PB', fromId:'P', toId:'B', type:'FS', lag:0}]});
        gantt = Neo.create(GanttContainer, {appName, store:taskStore, dependencyStore, timeAxis:{
            start:at('12', 0), end:at('21', 0), nonWorkingDays:[0,6], tickUnit:'hour', tickStep:6, pxPerMinute:0.5
        }});
        const observations = [], batches = [];
        taskStore.on('recordChange', () => observations.push([
            taskStore.get('P').endDate.getTime(), taskStore.get('B').startDate.getTime()
        ]));
        taskStore.on('rowsChange', event => batches.push(event.keys));
        gantt.useWorkingTime = true;
        expect(taskStore.get('P').endDate.getTime()).toBe(at('16', 12).getTime());
        expect(taskStore.get('B').startDate.getTime()).toBe(at('16', 12).getTime());
        expect(taskStore.get('B').endDate.getTime()).toBe(at('17', 12).getTime());
        expect(observations.length).toBeGreaterThan(0);
        expect(observations.every(([parent, successor]) => parent === at('16', 12).getTime() && successor === parent)).toBe(true);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toEqual(expect.arrayContaining(['P','C','B']));
        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('a store batch re-projects the links once', () => {
        const
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 'A', parentId: null, isLeaf: true, title: 'A', startDate: '2026-11-09T00:00:00Z', endDate: '2026-11-09T02:00:00Z'},
                    {id: 'B', parentId: null, isLeaf: true, title: 'B', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T04:00:00Z'},
                    {id: 'C', parentId: null, isLeaf: true, title: 'C', startDate: '2026-11-09T04:00:00Z', endDate: '2026-11-09T06:00:00Z'}
                ]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'ab', fromId: 'A', toId: 'B', type: 'FS', lag: 0, lagUnit: 'hour'},
                    {id: 'bc', fromId: 'B', toId: 'C', type: 'FS', lag: 0, lagUnit: 'hour'}
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            dependencyStore,
            store        : taskStore,
            timeAxis     : {start: '2026-11-09T00:00:00Z', end: '2026-11-10T00:00:00Z', tickUnit: 'hour', tickStep: 1, pxPerMinute: 1, snapMinutes: 15},
            viewportWidth: 2000
        });
        gantt.syncDependencyLayer();

        const
            layer   = gantt.dependencyLayer,
            project = layer.project.bind(layer),
            // The last x of a route is where its arrow ends, in px at 1 px per minute.
            end     = id => Number(layer.arrows.find(arrow => arrow.data.dependencyId === id)?.d.split(' ').at(-2));
        let projects = 0;

        layer.project = (...args) => { projects++; return project(...args) };

        expect(end('ab')).toBe(120);
        expect(end('bc')).toBe(240);

        taskStore.updateRows([
            {key: 'B', values: {startDate: new Date('2026-11-09T03:00:00Z'), endDate: new Date('2026-11-09T05:00:00Z')}},
            {key: 'C', values: {startDate: new Date('2026-11-09T05:00:00Z'), endDate: new Date('2026-11-09T07:00:00Z')}}
        ]);

        expect(projects).toBe(1);
        expect(end('ab')).toBe(180);
        expect(end('bc')).toBe(300);

        projects = 0;
        dependencyStore.updateRows([{key: 'ab', values: {type: 'SS'}}, {key: 'bc', values: {type: 'SS'}}]);

        expect(projects).toBe(1);
        expect(layer.arrows.map(arrow => arrow.data.type)).toEqual(['SS', 'SS']);

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('a batch that reapplies an opted-in filter re-projects once; an explicit filter and a single edit still project', () => {
        const
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 'A', parentId: null, isLeaf: true, title: 'A', startDate: '2026-11-09T00:00:00Z', endDate: '2026-11-09T02:00:00Z', percentDone: 0},
                    {id: 'B', parentId: null, isLeaf: true, title: 'B', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T04:00:00Z', percentDone: 0},
                    {id: 'C', parentId: null, isLeaf: true, title: 'C', startDate: '2026-11-09T04:00:00Z', endDate: '2026-11-09T06:00:00Z', percentDone: 0}
                ],
                filters: [{property: 'percentDone', operator: '<', value: 100, reapplyOnRecordChange: true}]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'ab', fromId: 'A', toId: 'B', type: 'FS', lag: 0, lagUnit: 'hour'},
                    {id: 'bc', fromId: 'B', toId: 'C', type: 'FS', lag: 0, lagUnit: 'hour'}
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            dependencyStore,
            store        : taskStore,
            timeAxis     : {start: '2026-11-09T00:00:00Z', end: '2026-11-10T00:00:00Z', tickUnit: 'hour', tickStep: 1, pxPerMinute: 1, snapMinutes: 15},
            viewportWidth: 2000
        });
        gantt.syncDependencyLayer();

        const
            layer   = gantt.dependencyLayer,
            project = layer.project.bind(layer),
            routes  = () => layer.arrows.map(arrow => arrow.data.dependencyId);
        let projects = 0;

        layer.project = (...args) => { projects++; return project(...args) };

        // The batch finishes B, so the refilter hides it with both of its links, and moves C: one projection, after the filter
        taskStore.updateRows([
            {key: 'B', values: {percentDone: 100}},
            {key: 'C', values: {startDate: new Date('2026-11-09T05:00:00Z'), endDate: new Date('2026-11-09T07:00:00Z')}}
        ]);
        expect(projects).toBe(1);
        expect(taskStore.items.map(task => task.id)).toEqual(['A', 'C']);
        expect(routes()).toEqual([]);

        // A link batch under an active FS filter hides both links: one projection
        taskStore.filters = [];
        dependencyStore.filters = [{property: 'type', value: 'FS', reapplyOnRecordChange: true}];
        expect(routes()).toEqual(['ab', 'bc']);
        projects = 0;
        dependencyStore.updateRows([{key: 'ab', values: {type: 'SS'}}, {key: 'bc', values: {type: 'SS'}}]);
        expect(projects).toBe(1);
        expect(routes()).toEqual([]);

        // An explicit filter and a single edit are not batches: each still projects
        projects = 0;
        dependencyStore.filters = [];
        expect(projects).toBe(1);
        expect(routes()).toEqual(['ab', 'bc']);
        projects = 0;
        taskStore.get('C').set({startDate: new Date('2026-11-09T06:00:00Z'), endDate: new Date('2026-11-09T08:00:00Z')});
        expect(projects).toBe(1);

        // A listener that starts a second batch inside a filtered one: the outer batch's rowsChange projects once for both
        taskStore.filters = [{property: 'percentDone', operator: '<', value: 100, reapplyOnRecordChange: true}];
        let   nested  = 0;
        const reenter = ({record}) => {
            if (record.id === 'A' && nested++ === 0) {
                taskStore.updateRows([{key: 'C', values: {startDate: new Date('2026-11-09T07:00:00Z'), endDate: new Date('2026-11-09T09:00:00Z')}}])
            }
        };
        // A registered schedule analysis hears of the nested date edit once, before the single projection
        const order = [];
        gantt.registerScheduleAnalysis({invalidateSchedule: () => order.push('invalidate'), getHighlights: () => ({})});
        layer.project = (...args) => { projects++; order.push('project'); return project(...args) };
        taskStore.on('recordChange', reenter);
        projects = 0;
        taskStore.updateRows([{key: 'A', values: {percentDone: 50}}]);
        taskStore.un('recordChange', reenter);
        expect(nested).toBe(1);
        expect(projects).toBe(1);
        expect(order).toEqual(['invalidate', 'project']);
        expect(taskStore.isUpdatingRows).toBe(false);

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('toggling useWorkingTime reschedules durations and tight successors through the writer, preserves hand-placed float, and honors schedule services', () => {
        const
            taskStore = Neo.create(TaskStore, {
                data: [
                    {id: 'prep',    parentId: null, isLeaf: true, title: 'Prep',     startDate: '2026-11-04T00:00:00Z', endDate: '2026-11-05T00:00:00Z', duration: 1, durationUnit: 'day'},
                    {id: 'plumb',   parentId: null, isLeaf: true, title: 'Plumbing', startDate: '2026-11-05T00:00:00Z', endDate: '2026-11-12T00:00:00Z', duration: 5, durationUnit: 'day'},
                    {id: 'drywall', parentId: null, isLeaf: true, title: 'Drywall',  startDate: '2026-11-13T00:00:00Z', endDate: '2026-11-17T00:00:00Z', duration: 2, durationUnit: 'day'}
                ]
            }),
            dependencyStore = Neo.create(DependencyStore, {
                data: [
                    {id: 'd1', fromId: 'prep',  toId: 'plumb',   type: 'FS', lag: 0, lagUnit: 'day'},
                    {id: 'd2', fromId: 'plumb', toId: 'drywall', type: 'FS', lag: 0, lagUnit: 'day'}
                ]
            });

        gantt = Neo.create(GanttContainer, {
            appName,
            dependencyStore,
            store         : taskStore,
            useWorkingTime: true,
            timeAxis      : {
                end            : '2026-11-25',
                nonWorkingDates: ['2026-11-12'],
                nonWorkingDays : [0, 6],
                start          : '2026-11-02',
                tickStep       : 1,
                tickUnit       : 'day',
                timeZone       : 'UTC'
            }
        });

        const events = [];
        gantt.on('taskChange', payload => events.push(payload));

        // 1. Switch working time OFF: weekend-crossing `plumb` ends earlier and tight successor `drywall` moves up
        gantt.useWorkingTime = false;

        expect(events).toHaveLength(1);
        expect(events[0].action).toBe('workingTime');
        expect(Object.keys(events[0].changesById).sort()).toEqual(['drywall', 'plumb']);
        expect(taskStore.get('plumb').startDate.toISOString()).toBe('2026-11-05T00:00:00.000Z');
        expect(taskStore.get('plumb').endDate.toISOString()).toBe('2026-11-10T00:00:00.000Z');
        expect(taskStore.get('plumb').duration).toBe(5);
        expect(taskStore.get('drywall').startDate.toISOString()).toBe('2026-11-10T00:00:00.000Z');
        expect(taskStore.get('drywall').endDate.toISOString()).toBe('2026-11-12T00:00:00.000Z');

        // Symmetrical undo check via `previousById`
        for (const [id, prev] of Object.entries(events[0].previousById)) {
            expect(Object.keys(prev)).toEqual(Object.keys(events[0].changesById[id]))
        }

        // 2. Hand-place `plumb` onto Saturday 2026-11-07 while `useWorkingTime` is false (`prevStart > prevReqStart`)
        gantt.moveTask('plumb', {
            startDate: '2026-11-07T00:00:00Z',
            endDate  : '2026-11-12T00:00:00Z'
        });
        expect(taskStore.get('plumb').startDate.toISOString()).toBe('2026-11-07T00:00:00.000Z');
        expect(taskStore.get('drywall').startDate.toISOString()).toBe('2026-11-12T00:00:00.000Z');

        // 3. Switch working time ON: hand-placed `plumb` keeps its manual offset (snapped forward off Saturday to Monday 2026-11-09)
        // rather than snapping back to `prep.endDate` (`2026-11-05`), while tight `drywall` cascades to `2026-11-17..2026-11-19`
        events.length = 0;
        gantt.useWorkingTime = true;

        expect(events).toHaveLength(1);
        expect(taskStore.get('plumb').startDate.toISOString()).toBe('2026-11-09T00:00:00.000Z');
        expect(taskStore.get('plumb').endDate.toISOString()).toBe('2026-11-17T00:00:00.000Z');
        expect(taskStore.get('drywall').startDate.toISOString()).toBe('2026-11-17T00:00:00.000Z');
        expect(taskStore.get('drywall').endDate.toISOString()).toBe('2026-11-19T00:00:00.000Z');

        // 4. Switch working time OFF again: hand-placed `2026-11-09` start is preserved; `drywall` moves up to `2026-11-14`
        gantt.useWorkingTime = false;
        expect(taskStore.get('plumb').startDate.toISOString()).toBe('2026-11-09T00:00:00.000Z');
        expect(taskStore.get('plumb').endDate.toISOString()).toBe('2026-11-14T00:00:00.000Z');
        expect(taskStore.get('drywall').startDate.toISOString()).toBe('2026-11-14T00:00:00.000Z');
        expect(taskStore.get('drywall').endDate.toISOString()).toBe('2026-11-16T00:00:00.000Z');

        // 5. External schedule service intercepts calendar-switch proposals
        const refusedResults = [], serviceCalls = [];
        gantt.on('scheduleResult', payload => refusedResults.push(payload));
        gantt.schedule = {
            store          : taskStore,
            dependencyStore,
            moveTask(key, proposal) {
                serviceCalls.push(key);
                return {status: 'refused', message: 'Frozen schedule', proposal}
            }
        };

        events.length = 0;
        gantt.useWorkingTime = true;
        expect(serviceCalls).toEqual(['plumb', 'drywall']);
        expect(refusedResults).toHaveLength(2);
        expect(events).toHaveLength(0);
        expect(taskStore.get('plumb').endDate.toISOString()).toBe('2026-11-14T00:00:00.000Z');

        dependencyStore.destroy();
        taskStore.destroy()
    });

    test('the service that admits an edit decides it, even when its admission replaces the schedule', () => {
        const taskStore       = Neo.create(TaskStore, {data: [{id: 'a', parentId: null, isLeaf: true, startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T04:00:00Z'}]}),
              dependencyStore = Neo.create(DependencyStore, {data: []}),
              otherStore      = Neo.create(TaskStore, {data: []}),
              calls           = [],
              service         = (name, store, replace) => ({
                  dependencyStore,
                  store,
                  handlesTask() { gantt.schedule = replace(); return true },
                  moveTask()    { calls.push(name); return {status: 'refused', message: name} }
              });

        gantt = Neo.create(GanttContainer, {appName, store: taskStore, dependencyStore,
            timeAxis: {start: '2026-11-09', end: '2026-11-10', timeZone: 'UTC'}});

        try {
            // Admission clears the schedule, then installs a service bound to other stores
            for (const replace of [() => null, () => service('B', otherStore, () => null)]) {
                calls.length   = 0;
                gantt.schedule = service('A', taskStore, replace);
                expect(gantt.moveTask('a', {startDate: '2026-11-09T05:00:00Z', endDate: '2026-11-09T07:00:00Z'}))
                    .toEqual({status: 'refused', message: 'A'});
                expect(calls).toEqual(['A']);
                expect(taskStore.get('a').startDate.toISOString()).toBe('2026-11-09T02:00:00.000Z')
            }
        } finally {
            gantt.schedule = null;
            gantt.destroy();
            gantt = null;
            dependencyStore.destroy();
            otherStore.destroy();
            taskStore.destroy()
        }
    });
});
