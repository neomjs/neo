import {setup} from '../../setup.mjs';

const appName = 'BoardLaneRowTest';

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
import Container       from '../../../../src/container/Base.mjs';
import Rectangle       from '../../../../src/util/Rectangle.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Board           from '../../../../src/board/Container.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';
import LaneRow         from '../../../../src/board/LaneRow.mjs';
import SortZone        from '../../../../src/board/SortZone.mjs';

const
    cards = () => [
        {id: 'c1', title: 'Atlas feed',    status: 'backlog',     lane: 'Atlas',  order: 1000},
        {id: 'c2', title: 'Beacon trace',  status: 'backlog',     lane: 'Beacon', order: 1000},
        {id: 'c3', title: 'Atlas deploy',  status: 'in-progress', lane: 'Atlas',  order: 1000},
        {id: 'c4', title: 'Beacon vessel', status: 'in-progress', lane: 'Beacon', order: 1000},
        {id: 'c5', title: 'Orphan task',   status: 'backlog',     lane: null,     order: 1000},
        {id: 'c6', title: 'Missing lane',  status: 'done',                        order: 1000}
    ],
    defaultColumns = () => [
        {status: 'backlog',     title: 'Backlog'},
        {status: 'in-progress', title: 'In progress'},
        {status: 'done',        title: 'Done'}
    ],
    createStore = (data=cards()) => Neo.create(Store, {keyProperty: 'id', model: CardModel, data}),
    createBoard = config => Neo.create(Board, {appName, columns: defaultColumns(), laneField: 'lane', ...config}),
    keys        = column => column.body.items.map(card => card.record.id),
    laneValues  = board  => board.items.map(lane => lane.value);

