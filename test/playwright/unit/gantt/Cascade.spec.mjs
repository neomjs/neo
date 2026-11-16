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
        resolveTaskRecord: key => tasks.get(key),
        addLag(...args) { return Cascade.addLag(this, ...args) },
        convertLagToMs(...args) { return Cascade.convertLagToMs(...args) },
        computeRequiredStartMs(...args) { return Cascade.computeRequiredStartMs(this, ...args) }
    };
    try {
        const changed = Cascade.runDependencyCascade(owner, tasks.get('key-0'));
        expect(changed).toHaveLength(count - 1);
        expect(reads).toBe(count - 1);
        expect(tasks.get('key-1').startDate.getTime()).toBe(epoch + 6 * 60_000);
        expect(tasks.get(`key-${count - 1}`).startDate.getTime()).toBe(epoch + (count + 4) * 60_000)
    } finally { edges.destroy(); tasks.destroy(); model.destroy() }
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
