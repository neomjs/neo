import {setup} from '../../setup.mjs';

const appName = 'BoardSortZoneTest';

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
import Container       from '../../../../src/container/Base.mjs';
import Rectangle       from '../../../../src/util/Rectangle.mjs';
import Board           from '../../../../src/board/Container.mjs';
import BoardSortZone   from '../../../../src/board/SortZone.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';

/**
 * @summary `moveCard`, the board's one writer: its order math (the midpoint, both ends, an empty column, and a
 * rebalance that stays silent), one `recordChange` per move, `cardMove` with both ends, and the card instance
 * surviving the move.
 */
const
    cards = () => [
        {id: 'c1', title: 'Atlas',  status: 'backlog',     order: 1000},
        {id: 'c2', title: 'Beacon', status: 'backlog',     order: 2000},
        {id: 'c3', title: 'Cipher', status: 'in-progress', order: 1000},
        {id: 'c4', title: 'Delta',  status: 'in-progress', order: 2000},
        {id: 'c5', title: 'Echo',   status: 'in-progress', order: 3000},
        {id: 'c6', title: 'Flux',   status: 'done',        order: 1000}
    ],
    columns       = [{status: 'backlog'}, {status: 'in-progress'}, {status: 'review'}, {status: 'done'}],
    createStore   = (data=cards()) => Neo.create(Store, {keyProperty: 'id', model: CardModel, data}),
    createBoard   = config => Neo.create(Board, {appName, columns, ...config}),
    keys          = column => column.body.items.map(card => card.record.id),
    recordChanges = store => {
        const events = [];
        store.on('recordChange', ({fields, record}) => events.push({id: record.id, names: fields.map(field => field.name).sort()}));
        return events
    };

test.describe('Neo.board.Container#moveCard', () => {
    let board, store;

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('lands between two neighbours at their midpoint and moves the same card across columns', () => {
        store = createStore();
        board = createBoard({store});

        const
            card   = board.getCard('c5'),
            events = recordChanges(store),
            moves  = [],
            record = store.get('c5');

        board.on('cardMove', data => moves.push(data));

        expect(board.moveCard({record, status: 'backlog', index: 1})).toBe(record);

        expect(record.order).toBe(1500);
        expect(record.status).toBe('backlog');
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c5', 'c2']);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c4']);
        expect(board.getCard('c5')).toBe(card);

        expect(events).toEqual([{id: 'c5', names: ['order', 'status']}]);
        expect(moves).toHaveLength(1);
        expect(moves[0].record).toBe(record);
        expect(moves[0].from).toEqual({index: 2, lane: null, status: 'in-progress'});
        expect(moves[0].to).toEqual({index: 1, lane: null, status: 'backlog'})
    });

    test('a move inside its column reports order alone', () => {
        store = createStore();
        board = createBoard({store});

        const events = recordChanges(store);

        board.moveCard({record: store.get('c2'), status: 'backlog', index: 0});

        expect(store.get('c2').order).toBe(0);
        expect(keys(board.getColumn('backlog'))).toEqual(['c2', 'c1']);
        expect(events).toEqual([{id: 'c2', names: ['order']}])
    });

    test('appends after the last card, and opens an empty column at 1000', () => {
        store = createStore();
        board = createBoard({store});

        const moves = [];
        board.on('cardMove', data => moves.push(data));

        board.moveCard({record: store.get('c1'), status: 'in-progress'});
        expect(store.get('c1').order).toBe(4000);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c4', 'c5', 'c1']);

        board.moveCard({record: store.get('c6'), status: 'review', index: 3});
        expect(store.get('c6').order).toBe(1000);
        expect(keys(board.getColumn('review'))).toEqual(['c6']);
        expect(moves[1].to).toEqual({index: 0, lane: null, status: 'review'})
    });

    test('beforeId and afterId resolve against the column without the moved card', () => {
        store = createStore();
        board = createBoard({store});

        board.moveCard({record: store.get('c6'), status: 'in-progress', beforeId: 'c4'});
        expect(store.get('c6').order).toBe(1500);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c6', 'c4', 'c5']);

        board.moveCard({record: store.get('c1'), status: 'in-progress', afterId: 'c3'});
        expect(store.get('c1').order).toBe(1250);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c1', 'c6', 'c4', 'c5'])
    });

    test('the card id resolves the record: the agent arm, no pointer', () => {
        store = createStore();
        board = createBoard({store});

        const record = board.moveCard({cardId: board.getCardId(store.get('c3')), status: 'done', index: 0});

        expect(record.id).toBe('c3');
        expect(record.order).toBe(0);
        expect(keys(board.getColumn('done'))).toEqual(['c3', 'c6'])
    });

    test('the key resolves a record its window has not rendered: the agent arm on a bounded column', () => {
        store = createStore(Array.from({length: 12}, (_, i) => ({id: `t${i}`, title: `Card ${i}`, status: 'backlog', order: (i + 1) * 1000})));
        board = createBoard({store, columns: [{status: 'backlog', maxRenderedCards: 2, overscan: 0, retainOffscreen: 2}, {status: 'done'}]});

        const events = recordChanges(store),
              record = store.get('t9');

        expect(board.getCard('t9'), 'control: the window rendered no card for it').toBe(null);
        expect(board.moveCard({cardId: board.getCardId(record), status: 'backlog', index: 1}), 'control: so no card id reaches it').toBe(null);

        expect(board.moveCard({key: 't9', status: 'backlog', index: 1})).toBe(record);
        expect(record.order).toBe(1500);
        expect(board.getColumnRecords('backlog').indexOf(record)).toBe(1);
        expect(events).toEqual([{id: 't9', names: ['order']}])
    });

    test('a record wins over a key and a key over a card id; an unknown key moves nothing', () => {
        store = createStore();
        board = createBoard({store});

        const events = recordChanges(store),
              c1Card = board.getCardId(store.get('c1'));

        expect(board.moveCard({key: 'c3', cardId: c1Card, status: 'done', index: 0}).id).toBe('c3');
        expect(board.moveCard({record: store.get('c2'), key: 'c4', status: 'done', index: 0}).id).toBe('c2');
        expect(board.moveCard({key: 'missing', cardId: c1Card, status: 'done'})).toBe(null);
        expect(events.map(event => event.id)).toEqual(['c3', 'c2'])
    });

    test('an unresolved record or column moves nothing', () => {
        store = createStore();
        board = createBoard({store});

        const events = recordChanges(store);

        expect(board.moveCard({cardId: 'missing', status: 'done'})).toBe(null);
        expect(board.moveCard({record: store.get('c1'), status: 'archived'})).toBe(null);
        expect(events).toEqual([])
    });

    test('a gap too small to split renumbers the column for every view of the store, then splits it', () => {
        store = createStore([
            {id: 'c1', title: 'Atlas',  status: 'backlog', order: 1000},
            {id: 'c2', title: 'Beacon', status: 'backlog', order: 1000 + 1e-10},
            {id: 'c3', title: 'Cipher', status: 'done',    order: 1000}
        ]);
        board = createBoard({store});

        const events = recordChanges(store);

        board.moveCard({record: store.get('c3'), status: 'backlog', index: 1});

        expect(store.get('c1').order).toBe(1000);
        expect(store.get('c2').order).toBe(2000);
        expect(store.get('c3').order).toBe(1500);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c3', 'c2']);
        // A grid over the same store hears the renumbered sibling; c1 kept its order, so it fires nothing
        expect(events).toEqual([{id: 'c2', names: ['order']}, {id: 'c3', names: ['order', 'status']}])
    });

    test('the board sits its own rebalance out: no intermediate order reaches its columns', () => {
        store = createStore([
            {id: 'c1', title: 'Atlas',  status: 'backlog', order: 5},
            {id: 'c2', title: 'Beacon', status: 'backlog', order: 5 + 1e-10},
            {id: 'c3', title: 'Cipher', status: 'done',    order: 1000}
        ]);
        board = createBoard({store});

        const
            cards   = ['c1', 'c2'].map(id => board.getCard(store.get(id))),
            columns = [];

        // The board listens first, so each entry is its column after it handled that event
        store.on('recordChange', () => columns.push(keys(board.getColumn('backlog'))));

        board.moveCard({record: store.get('c3'), status: 'backlog', index: 1});

        // c1's write alone gives [1000, 5 + 1e-10], a flipped order the board must not project
        expect(columns).toEqual([['c1', 'c2'], ['c1', 'c2'], ['c1', 'c3', 'c2']]);
        expect(['c1', 'c2'].map(id => board.getCard(store.get(id)))).toEqual(cards)
    });

    test('a drop into a 2,000-record column changes one record', () => {
        const data = Array.from({length: 2000}, (_, i) => ({id: `r${i}`, title: `R ${i}`, status: 'backlog', order: (i + 1) * 1000}));

        store = createStore(data.concat({id: 'x', title: 'X', status: 'done', order: 1000}));
        board = createBoard({store, columns: [{status: 'backlog'}, {status: 'done'}]});

        const events = recordChanges(store),
              card   = board.getCard('x');

        board.moveCard({record: store.get('x'), status: 'backlog', index: 1000});

        expect(events).toEqual([{id: 'x', names: ['order', 'status']}]);
        expect(store.get('x').order).toBe(1000500);
        expect(board.getColumnRecords('backlog')[1000].id).toBe('x');
        expect(board.getCard('x')).toBeNull();
        board.getColumn('backlog').setWindowStart(950);
        expect(board.getCard('x')).toBe(card)
    })
});

