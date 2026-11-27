import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Cascade         from '../../../../src/gantt/Cascade.mjs';
import Gantt           from '../../../../src/gantt/Container.mjs';
import TaskModel       from '../../../../src/gantt/TaskModel.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';

setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false},
    appConfig: {name: 'GanttCascadeTest', isMounted: () => true}});

test('a phase and its outgoing successor settle in the same store batch across two charts', () => {
    Neo.ns('Neo.main.addon.DragDrop', true);
    Neo.main.addon.DragDrop = {setConfigs: async () => ({})};
    const at    = hour => new Date(Date.UTC(2026, 10, 9, hour));
    const tasks = Neo.create(TaskStore, {rollupParents: true, data: [
        {id: 'phase', isLeaf: false},
        {id: 'child', parentId: 'phase', isLeaf: true, startDate: at(2), endDate: at(4), percentDone: 50},
        {id: 'marker', parentId: 'phase', isLeaf: true, milestone: true, startDate: at(3), endDate: at(3), percentDone: 100},
        {id: 'gate', isLeaf: true, milestone: true, startDate: at(4), endDate: at(4)},
        {id: 'next', isLeaf: true, startDate: at(4), endDate: at(6)}
    ]});
    const edges = Neo.create(DependencyStore, {data: [
        {id: 'phase-gate', fromId: 'phase', toId: 'gate', type: 'FS'},
        {id: 'handoff', fromId: 'gate', toId: 'next', type: 'FS'}
    ]});
    const config = {appName: 'GanttCascadeTest', store: tasks, dependencyStore: edges,
        timeAxis: {timeZone: 'UTC', start: at(0), end: at(24), snapMinutes: 15}};
    const first   = Neo.create(Gantt, config), second = Neo.create(Gantt, config);
    const batches = [], observations = [], phase = tasks.get('phase'), next = tasks.get('next');
    tasks.on({
        recordChange: () => observations.push([phase.endDate.getTime(), next.startDate.getTime()]),
        rowsChange  : ({keys}) => batches.push(keys)
    });

    try {
        const result = first.moveTask('child', {startDate: at(4), endDate: at(6)});
        expect(result.cascaded.map(item => item.record.id)).toEqual(['phase', 'gate', 'next']);
        expect(batches).toEqual([['child', 'phase', 'gate', 'next']]);
        expect(observations.length).toBeGreaterThan(0);
        for (const pair of observations) expect(pair).toEqual([+at(6), +at(6)]);
        expect(second.store.get('phase')).toBe(phase);
        expect(next.endDate).toEqual(at(8));

        first.dependencyCreation = true;
        expect(first.linkTasks({fromId: 'next', toId: 'child'}).reason).toBe('cycle');
        expect(first.linkTasks({fromId: 'next', toId: 'phase'}).reason).toBe('invalid-endpoints');
        expect(second.moveTask('phase', {startDate: at(7)})?.status).toBe('refused');
        expect(second.getBarDragContext({getLinkTerminal: () => null}, [], phase)).toBeNull();
        second.moveTask('child', {endDate: at(7)}, {resizeEdge: 'end'});
        expect(first.store.get('phase').endDate).toEqual(at(7));
        expect(next.startDate).toEqual(at(7));

        second.moveTask('marker', {startDate: at(9)});
        expect([phase.endDate, phase.percentDone]).toEqual([at(9), 50]);
        const gate = tasks.get('gate');
        expect([gate.startDate, gate.endDate, next.startDate]).toEqual([at(9), at(9), at(9)])
    } finally {
        second.destroy();
        first.destroy();
        edges.destroy();
        tasks.destroy()
    }
});

