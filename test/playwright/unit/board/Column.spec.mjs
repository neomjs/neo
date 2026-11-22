import {setup} from '../../setup.mjs';

const appName = 'BoardColumnWindowTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Board           from '../../../../src/board/Container.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';

class Deal extends CardModel {
    static config = {
        className: 'Test.Unit.Board.Column.Deal',
        fields   : [{name: 'amount'}]
    }
}
Deal = Neo.setupClass(Deal);

test.describe('Neo.board column summaries', () => {
    let board, store, replacement;

    const summary = column => column.header.vdom.cn.find(node =>
        node.cls?.includes('neo-board-column-summary'));

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        replacement?.destroy();
        board = store = replacement = null
    });

    test('sums finite numeric values in each visible lane and column, including offscreen records', () => {
        store = Neo.create(Store, {keyProperty: 'id', model: Deal, data: [
            {id: 'a', status: 'todo', lane: 'A', order: 1, amount: 10, progress: 1},
            {id: 'b', status: 'todo', lane: 'A', order: 2, amount: 2.5, progress: 1},
            {id: 'c', status: 'todo', lane: 'A', order: 3, amount: -3, progress: 0},
            {id: 'd', status: 'todo', lane: 'A', order: 4, amount: '100', progress: 1},
            {id: 'e', status: 'todo', lane: 'A', order: 5, amount: Infinity, progress: 1},
            {id: 'f', status: 'todo', lane: 'A', order: 6, amount: NaN, progress: 1},
            {id: 'g', status: 'todo', lane: 'B', order: 1, amount: 7, progress: 1},
            {id: 'h', status: 'done', lane: 'A', order: 1, amount: 20, progress: 1}
        ]});
        board = Neo.create(Board, {appName, store, laneField: 'lane',
            columnSummary: {field: 'amount'}, columns: [
                {status: 'todo', maxRenderedCards: 1, overscan: 0}, {status: 'done'}
            ]});

        const a    = board.getColumn('todo', 'A'),
              b    = board.getColumn('todo', 'B'),
              done = board.getColumn('done', 'A');
        expect(a.body.items).toHaveLength(1);
        expect(summary(a).text).toBe('9.5');
        expect(summary(b).text).toBe('7');
        expect(summary(done).text).toBe('20');

        store.filters = [{property: 'progress', operator: '>=', value: 1}];
        expect(summary(a).text).toBe('12.5');
        expect(summary(b).text).toBe('7');
        store.clearFilters();
        expect(summary(a).text).toBe('9.5');
        expect(board.getCard('b')).toBeNull();
        store.get('b').amount = 5;
        expect(summary(a).text).toBe('12');
        store.get('b').set({lane: 'B', amount: 8});
        expect(summary(a).text).toBe('7');
        expect(summary(b).text).toBe('15')
    });

    test('tracks edits, moves, store replacement, and runtime summary configuration without replacing header controls', () => {
        store = Neo.create(Store, {keyProperty: 'id', model: Deal, data: [
            {id: 'a', status: 'todo', order: 1, amount: 10},
            {id: 'b', status: 'todo', order: 2, amount: 5},
            {id: 'c', status: 'done', order: 1, amount: 2}
        ]});
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', wipLimit: 1}, {status: 'done'}
        ]});
        const todo     = board.getColumn('todo'),
              done     = board.getColumn('done'),
              header   = todo.header,
              controls = [...header.vdom.cn];
        expect(summary(todo)).toBeUndefined();
        expect(header.vdom.cn).toHaveLength(3);
        expect(todo.isWipExceeded).toBe(true);

        board.columnSummary = {field: 'amount', formatter: value => `Total: ${value}`};
        expect(summary(todo).text).toBe('Total: 15');
        expect(summary(done).text).toBe('Total: 2');
        expect(todo.header).toBe(header);
        controls.forEach((node, index) => expect(header.vdom.cn[index]).toBe(node));
        expect(todo.isWipExceeded).toBe(true);

        store.get('a').amount = 12;
        expect(summary(todo).text).toBe('Total: 17');
        store.get('a').status = 'done';
        expect(summary(todo).text).toBe('Total: 5');
        expect(summary(done).text).toBe('Total: 14');
        expect(todo.isWipExceeded).toBe(false);

        board.store = null;
        expect(summary(todo).text).toBe('Total: 0');
        replacement = Neo.create(Store, {keyProperty: 'id', model: Deal, data: [
            {id: 'new', status: 'todo', order: 1, amount: 42}
        ]});
        board.store = replacement;
        expect(summary(todo).text).toBe('Total: 42');
        store.get('b').amount = 999;
        expect(summary(todo).text).toBe('Total: 42');

        board.columnSummary = null;
        expect(summary(todo)).toBeUndefined();
        expect(header.vdom.cn).toHaveLength(3);
        expect(todo.header).toBe(header);
        controls.forEach((node, index) => expect(header.vdom.cn[index]).toBe(node))
    })
});

