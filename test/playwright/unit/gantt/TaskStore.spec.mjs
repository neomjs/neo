import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import TaskStore from '../../../../src/gantt/TaskStore.mjs';
import TaskModel from '../../../../src/gantt/TaskModel.mjs';

setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false},
    appConfig: {name: 'GanttTaskRollupTest', isMounted: () => true}});

class BookingTaskModel extends TaskModel {
    static config = {className:'Test.Unit.Gantt.BookingTaskModel', fields:[{name:'status',type:'String'}]}
}
Neo.setupClass(BookingTaskModel);

const bookingRows = () => [
    {id:'p', isLeaf:false, collapsed:false},
    {id:'a', parentId:'p', isLeaf:true, status:'ready', resourceId:'1', startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'},
    {id:'b', parentId:'p', isLeaf:true, status:'done', resourceId:'2', startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'},
    {id:'gate', parentId:'p', isLeaf:true, milestone:true, status:'ready', resourceId:'1', startDate:'2026-01-01T01:00Z', endDate:'2026-01-01T01:00Z'}
];

test('booking view borrows canonical leaves and stays independent of tree expansion', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}),
        view    = store.getBookingStore(), a = store.get('a'), range = ['2026-01-01T00:00Z','2026-01-01T01:00Z'];
    try {
        expect(store.getBookingStore()).toBe(view);
        expect(view.model).not.toBe(store.model);
        expect(store.model.storeId).toBe(store.id);
        expect(view.model.getField('status')).toBeTruthy();
        expect(view.get('a')).toBe(a);
        expect(store.getRangeRecords(...range, 1).map(item => item.id)).toEqual(['a']);
        expect(view.getRangeRecords('2026-01-01T01:00Z','2026-01-01T02:00Z', 1).map(item => item.id)).toEqual(['gate']);
        let loads = 0;
        view.on('load', () => loads++);
        store.collapse('p');
        expect(store.getRangeRecords(...range).map(item => item.id)).toEqual([]);
        expect(view.get('a')).toBe(a);
        expect(store.getRangeRecords(...range, 1).map(item => item.id)).toEqual(['a']);
        expect(loads).toBe(0);
        store.expand('p');
        expect(store.get('a')).toBe(a);
        expect(view.get('a')).toBe(a)
    } finally { store.destroy() }
    expect(view.isDestroyed).toBe(true)
});

test('booking view forwards edits and batches and owns its filter, not the tree filter', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore();
    try {
        const changes = [], batches = [];
        view.on({recordChange: event => changes.push(event.record.id), rowsChange: event => batches.push(event.keys)});
        view.filters = [{property:'status', operator:'===', value:'ready', reapplyOnRecordChange:true}];
        expect(view.items.map(item => item.id)).toEqual(['a','gate']);
        expect(store.getCount()).toBe(4);
        store.collapse('p');
        store.updateRows([{key:'a', values:{status:'done', resourceId:'2'}}]);
        expect(view.items.map(item => item.id)).toEqual(['gate']);
        expect(changes).toContain('a');
        expect(batches).toEqual([['a']]);
        view.clearFilters();
        expect(view.get('a')).toBe(store.get('a'));
        expect(view.getRangeRecords('2026-01-01T00:00Z','2026-01-01T01:00Z', '2').map(item => item.id)).toEqual(['a','b'])
    } finally { store.destroy() }
});

test('booking membership reconciles additions, removals, reparenting and reload without replacing unchanged records', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore(),
        a       = store.get('a');
    try {
        store.collapse('p');
        store.add({id:'c', parentId:'p', isLeaf:true, status:'ready', resourceId:'1', startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'});
        expect(view.get('c')).toBe(store.get('c'));
        expect(view.get('a')).toBe(a);
        store.add({id:'a', parentId:null});
        expect(view.get('a')).toBe(a);
        store.remove('c');
        expect(view.get('c')).toBeNull();
        expect(view.get('a')).toBe(a);
        store.setData(bookingRows());
        expect(view.get('a')).toBe(store.get('a'));
        expect(view.getCount()).toBe(3)
    } finally { store.destroy() }
});

test('clearing a fully filtered tree clears its structural booking view', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore();
    try {
        store.filters = [{property:'id', operator:'===', value:'absent'}];
        expect(store.getCount()).toBe(0);
        expect(view.getCount()).toBe(3);
        store.remove('b');
        expect(view.get('b')).toBeNull();
        expect(view.getCount()).toBe(2);
        store.clear();
        expect(view.getCount()).toBe(0)
    } finally { store.destroy() }
});

