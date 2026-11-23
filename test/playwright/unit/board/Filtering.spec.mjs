import {setup} from '../../setup.mjs';

const appName = 'BoardFilteringTest';
setup({
    neoConfig: {allowVdomUpdatesInTests: false, unitTestMode: true, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Board           from '../../../../src/board/Container.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';

/** @summary Tests visible Store projection against canonical Card identity and ordering under local filters. */
const rows = () => [
    {id: 'a', title: 'A', status: 'todo', order: 1000, progress: 100},
    {id: 'b', title: 'B', status: 'todo', order: 2000, progress: 0},
    {id: 'c', title: 'C', status: 'todo', order: 3000, progress: 100},
    {id: 'd', title: 'D', status: 'todo', order: 4000, progress: 0},
    {id: 'm', title: 'M', status: 'done', order: 1000, progress: 100}
];
const visibleFilter = () => [{property: 'progress', operator: '>=', value: 50}];
const keys          = column => column.body.items.map(card => card.record.id);

test.describe('Board Store filtering', () => {
    let board, store, otherStore;

    /** @summary Builds the same real Store/Board pair used by the board's existing unit suites. */
    function create(data=rows(), config={}, storeConfig={}) {
        store = Neo.create(Store, {keyProperty: 'id', model: CardModel, data, ...storeConfig});
        board = Neo.create(Board, {appName, store, columns: [{status: 'todo', wipLimit: 3}, {status: 'done'}], ...config});
        return board
    }

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        otherStore?.destroy();
        board = store = otherStore = null
    });

    test('filter and clear follow visible membership while parked Cards retain their Records', () => {
        create();
        const hidden   = board.getCard('b'), record = store.get('b'), column = board.getColumn('todo'),
              original = new Map(store.items.map(item => [item.id, {record: item, order: item.order}]));
        expect(column.count).toBe(4);
        store.sort({property: 'order', direction: 'DESC'});
        expect(keys(column)).toEqual(['a', 'b', 'c', 'd']);
        store.filters = visibleFilter();

        expect(store.count).toBe(3);
        expect(keys(column)).toEqual(['a', 'c']);
        expect(column.count).toBe(2);
        expect(column.isWipExceeded).toBe(false);
        expect(column.body.items.map(card => card.vdom['aria-setsize'])).toEqual([2, 2]);
        expect(column.body.items.map(card => card.vdom['aria-posinset'])).toEqual([1, 2]);
        expect(hidden.parent).toBeFalsy();
        expect(hidden.isDestroyed).toBeFalsy();
        expect(board.getCard('b')).toBe(hidden);
        expect(store.allItems.get('b')).toBe(record);

        store.clearFilters();
        expect(keys(column)).toEqual(['a', 'b', 'c', 'd']);
        expect(column.count).toBe(4);
        expect(board.getCard('b')).toBe(hidden);
        for (const [key, previous] of original) {
            expect(store.get(key)).toBe(previous.record);
            expect(store.get(key).order).toBe(previous.order)
        }
    });

    test('sliced filter windows keep bounded retention through small and empty visible sets', () => {
        create(Array.from({length: 12}, (_, i) => ({id: 'r' + i, status: 'todo', order: i * 1000, progress: i})),
            {columns: [{status: 'todo', maxRenderedCards: 3, overscan: 1, retainOffscreen: 2}]});
        const column  = board.getColumn('todo'), first = board.getCard('r0'),
              records = new Map(store.items.map(record => [record.id, record]));
        store.filters = [{property: 'progress', operator: '>=', value: 2}];
        expect(column.count).toBe(10);
        expect(keys(column)).toEqual(['r2', 'r3', 'r4', 'r5']);
        expect(board.getCard('r0')).toBeNull();
        expect(first.isDestroyed).toBeFalsy();
        expect(board.cardMap.size).toBeLessThanOrEqual(column.body.items.length + column.retentionLimit);

        store.filters = [{property: 'progress', operator: '>=', value: 5}];
        expect(keys(column)).toEqual(['r5', 'r6', 'r7', 'r8']);
        expect(board.cardMap.size).toBeLessThanOrEqual(6);
        expect(first.isDestroyed).toBe(true);
        expect(InstanceManager.get(first.id)).toBeFalsy();

        store.filters = [{property: 'progress', operator: '>=', value: 10}];
        expect(keys(column)).toEqual(['r10', 'r11']);
        expect(board.cardMap.size).toBeLessThanOrEqual(4);
        store.filters = [{property: 'progress', operator: '>=', value: 99}];
        expect(column.count).toBe(0);
        expect(keys(column)).toEqual([]);
        expect(store.allItems.count).toBe(12);
        expect(board.cardMap.size).toBeLessThanOrEqual(2);

        store.clearFilters();
        expect(column.isSliced).toBe(true);
        expect(keys(column)).toEqual(['r0', 'r1', 'r2', 'r3']);
        expect(board.cardMap.size).toBeLessThanOrEqual(6);
        for (const card of column.body.items) expect(card.record).toBe(records.get(card.record.id))
    });

    test('two-row filter cycles cannot accumulate hidden Cards beyond a finite zero-retention window', () => {
        create(Array.from({length: 100}, (_, i) => ({id: 'r' + i, status: 'todo', order: i * 1000, progress: i})),
            {columns: [{status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 0}]});
        const column  = board.getColumn('todo'), first = board.getCard('r0'),
              records = new Map(store.items.map(record => [record.id, record]));

        for (let start = 2; start < 100; start += 2) {
            const previous = [...column.body.items];
            store.filters = [
                {property: 'progress', operator: '>=', value: start},
                {property: 'progress', operator: '<', value: start + 2}
            ];
            expect(column.count).toBe(2);
            expect(keys(column)).toEqual(['r' + start, 'r' + (start + 1)]);
            expect(board.cardMap.size).toBe(2);
            expect(board.retainedCards.size).toBe(0);
            for (const card of previous) {
                expect(card.isDestroyed).toBe(true);
                expect(InstanceManager.get(card.id)).toBeFalsy()
            }
            for (const card of column.body.items) expect(card.record).toBe(records.get(card.record.id))
        }

        const previous = [...column.body.items];
        store.filters = [{property: 'progress', operator: '>=', value: 100}];
        expect(column.count).toBe(0);
        expect(keys(column)).toEqual([]);
        expect(board.cardMap.size).toBe(0);
        expect(board.retainedCards.size).toBe(0);
        for (const card of previous) {
            expect(card.isDestroyed).toBe(true);
            expect(InstanceManager.get(card.id)).toBeFalsy()
        }
        expect(store.allItems.count).toBe(100);
        for (const [key, record] of records) expect(store.allItems.get(key)).toBe(record);

        store.clearFilters();
        expect(column.count).toBe(100);
        expect(keys(column)).toEqual(['r0', 'r1']);
        expect(board.cardMap.size).toBe(2);
        expect(board.retainedCards.size).toBe(0);
        expect(board.getCard('r0')).not.toBe(first);
        for (const card of column.body.items) expect(card.record).toBe(records.get(card.record.id))
    });

    test('explicit render-all keeps lifetime Card identity across small, empty and cleared filters', () => {
        create(Array.from({length: 100}, (_, i) => ({id: 'r' + i, status: 'todo', order: i * 1000, progress: i})),
            {columns: [{status: 'todo', maxRenderedCards: null, overscan: 0, retainOffscreen: 0}]});
        const column = board.getColumn('todo'), cards = new Map(board.cardMap);

        for (let start = 2; start < 100; start += 2) {
            store.filters = [
                {property: 'progress', operator: '>=', value: start},
                {property: 'progress', operator: '<', value: start + 2}
            ];
            expect(column.count).toBe(2);
            expect(keys(column)).toEqual(['r' + start, 'r' + (start + 1)]);
            expect(board.cardMap.size).toBe(100);
            for (const card of column.body.items) expect(card).toBe(cards.get(card.record.id))
        }

        store.filters = [{property: 'progress', operator: '>=', value: 100}];
        expect(column.count).toBe(0);
        expect(keys(column)).toEqual([]);
        expect(board.cardMap.size).toBe(100);
        for (const [key, card] of cards) {
            expect(board.getCard(key)).toBe(card);
            expect(card.isDestroyed).toBeFalsy();
            expect(card.parent).toBeFalsy();
            expect(card.record).toBe(store.allItems.get(key))
        }

        store.clearFilters();
        expect(column.count).toBe(100);
        expect(keys(column)).toEqual([...cards.keys()]);
        expect(board.cardMap.size).toBe(100);
        for (const card of column.body.items) {
            expect(card).toBe(cards.get(card.record.id));
            expect(card.record).toBe(store.get(card.record.id))
        }
    });

    test('real hidden removal and same-key replacement retire obsolete Cards even with no derived column', () => {
        create(rows(), {columns: null});
        const removed = board.getCard('b'), old = board.getCard('a'), oldRecord = old.record;
        store.filters = visibleFilter();
        expect(removed.isDestroyed).toBeFalsy();
        store.remove('b');
        expect(removed.isDestroyed).toBe(true);
        expect(board.getCard('b')).toBeNull();

        store.filters = [{property: 'progress', operator: '>=', value: 200}];
        expect(board.getColumns()).toHaveLength(0);
        store.setData([{id: 'a', title: 'Replacement', status: 'todo', order: 1000, progress: 0}]);
        expect(board.getColumns()).toHaveLength(0);
        expect(store.allItems.get('a')).not.toBe(oldRecord);
        expect(old.isDestroyed).toBe(true);
        expect(InstanceManager.get(old.id)).toBeFalsy();

        store.clearFilters();
        const replacement = board.getCard('a');
        expect(replacement).not.toBe(old);
        expect(replacement.record).toBe(store.get('a'));
        expect(replacement.id).toBe(old.id)
    });

    test('hidden status and lane edits cannot recreate derived topology after reapplying a filter', () => {
        create([
            {id: 'hidden', status: 'todo', lane: 'A', order: 1000, progress: 0},
            {id: 'visible', status: 'todo', lane: 'A', order: 2000, progress: 100}
        ], {columns: null, laneField: 'lane'});
        const hidden = store.get('hidden'), visible = store.get('visible');
        store.filters = [{...visibleFilter()[0], reapplyOnRecordChange: true}];
        hidden.set({status: 'hidden-status', lane: 'B'});
        expect(board.getLane('B')).toBeFalsy();
        expect(board.getColumn('hidden-status', 'B')).toBeFalsy();

        visible.set({progress: 0, status: 'also-hidden', lane: 'C'});
        expect(store.count).toBe(0);
        expect(board.getColumns()).toHaveLength(0);
        expect(board.getLane('C')).toBeFalsy();
        store.clearFilters();
        expect(board.getColumn('hidden-status', 'B').body.items[0].record).toBe(hidden);
        expect(board.getColumn('also-hidden', 'C').body.items[0].record).toBe(visible)
    });

    test('filter listeners follow Store replacement, detachment and Board destruction', () => {
        create();
        otherStore = Neo.create(Store, {keyProperty: 'id', model: CardModel, data: rows()});
        const project = board.project;
        let   calls   = 0;
        board.project = function(...args) {calls++; return project.apply(this, args)};
        board.store = otherStore;
        calls = 0;
        store.filters = visibleFilter();
        expect(calls).toBe(0);
        otherStore.filters = visibleFilter();
        expect(calls).toBe(1);

        board.store = null;
        calls = 0;
        otherStore.clearFilters();
        expect(calls).toBe(0);
        board.store = store;
        board.destroy();
        board = null;
        calls = 0;
        store.clearFilters();
        expect(calls).toBe(0)
    });

    test('canonical normalization is stable and a reapplying order filter cannot recursively project', () => {
        create([
            {id: 'hidden', status: 'todo', progress: 0},
            {id: 'missing', status: 'todo', progress: 100},
            {id: 'ranked', status: 'todo', progress: 100, order: 2000}
        ], {}, {filters: visibleFilter()});
        const hidden = store.allItems.get('hidden'), missing = store.get('missing');
        expect(hidden.order).toBe(3000);
        expect(missing.order).toBe(4000);
        store.clearFilters();
        expect(hidden.order).toBe(3000);

        store.filters = [{property: 'order', operator: '!=', value: -1, reapplyOnRecordChange: true}];
        const project = board.project;
        let   depth   = 0, maximum = 0, calls = 0;
        board.project = function(...args) {
            calls++; maximum = Math.max(maximum, ++depth);
            try {return project.apply(this, args)} finally {depth--}
        };
        missing.order = null;
        expect(calls).toBeGreaterThan(0);
        expect(maximum).toBe(1);
        expect(store.items.every(record => Number.isFinite(record.order))).toBe(true)
    });

    for (const [name, target, expected] of [
        ['before', {beforeId: 'c'}, 2500],
        ['after', {afterId: 'a'}, 1500],
        ['visible index', {index: 1}, 2500],
        ['visible end', {index: 2}, 3500],
        ['missing anchor append', {beforeId: 'missing'}, 5000]
    ]) test('filtered move uses canonical neighbours: ' + name, () => {
        create();
        const untouched      = ['a', 'b', 'c', 'd'].map(key => store.get(key)),
              originalOrders = untouched.map(record => record.order);
        store.filters = visibleFilter();
        board.moveCard({key: 'm', status: 'todo', ...target});
        expect(store.get('m').order).toBe(expected);
        store.clearFilters();
        expect(board.getColumnRecords('todo').filter(record => record.id !== 'm')).toEqual(untouched);
        expect(untouched.map(record => record.order)).toEqual(originalOrders)
    });

    test('filtered float-gap rebalance preserves every untouched canonical neighbour', () => {
        create([
            {id: 'a', status: 'todo', order: 1, progress: 100},
            {id: 'b', status: 'todo', order: 1 + 2e-10, progress: 0},
            {id: 'c', status: 'todo', order: 1 + 4e-10, progress: 100},
            {id: 'm', status: 'done', order: 1000, progress: 100}
        ]);
        const untouched = ['a', 'b', 'c'].map(key => store.get(key));
        store.filters = visibleFilter();
        board.moveCard({key: 'm', status: 'todo', beforeId: 'c'});
        expect(store.get('m').order).toBe(2500);
        store.clearFilters();
        expect(board.getColumnRecords('todo').map(record => record.id)).toEqual(['a', 'b', 'm', 'c']);
        expect(untouched.map(record => record.order)).toEqual([1000, 2000, 3000])
    });

    test('a rebalance settles a reapplying filter when the final move set changes nothing', () => {
        create([
            {id: 'a', title: 'A', status: 'todo', order: 1},
            {id: 'b', title: 'B', status: 'todo', order: 1 + 2e-10},
            {id: 'c', title: 'C', status: 'todo', order: 1 + 4e-10}
        ]);
        const column  = board.getColumn('todo'),
              records = store.items,
              moved   = store.get('b'),
              changed = [],
              moves   = [];
        store.filters = [{property: 'order', operator: '<', value: 500, reapplyOnRecordChange: true}];
        store.on('recordChange', ({record}) => changed.push(record));
        board.on('cardMove', event => moves.push(event));

        expect(board.moveCard({record: moved, beforeId: 'c'})).toBe(moved);

        expect(changed).toHaveLength(3);
        records.forEach((record, index) => expect(changed[index]).toBe(record));
        expect(records.map(record => record.order)).toEqual([1000, 2000, 3000]);
        expect(store.count).toBe(0);
        expect(column.count).toBe(0);
        expect(column.windowRecords).toEqual([]);
        expect(keys(column)).toEqual([]);
        expect(moves).toHaveLength(1);
        expect(moves[0].record).toBe(moved);
        expect(moves[0].to.index).toBe(-1);
        expect(board.liveRegionNode.text).toBe('B moved to todo');

        store.clearFilters();
        expect(keys(column)).toEqual(['a', 'b', 'c']);
        records.forEach(record => expect(store.get(record.id)).toBe(record))
    });

    for (const handle of ['record', 'key', 'cardId']) {
        test('the canonical move writer accepts a filtered current ' + handle, () => {
            create();
            const record = store.get('b'), card = board.getCard(record), moves = [];
            store.filters = visibleFilter();
            board.on('cardMove', event => moves.push(event));

            const args = handle === 'record' ? {record} : handle === 'key' ? {key: record.id} : {cardId: card.id};
            expect(board.moveCard({...args, status: 'done', beforeId: 'm'})).toBe(record);

            expect(store.get('b')).toBeNull();
            expect(store.allItems.get('b')).toBe(record);
            expect(record.status).toBe('done');
            expect(record.order).toBe(0);
            expect(moves).toHaveLength(1);
            expect(moves[0].record).toBe(record);
            expect(moves[0].to.index).toBe(-1);
            expect(board.liveRegionNode.text).toBe('B moved to done');

            store.clearFilters();
            expect(keys(board.getColumn('done'))).toEqual(['b', 'm']);
            expect(board.getCard(record)).toBe(card);
            expect(card.record).toBe(record)
        })
    }

    test('the canonical move writer rejects obsolete, removed and detached source Records', () => {
        create();
        const obsolete = store.get('b');
        store.filters = visibleFilter();
        store.setData(rows());
        const current = store.allItems.get('b'), moves = [];
        board.on('cardMove', event => moves.push(event));
        expect(current).not.toBe(obsolete);

        expect(board.moveCard({record: obsolete, status: 'done'})).toBeNull();
        expect(board.moveCard({record: {id: 'b', status: 'todo', order: 2000}, status: 'done'})).toBeNull();
        expect(current.status).toBe('todo');
        expect(current.order).toBe(2000);
        expect(moves).toEqual([]);

        store.remove('b');
        expect(board.moveCard({record: current, status: 'done'})).toBeNull();
        expect(board.moveCard({key: 'b', status: 'done'})).toBeNull();
        board.store = null;
        expect(board.moveCard({record: current, status: 'done'})).toBeNull();
        expect(moves).toEqual([])
    });

    test('activation and editor entry reject hidden or obsolete Record/Card handles', () => {
        create();
        const hiddenCard = board.getCard('b'), hiddenRecord = hiddenCard.record, oldRecord = store.get('a');
        let   activated  = 0, opened = 0;
        board.on('cardActivate', () => activated++, board);
        board.getCardEditor = () => ({openForCard: () => {opened++; return true}});
        store.filters = visibleFilter();

        for (const handle of [hiddenCard, hiddenRecord]) {
            expect(board.activateCard(handle)).toBeNull();
            expect(board.openCardEditor(handle)).toBeNull()
        }
        store.setData(rows());
        expect(board.activateCard(oldRecord)).toBeNull();
        expect(board.openCardEditor(oldRecord)).toBeNull();
        expect(activated).toBe(0);
        expect(opened).toBe(0)
    })
});
