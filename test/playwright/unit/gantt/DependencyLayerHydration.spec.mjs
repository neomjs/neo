import {expect, test} from '@playwright/test';
import {setup}        from '../../setup.mjs';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import RecordFactory   from '../../../../src/data/RecordFactory.mjs';
import TimeAxis        from '../../../../src/timeline/TimeAxis.mjs';
import DependencyLayer from '../../../../src/gantt/DependencyLayer.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';
import TaskModel       from '../../../../src/gantt/TaskModel.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';

const appName = 'GanttLayerHydration', stamp = h => new Date(Date.UTC(2026, 0, 1, h));
setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false}, appConfig: {name: appName, isMounted: () => true}});

function rows() {
    return ['team', 'a', 'b', 'c', 'extra', 'tail'].map((id, i) => ({
        id, key: 'store-' + id, title: id, parentId: i > 0 && i < 4 ? 'team' : null, isLeaf: i > 0,
        collapsed: false, startDate: stamp(i), endDate: stamp(i + 1)
    }))
}
const links  = [{id: 'a-b', fromId: 'a', toId: 'b', type: 'FS'}, {id: 'a-c', fromId: 'a', toId: 'c', type: 'FF'}];
const warm   = store => store.items.filter(row => RecordFactory.isRecord(row)).map(row => row.key ?? row.id);
const routes = layer => layer.project().map(({d, data}) => [data.dependencyId, data.fromId, data.toId, d]);
function open(data, edges, options={}) {
    const {model, Store=TaskStore, ...config} = options;
    const store        = Neo.create(Store, {autoInitRecords: false, initialChunkSize: 0, ...config, ...(model && {model}), data});
    const dependencies = Neo.create(DependencyStore, {autoInitRecords: false, data: edges});
    const axis         = Neo.create(TimeAxis, {start: stamp(0), end: stamp(12), pxPerMinute: 1});
    const layer        = Neo.create(DependencyLayer, {appName, taskStore: store, dependencyStore: dependencies, timeAxis: axis});
    return {store, layer, dependencies, dispose() { layer.destroy(); axis.destroy(); dependencies.destroy(); store.destroy() }}
}

test('an empty dependency collection neither enumerates nor hydrates the visible task population', () => {
    const f = open(rows(), []);
    try {
        expect(warm(f.store)).toEqual([]);
        Object.defineProperty(f.store, 'items', {configurable: true, get() { throw Error('empty edge set scanned tasks') }});
        expect(routes(f.layer)).toEqual([]);
        delete f.store.items;
        const selected = f.store.getAt(1);
        expect(selected.id).toBe('a');
        expect(warm(f.store)).toEqual(['a'])
    } finally { delete f.store.items; f.dispose() }
});

test('a plain id reads the original input when a prior schema kept a converted id on the raw row', () => {
    const fields = TaskModel.config.fields.map(f => f.name === 'id' ? {name: 'id', convert: v => 'converted-' + v} : f);
    const model  = Neo.create(TaskModel, {fields: [...fields, {name: 'key'}]});
    const data   = rows().map(r => ({...r, parentId: null, isLeaf: true}));
    const f      = open(data, [], {model, keyProperty: 'key'});
    try {
        const raw = f.store.items.find(r => r.id === 'b');
        expect(f.store.resolveField(raw, 'id')).toBe('converted-b');
        model.fields = model.fields.map(field => field.name === 'id' ? {name:'id'} : field);
        expect(raw.id).toBe('converted-b');
        f.dependencies.add({...links[0]});
        expect(routes(f.layer).map(p => p[0])).toEqual(['a-b']);
        expect(f.store.get('store-b').id).toBe('b');
        expect(warm(f.store)).toEqual(['store-a', 'store-b'])
    } finally { f.dispose(); model.destroy() }
});

test('only visible sparse endpoints become records and keep their native paths through sort, filter and collapse', () => {
    const cold                         = open(rows(), []), reference = open(rows(), links, {autoInitRecords: true});
    const {store, layer, dependencies} = cold, held = store.get('b');
    try {
        dependencies.add(links.map(e => ({...e})));
        expect(routes(layer)).toEqual(routes(reference.layer));
        expect(warm(store)).toEqual(['a', 'b', 'c']);
        expect(store.get('b')).toBe(held);
        const configure = action => {
            action(store); action(reference.store);
            expect(routes(layer)).toEqual(routes(reference.layer))
        };
        configure(s => { s.get('b').set({endDate: stamp(8)}) });
        configure(s => { s.sorters = [{property: 'title', direction: 'DESC'}] });
        configure(s => { s.filters = [{filterBy: ({item}) => !['a', 'b'].includes(item.title)}] });
        expect(routes(layer).map(p => p[0])).toEqual(['a-b']);
        configure(s => { s.filters = [] });
        configure(s => s.collapse('team'));
        expect(routes(layer)).toEqual([]);
        configure(s => s.expand('team'));
        expect(routes(layer)).toHaveLength(2)
    } finally { cold.dispose(); reference.dispose() }
});

class MixedTasks extends TaskStore {
    static config = {className: 'Test.gantt.HydrationMixedTasks'}
    modelOf(row) { return row?.special ? this.specialModel : this.model }
}
const MixedStore = Neo.setupClass(MixedTasks);

test('sparse routes honor per-row native id semantics, explicit store keys and mapped endpoint dates', () => {
    const fieldList = id => TaskModel.config.fields.map(field => field.name === 'id' ? id :
        field.name === 'startDate' ? {...field, mapping: 'wire.start'} : field).concat([{name: 'key'}, {name:'special'}]);
    // The second argument of a virtual getter is the real Record, so raw field derivation alone cannot supply this id.
    for (const [idField, target] of [
        [{name:'id', mapping:'wire.keys[0]'}, 'mapped'],
        [{name:'id', convert: (value, record) => record.isRecord ? 'converted-' + value : 'raw-' + value}, 'converted-w'],
        [{name:'id', virtual:true, calculate: (data,record) => record?.get('title')}, 'virtual']
    ]) {
        const rich = () => Neo.create(TaskModel, {fields: fieldList(idField)});
        const data = () => [
            {id:'source', key:'s', title:'source', parentId:null, isLeaf:true, startDate:stamp(0), endDate:stamp(1)},
            {key:'t', title:'virtual', parentId:null, isLeaf:true, special:true, wire:{keys:['mapped'],start:stamp(3).toISOString()},
                ...(idField.convert && {id:'w'}), endDate:stamp(4)},
            {id:'unused', key:'u', title:'unused', parentId:null, isLeaf:true, startDate:stamp(5), endDate:stamp(6)}
        ];
        const edge  = [{id:'mixed', fromId:'source', toId:target, type:'FS'}];
        const plain = () => Neo.create(TaskModel,{fields:fieldList({name:'id'})});
        const make  = eager => {
            const model = plain(), specialModel=rich();
            const f     = open(data(),edge,{Store:MixedStore,model,specialModel,keyProperty:'key',autoInitRecords:eager});
            return {...f, dispose(){ f.dispose(); model.destroy(); specialModel.destroy() }}
        };
        const cold = make(false), eager=make(true);
        try {
            expect(routes(cold.layer)).toEqual(routes(eager.layer));
            expect(routes(cold.layer)[0].slice(0,3)).toEqual(['mixed','source',target]);
            expect(warm(cold.store)).toEqual(['s','t']);
            expect(cold.store.get('t').startDate).toEqual(stamp(3))
        } finally { cold.dispose(); eager.dispose() }
    }
});