test('a cascade uses task keys and scans the dependency population once', () => {
    const count = 80, epoch = Date.UTC(2026, 0, 1),
        model   = Neo.create(TaskModel, {fields: [...TaskModel.config.fields, {name: 'key'}]}),
        tasks   = Neo.create(TaskStore, {model, keyProperty: 'key', data: Array.from({length: count}, (_, i) => ({
            id       : `id-${i}`, key: `key-${i}`, isLeaf: true, parentId: null,
            startDate: new Date(epoch + (i === 0 ? 5 : 0) * 60_000),
            endDate  : new Date(epoch + (i === 0 ? 6 : 1) * 60_000)
        }))}),
        edges = Neo.create(DependencyStore, {data: Array.from({length: count - 1}, (_, i) => ({
            id: `edge-${i}`, fromId: `key-${i}`, toId: `key-${i + 1}`, type: 'FS'
        }))});
    const getAt = edges.getAt.bind(edges);
    let   reads = 0;
    edges.getAt = index => { reads++; return getAt(index) };
    edges.getSuccessors = edges.getPredecessors = () => { throw Error('unexpected repeated edge scan') };
    const owner = {
        store            : tasks, dependencyStore: edges, timeAxis: null, startDateField: 'startDate', endDateField: 'endDate',
        resolveTaskRecord: key => tasks.get(key)
    };
    const cascade = Neo.create(Cascade, {chart: owner});
    try {
        const changed = cascade.runDependencyCascade(tasks.get('key-0'));
        expect(changed).toHaveLength(count - 1);
        expect(reads).toBe(count - 1);
        expect(tasks.get('key-1').startDate.getTime()).toBe(epoch + 6 * 60_000);
        expect(tasks.get(`key-${count - 1}`).startDate.getTime()).toBe(epoch + (count + 4) * 60_000)
    } finally { cascade.destroy(); edges.destroy(); tasks.destroy(); model.destroy() }
});

class BufferedEdgeCascade extends Cascade {
    static config = {
        className: 'Test.Unit.Gantt.Cascade.BufferedEdgeCascade',
        bufferMs : 0
    }

    computeRequiredStartMs(options) {
        let extraMs = options.edge?.id === 'ab' ? this.bufferMs : 0;
        return super.computeRequiredStartMs(options) + extraMs
    }
}

BufferedEdgeCascade = Neo.setupClass(BufferedEdgeCascade);

test('a Cascade subclass configured on the chart overrides per-edge placement and honors owned vs borrowed lifecycle', () => {
    Neo.ns('Neo.main.addon.DragDrop', true);
    Neo.main.addon.DragDrop = {setConfigs: async () => ({})};

    const at    = hour => new Date(Date.UTC(2026, 10, 9, hour)),
          tasks = Neo.create(TaskStore, {data: [
              {id: 'a', parentId: null, isLeaf: true, startDate: at(1), endDate: at(2), duration: 1, durationUnit: 'hour'},
              {id: 'b', parentId: null, isLeaf: true, startDate: at(2), endDate: at(3), duration: 1, durationUnit: 'hour'},
              {id: 'c', parentId: null, isLeaf: true, startDate: at(3), endDate: at(4), duration: 1, durationUnit: 'hour'}
          ]}),
          edges    = Neo.create(DependencyStore, {data: [
              {id: 'ab', fromId: 'a', toId: 'b', type: 'FS', lag: 0, lagUnit: 'minute'},
              {id: 'bc', fromId: 'b', toId: 'c', type: 'FS', lag: 0, lagUnit: 'minute'}
          ]}),
          borrowed = Neo.create(BufferedEdgeCascade, {bufferMs: 3_600_000}),
          chart    = Neo.create(Gantt, {
              appName        : 'GanttCascadeTest',
              cascade        : {module: BufferedEdgeCascade, bufferMs: 2 * 3_600_000},
              dependencyStore: edges,
              store          : tasks,
              timeAxis       : {timeZone: 'UTC', start: at(0), end: at(24), snapMinutes: 15}
          }),
          owned    = chart.cascade;

    let defaultCascade;

    try {
        expect(owned).toBeInstanceOf(BufferedEdgeCascade);
        expect(owned.chart).toBe(chart);

        chart.moveTask('a', {startDate: at(2), endDate: at(3)});
        expect(tasks.get('b').startDate).toEqual(at(5));
        expect(tasks.get('b').endDate).toEqual(at(6));
        expect(tasks.get('c').startDate).toEqual(at(6));
        expect(tasks.get('c').endDate).toEqual(at(7));

        chart.cascade = borrowed;
        expect(owned.isDestroyed).toBe(true);
        expect(borrowed.chart).toBe(chart);

        chart.moveTask('a', {startDate: at(3), endDate: at(4)});
        expect(tasks.get('b').startDate).toEqual(at(5));
        expect(tasks.get('c').startDate).toEqual(at(6));

        chart.cascade  = null;
        defaultCascade = chart.cascade;
        expect(borrowed.isDestroyed).toBeFalsy();
        expect(borrowed.chart).toBeNull();
        expect(defaultCascade).toBeInstanceOf(Cascade);
        expect(defaultCascade).not.toBe(borrowed);
        expect(defaultCascade.chart).toBe(chart);

        chart.moveTask('a', {startDate: at(4), endDate: at(5)});
        expect(tasks.get('b').startDate).toEqual(at(5));
        expect(tasks.get('c').startDate).toEqual(at(6))
    } finally {
        chart.destroy();
        expect(defaultCascade?.isDestroyed).toBe(true);
        expect(borrowed.isDestroyed).toBeFalsy();
        borrowed.destroy();
        edges.destroy();
        tasks.destroy()
    }
});