test('structural changes preserve the booking view filter and its hidden canonical rows', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore();
    try {
        view.filters = [{property:'status', operator:'===', value:'ready', reapplyOnRecordChange:true}];
        store.collapse('p');
        store.add({id:'c', parentId:'p', isLeaf:true, status:'done', resourceId:'1', startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'});
        expect(view.items.map(item => item.id)).toEqual(['a','gate']);
        expect(view.getRow('c')).toBe(store.get('c'));
        store.remove('b');
        expect(view.getRow('b')).toBeUndefined();
        store.get('c').set({status:'ready'});
        expect(new Set(view.items.map(item => item.id))).toEqual(new Set(['a','gate','c']));
        expect(store.getCount()).toBe(1)
    } finally { store.destroy() }
});

test('re-keying a canonical leaf keeps the booking maps and later clear consistent', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore(),
        record  = store.get('a');
    try {
        view.filters = [{property:'status', operator:'===', value:'done'}];
        store.updateKey(record, 'a-new');
        expect(view.getRow('a')).toBeUndefined();
        expect(view.getRow('a-new')).toBe(record);
        view.clearFilters();
        expect(view.get('a-new')).toBe(record);
        store.clear();
        expect(view.getCount()).toBe(0)
    } finally { store.destroy() }
});

test('changing a childless node between leaf and phase updates booking membership', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore(),
        record  = store.get('a');
    try {
        record.set({isLeaf:false});
        expect(view.get('a')).toBeNull();
        record.set({isLeaf:true});
        expect(view.get('a')).toBe(record)
    } finally { store.destroy() }
});

test('silent hidden structural writes update the booking view without mutation events', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore();
    try {
        let sourceMutations = 0, viewMutations = 0;
        store.collapse('p');
        store.on('mutate', () => sourceMutations++);
        view.on('mutate', () => viewMutations++);
        store.splice(null, [], [{id:'hidden', parentId:'p', isLeaf:true, status:'ready', resourceId:'1',
            startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'}], true);
        expect(view.get('hidden')).toBe(store.get('hidden'));
        store.splice(null, ['hidden'], null, true);
        expect(view.get('hidden')).toBeNull();
        expect(sourceMutations).toBe(0);
        expect(viewMutations).toBe(0)
    } finally { store.destroy() }
});

test('source mutation observers see settled booking membership even when registered first', () => {
    const store = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()});
    let view, observations = [];
    try {
        store.collapse('p');
        store.on('mutate', () => observations.push({source:store.get('c'), view:view.get('c')}));
        view = store.getBookingStore();
        store.add({id:'c', parentId:'p', isLeaf:true, status:'ready', resourceId:'1',
            startDate:'2026-01-01T00:00Z', endDate:'2026-01-01T01:00Z'});
        store.remove('c');
        expect(observations).toHaveLength(2);
        expect(observations[0].view).toBe(observations[0].source);
        expect(observations[0].source).toBeTruthy();
        expect(observations[1].view).toBeFalsy();
        expect(observations[1].source).toBeFalsy()
    } finally { store.destroy() }
});

test('tree collapse, expansion and filtering do not sweep structural booking membership', async () => {
    const store  = Neo.create(TaskStore, {model:BookingTaskModel, data:bookingRows()}), view = store.getBookingStore(),
        original = store.getChildren.bind(store), visits = [];
    try {
        store.getChildren = key => { visits.push(key); return original(key) };
        store.collapse('p');
        await store.expand('p');
        store.filters = [{property:'id', operator:'===', value:'absent'}];
        expect(visits).toEqual([]);
        expect(view.getCount()).toBe(3)
    } finally { store.destroy() }
});

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