/**
 * @summary The zone, driven with synthetic drag data on a fake geometry (columns 300px apart, cards 100px apart):
 * a cancel or a drop where it started writes nothing, a drop elsewhere commits once through `moveCard` and the card
 * follows in the tree, an empty column takes the card at 1000, a collapsed one appends it.
 */
test.describe('Neo.board.SortZone', () => {
    let board, deltas, placed, store;

    const
        realApplyDeltas   = Neo.applyDeltas,
        realGetAttributes = Neo.main.DomAccess.getAttributes,
        realGetDomRect    = Container.prototype.getDomRect,
        // A card's rect follows the DOM: a node the zone moved sits where its delta put it and pushes the cards at
        // and after that index down
        rectFor = id => {
            if (id === board.id) return new Rectangle(0, 0, 1200, 600);
            const columnIndex = board.items.findIndex(column => column.id === id || column.body.id === id);

            if (columnIndex > -1) {
                const column = board.items[columnIndex], x = columnIndex * 300;
                return id === column.id ? new Rectangle(x, 0, 280, 600) : new Rectangle(x, 50, 280, 550)
            }

            // A body's cards root spans its cards in the flow
            const rootIndex = board.items.findIndex(column => column.body.getVdomItemsRoot().id === id);

            if (rootIndex > -1) {
                return new Rectangle(rootIndex * 300, 60, 280, Math.max(0, board.items[rootIndex].body.items.length * 100 - 20))
            }

            const
                card = Neo.getComponent(id),
                move = placed[id],
                body = move ? board.items.find(column => column.body.getVdomItemsRoot().id === move.parentId).body : card.parent;

            let index = move ? move.index : body.items.indexOf(card);

            move || Object.entries(placed).forEach(([movedId, moved]) => {
                moved.parentId === body.getVdomItemsRoot().id && Neo.getComponent(movedId).parent !== body && index >= moved.index && index++
            });

            return new Rectangle(board.items.indexOf(body.parent) * 300, 60 + index * 100, 280, 80)
        },
        startZone = async (config={}) => {
            board = createBoard({store, sortZoneConfig: {module: BoardSortZone, timeout: () => Promise.resolve()}, ...config});

            for (let i = 0; i < 10 && !board.sortZone; i++) {
                await Promise.resolve()
            }

            // Nothing renders here, so the cards roots get the ids a render would give them
            board.items.forEach(column => column.body && (column.body.getVdomItemsRoot().id ??= `${column.body.id}__cards`));

            const zone = board.sortZone;

            zone.dragStart = async () => {
                Object.assign(zone, {boundaryContainerRect: new Rectangle(0, 0, 1200, 600), offsetX: 0, offsetY: 0})
            };
            zone.dragEnd = () => {};

            return zone
        },
        drag = (zone, cardId, clientX, clientY) => zone.onDragStart({clientX, clientY, path: [{id: board.getCard(cardId).id}]}),
        // Holds every column-body measurement (the zone's pin) until released, so a move can arrive mid-start
        holdPins = () => {
            const held = [];

            Container.prototype.getDomRect = ids => board.items.some(column => column.body.id === ids[0]) ?
                new Promise(resolve => held.push(() => resolve(ids.map(rectFor)))) :
                Promise.resolve(ids.map(rectFor));

            return {held, release() {
                Container.prototype.getDomRect = ids => Promise.resolve(ids.map(rectFor));
                held.splice(0).forEach(resume => resume())
            }}
        },
        settle = async () => {
            for (let i = 0; i < 20; i++) {
                await Promise.resolve()
            }
        },
        expectNothingPinned = () => {
            board.items.forEach(column => {
                expect(column.body.style?.position ?? null, `${column.status} body`).toBe(null);
                expect(column.body.style?.height ?? null, `${column.status} body`).toBe(null);
                expect(column.body.getVdomItemsRoot().style?.minHeight ?? null, `${column.status} cards`).toBe(null)
            });
            board.cardMap.forEach(card => expect(card.wrapperStyle?.position ?? null, card.record.id).toBe(null))
        },
        root = status => board.getColumn(status).body.getVdomItemsRoot().id,
        // Two sliced columns of 300 records, four rendered at a time: b0…b299 and p0…p299, order (i + 1) · 1000
        slicedStore = () => createStore(['b', 'p'].flatMap(prefix => Array.from({length: 300}, (_, i) => ({
            id: `${prefix}${i}`, title: `${prefix} ${i}`, status: prefix === 'b' ? 'backlog' : 'in-progress', order: (i + 1) * 1000
        })))),
        slicedColumns = [
            {status: 'backlog',     maxRenderedCards: 4, overscan: 0, retainOffscreen: 8},
            {status: 'in-progress', maxRenderedCards: 4, overscan: 0, retainOffscreen: 8},
            {status: 'review'},
            {status: 'done'}
        ],
        ids = status => board.getColumnRecords(status).map(record => record.id),
        // The state `beginColumnSort` and the sort leave at a drop: the commit boundary, for a window that moved under
        // the drag, which a pointer cannot reach without column-window card pinning
        dropAt = (zone, {card, column, items, map=null, slot, start=column, startIndex=slot}) => {
            Object.assign(zone, {
                activeColumn : column,
                columnItems  : items,
                currentIndex : slot,
                dragComponent: card,
                dragRecord   : card.record,
                indexMap     : map || Object.fromEntries(items.map((item, i) => [i, i])),
                itemStyles   : items.map(() => ({})),
                startColumn  : start,
                startIndex
            });

            return zone.processDragEnd({})
        };

    test.beforeEach(() => {
        deltas = [];
        placed = {};
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {setConfigs: () => Promise.resolve({}), setDragProxyElement: () => Promise.resolve()};
        Neo.applyDeltas = (windowId, list) => {
            deltas.push(...list);
            list.forEach(delta => delta.action === 'moveNode' && (placed[delta.id] = {index: delta.index, parentId: delta.parentId}));
            return Promise.resolve()
        };
        // The fake geometry does not scroll
        Neo.main.DomAccess.getAttributes = () => Promise.resolve({scrollTop: 0});
        Container.prototype.getDomRect   = ids => Promise.resolve(ids.map(rectFor))
    });

    test.afterEach(() => {
        Neo.applyDeltas                  = realApplyDeltas;
        Neo.main.DomAccess.getAttributes = realGetAttributes;
        Container.prototype.getDomRect   = realGetDomRect;
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('arms every card as a drag target and none of the columns, cards added later included', async () => {
        store = createStore();

        await startZone();

        const armed = component => (component.wrapperCls || []).includes('neo-draggable');

        expect([...board.cardMap.values()].every(armed)).toBe(true);
        expect(board.items.some(armed)).toBe(false);

        store.add({id: 'c7', title: 'Graph', status: 'backlog', order: 3000});

        expect(armed(board.getCard('c7'))).toBe(true)
    });

    test('Escape after a cross-column move puts the node back and writes nothing', async () => {
        store = createStore();

        const zone = await startZone(), card = board.getCard('c1'), events = recordChanges(store);

        await drag(zone, 'c1', 100, 70);
        expect(zone.activeColumn).toBe(board.getColumn('backlog'));

        await zone.onDragMove({clientX: 400, clientY: 160});
        expect(zone.activeColumn).toBe(board.getColumn('in-progress'));
        expect(deltas).toEqual([{action: 'moveNode', id: card.id, index: 1, parentId: root('in-progress')}]);

        await zone.onDragCancel({});

        expect(events).toEqual([]);
        expect(deltas[1]).toEqual({action: 'moveNode', id: card.id, index: 0, parentId: root('backlog')});
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2']);
        expect(card.wrapperStyle.visibility ?? null).toBe(null);
        expect(card.wrapperStyle.position ?? null).toBe(null)
    });

    test('a drag in a scrolled column sorts in the body\'s content space, and its cards keep their in-flow height until the cancel', async () => {
        store = createStore();

        const zone = await startZone(), column = board.getColumn('in-progress');

        // Bodies sit at y 50 and cards 100 apart from y 60: scrolled by 40, the cards start 50 into the content
        Neo.main.DomAccess.getAttributes = () => Promise.resolve({scrollTop: 40});
        await drag(zone, 'c4', 400, 170);

        expect(zone.scrollTop).toBe(40);
        expect(zone.itemRects.map(rect => rect.y)).toEqual([50, 150, 250]);
        expect(column.body.items.map(card => card.wrapperStyle.top)).toEqual(['50px', '150px', '250px']);
        expect(column.body.getVdomItemsRoot().style.minHeight, 'three cards span 280px in the flow').toBe('280px');

        await zone.onDragCancel({});

        expectNothingPinned()
    });

    test('a drop in another column commits once through moveCard and the card follows in the tree', async () => {
        store = createStore();

        const zone = await startZone(), card = board.getCard('c1'), events = recordChanges(store);

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});
        await zone.onDragEnd({});

        expect(events).toEqual([{id: 'c1', names: ['order', 'status']}]);
        expect(store.get('c1').order).toBe(1500);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c1', 'c4', 'c5']);
        expect(keys(board.getColumn('backlog'))).toEqual(['c2']);
        expect(board.getColumn('backlog').count).toBe(1);
        expect(board.getCard('c1')).toBe(card);
        // The node went home before the commit, so the board's re-projection moved it as for any other writer
        expect(deltas.map(delta => delta.parentId)).toEqual([root('in-progress'), root('backlog')])
    });

    test('the first move after a column entry keeps the index the entry chose', async () => {
        store = createStore();

        const zone = await startZone();

        // The pointer holds the card 70px below its top: the proxy's top, not the pointer, is what the sort measures
        zone.dragStart = async () => {
            Object.assign(zone, {boundaryContainerRect: new Rectangle(0, 0, 1200, 600), offsetX: 0, offsetY: 70})
        };

        await drag(zone, 'c1', 100, 130);
        await zone.onDragMove({clientX: 400, clientY: 152});
        expect(deltas[0].index).toBe(0);

        await zone.onDragMove({clientX: 400, clientY: 152});
        expect(zone.currentIndex).toBe(0)
    });

    // A move can land while the start still awaits its pin measurement (a real browser did, 1 in 9)
    [{name: 'the start column', clientX: 100, clientY: 70}, {name: 'another column', clientX: 400, clientY: 160}].forEach(({name, clientX, clientY}) => {
        test(`a move over ${name} before the drag start has measured is ignored, and the cancel leaves nothing pinned`, async () => {
            store = createStore();

            const zone = await startZone(), pins = holdPins(), starting = drag(zone, 'c1', 100, 70);

            await settle();
            expect(pins.held).toHaveLength(1);

            const moving = zone.onDragMove({clientX, clientY});

            await settle();
            pins.release();
            await Promise.all([starting, moving]);

            expect.soft(deltas).toEqual([]);
            expect.soft(zone.activeColumn).toBe(board.getColumn('backlog'));

            await zone.onDragCancel({clientX, clientY});
            expectNothingPinned()
        })
    });

    test('the drop commits the record the drag started with, even when the card view is reused meanwhile', async () => {
        store = createStore();

        const zone = await startZone();

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});

        // A recycling column (the density leaf) hands the same view another record mid-drag
        board.getCard('c1').record = store.get('c2');

        await zone.onDragEnd({});

        expect(store.get('c1').status).toBe('in-progress');
        expect(store.get('c2').status).toBe('backlog')
    });

    test('only cards sort: a spacer in the body stays out, and the home slot is the card\'s place among the items', async () => {
        store = createStore();

        const zone = await startZone(), card = board.getCard('c1');

        board.getColumn('backlog').body.insert(0, {ntype: 'component', id: 'backlog-spacer'});

        await drag(zone, 'c1', 100, 170);
        expect(zone.columnItems.map(item => item.id)).toEqual([card.id, board.getCard('c2').id]);

        await zone.onDragMove({clientX: 400, clientY: 160});
        await zone.onDragCancel({});

        expect(deltas.at(-1)).toEqual({action: 'moveNode', id: card.id, index: 1, parentId: root('backlog')});
        expect((Neo.getComponent('backlog-spacer').wrapperCls || []).includes('neo-draggable')).toBe(false)
    });

    test('a drop where the card started writes nothing', async () => {
        store = createStore();

        const zone = await startZone(), events = recordChanges(store);

        await drag(zone, 'c2', 100, 170);
        await zone.onDragEnd({});

        expect(events).toEqual([]);
        expect(deltas).toEqual([]);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2'])
    });

    test('a drop lower in the same column changes order alone', async () => {
        store = createStore();

        const zone = await startZone(), events = recordChanges(store);

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 100, clientY: 170});
        expect(zone.currentIndex).toBe(1);
        expect(board.getCard('c2').wrapperStyle.top).toBe('10px');

        await zone.onDragEnd({});

        expect(events).toEqual([{id: 'c1', names: ['order']}]);
        expect(keys(board.getColumn('backlog'))).toEqual(['c2', 'c1'])
    });

    test('a multi-card release below the board restores its preview without writing the last column', async () => {
        store = createStore();
        const zone = await startZone(), events = recordChanges(store), moves = [];
        board.selectionModel.setSelection(['c1', 'c2']);
        board.on('cardMove', () => moves.push('one'));
        board.on('cardsMove', () => moves.push('many'));

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});
        expect(zone.activeColumn).toBe(board.getColumn('in-progress'));
        await zone.onDragEnd({clientX: 1000, clientY: 740});

        expect(events).toEqual([]);
        expect(moves).toEqual([]);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2']);
        expect(deltas.at(-1).parentId).toBe(root('backlog'));
        expectNothingPinned()
    });

    test('moving below another column keeps the placeholder in the same column and slot', async () => {
        store = createStore();
        const zone = await startZone();
        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});
        const count = deltas.length;
        expect(zone.currentIndex).toBe(1);
        await zone.onDragMove({clientX: 1000, clientY: 740});
        expect(zone.activeColumn).toBe(board.getColumn('in-progress'));
        expect(zone.currentIndex).toBe(1);
        expect(deltas).toHaveLength(count);
        await zone.onDragCancel({clientX: 1000, clientY: 740})
    });

    test('releasing in a board gutter commits the pictured slot without sorting at the release height', async () => {
        store = createStore();
        const zone = await startZone(), events = recordChanges(store);
        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});
        const gap = {clientX: 290, clientY: 500};
        await zone.onDragMove(gap);
        expect(zone.activeColumn).toBe(board.getColumn('in-progress'));
        expect(zone.currentIndex).toBe(1);
        await zone.onDragEnd(gap);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c1', 'c4', 'c5']);
        expect(events).toEqual([{id: 'c1', names: ['order', 'status']}]);
        expectNothingPinned()
    });

    test('the release uses the current board viewport, and an ended gesture takes no new measurement', async () => {
        store = createStore();
        const zone = await startZone(), events = recordChanges(store), point = {clientX: 400, clientY: 160};
        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove(point);

        // The scrollable columns can extend beyond the visible board.
        board.getDomRect = async ids => ids.map(id => id === board.id ? new Rectangle(0, 0, 300, 600) : rectFor(id));
        await zone.onDragEnd(point);
        expect(events).toEqual([]);
        expectNothingPinned();

        board.getDomRect = () => {throw new Error('release without a live card measured the board')};
        await zone.onDragEnd(point)
    });

    test('an in-board gutter cannot commit to a column scrolled out of view', async () => {
        store = createStore();
        const zone = await startZone(), events = recordChanges(store);

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});
        board.getDomRect = async ids => ids.map(id => id === board.id ? new Rectangle(0, 0, 300, 600) : rectFor(id));
        await zone.onDragEnd({clientX: 290, clientY: 500});

        expect(events).toEqual([]);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2']);
        expectNothingPinned()
    });

    test('an empty column takes the card at index 0 with order 1000', async () => {
        store = createStore();

        const zone = await startZone();

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 700, clientY: 300});
        await zone.onDragEnd({clientX: 700, clientY: 300});

        expect(store.get('c1').order).toBe(1000);
        expect(keys(board.getColumn('review'))).toEqual(['c1'])
    });

    test('a drop onto a collapsed column appends', async () => {
        store = createStore();

        const zone = await startZone();

        board.getColumn('done').collapsed = true;

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 1000, clientY: 20});
        expect(deltas[0].index).toBe(1);

        await zone.onDragEnd({});

        expect(store.get('c1').order).toBe(2000);
        expect(keys(board.getColumn('done'))).toEqual(['c6', 'c1'])
    });

    test('a drop into a sliced column scrolled down lands between the cards it was dropped between', async () => {
        store = slicedStore();

        const zone = await startZone({columns: slicedColumns}), events = recordChanges(store);

        board.getColumn('in-progress').setWindowStart(150);
        expect(keys(board.getColumn('in-progress')), 'control: the window renders p150 on').toEqual(['p150', 'p151', 'p152', 'p153']);

        await drag(zone, 'b0', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 270});
        await zone.onDragEnd({});

        expect(events).toEqual([{id: 'b0', names: ['order', 'status']}]);
        expect(ids('in-progress').slice(150, 154)).toEqual(['p150', 'p151', 'b0', 'p152'])
    });

    test('a card held at the end of a sliced column stays rendered when the window moves back', async () => {
        store = slicedStore();

        const zone = await startZone({columns: slicedColumns}), column = board.getColumn('backlog');

        column.setWindowStart(296);
        expect(keys(column), 'control: the window ends at b299').toEqual(['b296', 'b297', 'b298', 'b299']);

        await drag(zone, 'b299', 100, 370);
        // A scroll slides the window back, as moving the held card up a column scrolled to its end does
        column.setWindowStart(290);

        expect(column.body.items.includes(board.getCard('b299')), 'the held card stays in its column\'s body').toBe(true);
        expect(keys(column), 'the window moves only as far as the held card needs').toEqual(['b296', 'b297', 'b298', 'b299']);

        // The scroll that moved the window, as the body reported it
        column.pendingScroll = {scrollTop: 290 * column.averageCardHeight, stride: column.averageCardHeight};

        await zone.onDragCancel({});

        // Released without a drop, the window returns to that scroll position instead of leaving the viewport on its
        // spacer: a cancel writes nothing, so nothing else re-projects the column
        expect(keys(column), 'the window follows the scroll again').toEqual(['b290', 'b291', 'b292', 'b293'])
    });

    test('a window that moved under the drag cannot pass a real move off as a drop where the card started', async () => {
        store = slicedStore();

        const zone   = await startZone({columns: slicedColumns}), events = recordChanges(store),
              column = board.getColumn('backlog'), dragged = board.getCard('b2');

        column.setWindowStart(150);

        // The same local slot, 2, at the start and at the drop: logically the card moved 149 places down
        const items = [board.getCard('b150'), board.getCard('b151'), dragged, board.getCard('b152'), board.getCard('b153')];

        await dropAt(zone, {card: dragged, column, items, slot: 2, startIndex: 2});

        expect(events).toEqual([{id: 'b2', names: ['order']}]);
        expect(store.get('b2').order).toBe(152500);
        expect(ids('backlog').slice(149, 153)).toEqual(['b150', 'b151', 'b2', 'b152'])
    });

    test('a drop where the record already sits writes nothing and moves no card, judged by its place in the column', async () => {
        store = slicedStore();

        const zone   = await startZone({columns: slicedColumns}), events = recordChanges(store), moves = [],
              column = board.getColumn('backlog');

        column.setWindowStart(150);
        board.on('cardMove', data => moves.push(data));

        const items = ['b150', 'b151', 'b152', 'b153'].map(id => board.getCard(id));

        await dropAt(zone, {card: items[1], column, items, slot: 1});

        expect(events).toEqual([]);
        expect(moves).toEqual([])
    });

    test('the drop reads its neighbour in the order the sort painted, not the order the column holds its cards', async () => {
        store = slicedStore();

        const zone = await startZone({columns: slicedColumns}), column = board.getColumn('backlog');

        column.setWindowStart(150);

        // The sort carried b152 from slot 2 to the top: it paints b152, b150, b151, b153
        const items = ['b150', 'b151', 'b152', 'b153'].map(id => board.getCard(id));

        await dropAt(zone, {card: items[2], column, items, map: {0: 2, 1: 0, 2: 1, 3: 3}, slot: 0, startIndex: 2});

        expect(store.get('b152').order).toBe(150500);
        expect(ids('backlog').slice(149, 153)).toEqual(['b149', 'b152', 'b150', 'b151'])
    });

    test('a drop after the last rendered card lands behind it, not at the end of the column', async () => {
        store = slicedStore();

        const zone = await startZone({columns: slicedColumns}), column = board.getColumn('backlog'), card = board.getCard('p0');

        column.setWindowStart(150);

        const items = [...['b150', 'b151', 'b152', 'b153'].map(id => board.getCard(id)), card];

        await dropAt(zone, {card, column, items, slot: 4, start: board.getColumn('in-progress'), startIndex: 0});

        expect(ids('backlog').slice(152, 156)).toEqual(['b152', 'b153', 'p0', 'b154'])
    });

    [
        {name: 'removed',                 change: () => store.remove(store.get('b152'))},
        {name: 'moved to another column', change: () => store.get('b152').set({status: 'done'})}
    ].forEach(({name, change}) => {
        test(`an anchor ${name} during the drop's await cancels the drop rather than appending`, async () => {
            store = slicedStore();

            const zone = await startZone({columns: slicedColumns}), column = board.getColumn('backlog'), card = board.getCard('p0');

            column.setWindowStart(150);

            const items = [board.getCard('b150'), board.getCard('b151'), card, board.getCard('b152'), board.getCard('b153')];

            zone.timeout = async () => change();

            await dropAt(zone, {card, column, items, slot: 2, start: board.getColumn('in-progress'), startIndex: 0});

            expect(store.get('p0').status).toBe('in-progress');
            expect(store.get('p0').order).toBe(1000)
        })
    });

    test('a record the store replaced under the dragged key cancels the drop: neither the replaced record nor its replacement moves', async () => {
        store = slicedStore();

        const zone     = await startZone({columns: slicedColumns}), column = board.getColumn('backlog'), card = board.getCard('p0'),
              replaced = store.get('p0');

        column.setWindowStart(150);

        const items = [board.getCard('b150'), board.getCard('b151'), card, board.getCard('b152'), board.getCard('b153')];

        zone.timeout = async () => {
            store.remove(replaced);
            store.add({id: 'p0', title: 'p 0 again', status: 'in-progress', order: 1000})
        };

        await dropAt(zone, {card, column, items, slot: 2, start: board.getColumn('in-progress'), startIndex: 0});

        expect(store.get('p0')).not.toBe(replaced);
        expect(store.get('p0').status).toBe('in-progress');
        expect(replaced.status).toBe('in-progress');
        expect(ids('backlog').slice(150, 153)).toEqual(['b150', 'b151', 'b152'])
    });

    test('an expanded column that holds records but rendered no neighbour names no place, so the drop writes nothing', async () => {
        store = slicedStore();

        const zone = await startZone({columns: slicedColumns}), events = recordChanges(store), card = board.getCard('b0');

        await dropAt(zone, {card, column: board.getColumn('in-progress'), items: [card], slot: 0, start: board.getColumn('backlog'), startIndex: 0});

        expect(events).toEqual([]);
        expect(store.get('b0').status).toBe('backlog')
    });

    [{name: 'a drop', end: zone => zone.onDragEnd({})}, {name: 'an Escape', end: zone => zone.onDragCancel({})}].forEach(({name, end}) => {
        test(`${name} after the board's store was detached mid-drag writes nothing and still cleans up`, async () => {
            store = createStore();

            const zone = await startZone(), events = recordChanges(store), moves = [];

            board.on('cardMove', data => moves.push(data));

            await drag(zone, 'c1', 100, 70);
            await zone.onDragMove({clientX: 400, clientY: 160});

            // The anchor is c4 now; detaching the store destroys every card, the dragged one included
            board.store = null;

            await end(zone);

            expect(events).toEqual([]);
            expect(moves).toEqual([]);
            expect(zone.dragComponent).toBe(null);
            expect(zone.activeColumn).toBe(null);
            expect(zone.columnItems).toBe(null);
            expectNothingPinned()
        })
    });

    test('drag fallback skips hidden focused and first selected keys while retaining visible record order', async () => {
        store = createStore();

        const zone         = await startZone(),
              sm           = board.selectionModel,
              firstVisible = store.get('c4'),
              nextVisible  = store.get('c2');

        sm.setSelection(['c1', 'c4', 'c2', 'c3']);
        store.filters = [{property: 'order', operator: '>=', value: 2000}];
        // A queued gesture can carry the focus key from before the filter.
        sm.focusedKey = 'c1';

        const fallback = zone.getSelectedDragRecords();

        expect(fallback).toHaveLength(2);
        expect(fallback[0]).toBe(firstVisible);
        expect(fallback[1]).toBe(nextVisible);
        expect(sm.items).toEqual(['c1', 'c4', 'c2', 'c3']);

        sm.focusedKey = 'c2';
        const focused = zone.getSelectedDragRecords();
        expect(focused).toHaveLength(2);
        expect(focused[0]).toBe(nextVisible);
        expect(focused[1]).toBe(firstVisible);

        store.filters = [{property: 'status', value: 'missing'}];
        expect(zone.getSelectedDragRecords()).toEqual([])
    });

    test('drag participation rejects an explicit hidden or stale lead Record', async () => {
        store = createStore();

        const zone   = await startZone(),
              hidden = store.get('c1'),
              stale  = store.get('c2');

        board.selectionModel.setSelection(['c1', 'c2', 'c4']);
        store.filters = [{property: 'order', operator: '>=', value: 2000}];

        expect(store.allItems.get('c1')).toBe(hidden);
        expect(zone.getSelectedDragRecords(hidden)).toEqual([]);

        store.clearFilters();
        store.setData(cards());

        expect(store.get('c2')).not.toBe(stale);
        expect(zone.getSelectedDragRecords(stale)).toEqual([]);

        const current = store.get('c2'),
              records = zone.getSelectedDragRecords(current);
        expect(records[0]).toBe(current);
        records.forEach(record => expect(store.get(record.id)).toBe(record))
    });

    test('filtered drag excludes hidden selection but includes visible offscreen canonical records', async () => {
        store = createStore(Array.from({length: 12}, (_, i) => ({
            id: `filter-${i}`, title: `Filter ${i}`, status: 'backlog', order: (i + 1) * 1000
        })));

        const zone = await startZone({columns: [
                  {status: 'backlog', maxRenderedCards: 2, overscan: 0, retainOffscreen: 0}
              ]}),
              lead = store.get('filter-6'),
              offscreen = store.get('filter-10');

        board.selectionModel.setSelection(['filter-0', 'filter-6', 'filter-10']);
        store.filters = [{property: 'order', operator: '>=', value: 6000}];

        expect(store.get('filter-0')).toBeNull();
        expect(board.getCard(offscreen)).toBeNull();

        const records = zone.getSelectedDragRecords(lead);
        expect(records).toHaveLength(2);
        expect(records[0]).toBe(lead);
        expect(records[1]).toBe(offscreen)
    });

    test('multi-selection proxy vdom: the stack draws the lead and at most four clones, and its badge shows the total', async () => {
        store = createStore([
            ...cards(),
            {id: 'c7', title: 'Graph', status: 'done', order: 2000}
        ]);

        const zone = await startZone();

        board.selectionModel.setSelection(['c1', 'c3', 'c4']);

        await drag(zone, 'c1', 100, 70);

        const
            cfg3        = zone.dragProxyConfig,
            stack3      = cfg3.vdom,
            lead3       = stack3.cn[0],
            stackCards3 = stack3.cn.filter(node => node.cls?.includes('neo-board-stack-card')),
            badge3      = stack3.cn.find(node => node.cls?.includes('neo-board-stack-count'));

        expect(cfg3.cls).toContain('neo-board-stack-proxy');
        expect(stack3.cls).toEqual(['neo-board-stack']);
        expect(lead3.cls).toContain('neo-board-stack-lead');
        expect(lead3.cls).not.toContain('neo-board-card-ghost');
        expect(stackCards3).toHaveLength(2);
        expect(badge3).toEqual({tag: 'span', cls: ['neo-board-stack-count'], text: '3'});
        expect(stackCards3[0].style['--stack-angle']).toBe('3deg');
        expect(stackCards3[1].style['--stack-angle']).toBe('-4deg');
        expect(stackCards3[0].style['--stack-opacity']).toBe('0.9');
        expect(stackCards3[1].style['--stack-opacity']).toBe('0.8');
        expect(stackCards3[0].style['--flip-x']).toBe('300px');
        expect(stackCards3[0].style['--flip-y']).toBe('0px');
        expect(stackCards3[1].style['--flip-x']).toBe('300px');
        expect(stackCards3[1].style['--flip-y']).toBe('100px');

        await zone.onDragCancel({});

        board.selectionModel.setSelection(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);

        await drag(zone, 'c1', 100, 70);

        const
            cfg7        = zone.dragProxyConfig,
            stack7      = cfg7.vdom,
            stackCards7 = stack7.cn.filter(node => node.cls?.includes('neo-board-stack-card')),
            badge7      = stack7.cn.find(node => node.cls?.includes('neo-board-stack-count'));

        expect(stack7.cn[0].cls).toContain('neo-board-stack-lead');
        expect(stackCards7).toHaveLength(4);
        expect(stackCards7.map(node => node.style['--stack-angle'])).toEqual(['3deg', '-4deg', '5deg', '-6deg']);
        expect(stackCards7.map(node => node.style['--stack-opacity'])).toEqual(['0.9', '0.8', '0.7', '0.6']);
        expect(badge7).toEqual({tag: 'span', cls: ['neo-board-stack-count'], text: '7'});

        await zone.onDragCancel({});

        // Two and five: the smallest selection and the largest stack without overflow count themselves too
        for (const ids of [['c1', 'c2'], ['c1', 'c2', 'c3', 'c4', 'c5']]) {
            board.selectionModel.setSelection(ids);
            await drag(zone, 'c1', 100, 70);

            const {cn} = zone.dragProxyConfig.vdom;

            expect(cn.filter(node => node.cls?.includes('neo-board-stack-card'))).toHaveLength(ids.length - 1);
            expect(cn.find(node => node.cls?.includes('neo-board-stack-count'))?.text).toBe(String(ids.length));
            await zone.onDragCancel({})
        }

        // Dragging an unselected card falls back to the single-card proxy config
        board.selectionModel.setSelection(['c3', 'c4']);
        await drag(zone, 'c2', 100, 170);
        expect(zone.dragProxyConfig.vdom).toBeUndefined();
        await zone.onDragCancel({})
    });

    test('multi-selection drop lands contiguously at the anchor in visual order with one moveCard per record under isNormalizing, one cardsMove, and surviving card instances/ids', async () => {
        store = createStore();

        const
            zone          = await startZone(),
            events        = recordChanges(store),
            cardMoves     = [],
            cardsMoves    = [],
            moveCardCalls = [],
            origMoveCard  = board.moveCard.bind(board),
            originalCards = ['c1', 'c2', 'c6'].map(id => board.getCard(id)),
            originalIds   = originalCards.map(card => card.id);

        board.moveCard = args => {
            moveCardCalls.push({id: args.record?.id, isNormalizing: board.isNormalizing});
            return origMoveCard(args)
        };
        board.on('cardMove', data => cardMoves.push(data.record.id));
        board.on('cardsMove', data => cardsMoves.push({
            ids      : data.records.map(r => r.id),
            laneValue: data.laneValue,
            status   : data.status
        }));

        // Select c6 (done) first, then c2 and c1 (backlog) — visual order after lead c1 is ['c1', 'c2', 'c6']
        board.selectionModel.setSelection(['c6', 'c2', 'c1']);

        await drag(zone, 'c1', 100, 70);
        // Move into in-progress at index 1 (between c3 and c4, so beforeId is 'c4')
        await zone.onDragMove({clientX: 400, clientY: 160});
        await zone.onDragEnd({});

        expect(moveCardCalls).toEqual([
            {id: 'c1', isNormalizing: true},
            {id: 'c2', isNormalizing: true},
            {id: 'c6', isNormalizing: true}
        ]);
        expect(cardMoves).toEqual(['c1', 'c2', 'c6']);
        expect(cardsMoves).toEqual([{
            ids      : ['c1', 'c2', 'c6'],
            laneValue: null,
            status   : 'in-progress'
        }]);
        expect(events).toEqual([
            {id: 'c1', names: ['order', 'status']},
            {id: 'c2', names: ['order', 'status']},
            {id: 'c6', names: ['order', 'status']}
        ]);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c1', 'c2', 'c6', 'c4', 'c5']);
        expect(keys(board.getColumn('backlog'))).toEqual([]);
        expect(keys(board.getColumn('done'))).toEqual([]);
        expect(['c1', 'c2', 'c6'].map(id => board.getCard(id))).toEqual(originalCards);
        expect(['c1', 'c2', 'c6'].map(id => board.getCard(id).id)).toEqual(originalIds)
    });

    test('a multi-selection dragged by its middle card lands in board order, the block starting at the slot', async () => {
        store = createStore();

        const
            zone       = await startZone(),
            cardMoves  = [],
            cardsMoves = [];

        board.on('cardMove',  data => cardMoves.push(data.record.id));
        board.on('cardsMove', data => cardsMoves.push(data.records.map(record => record.id)));

        // Board order is c1, c2 (backlog), c6 (done); the drag holds c2
        board.selectionModel.setSelection(['c1', 'c2', 'c6']);

        await drag(zone, 'c2', 100, 170);
        // Into in-progress at index 1, between c3 and c4
        await zone.onDragMove({clientX: 400, clientY: 160});
        await zone.onDragEnd({});

        expect(keys(board.getColumn('in-progress')), 'the block starts at the slot, in board order').toEqual(['c3', 'c1', 'c2', 'c6', 'c4', 'c5']);
        expect(cardMoves, 'the held card takes the slot first').toEqual(['c2', 'c1', 'c6']);
        expect(cardsMoves, 'one cardsMove, in board order').toEqual([['c1', 'c2', 'c6']])
    });

    test('a prepared multi-card drop completes when its rebalance filters out a later selected record', async () => {
        store = createStore([
            {id: 'A', title: 'A', status: 'in-progress', order: 1},
            {id: 'B', title: 'B', status: 'backlog', order: 1},
            {id: 'C', title: 'C', status: 'in-progress', order: 1 + 2e-10},
            {id: 'D', title: 'D', status: 'in-progress', order: 1 + 4e-10}
        ]);

        const zone  = await startZone(),
              lead  = store.get('B'),
              later = store.get('D'),
              moves = [];
        let laterHiddenBeforeLeadMove = false;

        store.filters = [{property: 'order', operator: '<', value: 500, reapplyOnRecordChange: true}];
        board.selectionModel.setSelection(['B', 'D']);
        board.on('cardsMove', event => moves.push(event));
        store.on('filter', () => {
            if (lead.status === 'backlog' && !store.get('D')) laterHiddenBeforeLeadMove = true
        });

        await drag(zone, 'B', 100, 70);
        expect(zone.dragRecords).toHaveLength(2);
        expect(zone.dragRecords[0]).toBe(lead);
        expect(zone.dragRecords[1]).toBe(later);
        await zone.onDragMove({clientX: 400, clientY: 160});
        expect(zone.getDropAnchor().beforeId).toBe('C');
        await zone.onDragEnd({});

        expect(laterHiddenBeforeLeadMove).toBe(true);
        expect(moves).toHaveLength(1);
        expect(moves[0].records).toHaveLength(2);
        expect(moves[0].records[0]).toBe(lead);
        expect(moves[0].records[1]).toBe(later);
        expect(store.allItems.get('B')).toBe(lead);
        expect(store.allItems.get('D')).toBe(later);
        expect(store.count).toBe(0);
        expect(board.getColumn('in-progress').count).toBe(0);
        expect(keys(board.getColumn('in-progress'))).toEqual([]);

        store.clearFilters();

        expect(ids('backlog')).toEqual([]);
        expect(ids('in-progress')).toEqual(['A', 'B', 'D', 'C']);
        expect(board.getCard('B').record).toBe(lead);
        expect(board.getCard('D').record).toBe(later)
    });

    test('multi-selection Escape and same-position drop write nothing and remove the ghost class', async () => {
        store = createStore();

        const
            zone       = await startZone(),
            events     = recordChanges(store),
            cardMoves  = [],
            cardsMoves = [];

        board.on('cardMove', data => cardMoves.push(data));
        board.on('cardsMove', data => cardsMoves.push(data));
        board.selectionModel.setSelection(['c1', 'c2', 'c3']);

        // 1. Escape after moving to another column
        await drag(zone, 'c1', 100, 70);
        expect(['c1', 'c2', 'c3'].every(id => board.getCard(id).cls.includes('neo-board-card-ghost'))).toBe(true);

        await zone.onDragMove({clientX: 400, clientY: 160});
        await zone.onDragCancel({});

        expect(events).toEqual([]);
        expect(cardMoves).toEqual([]);
        expect(cardsMoves).toEqual([]);
        expect(['c1', 'c2', 'c3'].some(id => board.getCard(id).cls.includes('neo-board-card-ghost'))).toBe(false);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2']);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c4', 'c5']);

        // 2. Same-position drop at the start slot
        await drag(zone, 'c1', 100, 70);
        expect(['c1', 'c2', 'c3'].every(id => board.getCard(id).cls.includes('neo-board-card-ghost'))).toBe(true);

        await zone.onDragEnd({});

        expect(events).toEqual([]);
        expect(cardMoves).toEqual([]);
        expect(cardsMoves).toEqual([]);
        expect(['c1', 'c2', 'c3'].some(id => board.getCard(id).cls.includes('neo-board-card-ghost'))).toBe(false);
        expect(keys(board.getColumn('backlog'))).toEqual(['c1', 'c2']);
        expect(keys(board.getColumn('in-progress'))).toEqual(['c3', 'c4', 'c5'])
    });

    test('the dragged card is the landing slot until its gesture ends, by Escape or by a drop, and no proxy clone carries the slot', async () => {
        store = createStore();

        const
            zone = await startZone(),
            slot = id => board.getCard(id).cls.includes('neo-board-card-slot');

        await drag(zone, 'c1', 100, 70);
        expect(slot('c1')).toBe(true);
        expect(board.getCard('c1').wrapperStyle.visibility).toBe('hidden');
        expect(zone.cloneCardVdom(board.getCard('c1').record).cls).not.toContain('neo-board-card-slot');

        await zone.onDragMove({clientX: 400, clientY: 160});
        expect(slot('c1')).toBe(true);

        await zone.onDragCancel({});
        expect(slot('c1')).toBe(false);
        expect(board.getCard('c1').wrapperStyle.visibility).toBeFalsy();

        await drag(zone, 'c1', 100, 70);
        await zone.onDragMove({clientX: 400, clientY: 160});
        await zone.onDragEnd({clientX: 400, clientY: 160});
        expect(slot('c1')).toBe(false);
        expect(board.getCard('c1').wrapperStyle.visibility).toBeFalsy();
        expect(['c2', 'c3', 'c4', 'c5', 'c6'].some(slot)).toBe(false)
    });

    test('selected records offscreen in a 2,000-record sliced column render title-only stack clones and move with the selection', async () => {
        const data = Array.from({length: 2000}, (_, i) => ({
            id    : `r${i}`,
            title : `Record ${i}`,
            status: 'backlog',
            order : (i + 1) * 1000
        }));

        store = createStore(data.concat({id: 'x', title: 'Done Card', status: 'done', order: 1000}));

        const
            zone       = await startZone({
                columns: [
                    {status: 'backlog', maxRenderedCards: 4, overscan: 0, retainOffscreen: 4},
                    {status: 'done'}
                ]
            }),
            cardsMoves = [];

        board.on('cardsMove', event => cardsMoves.push(event));

        // Select onscreen r0 and two offscreen records r500 and r1500 in the 2,000-record column
        board.selectionModel.setSelection(['r0', 'r500', 'r1500']);

        expect(board.getCard('r0')).not.toBeNull();
        expect(board.getCard('r500')).toBeNull();
        expect(board.getCard('r1500')).toBeNull();

        await drag(zone, 'r0', 100, 70);

        const stackClones = zone.dragProxyConfig.vdom.cn.filter(node => node.cls?.includes('neo-board-stack-card'));

        expect(stackClones).toHaveLength(2);
        expect(stackClones[0].cn).toEqual([{tag: 'div', cls: ['neo-board-card-title'], text: 'Record 500'}]);
        expect(stackClones[1].cn).toEqual([{tag: 'div', cls: ['neo-board-card-title'], text: 'Record 1500'}]);

        // Move into 'done' column (column index 1, x=300..580) before 'x' (y=60)
        await zone.onDragMove({clientX: 400, clientY: 70});
        await zone.onDragEnd({});

        expect(cardsMoves).toHaveLength(1);
        expect(cardsMoves[0].records.map(r => r.id)).toEqual(['r0', 'r500', 'r1500']);
        expect(cardsMoves[0].status).toBe('done');
        expect(ids('done')).toEqual(['r0', 'r500', 'r1500', 'x']);
        expect(board.getColumn('backlog').count).toBe(1997);
        expect(board.getColumn('done').count).toBe(4)
    });

    [
        {name: 'the in-flight destination', enteringX: 1000, terminal: {}},
        {name: 'the latest move received during entry', enteringX: 700, latestX: 1000, terminal: {}},
        {name: 'the release point received during entry', enteringX: 700, terminal: {clientX: 1000, clientY: 80}},
        {name: 'cancellation during entry', enteringX: 700, latestX: 1000, terminal: {}, cancelled: true}
    ].forEach(({name, enteringX, latestX, terminal, cancelled=false}) => {
        test(`a held column entry settles before ${name} ends the drag`, async () => {
            store = createStore();
            store.remove('c6');
            const zone          = await startZone(), card = board.getCard('c1'), record = card.record,
                  promiseUpdate = card.promiseUpdate, moves = [];
            let release, ended = false;

            board.on('cardMove', event => moves.push(event));
            await drag(zone, 'c1', 100, 70);
            card.promiseUpdate = function(...args) {
                card.promiseUpdate = promiseUpdate;
                return new Promise(resolve => {release = resolve})
            };

            const entering = zone.onDragMove({clientX: enteringX, clientY: 80});
            await settle();
            expect(zone.isEnteringColumn).toBe(true);
            if (latestX) await zone.onDragMove({clientX: latestX, clientY: 80});

            const ending = (cancelled ? zone.onDragCancel(terminal) : zone.onDragEnd(terminal))
                .then(() => {ended = true});
            await zone.onDragEnd(terminal); // Duplicate delivery must not create a second commit.
            await settle();
            expect.soft(ended, 'release waits for the held column operation').toBe(false);
            expect.soft(moves, 'no Store write occurs before column entry settles').toEqual([]);

            release();
            await Promise.all([entering, ending]);

            expect(record.status).toBe(cancelled ? 'backlog' : 'done');
            expect(moves).toHaveLength(cancelled ? 0 : 1);
            if (!cancelled) {
                expect(moves[0].record).toBe(record);
                expect(record.order).toBe(1000);
                expect(keys(board.getColumn('done'))).toEqual(['c1'])
            }
            expect(zone.dragComponent).toBeNull();
            expect(zone.activeColumn).toBeNull();
            expect(zone.columnItems).toBeNull();
            expect(zone.isEnteringColumn).toBe(false);
            expect(zone.dragEndActive).toBe(false);
            expectNothingPinned()
        })
    });

    test('enterColumn awaits card.promiseUpdate after restoreColumn before moving the DOM node and measuring the target column', async () => {
        store = createStore();

        const
            zone = await startZone(),
            card = board.getCard('c1');
        let resolveRestore;

        await drag(zone, 'c1', 100, 70);
        expect(card.wrapperStyle.position).toBe('absolute');

        card.promiseUpdate = () => new Promise(resolve => {resolveRestore = resolve});

        const entering = zone.onDragMove({clientX: 400, clientY: 160});

        await settle();

        expect(card.wrapperStyle.position).toBe(null);
        expect(deltas).toEqual([]);
        expect(zone.activeColumn).toBe(board.getColumn('backlog'));
        expect(board.getColumn('in-progress').body.style?.position ?? null).toBe(null);

        resolveRestore();
        await entering;

        expect(deltas).toEqual([{action: 'moveNode', id: card.id, index: 1, parentId: root('in-progress')}]);
        expect(zone.activeColumn).toBe(board.getColumn('in-progress'));
        expect(card.wrapperStyle.position).toBe('absolute')
    })
});
