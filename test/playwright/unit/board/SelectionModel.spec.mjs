import {setup} from '../../setup.mjs';

const appName = 'BoardSelectionModelTest';

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

Neo.main.DomAccess.focus          ??= () => {};
Neo.main.DomAccess.scrollIntoView ??= () => Promise.resolve();
Neo.main.DomAccess.selectNode     ??= () => {};
Neo.main.DomAccess.syncModalMask  ??= () => {};
Neo.main.DomAccess.trapFocus      ??= () => {};

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Store          from '../../../../src/data/Store.mjs';
import Board          from '../../../../src/board/Container.mjs';
import CardModel      from '../../../../src/board/CardModel.mjs';
import SelectionModel from '../../../../src/board/SelectionModel.mjs';
import TicketStore    from '../../../../examples/board/bigData/TicketStore.mjs';

/**
 * @summary Unit suite for `Neo.board.SelectionModel` and `Neo.board.Container` keyboard, selection, and ARIA
 * contracts: roving `tabIndex`, `Up/Down/Home/End` vertical focus navigation, `Left/Right` column jumps with
 * visual index clamping and collapsed-column skipping, `Space` toggle, `Shift+Up/Down` contiguous range selection,
 * `Ctrl/Cmd+Click` and `Shift+Click`, `Ctrl/Cmd+A` select-all across open columns, `Escape` clear, `Ctrl+Arrow` moves
 * through `board.moveCard` with boundary no-ops, `Enter` and double-click `cardActivate`, offscreen selection survival
 * across sliced column window shifts, and ARIA attributes + polite live region updates.
 */
const
    cards = () => [
        {id: 'b1', title: 'Backlog 1', status: 'backlog',     order: 1000},
        {id: 'b2', title: 'Backlog 2', status: 'backlog',     order: 2000},
        {id: 'b3', title: 'Backlog 3', status: 'backlog',     order: 3000},
        {id: 'p1', title: 'Progress 1', status: 'in-progress', order: 1000},
        {id: 'd1', title: 'Done 1',     status: 'done',        order: 1000},
        {id: 'd2', title: 'Done 2',     status: 'done',        order: 2000}
    ],
    columns     = [
        {status: 'backlog',     title: 'Backlog'},
        {status: 'in-progress', title: 'In progress'},
        {status: 'done',        title: 'Done'}
    ],
    createStore = (data=cards()) => Neo.create(Store, {keyProperty: 'id', model: CardModel, data}),
    createBoard = config => Neo.create(Board, {appName, columns, ...config});

