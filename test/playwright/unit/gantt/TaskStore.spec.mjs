import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import TaskStore from '../../../../src/gantt/TaskStore.mjs';

setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false},
    appConfig: {name: 'GanttTaskRollupTest', isMounted: () => true}});

const rows = () => [
    {id:'p', isLeaf:false, startDate:'2026-01-01T00:00Z', endDate:'2026-01-20T00:00Z'},
    {id:'q', parentId:'p', isLeaf:false, startDate:'2026-01-01T00:00Z', endDate:'2026-01-20T00:00Z'},
    {id:'a', parentId:'q', isLeaf:true, startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z', percentDone:100},
    {id:'b', parentId:'q', isLeaf:true, startDate:'2026-01-01T09:00Z', endDate:'2026-01-01T10:00Z', percentDone:0},
    {id:'c', parentId:'p', isLeaf:true, startDate:'2026-01-01T02:00Z', endDate:'2026-01-01T04:00Z', percentDone:100}
];

test('opt-in phases use structural leaf work, including collapsed and filtered children', () => {
    const store = Neo.create(TaskStore, {data: rows(), rollupParents:true});
    try {
        const p = store.get('p'), q = store.get('q');
        expect(p.percentDone).toBe(75);
        expect(q.percentDone).toBe(50);
        expect(p.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(p.endDate.toISOString()).toBe('2026-01-01T10:00:00.000Z');
        store.collapse('q');
        store.filters = [{property:'id', operator:'===', value:'c'}];
        store.get('b').percentDone = 100;
        expect(q.percentDone).toBe(100);
        expect(p.percentDone).toBe(100);
        expect(store.rollupParentTasks()).toEqual([])
    } finally { store.destroy() }
});

test('batch observers see final parent values and disabling retains them', () => {
    const store = Neo.create(TaskStore, {data:rows(), rollupParents:true});
    try {
        const p        = store.get('p'), q = store.get('q');
        const observed = [], batches = [];
        store.on('recordChange', () => observed.push(p.endDate.toISOString()));
        store.on('rowsChange', event => batches.push(event.keys));
        store.updateRows([{key:'b', values:{endDate:new Date('2026-01-01T11:00Z')}},
            {key:'p', values:{endDate:new Date('2026-02-01T00:00Z'), title:'Phase'}}]);
        expect(observed.every(value => value === '2026-01-01T11:00:00.000Z')).toBe(true);
        expect(observed.length).toBeGreaterThan(0);
        expect(batches).toHaveLength(1);
        expect(new Set(batches[0])).toEqual(new Set(['b','q','p']));
        expect(p.title).toBe('Phase');
        expect(p.endDate.toISOString()).toBe('2026-01-01T11:00:00.000Z');
        expect(store.isDerivedParent(q)).toBe(true);
        store.rollupParents = false;
        store.get('b').endDate = new Date('2026-01-01T12:00Z');
        expect(p.endDate.toISOString()).toBe('2026-01-01T11:00:00.000Z');
        expect(store.isDerivedParent(p)).toBe(false);
        store.rollupParents = true;
        expect(p.endDate.toISOString()).toBe('2026-01-01T12:00:00.000Z')
    } finally { store.destroy() }
});

test('add, remove, reparent and reload settle the structural ancestors', () => {
    const store = Neo.create(TaskStore, {data:rows(), rollupParents:true});
    try {
        store.add({id:'d', parentId:'p', isLeaf:true, startDate:'2026-01-01T12:00Z', endDate:'2026-01-01T14:00Z', percentDone:0});
        expect(store.get('p').endDate.toISOString()).toBe('2026-01-01T14:00:00.000Z');
        store.remove('d');
        expect(store.get('p').endDate.toISOString()).toBe('2026-01-01T10:00:00.000Z');
        store.add({id:'b', parentId:'p'});
        expect(store.getChildren('q').map(item => item.id)).toEqual(['a']);
        expect(store.get('q').endDate.toISOString()).toBe('2026-01-01T01:00:00.000Z');
        expect(store.get('p').percentDone).toBe(75);
        store.setData(rows());
        expect(store.get('q').percentDone).toBe(50);
        expect(store.get('p').percentDone).toBe(75)
    } finally { store.destroy() }
});

test('zero-duration and empty phases avoid invalid dates and division by zero', () => {
    const store = Neo.create(TaskStore, {rollupParents:true, data:[
        {id:'p', isLeaf:false, startDate:'2026-01-01T00:00Z', endDate:'2026-01-02T00:00Z', percentDone:70},
        {id:'point', parentId:'p', isLeaf:true, startDate:'2026-01-03T00:00Z', endDate:'2026-01-03T00:00Z', percentDone:90}
    ]});
    try {
        const parent = store.get('p');
        expect(parent.startDate.toISOString()).toBe('2026-01-03T00:00:00.000Z');
        expect(parent.endDate.toISOString()).toBe('2026-01-03T00:00:00.000Z');
        expect(parent.percentDone).toBe(0);
        store.remove('point');
        expect(store.isDerivedParent(parent)).toBe(false);
        expect(parent.endDate.toISOString()).toBe('2026-01-03T00:00:00.000Z')
    } finally { store.destroy() }
});

test('batch updates settle parent fields and single-parent calls return only real changes', () => {
    const store = Neo.create(TaskStore, {data:rows(), rollupParents:true});
    try {
        store.updateRows([{key:'a', values:{percentDone:0}}, {key:'b', values:{percentDone:100}}]);
        expect(store.get('q').percentDone).toBe(50);
        expect(store.get('p').percentDone).toBe(75);
        const pending = new Map([[store.get('a'), {percentDone:100}]]);
        const changed = store.planParentRollup(store.get('q'), pending);
        expect(changed.previous.percentDone).toBe(50);
        expect(changed.changes.percentDone).toBe(100);
        expect(store.get('q').percentDone).toBe(50);
        expect(store.planParentRollups(pending).map(item => item.record.id)).toEqual(['q','p']);
        expect(store.planParentRollup(store.get('p'), pending).changes.percentDone).toBe(100)
    } finally { store.destroy() }
});

test('Turbo rows and explicit parent writes join one batch with Number field semantics', () => {
    const store = Neo.create(TaskStore, {data:rows(), rollupParents:true, autoInitRecords:false});
    try {
        const p            = store.get('p');
        const observations = [];
        store.on('recordChange', () => observations.push(p.percentDone));
        store.updateRows([{key:'a', values:{percentDone:'50'}}, {key:'p', values:{percentDone:999}}]);
        // Number fields retain strings in RecordFactory; the rollup admits finite numbers only.
        expect(store.get('a').percentDone).toBe('50');
        expect(p.percentDone).toBe(50);
        expect(observations.every(value => value === 50)).toBe(true);
        expect(observations.length).toBeGreaterThan(0);
        store.updateRows([{key:'p', values:{percentDone:999}}]);
        expect(p.percentDone).toBe(50)
    } finally { store.destroy() }
});

test('title-only batches skip planning and a leaf edit avoids unrelated roots', () => {
    const store = Neo.create(TaskStore, {rollupParents:true, data:[...rows(),
        {id:'other', isLeaf:false}, {id:'other-leaf', parentId:'other', isLeaf:true,
            startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'}]});
    try {
        const original = store.getChildren.bind(store), visits = [];
        store.getChildren = key => { visits.push(key); return original(key) };
        store.updateRows([{key:'a', values:{title:'Renamed'}}]);
        expect(visits).toEqual([]);
        store.updateRows([{key:'a', values:{percentDone:50}}]);
        expect(visits).not.toContain('other');
        expect(store.get('p').percentDone).toBe(62.5);
        store.rollupParents = false;
        visits.length = 0;
        store.updateRows([{key:'a', values:{percentDone:100}}]);
        expect(visits).toEqual([])
    } finally { store.destroy() }
});
