import {setup} from '../../setup.mjs';

const appName = 'BoardContainerTest';

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
import VDomUpdate      from '../../../../src/manager/VDomUpdate.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Board           from '../../../../src/board/Container.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';

/**
 * @summary The board as a projection of one store: columns derive from the records, a status or order change moves
 * the same card instance, add and remove create and destroy exactly one card, WIP and collapse are column state,
 * and every id derives from the status or the record key.
 */
const
    cards = () => [
        {id: 'c1', title: 'Atlas feed',    status: 'backlog',     order: 1000, tags: ['feed', 'ops'], progress: 10, assignees: ['Ada Lovelace', {name: 'Grace Hopper'}]},
        {id: 'c2', title: 'Beacon trace',  status: 'backlog',     order: 2000},
        {id: 'c3', title: 'Cipher deploy', status: 'in-progress', order: 1000, progress: 60, color: '#f59e0b'},
        {id: 'c4', title: 'Delta vessel',  status: 'in-progress', order: 2000},
        {id: 'c5', title: 'Echo log',      status: 'in-progress', order: 3000},
        {id: 'c6', title: 'Flux build',    status: 'done',        order: 1000}
    ],
    createStore = (data=cards()) => Neo.create(Store, {keyProperty: 'id', model: CardModel, data}),
    createBoard = config => Neo.create(Board, {appName, ...config}),
    ids         = column => column.body.items.map(card => card.id),
    keys        = column => column.body.items.map(card => card.record.id),
    statuses    = board  => board.items.map(column => column.status);

