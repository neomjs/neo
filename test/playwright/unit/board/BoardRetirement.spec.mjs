import {setup} from '../../setup.mjs';

const appName = 'BoardRetirementTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import Store            from '../../../../src/data/Store.mjs';
import VNode            from '../../../../src/util/VNode.mjs';
import VdomHelper       from '../../../../src/vdom/Helper.mjs';
import Board            from '../../../../src/board/Container.mjs';
import CardModel        from '../../../../src/board/CardModel.mjs';

const records = (count, status='todo') => Array.from({length: count}, (_, index) => ({
    id: `${status}-${index}`, title: `${status} card ${index}`, status, order: (index + 1) * 1000
}));

/**
 * @summary Reads only references stored in this snapshot, without resolving them through a successor's registry.
 * @param {Object} vnode
 * @returns {String[]}
 */
const componentReferences = vnode => (vnode?.childNodes || []).flatMap(child =>
    child.componentId ? [child.componentId] : componentReferences(child)
);

/**
 * @summary Retired cards leave traversable stored vnodes before the next render, while retained live cards keep
 * their identity. Old DOM nodes may remain as inline snapshots until the removal diff completes.
 */
test.describe('Neo.board.Container card retirement', () => {
    let board, store, stores;

    const createStore = (data=records(4), config={}) => {
        const result = Neo.create(Store, {keyProperty: 'id', model: CardModel, data, ...config});
        stores.push(result);
        return result
    };

    const renderBoard = async (columns=[{status: 'todo'}]) => {
        board = Neo.create(Board, {appName, store, columns});
        await board.initVnode();
        board.mounted = true;
        await board.promiseUpdate();
        return board
    };

    const expectSafeTree = () => {
        expect(() => VNode.createMap(board.vnode)).not.toThrow();
        board.items.forEach(column => {
            expect(() => VNode.createMap(column.body.vnode)).not.toThrow()
        })
    };

    const expectRetired = cards => cards.forEach(card => {
        expect(card.isDestroyed).toBe(true);
        expect(ComponentManager.get(card.id)).not.toBe(card)
    });

    test.beforeEach(() => {
        stores = []
    });

    test.afterEach(() => {
        board?.destroy();
        stores.forEach(value => value.destroy());
        board = store = null
    });

    test('removing a rendered record leaves the board traversable before the removal render', async () => {
        store = createStore();
        await renderBoard();

        const card = board.getCard('todo-0');
        expect(VNode.createMap(board.vnode).has(card.id)).toBe(true);

        store.remove('todo-0');

        expectRetired([card]);
        expect(ComponentManager.get(card.id)).toBeFalsy();
        expect(board.getCard('todo-0')).toBeNull();
        expectSafeTree()
    });

    test('clear followed by project retires every card before any ancestor traversal', async () => {
        store = createStore();
        await renderBoard();

        const cards = [...board.cardMap.values()];
        expect(VNode.createMap(board.vnode).has(cards[0].id)).toBe(true);

        store.clear();
        board.project();

        expectRetired(cards);
        expect(board.cardMap.size).toBe(0);
        expect(board.retainedCards.size).toBe(0);
        expectSafeTree()
    });

    test('clearing the Store retires cards without needing a current Store to resolve their keys', async () => {
        store = createStore();
        await renderBoard();

        const cards = [...board.cardMap.values()];

        board.store = null;

        expectRetired(cards);
        expect(board.cardMap.size).toBe(0);
        expect(board.retainedCards.size).toBe(0);
        expect(board.getColumn('todo').count).toBe(0);
        expectSafeTree()
    });

    test('Store replacement with a different keyProperty retires old visible and retained cards', async () => {
        const fields = [{name: 'legacyKey'}, {name: 'nextKey'}, {name: 'title'}, {name: 'status'}, {name: 'order'}];
        store = createStore(records(6).map(({id, ...record}) => ({...record, legacyKey: id})), {
            keyProperty: 'legacyKey', model: {fields}
        });
        await renderBoard([{status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}]);

        const column = board.getColumn('todo');
        column.setWindowStart(2);

        const cards = [...board.cardMap.values()];
        expect(cards).toHaveLength(4);

        store = createStore([
            {nextKey: 'new-a', title: 'New A', status: 'todo', order: 1000},
            {nextKey: 'new-b', title: 'New B', status: 'todo', order: 2000}
        ], {keyProperty: 'nextKey', model: {fields}});
        board.store = store;

        expectRetired(cards);
        expect([...board.cardMap.keys()]).toEqual(['new-a', 'new-b']);
        expect(board.retainedCards.size).toBe(0);
        expect(board.getCard('new-a').record).toBe(store.get('new-a'));
        expectSafeTree()
    });

    test('same-key reload unlinks old snapshot references before registering successor cards', async () => {
        store = createStore();
        await renderBoard();

        const cards    = [...board.cardMap.values()],
              snapshot = board.getColumn('todo').body.vnode;

        expect(componentReferences(snapshot)).toContain(cards[0].id);

        store.setData(records(4).map(record => ({...record, title: 'Replacement record'})));

        expectRetired(cards);
        cards.forEach(oldCard => {
            const successor = board.getCard(oldCard.record.id);
            expect(successor).not.toBe(oldCard);
            expect(successor.record).toBe(store.get(oldCard.record.id));
            expect(ComponentManager.get(successor.id)).toBe(successor);
            expect(componentReferences(snapshot)).not.toContain(oldCard.id)
        });
        expectSafeTree()
    });

    test('zero-retention eviction unlinks detached cards from the rendered snapshot', async () => {
        store = createStore(records(8));
        await renderBoard([{status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 0}]);

        const column = board.getColumn('todo'),
              cards  = [...column.body.items];

        expect(VNode.createMap(board.vnode).has(cards[0].id)).toBe(true);

        column.setWindowStart(2);

        expectRetired(cards);
        expect(board.cardMap.size).toBe(2);
        expect(board.retainedCards.size).toBe(0);
        expectSafeTree()
    });

    test('a card moved between columns and removed before flush leaves every body snapshot traversable', async () => {
        store = createStore([...records(2), ...records(1, 'done')]);
        await renderBoard([{status: 'todo'}, {status: 'done'}]);

        const card      = board.getCard('todo-0'),
              snapshots = board.items.map(column => column.body.vnode);

        expect(componentReferences(snapshots[0])).toContain(card.id);

        store.get('todo-0').status = 'done';
        expect(board.getCard('todo-0')).toBe(card);
        expect(card.parent).toBe(board.getColumn('done').body);

        store.remove('todo-0');

        expectRetired([card]);
        expect(ComponentManager.get(card.id)).toBeFalsy();
        snapshots.forEach(snapshot => expect(() => VNode.createMap(snapshot)).not.toThrow());
        expectSafeTree()
    });

    test('a detached retained card stays registered and returns as the same instance', async () => {
        store = createStore(records(8));
        await renderBoard([{status: 'todo', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}]);

        const column = board.getColumn('todo'),
              card   = board.getCard('todo-0');

        expect(VNode.createMap(board.vnode).has(card.id)).toBe(true);

        column.setWindowStart(2);

        expect(board.getCard('todo-0')).toBeNull();
        expect(board.cardMap.get('todo-0')).toBe(card);
        expect(card.isDestroyed).toBeFalsy();
        expect(ComponentManager.get(card.id)).toBe(card);
        expectSafeTree();

        column.setWindowStart(0);

        expect(board.getCard('todo-0')).toBe(card);
        expect(card.parent).toBe(column.body);
        expect(ComponentManager.get(card.id)).toBe(card);
        expectSafeTree()
    });

    test('a row a lazy Store adds after construction gets a card on its canonical Record, as an eager row does', async () => {
        for (const autoInitRecords of [true, false]) {
            store = createStore(records(1), {autoInitRecords});
            await renderBoard();

            store.add({id: 'todo-1', title: 'todo card 1', status: 'todo', order: 2000}, autoInitRecords);

            const column = board.getColumn('todo');

            expect(store.count).toBe(2);
            expect(column.count).toBe(2);
            expect(column.body.items.map(card => card.record.id)).toEqual(['todo-0', 'todo-1']);
            column.body.items.forEach(card => expect(card.record).toBe(store.get(card.record.id)));
            expectSafeTree();

            board.destroy();
            board = null
        }
    });

    test('a Store the board creates retires on replacement and with the board, while a borrowed Store survives both', () => {
        const storeConfig = data => ({keyProperty: 'id', model: CardModel, data});

        store = createStore();
        board = Neo.create(Board, {appName, columns: [{status: 'todo'}], store: storeConfig(records(2))});

        const created = board.store;

        board.store = store;

        expect(created.isDestroyed).toBe(true);
        expect(Neo.get(created.id)).toBeFalsy();

        board.store = storeConfig(records(1));

        const successor = board.store;

        expect(store.isDestroyed).toBeFalsy();

        board.destroy();
        board = null;

        expect(successor.isDestroyed).toBe(true);
        expect(Neo.get(successor.id)).toBeFalsy();
        expect(store.isDestroyed).toBeFalsy();
        expect(Neo.get(store.id)).toBe(store)
    })
});