for (const working of [false, true]) test(`successor dates remain required beyond the visible axis (${working ? 'working' : 'elapsed'} time)`, () => {
    Neo.ns('Neo.main.addon.DragDrop', true);
    Neo.main.addon.DragDrop = {setConfigs: async () => ({}), setDragProxyElement: async () => ({})};
    const date = hour => `2026-11-13T${hour}:00:00Z`, tasks = Neo.create(TaskStore, {data: [
        {id: 'a', isLeaf: true, startDate: date('06'), endDate: date('16')},
        {id: 'b', isLeaf: true, startDate: date('08'), endDate: date('18')}
    ]}), edges = Neo.create(DependencyStore, {data: [{id: 'ab', fromId: 'a', toId: 'b', type: 'FS'}]});
    const chart = Neo.create(Gantt, {appName: 'GanttCascadeTest', store: tasks, dependencyStore: edges,
        useWorkingTime: working, timeAxis: {timeZone: 'UTC', start: '2026-11-13', end: '2026-11-14', nonWorkingDays: [0, 6]}});
    const events = [];
    chart.on('taskChange', event => events.push(event));
    try {
        const result      = chart.moveTask('a', {startDate: date('08'), endDate: date('18')});
        const expectedEnd = working ? '2026-11-16T04:00:00.000Z' : '2026-11-14T04:00:00.000Z';
        const successor   = tasks.get('b');
        expect(successor.startDate.toISOString()).toBe('2026-11-13T18:00:00.000Z');
        expect(successor.endDate.toISOString()).toBe(expectedEnd);
        expect(result.cascaded[0].changes.startDate.toISOString()).toBe('2026-11-13T18:00:00.000Z');
        expect(result.cascaded[0].changes.endDate.toISOString()).toBe(expectedEnd);
        expect(events).toHaveLength(1);
        expect(events[0].changesById.b.startDate.toISOString()).toBe('2026-11-13T18:00:00.000Z');
        expect(events[0].changesById.b.endDate.toISOString()).toBe(expectedEnd);
        expect(tasks.get('a').startDate.toISOString()).toBe('2026-11-13T08:00:00.000Z');
        expect(tasks.get('a').endDate.toISOString()).toBe('2026-11-13T18:00:00.000Z');

        if (!working) {
            chart.moveTask('a', {startDate: date('20'), endDate: '2026-11-14T06:00:00Z'});
            expect(tasks.get('a').startDate.toISOString()).toBe('2026-11-13T14:00:00.000Z');
            expect(tasks.get('a').endDate.toISOString()).toBe('2026-11-14T00:00:00.000Z');
            expect(successor.startDate.toISOString()).toBe('2026-11-14T00:00:00.000Z');
            expect(successor.endDate.toISOString()).toBe('2026-11-14T10:00:00.000Z')
        }
    } finally { chart.destroy(); tasks.destroy(); edges.destroy() }
});
