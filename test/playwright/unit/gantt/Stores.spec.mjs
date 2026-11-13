import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';

setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false},
    appConfig: {name: 'GanttStoresTest', isMounted: () => true}});

test('task ranges retain tree identity and dependency admission refuses duplicate and cyclic edges', () => {
    const tasks = Neo.create(TaskStore, {data: [
        {id: 'a', title: 'A', isLeaf: true, startDate: '2026-01-01T01:00Z', endDate: '2026-01-01T02:00Z'},
        {id: 'b', title: 'B', isLeaf: true, startDate: '2026-01-01T02:00Z', endDate: '2026-01-01T02:00Z'}
    ]});
    const edges = Neo.create(DependencyStore, {data: []});
    try {
        expect(tasks.getRangeRecords('2026-01-01T02:00Z', '2026-01-01T02:00Z').map(row => row.id)).toEqual(['b']);
        expect(edges.addFinishToStart({fromId: 'a', toId: 'b', id: 'ab'}).status).toBe('committed');
        expect(edges.getSuccessors('a').map(edge => edge.id)).toEqual(['ab']);
        expect(edges.getPredecessors('b').map(edge => edge.id)).toEqual(['ab']);
        expect(edges.addFinishToStart({fromId: 'a', toId: 'b'}).reason).toBe('duplicate');
        expect(edges.addFinishToStart({fromId: 'b', toId: 'a'}).reason).toBe('cycle');
        expect(edges.getCount()).toBe(1)
    } finally { tasks.destroy(); edges.destroy() }
});

test('generated edge ids skip persisted keys while explicit collisions are refused', () => {
    const edges    = Neo.create(DependencyStore, {data: [{id: 'gantt-link-1', fromId: 'a', toId: 'b', type: 'FS'}]});
    const original = Neo.getId;
    let   next     = 0;
    Neo.getId = () => `gantt-link-${++next}`;
    try {
        expect(edges.addFinishToStart({fromId: 'c', toId: 'd', id: 'gantt-link-1'}).reason).toBe('duplicate-id');
        expect(edges.addFinishToStart({fromId: 'c', toId: 'd'})).toMatchObject({status: 'committed', edge: {id: 'gantt-link-2'}})
    } finally { Neo.getId = original; edges.destroy() }
});