test.describe('Neo.board.LaneRow & Board swimlanes', () => {
    let board, store;

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('laneField set and lanes: null derives one row per distinct value in first-seen order and groups unassigned records into the Unassigned row', () => {
        store = createStore();
        board = createBoard({store});

        expect(board.cls).toContain('neo-board-lanes');
        expect(board.layout.ntype).toBe('layout-grid');
        expect(board.items.every(item => item instanceof LaneRow)).toBe(true);
        expect(laneValues(board)).toEqual(['Atlas', 'Beacon', null]);

        const
            atlas      = board.getLane('Atlas'),
            beacon     = board.getLane('Beacon'),
            unassigned = board.getLane(null);

        expect(atlas.title).toBe('Atlas');
        expect(atlas.count).toBe(2);
        // Toggle, title and count form one label, which sticks to the board's visible start on a narrower board
        expect(atlas.header.vdom.cn.map(node => node.cls[0])).toEqual(['neo-board-lane-label']);
        expect(atlas.header.vdom.cn[0].cn.map(node => node.cls[0])).toEqual(['neo-board-lane-collapse', 'neo-board-lane-title', 'neo-board-lane-count']);
        expect(atlas.header.vdom.cn[0].cn[1].text).toBe('Atlas');
        expect(atlas.header.vdom.cn[0].cn[2].text).toBe('2');

        expect(beacon.title).toBe('Beacon');
        expect(beacon.count).toBe(2);

        expect(unassigned.title).toBe('Unassigned');
        expect(unassigned.count).toBe(2);
        expect(unassigned.header.vdom.cn[0].cn[1].text).toBe('Unassigned');
        expect(unassigned.header.vdom.cn[0].cn[2].text).toBe('2');

        expect(board.getColumn('backlog', 'Atlas').id).toBe(`${board.id}__col__backlog__Atlas`);
        expect(board.getColumn('in-progress', 'Atlas').id).toBe(`${board.id}__col__in-progress__Atlas`);
        expect(board.getColumn('backlog', 'Beacon').id).toBe(`${board.id}__col__backlog__Beacon`);
        expect(board.getColumn('backlog', null).id).toBe(`${board.id}__col__backlog`);

        expect(keys(board.getColumn('backlog', 'Atlas'))).toEqual(['c1']);
        expect(keys(board.getColumn('in-progress', 'Atlas'))).toEqual(['c3']);
        expect(keys(board.getColumn('backlog', 'Beacon'))).toEqual(['c2']);
        expect(keys(board.getColumn('in-progress', 'Beacon'))).toEqual(['c4']);
        expect(keys(board.getColumn('backlog', null))).toEqual(['c5']);
        expect(keys(board.getColumn('done', null))).toEqual(['c6'])
    });

    test('record.set({[laneField]: other}) moves the same card instance to the other row and updates lane counts', () => {
        store = createStore();
        board = createBoard({store});

        const
            card = board.getCard('c1'),
            id   = card.id;

        store.get('c1').set({lane: 'Beacon'});

        expect(keys(board.getColumn('backlog', 'Atlas'))).toEqual([]);
        expect(keys(board.getColumn('backlog', 'Beacon'))).toEqual(['c1', 'c2']);
        expect(board.getColumn('backlog', 'Beacon').body.items[0]).toBe(card);
        expect(board.getCard('c1')).toBe(card);
        expect(card.id).toBe(id);
        expect(card.isDestroyed).toBeFalsy();
        expect(board.getLane('Atlas').count).toBe(1);
        expect(board.getLane('Beacon').count).toBe(3);

        // Moving to a newly seen lane value derives a new LaneRow and preserves the card instance
        store.get('c1').set({lane: 'Cipher', status: 'done'});

        expect(laneValues(board)).toEqual(['Atlas', 'Beacon', null, 'Cipher']);
        expect(keys(board.getColumn('done', 'Cipher'))).toEqual(['c1']);
        expect(board.getColumn('done', 'Cipher').body.items[0]).toBe(card);
        expect(board.getLane('Beacon').count).toBe(2);
        expect(board.getLane('Cipher').count).toBe(1)
    });

    test('a collapsed lane row shows the header with the count, hides its columns, and is excluded from SortZone#columnRects', async () => {
        const realGetAttributes = Neo.main.DomAccess.getAttributes,
              realGetDomRect    = Container.prototype.getDomRect;

        try {
            store = createStore();
            board = createBoard({
                lanes         : [{value: 'Atlas'}, {value: 'Beacon', title: 'Beacon Ops', collapsed: true}],
                sortZoneConfig: {module: SortZone, timeout: () => Promise.resolve()},
                store
            });

            const
                atlas  = board.getLane('Atlas'),
                beacon = board.getLane('Beacon');

            expect(beacon.collapsed).toBe(true);
            expect(beacon.cls).toContain('neo-board-lane-collapsed');
            expect(beacon.columnContainer.hidden).toBe(true);
            expect(beacon.header.vdom.cn[0].cn[1].text).toBe('Beacon Ops');
            expect(beacon.header.vdom.cn[0].cn[2].text).toBe('2');
            expect(beacon.header.vdom.cn[0].cn[0]['aria-expanded']).toBe('false');

            // Toggling collapsed restores the columns container and updates ARIA
            beacon.onCollapseClick({});
            expect(beacon.collapsed).toBe(false);
            expect(beacon.cls).not.toContain('neo-board-lane-collapsed');
            expect(beacon.columnContainer.hidden).toBe(false);
            expect(beacon.header.vdom.cn[0].cn[0]['aria-expanded']).toBe('true');

            // Re-collapse Beacon and verify SortZone#onDragStart snapshots only non-collapsed lane columns
            beacon.collapsed = true;

            for (let i = 0; i < 10 && !board.sortZone; i++) {
                await Promise.resolve()
            }

            Container.prototype.getDomRect   = ids => Promise.resolve(ids.map((id, index) => new Rectangle(index * 300, 0, 280, 240)));
            Neo.main.DomAccess.getAttributes = () => Promise.resolve({scrollTop: 0});
            board.sortZone.dragStart         = async () => {};
            board.sortZone.dragEnd           = () => {};

            const
                card = board.getCard('c1'),
                col  = board.getColumn('backlog', 'Atlas');

            await board.sortZone.onDragStart({
                clientX: 20,
                clientY: 20,
                path   : [{id: card.id, cls: card.cls}, {id: col.body.id, cls: col.body.cls}, {id: col.id, cls: col.cls}]
            });

            const snapshotLanes = new Set(board.sortZone.columnRects.map(entry => entry.column.laneValue));
            expect(snapshotLanes.has('Atlas')).toBe(true);
            expect(snapshotLanes.has(null)).toBe(true);
            expect(snapshotLanes.has('Beacon')).toBe(false);

            await board.sortZone.onDragCancel({});
            expect(atlas.collapsed).toBe(false);

            // Re-projection (project() / onStoreLoad) preserves user-toggled collapsed state on both derived and explicit lanes
            atlas.collapsed  = true;
            beacon.collapsed = false;
            board.project();
            expect(atlas.collapsed).toBe(true);
            expect(beacon.collapsed).toBe(false);

            // Setting explicit lanes with collapsed updates the configured state
            board.lanes = [{value: 'Atlas', collapsed: false}, {value: 'Beacon', title: 'Beacon Ops', collapsed: true}];
            expect(atlas.collapsed).toBe(false);
            expect(beacon.collapsed).toBe(true)
        } finally {
            Neo.main.DomAccess.getAttributes = realGetAttributes;
            Container.prototype.getDomRect   = realGetDomRect
        }
    });

    test('explicit lanes do not hide records whose lane value is unlisted: unlisted values render in derived rows after explicit ones', () => {
        store = createStore();
        board = createBoard({
            lanes: [{value: 'Atlas', title: 'Atlas Primary'}],
            store
        });

        // Explicit Atlas row first, then derived Beacon row for unlisted 'Beacon' records, then Unassigned (null)
        expect(laneValues(board)).toEqual(['Atlas', 'Beacon', null]);
        expect(board.getLane('Atlas').title).toBe('Atlas Primary');
        expect(board.getLane('Beacon').title).toBe('Beacon');
        expect(keys(board.getColumn('backlog', 'Beacon'))).toEqual(['c2']);
        expect(keys(board.getColumn('in-progress', 'Beacon'))).toEqual(['c4']);
        expect(board.getLane('Beacon').count).toBe(2);

        // Collapse a derived lane and verify re-projection preserves its collapsed state
        board.getLane('Beacon').collapsed = true;
        board.project();
        expect(board.getLane('Beacon').collapsed).toBe(true);

        // Moving a record to a newly-seen unlisted value when explicit lanes are configured creates its derived row
        store.get('c1').set({lane: 'Cipher'});
        expect(laneValues(board)).toEqual(['Atlas', 'Beacon', null, 'Cipher']);
        expect(keys(board.getColumn('backlog', 'Cipher'))).toEqual(['c1'])
    });

    test('moveCard across lanes commits status, lane, and order in one recordChange event, while a same-lane move omits the lane field', () => {
        store = createStore();
        board = createBoard({store});

        const events = [];
        store.on('recordChange', data => events.push(data));

        // 1. Same-lane move (Atlas backlog -> Atlas in-progress): no lane field in recordChange
        board.moveCard({key: 'c1', status: 'in-progress', lane: 'Atlas', index: 0});

        expect(events).toHaveLength(1);
        expect(events[0].fields.map(field => field.name).sort()).toEqual(['order', 'status']);
        expect(store.get('c1').order).toBe(0);

        events.length = 0;

        // 2. Cross-lane move (Atlas in-progress -> Beacon done): one recordChange carrying lane, status, and order
        board.moveCard({key: 'c1', status: 'done', lane: 'Beacon', index: 0});

        expect(events).toHaveLength(1);
        expect(events[0].fields.map(field => field.name).sort()).toEqual(['lane', 'order', 'status']);
        expect(store.get('c1').lane).toBe('Beacon');
        expect(store.get('c1').status).toBe('done');
        expect(keys(board.getColumn('done', 'Beacon'))).toEqual(['c1']);
        expect(board.getLane('Atlas').count).toBe(1);
        expect(board.getLane('Beacon').count).toBe(3)
    });

    test('one set that brings a new status and a new lane gives every lane the new column', () => {
        store = createStore([
            {id: 'a', title: 'A', status: 'todo', lane: 'one', order: 1000},
            {id: 'b', title: 'B', status: 'todo', lane: 'one', order: 2000}
        ]);
        board = createBoard({store, columns: null});

        const changes = [];
        store.on('recordChange', data => changes.push(data));

        store.get('a').set({status: 'doing', lane: 'two'});

        expect(changes).toHaveLength(1);
        expect(laneValues(board)).toEqual(['one', 'two']);
        board.items.forEach(lane => expect(lane.columns.map(column => column.status)).toEqual(['doing', 'todo']));
        expect(keys(board.getColumn('doing', 'two'))).toEqual(['a']);
        expect(keys(board.getColumn('todo', 'one'))).toEqual(['b']);

        expect(board.moveCard({key: 'b', status: 'doing', lane: 'one'})).toBe(store.get('b'));
        expect(keys(board.getColumn('doing', 'one'))).toEqual(['b'])
    })
});