test.describe('Neo.board.SelectionModel & keyboard / ARIA contract', () => {
    let board, store;

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('mounts SelectionModel by default, enforces one roving tabIndex=0 card, and sets board/column/card ARIA + polite live region', () => {
        store = createStore();
        board = createBoard({store});

        const sm = board.selectionModel;

        expect(sm).toBeInstanceOf(SelectionModel);
        expect(sm.focusedKey).toBe('b1');
        expect(board.role).toBe('group');
        expect(board.vdom['aria-label']).toBe('Kanban board');

        board.ariaLabel = 'Sprint board';
        expect(board.vdom['aria-label']).toBe('Sprint board');

        // Live region node exists at the tail of board.vdom.cn
        const live = board.liveRegionNode;
        expect(live).toMatchObject({
            id           : `${board.id}__live`,
            role         : 'status',
            'aria-live'  : 'polite',
            'aria-atomic': 'true',
            text         : ''
        });
        expect(board.vdom.cn.at(-1)).toBe(live);

        // Column body ARIA labels and header collapse aria-expanded
        const
            backlogCol    = board.getColumn('backlog'),
            inProgressCol = board.getColumn('in-progress');

        expect(backlogCol.body.role).toBe('list');
        expect(backlogCol.body.vdom['aria-label']).toBe('Backlog, 3 cards');
        expect(inProgressCol.body.vdom['aria-label']).toBe('In progress, 1 card');
        expect(backlogCol.header.vdom.cn[2]['aria-expanded']).toBe('true');

        // Exactly one rendered card has tabIndex: 0; all others have tabIndex: -1
        const allCards = [...board.cardMap.values()];
        expect(allCards.filter(card => card.vdom.tabIndex === 0).map(card => card.record.id)).toEqual(['b1']);
        expect(allCards.filter(card => card.vdom.tabIndex === -1)).toHaveLength(allCards.length - 1);

        // Card ARIA attributes
        expect(board.getCard('b1').vdom).toMatchObject({
            role                  : 'listitem',
            'aria-roledescription': 'card',
            'aria-selected'       : 'false',
            'aria-posinset'       : 1,
            'aria-setsize'        : 3,
            tabIndex              : 0
        });
        expect(board.getCard('b3').vdom).toMatchObject({
            'aria-selected': 'false',
            'aria-posinset': 3,
            'aria-setsize' : 3,
            tabIndex       : -1
        })
    });

    test('Up, Down, Home, End, Left, and Right navigate focus, clamp visual index, and skip collapsed columns', async () => {
        store = createStore();
        board = createBoard({store});

        const sm = board.selectionModel;

        expect(sm.focusedKey).toBe('b1');

        await sm.onKeyDownDown({});
        expect(sm.focusedKey).toBe('b2');
        expect(board.getCard('b2').vdom.tabIndex).toBe(0);
        expect(board.getCard('b1').vdom.tabIndex).toBe(-1);

        await sm.onKeyDownEnd({});
        expect(sm.focusedKey).toBe('b3');

        await sm.onKeyDownHome({});
        expect(sm.focusedKey).toBe('b1');

        // Jump to index 2 ('b3') in backlog, then Right into in-progress (only 1 card 'p1') -> clamps to 'p1'
        await sm.onKeyDownEnd({});
        expect(sm.focusedKey).toBe('b3');

        await sm.onKeyDownRight({});
        expect(sm.focusedKey).toBe('p1');

        // Collapse 'in-progress', move back to 'b2' (index 1 in backlog), then Right -> skips collapsed 'in-progress' and lands on 'd2' (index 1 in done)
        await sm.onKeyDownLeft({});
        expect(sm.focusedKey).toBe('b1');
        await sm.onKeyDownDown({});
        expect(sm.focusedKey).toBe('b2');

        board.getColumn('in-progress').collapsed = true;
        expect(board.getColumn('in-progress').header.vdom.cn[2]['aria-expanded']).toBe('false');

        await sm.onKeyDownRight({});
        expect(sm.focusedKey).toBe('d2');

        await sm.onKeyDownLeft({});
        expect(sm.focusedKey).toBe('b2')
    });

    test('Space, Shift+Up/Down, Click, Ctrl/Cmd+Click, Shift+Click, Ctrl/Cmd+A, and Escape manage selection and announce to the live region', async () => {
        store = createStore();
        board = createBoard({store});

        const
            sm     = board.selectionModel,
            events = [];

        board.on('selectionChange', payload => events.push({
            ids      : payload.records.map(r => r.id),
            selection: [...payload.selection]
        }));

        // Space toggles selection on focused card ('b1')
        sm.onKeyDownSpace({});
        expect(sm.items).toEqual(['b1']);
        expect(board.getCard('b1').cls).toContain('neo-selected');
        expect(board.getCard('b1').vdom['aria-selected']).toBe('true');
        expect(board.liveRegionNode.text).toBe('1 card selected');

        // Shift+Down extends contiguous selection in backlog: 'b1'..'b2', then 'b1'..'b3'
        await sm.onKeyDownShiftDown({});
        expect(sm.focusedKey).toBe('b2');
        expect(sm.items).toEqual(['b1', 'b2']);
        expect(board.liveRegionNode.text).toBe('2 cards selected');

        await sm.onKeyDownShiftDown({});
        expect(sm.focusedKey).toBe('b3');
        expect(sm.items).toEqual(['b1', 'b2', 'b3']);
        expect(board.liveRegionNode.text).toBe('3 cards selected');

        // Shift+Up shrinks contiguous selection back to 'b1'..'b2'
        await sm.onKeyDownShiftUp({});
        expect(sm.focusedKey).toBe('b2');
        expect(sm.items).toEqual(['b1', 'b2']);

        // Escape clears selection and announces; pressing Escape again during nothing writes/emits nothing
        sm.onKeyDownEscape({});
        expect(sm.items).toEqual([]);
        expect(board.getCard('b1').cls).not.toContain('neo-selected');
        expect(board.getCard('b1').vdom['aria-selected']).toBe('false');
        expect(board.liveRegionNode.text).toBe('Selection cleared');

        const countAfterClear = events.length;
        board.liveRegionNode.text = '';
        sm.onKeyDownEscape({});
        expect(events).toHaveLength(countAfterClear);
        expect(board.liveRegionNode.text).toBe('');

        // Plain click selects single card; Ctrl/Cmd+Click toggles; Shift+Click selects range
        const
            cardB1 = board.getCard('b1'),
            cardB3 = board.getCard('b3'),
            cardP1 = board.getCard('p1');

        sm.onBoardClick({path: [{id: cardB1.id, cls: ['neo-board-card']}]});
        expect(sm.items).toEqual(['b1']);

        sm.onBoardClick({ctrlKey: true, path: [{id: cardP1.id, cls: ['neo-board-card']}]});
        expect(sm.items).toEqual(['b1', 'p1']);

        sm.onBoardClick({metaKey: true, path: [{id: cardP1.id, cls: ['neo-board-card']}]});
        expect(sm.items).toEqual(['b1']);

        sm.onBoardClick({shiftKey: true, path: [{id: cardB3.id, cls: ['neo-board-card']}]});
        expect(sm.items).toEqual(['b1', 'b2', 'b3']);

        // The ⋯ button opens its card's editor: a selected card keeps the selection, an unselected one becomes it
        const menuClick = card => sm.onBoardClick({path: [{cls: ['neo-board-card-menu-button']}, {id: card.id, cls: ['neo-board-card']}]});

        menuClick(board.getCard('b2'));
        expect(sm.items).toEqual(['b1', 'b2', 'b3']);
        menuClick(cardP1);
        expect(sm.items).toEqual(['p1']);
        expect(sm.focusedKey).toBe('p1');

        // Ctrl+A / Meta+A selects all cards in the focused column
        await sm.focusRecord('d1');
        sm.onKeyDownA({ctrlKey: true});
        expect(sm.items).toEqual(['d1', 'd2']);
        expect(board.liveRegionNode.text).toBe('2 cards selected');
        expect(events.at(-1)).toEqual({
            ids      : ['d1', 'd2'],
            selection: ['d1', 'd2']
        })
    });

    test('Ctrl+Up/Down/Left/Right route through board.moveCard with neighbour anchors, fire cardMove, announce the move, and no-op at boundaries', async () => {
        store = createStore();
        board = createBoard({store});

        const
            sm        = board.selectionModel,
            moveCalls = [],
            cardMoves = [],
            origMove  = board.moveCard.bind(board);

        board.moveCard = payload => {
            moveCalls.push(payload);
            return origMove(payload)
        };
        board.on('cardMove', data => cardMoves.push(data));

        // Focus is on 'b1' (top of backlog column 0): Ctrl+Up and Ctrl+Left are boundary no-ops
        expect(await sm.onKeyDownCtrlUp({})).toBeNull();
        expect(await sm.onKeyDownCtrlLeft({})).toBeNull();
        expect(moveCalls).toHaveLength(0);
        expect(cardMoves).toHaveLength(0);

        // Ctrl+Down moves 'b1' to index 1 (between 'b2' and 'b3', so beforeId: 'b3')
        await sm.onKeyDownCtrlDown({});
        expect(moveCalls).toHaveLength(1);
        expect(moveCalls[0]).toMatchObject({
            beforeId: 'b3',
            afterId : null,
            index   : 1,
            key     : 'b1',
            status  : 'backlog'
        });
        expect(board.getColumnRecords('backlog').map(r => r.id)).toEqual(['b2', 'b1', 'b3']);
        expect(board.liveRegionNode.text).toBe('Backlog 1 moved to Backlog, position 2 of 3');
        expect(sm.focusedKey).toBe('b1');

        // Another Ctrl+Down moves 'b1' to bottom of backlog (index 2, afterId: 'b3'); then Ctrl+Down is a boundary no-op
        await sm.onKeyDownCtrlDown({});
        expect(moveCalls[1]).toMatchObject({
            beforeId: null,
            afterId : 'b3',
            index   : 2,
            key     : 'b1',
            status  : 'backlog'
        });
        expect(board.getColumnRecords('backlog').map(r => r.id)).toEqual(['b2', 'b3', 'b1']);
        expect(board.liveRegionNode.text).toBe('Backlog 1 moved to Backlog, position 3 of 3');

        expect(await sm.onKeyDownCtrlDown({})).toBeNull();
        expect(moveCalls).toHaveLength(2);

        // Ctrl+Right moves 'b1' from index 2 in backlog into 'in-progress' (clamped to index 1, after 'p1')
        await sm.onKeyDownCtrlRight({});
        expect(moveCalls[2]).toMatchObject({
            beforeId: null,
            afterId : 'p1',
            index   : 1,
            key     : 'b1',
            status  : 'in-progress'
        });
        expect(board.getColumnRecords('in-progress').map(r => r.id)).toEqual(['p1', 'b1']);
        expect(board.liveRegionNode.text).toBe('Backlog 1 moved to In progress, position 2 of 2');
        expect(board.getColumn('in-progress').body.vdom['aria-label']).toBe('In progress, 2 cards');

        // Collapse 'done' -> 'in-progress' is now the rightmost open column, so Ctrl+Right is a boundary no-op
        board.getColumn('done').collapsed = true;
        expect(await sm.onKeyDownCtrlRight({})).toBeNull();
        expect(moveCalls).toHaveLength(3)
    });

    test('Enter and double-click fire cardActivate for the focused card only and open CardEditor once, even when multiple cards are selected', () => {
        store = createStore();
        board = createBoard({store});

        const
            sm          = board.selectionModel,
            activations = [];

        board.on('cardActivate', payload => activations.push({
            cardId  : payload.card?.id,
            recordId: payload.record.id
        }));

        // Select 3 cards, focus on 'b2'
        sm.setSelection(['b1', 'b2', 'b3']);
        sm.focusedKey = 'b2';
        sm.syncAnnotations();

        sm.onKeyDownEnter({});

        expect(activations).toEqual([{
            cardId  : board.getCard('b2').id,
            recordId: 'b2'
        }]);
        expect(board.cardEditor.hidden).toBe(false);
        expect(board.cardEditor.record.id).toBe('b2');

        board.cardEditor.hide();

        // Double-click on card 'p1' body (outside title/menu) activates 'p1' once
        const cardP1 = board.getCard('p1');
        cardP1.onCardDoubleClick({path: [{id: cardP1.id, cls: ['neo-board-card']}]});

        expect(activations).toHaveLength(2);
        expect(activations[1]).toEqual({
            cardId  : cardP1.id,
            recordId: 'p1'
        });
        expect(board.cardEditor.record.id).toBe('p1')
    });

    test('Enter on a button in the board belongs to the button: a lane or column toggle or a card menu activates no card (#21391)', () => {
        store = createStore();
        board = createBoard({store});

        const
            sm          = board.selectionModel,
            activations = [],
            // The shape `Neo.main.DomEvents#getTargetData` gives a key event's path
            onButton    = cls => ({path: [{cls: [cls], tagName: 'button'}, {cls: ['neo-board'], tagName: 'div'}]});

        board.on('cardActivate', ({record}) => activations.push(record.id));
        sm.focusedKey = 'b2';

        ['neo-board-lane-collapse', 'neo-board-column-collapse', 'neo-board-card-menu-button'].forEach(cls => {
            expect(sm.onKeyDownEnter(onButton(cls)), cls).toBeNull()
        });

        expect(activations).toEqual([]);

        // On the focused card itself, Enter still activates it
        sm.onKeyDownEnter({path: [{cls: ['neo-board-card'], id: board.getCard('b2').id, tagName: 'div'}]});
        expect(activations).toEqual(['b2'])
    });

    test('filtering retains selected canonical records while focus uses visible membership', async () => {
        store = createStore();
        board = createBoard({store});

        const sm      = board.selectionModel,
              hidden  = store.get('b1'),
              visible = store.get('b2'),
              added   = store.get('d2'),
              card    = board.getCard(hidden),
              events  = [];

        sm.setSelection(['b1', 'b2']);
        board.on('selectionChange', payload => events.push(payload));
        store.filters = [{property: 'order', operator: '>=', value: 2000}];

        expect(store.get('b1')).toBeNull();
        expect(store.allItems.get('b1')).toBe(hidden);
        expect(sm.items).toEqual(['b1', 'b2']);
        expect(sm.focusedKey).toBe('b2');
        expect(await sm.focusRecord(hidden, {focusDom: false})).toBeNull();
        expect(sm.focusedKey).toBe('b2');

        sm.select('d2');

        expect(events).toHaveLength(1);
        expect(events[0].selection).toEqual(['b1', 'b2', 'd2']);
        expect(events[0].records).toHaveLength(3);
        expect(events[0].records[0]).toBe(hidden);
        expect(events[0].records[1]).toBe(visible);
        expect(events[0].records[2]).toBe(added);

        store.clearFilters();

        expect(sm.items).toEqual(['b1', 'b2', 'd2']);
        expect(store.get('b1')).toBe(hidden);
        expect(board.getCard(hidden)).toBe(card);
        expect(card.record).toBe(hidden);
        expect(card.vdom['aria-selected']).toBe('true')
    });

    test('removing a filtered selected record prunes its key and does not restore it on clearFilters', () => {
        store = createStore();
        board = createBoard({store});

        const sm       = board.selectionModel,
              hidden   = store.get('b1'),
              survivor = store.get('b2'),
              card     = board.getCard(hidden);

        sm.setSelection(['b1', 'b2']);
        store.filters = [{property: 'order', operator: '>=', value: 2000}];
        expect(store.allItems.get('b1')).toBe(hidden);

        store.remove('b1');

        expect(store.allItems.get('b1')).toBeNull();
        expect(sm.items).toEqual(['b2']);
        expect(card.isDestroyed).toBe(true);
        expect(board.getCard(hidden)).toBeNull();

        store.clearFilters();

        expect(store.get('b1')).toBeNull();
        expect(sm.items).toEqual(['b2']);
        expect(board.getCard('b2').record).toBe(survivor)
    });

    test('a filter hiding every record retains selection with no focused card', () => {
        store = createStore();
        board = createBoard({store});

        const sm      = board.selectionModel,
              records = [store.get('b1'), store.get('p1')];

        sm.setSelection(records);
        store.filters = [{property: 'status', value: 'missing'}];

        expect(store.count).toBe(0);
        expect(sm.items).toEqual(['b1', 'p1']);
        expect(sm.focusedKey).toBeNull();
        expect(sm.getFocusedRecord()).toBeNull();
        expect(sm.items).toEqual(['b1', 'p1']);

        store.clearFilters();

        expect(sm.items).toEqual(['b1', 'p1']);
        expect(sm.getFocusedRecord()).toBe(records[0]);
        records.forEach(record => expect(board.getCard(record).record).toBe(record))
    });

    test('selection annotates a parked card without scheduling an orphan update', () => {
        store = createStore();
        board = createBoard({store});

        const sm     = board.selectionModel,
              record = store.get('b1'),
              card   = board.getCard(record),
              update = card.update;
        let unsilencedUpdates = 0;

        record.status = 'archived';
        expect(card.parent).toBeFalsy();
        card.update = function(...args) {
            if (!this.silentVdomUpdate) unsilencedUpdates++;
            return update.apply(this, args)
        };

        try {
            sm.select(record);
            expect(card.cls).toContain('neo-selected');
            expect(card.getVdomRoot().cls).toContain('neo-selected');
            expect(card.vdom['aria-selected']).toBe('true');
            expect(card.vdom.tabIndex).toBe(-1);
            expect(unsilencedUpdates, 'a detached card must not request an unsilenced update').toBe(0)
        } finally {
            card.update = update
        }

        record.status = 'backlog';
        expect(board.getCard(record)).toBe(card);
        expect(card.parent).toBe(board.getColumn('backlog').body);
        expect(card.cls).toContain('neo-selected');
        expect(card.getVdomRoot().cls).toContain('neo-selected');
        expect(card.vdom['aria-selected']).toBe('true')
    });

    test('selection by record key and focus navigation past the window work on a 2,000-record sliced column', async () => {
        const slicedData = Array.from({length: 2000}, (_, i) => ({
            id    : `s-${i + 1}`,
            title : `Sliced ${i + 1}`,
            status: 'backlog',
            order : (i + 1) * 1000
        }));

        store = createStore(slicedData);
        board = createBoard({
            store,
            columns: [{status: 'backlog', title: 'Backlog', maxRenderedCards: 3, overscan: 0, retainOffscreen: 0}]
        });

        const
            col = board.getColumn('backlog'),
            sm  = board.selectionModel;

        expect(col.isSliced).toBe(true);
        expect(col.count).toBe(2000);
        expect(board.getCard('s-1')).toBeTruthy();
        expect(board.getCard('s-4')).toBeNull();

        // Select 's-1' while rendered
        sm.select('s-1');
        expect(board.getCard('s-1').cls).toContain('neo-selected');
        expect(board.getCard('s-1').vdom['aria-selected']).toBe('true');

        // Navigate Down past the 3-card window ('s-1' -> 's-2' -> 's-3' -> 's-4'): step to 's-4' scrolls and renders 's-4' first
        await sm.onKeyDownDown({});
        await sm.onKeyDownDown({});
        expect(sm.focusedKey).toBe('s-3');
        expect(board.getCard('s-4')).toBeNull();

        await sm.onKeyDownDown({});
        expect(sm.focusedKey).toBe('s-4');
        expect(board.getCard('s-4')).toBeTruthy();
        expect(board.getCard('s-4').vdom.tabIndex).toBe(0);
        expect(board.getCard('s-4').vdom['aria-posinset']).toBe(4);
        expect(board.getCard('s-4').vdom['aria-setsize']).toBe(2000);

        // 's-1' is now offscreen, but remains selected in sm.items
        expect(board.getCard('s-1')).toBeNull();
        expect(sm.isSelected('s-1')).toBe(true);
        expect(sm.items).toEqual(['s-1']);

        // End key jumps to 's-2000' via scrollToRecord and focuses it
        await sm.onKeyDownEnd({});
        expect(sm.focusedKey).toBe('s-2000');
        expect(board.getCard('s-2000')).toBeTruthy();
        expect(board.getCard('s-2000').vdom.tabIndex).toBe(0);
        expect(board.getCard('s-2000').vdom['aria-posinset']).toBe(2000);
        expect(board.getCard('s-2000').vdom['aria-setsize']).toBe(2000);

        // Home key jumps back to 's-1' -> re-projected 's-1' card still carries neo-selected and aria-selected="true"
        await sm.onKeyDownHome({});
        const restored = board.getCard('s-1');
        expect(restored).toBeTruthy();
        expect(restored.cls).toContain('neo-selected');
        expect(restored.vdom['aria-selected']).toBe('true');
        expect(restored.vdom.tabIndex).toBe(0)
    });

    test('scroll and a status edit read each affected column once on the 10,000-ticket board', () => {
        store = Neo.create(TicketStore);
        board = createBoard({store, columns: Object.keys(TicketStore.statusCounts).map(status => ({
            status,
            wipLimit: status === 'triage' ? 1500 : null
        }))});

        const source     = board.getColumn('new'),
              target     = board.getColumn('triage'),
              record     = store.get('t-1'),
              firstCard  = board.getCard(record),
              selection  = board.selectionModel,
              reads      = [],
              getRecords = board.getColumnRecords.bind(board);

        board.getColumnRecords = (status, lane) => {
            reads.push(status);
            return getRecords(status, lane)
        };

        expect(store.count).toBe(10000);
        expect(source.body.items).toHaveLength(110);

        source.setWindowStart(100);

        expect(reads.splice(0)).toEqual(['new']);
        expect(selection.focusedKey).toBe(record.id);
        expect(board.getCard(record)).toBeNull();
        expect(source.body.items[0].vdom.tabIndex).toBe(0);

        record.title = 'Title edited without projecting a column';
        expect(reads).toEqual([]);

        source.setWindowStart(0);

        expect(reads.splice(0)).toEqual(['new']);
        expect(board.getCard(record)).toBe(firstCard);
        expect(firstCard.vdom.tabIndex).toBe(0);
        expect(board.getCardPosition(record)).toMatchObject({status: 'new', index: 0});
        reads.length = 0;

        record.set({status: 'triage', order: 1500});

        expect(reads).toEqual(['triage', 'new']);
        expect(source.count).toBe(6199);
        expect(target.count).toBe(1501);
        expect(target.isWipExceeded).toBe(true);
        expect(target.body.items.slice(0, 3).map(card => card.record.id)).toEqual(['t-6201', 't-1', 't-6202']);
        expect(board.getCardPosition(record)).toMatchObject({status: 'triage', index: 1});
        expect(board.getCard(record)).toBe(firstCard);
        expect(selection.focusedKey).toBe(record.id);
        expect(board.getColumns().flatMap(column => column.body.items).filter(card => card.vdom.tabIndex === 0)).toEqual([firstCard])
    });

    test('a move across filtered swimlanes keeps order and focus local to each column of the same status', () => {
        store = createStore([
            {id: 'moving',  status: 'backlog', lane: 'Atlas',  order: 1000},
            {id: 'source',  status: 'backlog', lane: 'Atlas',  order: 4000},
            {id: 'hidden',  status: 'backlog', lane: 'Beacon', order: 500},
            {id: 'before',  status: 'backlog', lane: 'Beacon', order: 1500},
            {id: 'after',   status: 'backlog', lane: 'Beacon', order: 3000}
        ]);
        board = createBoard({
            store,
            laneField: 'lane',
            columns  : [{status: 'backlog', wipLimit: 2, maxRenderedCards: 3, overscan: 0}]
        });

        const source = board.getColumn('backlog', 'Atlas'),
              target = board.getColumn('backlog', 'Beacon'),
              card   = board.getCard('moving');

        store.filters = [{property: 'order', operator: '>=', value: 1000}];
        expect(store.get('hidden')).toBeNull();
        expect(store.allItems.get('hidden')).toBeTruthy();

        card.record.set({lane: 'Beacon', order: 2000});

        expect(source.body.items.map(item => item.record.id)).toEqual(['source']);
        expect(target.body.items.map(item => item.record.id)).toEqual(['before', 'moving', 'after']);
        expect([source.count, target.count, target.isWipExceeded]).toEqual([1, 3, true]);
        expect(target.isSliced).toBe(true);
        expect(board.getCardPosition(card.record)).toEqual({status: 'backlog', lane: 'Beacon', index: 1});
        expect(board.selectionModel.focusedKey).toBe('moving');
        expect(card.vdom.tabIndex).toBe(0);

        store.clearFilters();

        expect(target.body.items.map(item => item.record.id)).toEqual(['hidden', 'before', 'moving']);
        expect(board.getCardPosition(card.record)).toEqual({status: 'backlog', lane: 'Beacon', index: 2});
        expect(board.getCard('moving')).toBe(card);
        expect(card.vdom.tabIndex).toBe(0)
    })
});