test.describe('Neo.board.Container', () => {
    let board, store;

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('derives one column per status in first-seen order and projects the records by order', () => {
        store = createStore();
        board = createBoard({store});

        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'done']);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2']);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c4', 'c5']);
        expect(keys(board.getColumn('done'))).toEqual(['c6']);
        expect(board.getColumnRecords('in-progress').map(record => record.id)).toEqual(['c3', 'c4', 'c5']);
        expect(board.getColumn('in-progress').count).toBe(3)
    });

    test('explicit columns render in their order, empty ones included, with title and WIP limit', () => {
        store = createStore();
        board = createBoard({store, columns: [
            {status: 'backlog',     title: 'Backlog'},
            {status: 'in-progress', title: 'In progress', wipLimit: 8},
            {status: 'review',      title: 'Review',      wipLimit: 4},
            {status: 'done',        title: 'Done'}
        ]});

        const review     = board.getColumn('review'),
              inProgress = board.getColumn('in-progress');

        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'review', 'done']);
        expect(review.body.items).toEqual([]);
        expect(review.count).toBe(0);
        expect(review.header.vdom.cn[0].text).toBe('Review');
        expect(review.header.vdom.cn[1].text).toBe('0/4');
        expect(inProgress.header.vdom.cn[1].text).toBe('3/8');
        expect(board.getColumn('backlog').header.vdom.cn[1].text).toBe('2')
    });

    test('a status change moves the same card instance into the target column', () => {
        store = createStore();
        board = createBoard({store});

        const card = board.getCard('c1'),
              id   = card.id;

        store.get('c1').status = 'done';

        expect(keys(board.getColumn('backlog'))).toEqual(['c2']);
        expect(keys(board.getColumn('done'))).toEqual(['c1', 'c6']);
        expect(board.getColumn('done').body.items[0]).toBe(card);
        expect(board.getCard('c1')).toBe(card);
        expect(card.id).toBe(id);
        expect(card.isDestroyed).toBeFalsy();
        expect(board.getColumn('backlog').count).toBe(1);
        expect(board.getColumn('done').count).toBe(2)
    });

    test('an order change re-sorts inside the column', () => {
        store = createStore();
        board = createBoard({store});

        store.get('c5').order = 500;

        expect(keys(board.getColumn('in-progress'))).toEqual(['c5', 'c3', 'c4']);

        store.get('c5').order = 1500;

        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c5', 'c4'])
    });

    test('a re-projection that finds the card in place is a no-op', () => {
        store = createStore();
        board = createBoard({store});

        const column = board.getColumn('in-progress'),
              before = [...column.body.items];

        board.reconcileColumn(column);
        board.project();

        expect(column.body.items).toEqual(before);
        expect(column.body.items.every(card => !card.isDestroyed)).toBe(true);

        // The zone's path: the DOM move lands first, then one set of status and order follows — the projection
        // finds the card where the record says it belongs and leaves it alone
        const card = board.getCard('c2'),
              done = board.getColumn('done');

        done.body.insert(0, card);
        store.get('c2').set({status: 'done', order: 500});

        expect(done.body.items[0]).toBe(card);
        expect(keys(done)).toEqual(['c2', 'c6']);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1']);

        // The source column re-projects from the status's oldValue, not from where the card already sits
        expect(board.getColumn('backlog').count).toBe(1);
        expect(done.count).toBe(2);
        expect(board.getColumn('backlog').header.vdom.cn[1].text).toBe('1')
    });

    test('store add and remove create and destroy exactly one card', () => {
        store = createStore();
        board = createBoard({store});

        expect(board.cardMap.size).toBe(6);

        store.add({id: 'c7', title: 'Graph audit', status: 'done', order: 500});

        expect(board.cardMap.size).toBe(7);
        expect(keys(board.getColumn('done'))).toEqual(['c7', 'c6']);

        const card = board.getCard('c7');

        store.remove(store.get('c7'));

        expect(board.cardMap.size).toBe(6);
        expect(keys(board.getColumn('done'))).toEqual(['c6']);
        expect(card.isDestroyed).toBe(true);
        expect(board.getCard('c7')).toBeNull()
    });

    test('a WIP limit crossed marks the column and its badge, back under clears it', () => {
        store = createStore();
        board = createBoard({store, columns: [{status: 'backlog'}, {status: 'in-progress', wipLimit: 2}, {status: 'done'}]});

        const column = board.getColumn('in-progress');

        expect(column.isWipExceeded).toBe(true);
        expect(column.cls).toContain('neo-board-column-wip-exceeded');
        expect(column.header.vdom.cn[1].cls).toContain('neo-board-column-wip-exceeded');

        store.get('c5').status = 'done';

        expect(column.isWipExceeded).toBe(false);
        expect(column.cls).not.toContain('neo-board-column-wip-exceeded');
        expect(column.header.vdom.cn[1].cls).not.toContain('neo-board-column-wip-exceeded');
        expect(column.header.vdom.cn[1].text).toBe('2/2')
    });

    test('the header updates its nodes in place: same objects, stable ids, across count changes', () => {
        store = createStore();
        board = createBoard({store, columns: [{status: 'backlog'}, {status: 'in-progress', wipLimit: 8}, {status: 'review'}, {status: 'done'}]});

        const column                 = board.getColumn('in-progress'),
              nodes                  = column.header.vdom.cn,
              [title, badge, toggle] = nodes;

        expect(nodes.map(node => node.id)).toEqual([`${column.id}__title`, `${column.id}__count`, `${column.id}__collapse`]);
        expect(badge.text).toBe('3/8');

        // Two quick moves out and back: the witness that doubled the badge in the browser
        store.get('c3').status = 'review';
        store.get('c3').status = 'in-progress';
        store.get('c1').status = 'in-progress';

        expect(column.header.vdom.cn[0]).toBe(title);
        expect(column.header.vdom.cn[1]).toBe(badge);
        expect(column.header.vdom.cn[2]).toBe(toggle);
        expect(column.header.vdom.cn.length).toBe(3);
        expect(badge.text).toBe('4/8');
        expect(badge.id).toBe(`${column.id}__count`)
    });

    test('a collapsed column hides its body, keeps its count, and toggles back', () => {
        store = createStore();
        board = createBoard({store, columns: [{status: 'backlog'}, {status: 'in-progress'}, {status: 'done', collapsed: true}]});

        const column = board.getColumn('done');

        expect(column.cls).toContain('neo-board-column-collapsed');
        expect(column.body.hidden).toBe(true);
        expect(column.header.vdom.cn[1].text).toBe('1');
        expect(column.header.vdom.cn[2]['aria-expanded']).toBe('false');

        column.collapsed = false;

        expect(column.cls).not.toContain('neo-board-column-collapsed');
        expect(column.body.hidden).toBe(false);
        expect(column.header.vdom.cn[2]['aria-expanded']).toBe('true')
    });

    test('column and card ids derive from the status and the record key, and distinct values stay distinct', () => {
        store = createStore([
            ...cards(),
            {id: 'c 8/x', title: 'Odd key',        status: 'needs review', order: 1000},
            {id: 'a/b',   title: 'Slash key',      status: 'in progress',  order: 1000},
            {id: 'a-b',   title: 'Hyphen key',     status: 'in progress',  order: 2000},
            {id: 'a_b',   title: 'Underscore key', status: 'in-progress',  order: 4000}
        ]);
        board = createBoard({store});

        expect(board.getColumn('in-progress').id).toBe(`${board.id}__col__in-progress`);
        expect(board.getColumn('in progress').id).toBe(`${board.id}__col__in_20_progress`);
        expect(board.getColumn('needs review').id).toBe(`${board.id}__col__needs_20_review`);
        expect(board.getCard('c3').id).toBe(`${board.id}__card__c3`);
        expect(board.getCard('c 8/x').id).toBe(`${board.id}__card__c_20_8_2f_x`);
        expect(board.getCard('a/b').id).toBe(`${board.id}__card__a_2f_b`);
        expect(board.getCard('a-b').id).toBe(`${board.id}__card__a-b`);
        expect(board.getCard('a_b').id).toBe(`${board.id}__card__a_5f_b`);

        // Every component resolves to itself through the instance manager: no two share an id
        [board.getColumn('in-progress'), board.getColumn('in progress'), board.getCard('c3'), board.getCard('a/b'), board.getCard('a-b'), board.getCard('a_b')]
            .forEach(component => expect(Neo.getComponent(component.id)).toBe(component));

        expect(Board.slug('Ünicode')).toBe('_dc_nicode')
    });

    test('a number key and a string key that read the same keep distinct card ids', () => {
        store = createStore([
            {id: 1,   title: 'Number key', status: 'backlog', order: 1000},
            {id: '1', title: 'String key', status: 'backlog', order: 2000}
        ]);
        board = createBoard({store});

        const
            numberCard = board.getCard(1),
            stringCard = board.getCard('1');

        expect(numberCard.record.title).toBe('Number key');
        expect(stringCard.record.title).toBe('String key');
        expect(numberCard.id).toBe(`${board.id}__card__1`);
        expect(stringCard.id).not.toBe(numberCard.id);
        [numberCard, stringCard].forEach(card => expect(Neo.getComponent(card.id)).toBe(card));

        // Every type keeps its own slug, so no two values share one
        expect(new Set([1, '1', NaN, 'NaN', true, 'true', 1n].map(value => Board.slug(value))).size).toBe(7)
    });

    test('a batch that moves a card and changes a rendered field delivers both', () => {
        store = createStore();
        board = createBoard({store});

        const card = board.getCard('c1');

        store.get('c1').set({status: 'done', title: 'Changed'});

        expect(keys(board.getColumn('done'))).toEqual(['c1', 'c6']);
        expect(board.getColumn('done').body.items[0]).toBe(card);
        expect(card.vdom.cn[0].text).toBe('Changed');

        // The display-only control
        store.get('c1').set({title: 'Changed again'});

        expect(board.getColumn('done').body.items[0]).toBe(card);
        expect(card.vdom.cn[0].text).toBe('Changed again')
    });

    test('derived columns: a status seen for the first time gets its column and the card survives', () => {
        store = createStore();
        board = createBoard({store});

        const card = board.getCard('c1'),
              id   = card.id;

        store.get('c1').status = 'review';

        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'done', 'review']);
        expect(board.getCard('c1')).toBe(card);
        expect(card.id).toBe(id);
        expect(card.isDestroyed).toBeFalsy();
        expect(Neo.getComponent(id)).toBe(card);
        expect(keys(board.getColumn('review'))).toEqual(['c1']);
        expect(board.getColumn('review').count).toBe(1);
        expect(board.getColumn('backlog').count).toBe(1)
    });

    test('explicit columns: a status without a column parks the card, and it returns as the same instance', () => {
        store = createStore();
        board = createBoard({store, columns: [{status: 'backlog'}, {status: 'in-progress'}, {status: 'done'}]});

        const card = board.getCard('c3');

        store.get('c3').status = 'archived';

        expect(board.getCard('c3')).toBe(card);
        expect(card.isDestroyed).toBeFalsy();
        expect(card.parent).toBeFalsy();
        expect(keys(board.getColumn('in-progress'))).toEqual(['c4', 'c5']);
        expect(board.cardMap.size).toBe(6);

        store.get('c3').status = 'done';

        expect(board.getColumn('done').body.items).toContain(card);
        expect(board.getCard('c3')).toBe(card)
    });

    test('records without an order get one inside their column, in store order, after the highest existing', () => {
        store = createStore([
            {id: 'u1', title: 'A', status: 'todo'},
            {id: 'u2', title: 'B', status: 'todo', order: 5000},
            {id: 'u3', title: 'C', status: 'todo'},
            {id: 'u4', title: 'D', status: 'doing'}
        ]);
        board = createBoard({store});

        expect(store.get('u1').order).toBe(6000);
        expect(store.get('u3').order).toBe(7000);
        expect(store.get('u4').order).toBe(1000);
        expect(keys(board.getColumn('todo'))).toEqual(['u2', 'u1', 'u3'])
    });

    test('the default card items render title, tags, progress and avatars; a missing field renders nothing', () => {
        store = createStore();
        board = createBoard({store});

        const full   = board.getCard('c1').vdom.cn,
              bare   = board.getCard('c2').vdom.cn,
              tinted = board.getCard('c3');

        expect(full.map(node => node.cls[0])).toEqual([
            'neo-board-card-title', 'neo-board-card-tags', 'neo-board-card-progress', 'neo-board-card-avatars', 'neo-board-card-menu-button'
        ]);
        expect(full[0].text).toBe('Atlas feed');
        expect(full[1].cn.map(node => node.text)).toEqual(['feed', 'ops']);
        expect(full[2]['aria-valuenow']).toBe(10);
        expect(full[3].cn.map(node => node.text)).toEqual(['AL', 'GH']);
        expect(bare.map(node => node.cls[0])).toEqual(['neo-board-card-title', 'neo-board-card-menu-button']);
        expect(tinted.style['--neo-board-card-accent-color']).toBe('#f59e0b')
    });

    test('a field change outside status and order re-renders the card where it is', () => {
        store = createStore();
        board = createBoard({store});

        const card   = board.getCard('c4'),
              column = board.getColumn('in-progress');

        store.get('c4').title = 'Delta vessel, refit';
        store.get('c4').tags  = ['refit'];

        expect(column.body.items.indexOf(card)).toBe(1);
        expect(card.vdom.cn[0].text).toBe('Delta vessel, refit');
        expect(card.vdom.cn[1].cn[0].text).toBe('refit')
    });

    test('changing the columns after construction re-projects; a dropped column parks its cards', () => {
        store = createStore();
        board = createBoard({store});

        const c6 = board.getCard('c6');

        board.columns = [{status: 'in-progress', title: 'Doing'}, {status: 'backlog'}];

        expect(statuses(board)).toEqual(['in-progress', 'backlog']);
        expect(board.getColumn('in-progress').title).toBe('Doing');
        expect(board.getColumn('done')).toBeNull();
        expect(c6.isDestroyed).toBeFalsy();
        expect(c6.parent).toBeFalsy();
        expect(board.getCard('c6')).toBe(c6);
        expect(board.cardMap.size).toBe(6);

        // The column comes back: the same card instance lands in it
        board.columns = null;

        expect(board.getColumn('done').body.items).toContain(c6)
    });

    test('moveCard fires cardMove with unified {action, record, changes, previous} envelope alongside {from, to}', () => {
        store = createStore();
        board = createBoard({store});

        const
            moves  = [],
            record = store.get('c1');

        board.on('cardMove', payload => moves.push(payload));

        board.moveCard({
            record,
            status: 'in-progress',
            index : 1,
            fields: {progress: 55}
        });

        expect(moves).toHaveLength(1);
        expect(moves[0].action).toBe('move');
        expect(moves[0].record).toBe(record);
        expect(moves[0].from).toEqual({index: 0, lane: null, status: 'backlog'});
        expect(moves[0].to).toEqual({index: 1, lane: null, status: 'in-progress'});
        expect(moves[0].changes).toEqual({
            order   : 1500,
            progress: 55,
            status  : 'in-progress'
        });
        expect(moves[0].previous).toEqual({
            order   : 1000,
            progress: 10,
            status  : 'backlog'
        })
    });

    test('the column that receives the roving tabIndex flushes it', () => {
        store = createStore([
            {id: 'c1', title: 'A', status: 'backlog',     order: 1000},
            {id: 'c3', title: 'C', status: 'in-progress', order: 1000},
            {id: 'c4', title: 'D', status: 'in-progress', order: 2000}
        ]);
        board = createBoard({store, columns: [{status: 'backlog'}, {status: 'in-progress'}]});

        const sm      = board.selectionModel, body = board.getColumn('in-progress').body, update = body.update.bind(body);
        let   flushes = 0;

        sm.focusedKey = 'c1';
        sm.syncAnnotations(true);
        body.update = (...args) => {flushes++; return update(...args)};

        store.remove(store.get('c1'));

        expect(board.getCard('c3').vdom.tabIndex).toBe(0);
        expect(flushes).toBeGreaterThan(0)
    });

    test('cross-column moves merge both column bodies into the yielded board update when a sibling column is in flight', () => {
        store = createStore();
        board = createBoard({store});

        const
            backlog    = board.getColumn('backlog'),
            inProgress = board.getColumn('in-progress'),
            done       = board.getColumn('done');

        for (const inst of [board, backlog, inProgress, done, backlog.body, inProgress.body, done.body]) {
            inst.vnodeInitialized = true;
            inst.vnode            = {id: inst.id, childNodes: []};
            inst.mounted          = true;
            inst._needsVdomUpdate = false
        }

        Neo.config.allowVdomUpdatesInTests = true;
        VDomUpdate.registerInFlightUpdate(done.id, 1);

        try {
            store.get('c3').set({status: 'backlog', order: 500});

            expect(board.updateDepth).toBe(-1);
            expect(board.needsVdomUpdate).toBe(true);
            expect(backlog.body.isVdomUpdating).toBe(false);
            expect(inProgress.body.isVdomUpdating).toBe(false);

            const mergedIds = VDomUpdate.getMergedChildIds(board.id);
            expect(mergedIds?.has(backlog.body.id)).toBe(true);
            expect(mergedIds?.has(inProgress.body.id)).toBe(true)
        } finally {
            Neo.config.allowVdomUpdatesInTests = false;
            VDomUpdate.unregisterInFlightUpdate(done.id);
            VDomUpdate.mergedCallbackMap.remove(board.id);
            VDomUpdate.postUpdateQueueMap.remove(done.id);
            VDomUpdate.promiseCallbackMap.delete(board.id)
        }
    })
});