let allocations = 0;

/**
 * @summary Counts every card construction, including instances evicted before the test can inspect the map.
 */
class AllocationBoard extends Board {
    static config = {
        className: 'Test.Unit.Board.Column.AllocationBoard'
    }

    /**
     * @summary Counts allocation while preserving the production card construction path.
     * @param {Object} record
     * @returns {Neo.board.Card}
     */
    createCard(record) {
        ++allocations;
        return super.createCard(record)
    }
}

AllocationBoard = Neo.setupClass(AllocationBoard);

const
    records = (count, status='todo') => Array.from({length: count}, (_, index) => ({
        id: `${status}-${index}`, title: `${status} card ${index}`, status, order: (index + 1) * 1000
    })),
    keys = column => column.body.items.map(card => card.record.id);

/**
 * @summary Column windows bound allocation and retention without reassigning card identity; all-record mode
 * preserves the board's existing lifetime contract. These tests exercise the real store and component tree.
 */
test.describe('Neo.board.Column window lifetime', () => {
    let board, store, stores;

    const createStore = data => {
        const result = Neo.create(Store, {keyProperty: 'id', model: CardModel, data});
        stores.push(result);
        return result
    };

    test.beforeEach(() => {
        allocations = 0;
        stores = []
    });

    test.afterEach(() => {
        board?.destroy();
        stores.forEach(value => value.destroy());
        board = store = null
    });

    test('five 2000-record columns allocate at most 550 cards initially and retain full counts', () => {
        const statuses = ['todo', 'doing', 'review', 'ready', 'done'];
        store = createStore(statuses.flatMap(status => records(2000, status)));
        board = Neo.create(AllocationBoard, {appName, store});

        expect(allocations).toBeLessThanOrEqual(550);
        expect(board.cardMap.size).toBe(allocations);

        statuses.forEach(status => {
            const column = board.getColumn(status);

            expect(column.maxRenderedCards).toBe(100);
            expect(column.overscan).toBe(10);
            expect(column.retainOffscreen).toBeNull();
            expect(column.isSliced).toBe(true);
            expect(column.count).toBe(2000);
            expect(column.header.vdom.cn[1].text).toBe('2000');
            expect(column.body.items.length).toBeLessThanOrEqual(110);
            expect(board.getCard(`${status}-0`).record).toBe(store.get(`${status}-0`));
            expect(board.getCard(`${status}-1999`)).toBeNull()
        })
    });

    test('a card returns with the same instance and record-derived id while it is retained', () => {
        store = createStore(records(12));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const column = board.getColumn('todo'),
              card   = board.getCard('todo-0'),
              record = card.record,
              id     = card.id;

        column.setWindowStart(2);

        expect(keys(column)).toEqual(['todo-2', 'todo-3']);
        expect(board.getCard(record)).toBeNull();
        expect(board.cardMap.get(record.id)).toBe(card);
        expect(card.parent).toBeFalsy();
        expect(card.isDestroyed).toBeFalsy();

        column.setWindowStart(0);

        expect(board.getCard(record)).toBe(card);
        expect(card.record).toBe(record);
        expect(card.id).toBe(id);
        expect(id).toBe(board.getCardId(record));
        expect(board.cardMap.size).toBeLessThanOrEqual(4)
    });

    test('null retention holds one rendered window, then evicts its oldest cards', () => {
        store = createStore(records(20));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 1}
        ]});

        const column = board.getColumn('todo'),
              first  = [...column.body.items];

        column.setWindowStart(3);

        expect(keys(column)).toEqual(['todo-3', 'todo-4', 'todo-5']);
        expect(board.cardMap.size).toBe(6);
        expect(first.every(card => !card.isDestroyed)).toBe(true);

        column.setWindowStart(6);

        expect(board.cardMap.size).toBe(6);
        first.forEach(card => {
            expect(card.isDestroyed).toBe(true);
            expect(InstanceManager.get(card.id)).toBeFalsy()
        })
    });

    test('an explicit retention budget counts cards, including a zero-card budget', () => {
        store = createStore(records(12));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 1}
        ]});

        const column = board.getColumn('todo'),
              first  = [...column.body.items];

        column.setWindowStart(2);

        expect(board.cardMap.size).toBe(3);
        expect(first.filter(card => card.isDestroyed)).toHaveLength(1);

        column.retainOffscreen = 0;

        expect(board.cardMap.size).toBe(2);
        expect(first.every(card => card.isDestroyed)).toBe(true);

        const current = [...column.body.items];
        column.setWindowStart(4);

        expect(board.cardMap.size).toBe(2);
        expect(current.every(card => card.isDestroyed)).toBe(true)
    });

    test('updates to retained and never-rendered records are visible when their window returns', () => {
        store = createStore(records(12));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const column = board.getColumn('todo'),
              first  = board.getCard('todo-0');

        column.setWindowStart(2);
        store.get('todo-0').title = 'Updated while retained';
        store.get('todo-8').title = 'Updated before first render';
        column.setWindowStart(0);

        expect(board.getCard('todo-0')).toBe(first);
        expect(first.vdom.cn[0].text).toBe('Updated while retained');

        column.setWindowStart(8);

        expect(board.getCard('todo-8').vdom.cn[0].text).toBe('Updated before first render');
        expect(board.getCard('todo-8').record).toBe(store.get('todo-8'))
    });

    test('a retained card moving to another column keeps its identity and updates both counts', () => {
        store = createStore(records(8));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2},
            {status: 'done', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const todo = board.getColumn('todo'),
              done = board.getColumn('done'),
              card = board.getCard('todo-0');

        todo.setWindowStart(2);
        store.get('todo-0').set({status: 'done', title: 'Moved from retained window'});

        expect(board.getCard('todo-0')).toBe(card);
        expect(done.body.items).toEqual([card]);
        expect(todo.body.items).not.toContain(card);
        expect(card.vdom.cn[0].text).toBe('Moved from retained window');
        expect(card.record).toBe(store.get('todo-0'));
        expect(todo.count).toBe(7);
        expect(done.count).toBe(1)
    });

    for (const sourceFirst of [false, true]) {
        test(`bulk moves transfer offscreen cards to the destination budget (source first: ${sourceFirst})`, () => {
            store = createStore([...records(8), ...records(1, 'done')]);
            const configs = [
                {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 1},
                {status: 'done'}
            ];
            board = Neo.create(Board, {appName, store, columns: sourceFirst ? configs.reverse() : configs});

            const column = board.getColumn('todo'),
                  card   = board.getCard('done-0');

            store.get('done-0').setSilent({status: 'todo', order: 4500});
            board.project();

            expect(board.getColumnRecords('todo')[4]).toBe(card.record);
            expect(board.getCard('done-0')).toBeNull();
            expect(board.retainedCards.get('done-0')).toBe(column);
            expect(card.parent).toBeFalsy();
            expect(board.getColumn('done').count).toBe(0);

            column.retainOffscreen = 0;

            expect(card.isDestroyed).toBe(true);
            expect(board.cardMap.has('done-0')).toBe(false);
            expect(board.retainedCards.has('done-0')).toBe(false)
        })
    }

    test('a bulk move out of a zero-retention sliced source survives in the destination budget', () => {
        store = createStore([...records(8), ...records(8, 'done')]);
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 0},
            {status: 'done', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const card = board.getCard('todo-0');
        card.record.setSilent({status: 'done', order: 4500});
        board.project();

        expect(board.getCard('todo-0')).toBeNull();
        expect(board.retainedCards.get('todo-0')).toBe(board.getColumn('done'));
        expect(card.isDestroyed).toBeFalsy();

        board.getColumn('done').setWindowStart(4);

        expect(board.getCard('todo-0')).toBe(card)
    });

    test('a config change cannot evict a card that silently moved into another column budget', () => {
        store = createStore([...records(8), ...records(8, 'done')]);
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2},
            {status: 'done', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const card = board.getCard('todo-0');
        card.record.setSilent({status: 'done', order: 4500});
        board.columns = board.columns.map(config => ({...config, retainOffscreen: config.status === 'todo' ? 0 : 2}));

        expect(card.isDestroyed).toBeFalsy();
        expect(board.getCard('todo-0')).toBeNull();
        expect(board.retainedCards.get('todo-0')).toBe(board.getColumn('done'));
        board.getColumn('done').setWindowStart(4);
        expect(board.getCard('todo-0')).toBe(card)
    });

    test('removing visible or retained records destroys their cards and releases their registrations', () => {
        store = createStore(records(10));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const column   = board.getColumn('todo'),
              retained = board.getCard('todo-0');

        column.setWindowStart(2);
        const visible = board.getCard('todo-2');

        store.remove('todo-0');
        store.remove('todo-2');

        [retained, visible].forEach(card => {
            expect(card.isDestroyed).toBe(true);
            expect(board.cardMap.has(card.record.id)).toBe(false);
            expect(InstanceManager.get(card.id)).toBeFalsy()
        });
        expect(column.count).toBe(8);
        expect(column.body.items.every(card => store.get(card.record.id) === card.record)).toBe(true)
    });

    test('replacing the store destroys old visible and retained cards even when the new store reuses keys', () => {
        store = createStore(records(8));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const column = board.getColumn('todo');
        column.setWindowStart(2);

        const previous = [...board.cardMap.values()],
              oldStore = store;

        store = createStore(records(8).map(record => ({...record, title: 'Replacement record'})));
        board.store = store;

        previous.forEach(card => expect(card.isDestroyed).toBe(true));
        column.body.items.forEach(card => {
            expect(previous).not.toContain(card);
            expect(card.record).toBe(store.get(card.record.id));
            expect(card.vdom.cn[0].text).toBe('Replacement record')
        });

        oldStore.get('todo-2').title = 'Stale store update';

        expect(column.body.items.every(card => card.vdom.cn[0].text === 'Replacement record')).toBe(true)
    });

    test('removing a sliced column destroys its visible and retained cards without touching another column', () => {
        store = createStore([...records(8), ...records(1, 'done')]);
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2},
            {status: 'done'}
        ]});

        const column = board.getColumn('todo'),
              done   = board.getCard('done-0');

        column.setWindowStart(2);

        const removed = [...board.cardMap.values()].filter(card => card !== done);

        expect(removed).toHaveLength(4);
        expect(board.retainedCards.size).toBe(2);

        board.columns = [{status: 'done'}];

        expect(board.getColumn('todo')).toBeNull();
        expect(column.isDestroyed).toBe(true);
        expect(InstanceManager.get(column.id)).toBeFalsy();
        removed.forEach(card => {
            expect(card.isDestroyed).toBe(true);
            expect(InstanceManager.get(card.id)).toBeFalsy()
        });
        expect([...board.cardMap.keys()]).toEqual(['done-0']);
        expect(board.retainedCards.size).toBe(0);
        expect(board.getCard('done-0')).toBe(done);
        expect(store.count).toBe(9)
    });

    test('reloading the same Store replaces visible and retained record identities even when keys repeat', () => {
        store = createStore(records(8));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const column     = board.getColumn('todo'),
              oldRecords = [...store.items];

        column.setWindowStart(2);

        const oldCards = [...board.cardMap.values()];

        expect(oldCards).toHaveLength(4);
        expect(board.retainedCards.size).toBe(2);

        store.setData(records(8).map(record => ({...record, title: `Reloaded ${record.id}`})));

        expect(board.store).toBe(store);
        expect(column.count).toBe(8);
        oldCards.forEach(card => expect(card.isDestroyed).toBe(true));
        board.cardMap.forEach(card => {
            expect(card.record).toBe(store.get(card.record.id));
            expect(oldRecords).not.toContain(card.record);
            expect(card.vdom.cn[0].text).toBe(`Reloaded ${card.record.id}`)
        });

        column.setWindowStart(0);

        expect(keys(column)).toEqual(['todo-0', 'todo-1']);
        column.body.items.forEach(card => {
            expect(card.record).toBe(store.get(card.record.id));
            expect(oldRecords).not.toContain(card.record);
            expect(card.vdom.cn[0].text).toBe(`Reloaded ${card.record.id}`)
        })
    });

    test('clearing the Store resets the column count, window and spacers and makes record navigation empty', async () => {
        store = createStore(records(8));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}
        ]});

        const column = board.getColumn('todo');

        column.setWindowStart(4);
        expect(keys(column)).toEqual(['todo-4', 'todo-5']);

        board.store = null;

        expect(board.cardMap.size).toBe(0);
        expect(board.retainedCards.size).toBe(0);
        expect(column.body.items).toEqual([]);
        expect(column.count).toBe(0);
        expect(column.header.vdom.cn[1].text).toBe('0');
        expect(column.windowRecords).toEqual([]);
        expect(column.windowStart).toBe(0);
        expect(column.isSliced).toBe(false);
        expect(column.body.vdom.cn[0].style.height).toBe('0px');
        expect(column.body.vdom.cn[2].style.height).toBe('0px');
        expect(await column.scrollToRecord('todo-4')).toBeNull()
    });

    test('small unsliced columns keep parked cards until record removal or board destruction', () => {
        store = createStore(records(4));
        board = Neo.create(Board, {appName, store, columns: [{status: 'todo'}]});

        const column = board.getColumn('todo'),
              card   = board.getCard('todo-0');

        expect(column.isSliced).toBe(false);
        store.get('todo-0').status = 'archived';

        expect(board.getCard('todo-0')).toBe(card);
        expect(card.parent).toBeFalsy();
        expect(card.isDestroyed).toBeFalsy();

        store.get('todo-0').status = 'todo';

        expect(column.body.items).toContain(card);
        expect(board.getCard('todo-0')).toBe(card);

        store.get('todo-0').status = 'archived';
        board.destroy();
        board = null;

        expect(card.isDestroyed).toBe(true);
        expect(InstanceManager.get(card.id)).toBeFalsy()
    });

    test('window starts clamp to the data and runtime limits immediately reproject', () => {
        store = createStore(records(12));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 0}
        ]});

        const column = board.getColumn('todo');

        column.setWindowStart(4);
        expect(keys(column)).toEqual(['todo-4', 'todo-5']);

        column.overscan = 1;
        expect(keys(column)).toEqual(['todo-4', 'todo-5', 'todo-6']);

        column.maxRenderedCards = 4;
        expect(keys(column)).toEqual(['todo-4', 'todo-5', 'todo-6', 'todo-7', 'todo-8']);
        expect(board.cardMap.size).toBe(5);

        column.setWindowStart(1000);
        expect(column.windowStart).toBe(7);
        expect(keys(column)).toEqual(['todo-7', 'todo-8', 'todo-9', 'todo-10', 'todo-11']);

        column.setWindowStart(-10);
        expect(column.windowStart).toBe(0);
        expect(keys(column)).toEqual(['todo-0', 'todo-1', 'todo-2', 'todo-3', 'todo-4'])
    });

    test('column configs accept explicit null at construction and when updating existing columns', () => {
        store = createStore(records(150));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: null, overscan: 0, retainOffscreen: 0}
        ]});

        const column = board.getColumn('todo'),
              first  = board.getCard('todo-0');

        expect(column.maxRenderedCards).toBeNull();
        expect(column.isSliced).toBe(false);
        expect(column.body.items).toHaveLength(150);

        board.columns = [{status: 'todo', maxRenderedCards: 2, overscan: 1, retainOffscreen: 0}];

        expect(board.getColumn('todo')).toBe(column);
        expect(column.isSliced).toBe(true);
        expect(column.body.items).toHaveLength(3);
        expect(board.cardMap.size).toBe(3);
        expect(board.getCard('todo-0')).toBe(first);
        expect(board.getCard('todo-149')).toBeNull();

        board.columns = [{status: 'todo', maxRenderedCards: null, overscan: 0, retainOffscreen: 0}];

        expect(column.maxRenderedCards).toBeNull();
        expect(column.isSliced).toBe(false);
        expect(column.body.items).toHaveLength(150);
        expect(board.getCard('todo-0')).toBe(first);
        expect(board.getCard('todo-149').record).toBe(store.get('todo-149'))
    });

    test('scrollToRecord resolves the rendered card by key or record and rejects records outside the column', async () => {
        store = createStore([...records(20), ...records(1, 'done')]);
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 1, retainOffscreen: 0},
            {status: 'done'}
        ]});

        const column = board.getColumn('todo'),
              card   = await column.scrollToRecord('todo-19');

        expect(card).toBe(board.getCard('todo-19'));
        expect(card.record).toBe(store.get('todo-19'));
        expect(column.body.items).toContain(card);
        expect(column.windowStart).toBe(17);

        const first = await column.scrollToRecord(store.get('todo-0'));

        expect(first).toBe(board.getCard('todo-0'));
        expect(column.windowStart).toBe(0);
        expect(await column.scrollToRecord('missing')).toBeNull();
        expect(await column.scrollToRecord(store.get('done-0'))).toBeNull();
        expect(column.windowStart).toBe(0)
    });

    test('concurrent measurements share the DOM read and both await the final spacer update', async () => {
        store = createStore(records(8));
        board = Neo.create(Board, {appName, store, columns: [
            {status: 'todo', maxRenderedCards: 2, overscan: 0}
        ]});

        const column = board.getColumn('todo'),
              body   = column.body;

        column.setWindowStart(2);
        body.mounted = true;
        await column.scheduleWindowMeasurement();

        let   domReads   = 0, updateCalls = 0, releaseCorrection, announceCorrection;
        const correction = new Promise(resolve => {releaseCorrection = resolve}),
              correctionStarted = new Promise(resolve => {announceCorrection = resolve}),
              settled           = [false, false];

        column.getDomRect = async ids => {
            ++domReads;
            return ids.map((id, index) => ({height: 200, y: index * 200}))
        };
        body.promiseUpdate = () => {
            if (++updateCalls === 2) {
                announceCorrection();
                return correction
            }
            return Promise.resolve()
        };

        try {
            const first = column.scheduleWindowMeasurement().then(() => {settled[0] = true});

            await correctionStarted;
            expect(column.averageCardHeight).toBe(200);

            const second = column.scheduleWindowMeasurement().then(() => {settled[1] = true});

            // A later caller may see the new height, but the corresponding DOM correction is still pending.
            await new Promise(resolve => setImmediate(resolve));

            expect(domReads).toBe(1);
            expect(settled).toEqual([false, false]);

            releaseCorrection();
            await Promise.all([first, second]);

            expect(settled).toEqual([true, true]);
            expect(domReads).toBe(1)
        } finally {
            releaseCorrection()
        }
    });

    for (const change of ['moves to another column', 'is replaced under the same key']) {
        test(`pending scrollToRecord cancels when its record ${change}`, async () => {
            store = createStore(records(8));
            board = Neo.create(Board, {appName, store, columns: [
                {status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2},
                {status: 'done'}
            ]});

            const column         = board.getColumn('todo'),
                  record         = store.get('todo-4'),
                  scrollRequests = [],
                  scrollIntoView = Neo.main.DomAccess.scrollIntoView;
            let releaseUpdate;
            const update = new Promise(resolve => {releaseUpdate = resolve});

            // Keep the real record projection, but hold its DOM completion until the concurrent mutation lands.
            column.scheduleWindowMeasurement = async () => {};
            column.body.mounted = true;
            column.body.promiseUpdate = () => update;
            Neo.main.DomAccess.scrollIntoView = async request => {scrollRequests.push(request)};

            try {
                const navigation = column.scrollToRecord(record);

                if (change === 'moves to another column') {
                    record.status = 'done';
                    expect(board.getCard(record).parent).toBe(board.getColumn('done').body)
                } else {
                    store.setData(records(8).map(value => ({...value, title: 'Replacement record'})));
                    expect(board.getCard('todo-4').record).toBe(store.get('todo-4'));
                    expect(board.getCard('todo-4').record).not.toBe(record)
                }

                releaseUpdate();

                expect(await navigation).toBeNull();
                expect(scrollRequests).toEqual([])
            } finally {
                releaseUpdate();
                Neo.main.DomAccess.scrollIntoView = scrollIntoView
            }
        })
    }
});
