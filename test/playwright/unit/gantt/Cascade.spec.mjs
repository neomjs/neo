import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Cascade         from '../../../../src/gantt/Cascade.mjs';
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
