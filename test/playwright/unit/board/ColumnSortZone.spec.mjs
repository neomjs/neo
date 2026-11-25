import {setup} from '../../setup.mjs';

const appName = 'BoardColumnSortZoneTest';

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
import SortZone        from '../../../../src/draggable/container/SortZone.mjs';
import Rectangle       from '../../../../src/util/Rectangle.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Board           from '../../../../src/board/Container.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';
import ColumnSortZone  from '../../../../src/board/ColumnSortZone.mjs';

const
    cards = () => [
        {id: 'c1', title: 'Atlas',  status: 'backlog',     order: 1000},
        {id: 'c2', title: 'Beacon', status: 'in-progress', order: 1000},
        {id: 'c3', title: 'Cipher', status: 'review',      order: 1000},
        {id: 'c4', title: 'Delta',  status: 'done',        order: 1000}
    ],
    defaultColumns = () => [
        {status: 'backlog',     title: 'Backlog'},
        {status: 'in-progress', title: 'In Progress'},
        {status: 'review',      title: 'Review'},
        {status: 'done',        title: 'Done'}
    ],
    createStore = (data=cards()) => Neo.create(Store, {keyProperty: 'id', model: CardModel, data}),
    statuses    = board => board.items.map(column => column.status);

test.describe('Neo.board.ColumnSortZone & Column#locked', () => {
    let board, store;

    const
        realGetDomRect = Container.prototype.getDomRect,
        rectFor        = id => {
            if (id === board.id) {
                return new Rectangle(0, 0, 1200, 600)
            }

            const index = board.items.findIndex(column => column.id === id);

            if (index > -1) {
                return new Rectangle(index * 300, 0, 280, 600)
            }

            return new Rectangle(0, 0, 280, 44)
        },
        startBoard = async (config={}) => {
            board = Neo.create(Board, {
                appName,
                columns             : defaultColumns(),
                columnSortZoneConfig: {module: ColumnSortZone, timeout: () => Promise.resolve()},
                store,
                ...config
            });

            for (let i = 0; i < 10 && !board.columnSortZone; i++) {
                await Promise.resolve()
            }

            const zone = board.columnSortZone;

            zone.dragStart = async () => {
                Object.assign(zone, {
                    boundaryContainerRect: new Rectangle(0, 0, 1200, 600),
                    offsetX              : 0,
                    offsetY              : 0
                })
            };
            zone.dragEnd = () => {};

            return zone
        },
        headerPath = status => {
            const column = board.getColumn(status);

            return [
                {id: `${column.id}__title`, cls: ['neo-board-column-title']},
                {id: column.header.id,      cls: [...(column.header.cls || [])]},
                {id: column.id,             cls: [...(column.cls || [])]},
                {id: board.id,              cls: [...(board.cls || [])]}
            ]
        },
        collapsePath = status => {
            const column = board.getColumn(status);

            return [
                {id: `${column.id}__collapse`, cls: ['neo-board-column-collapse']},
                ...headerPath(status).slice(1)
            ]
        };

    test.beforeEach(() => {
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {
            registerZone       : () => Promise.resolve(),
            setConfigs         : () => Promise.resolve({}),
            setDragProxyElement: () => Promise.resolve(),
            unregisterZone     : () => Promise.resolve()
        };
        Container.prototype.getDomRect = ids => Promise.resolve(ids.map(rectFor))
    });

    test.afterEach(() => {
        Container.prototype.getDomRect = realGetDomRect;
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('arms unlocked column headers, marks locked headers aria-disabled with a lock glyph, and excludes locked columns from getSortableItems', async () => {
        store = createStore();

        const zone = await startBoard({
            columns: [
                {status: 'backlog'},
                {status: 'in-progress', locked: true},
                {status: 'review'},
                {status: 'done'}
            ]
        });

        const
            backlog    = board.getColumn('backlog'),
            inProgress = board.getColumn('in-progress');

        expect(zone.sortGroup).toBe('board-columns');
        expect(zone.dragHandleSelector).toBe('.neo-board-column-header');
        expect(zone.ignoreDragSelector).toBe('.neo-board-column-collapse');

        expect(backlog.header.cls).toContain('neo-draggable');
        expect(backlog.wrapperCls || []).not.toContain('neo-draggable');
        expect(backlog.header.vdom['aria-disabled']).toBeUndefined();
        expect(backlog.header.vdom.cn).toHaveLength(3);

        expect(inProgress.locked).toBe(true);
        expect(inProgress.cls).toContain('neo-board-column-locked');
        expect(inProgress.header.cls).not.toContain('neo-draggable');
        expect(inProgress.header.vdom['aria-disabled']).toBe('true');
        expect(inProgress.header.vdom.cn).toHaveLength(4);
        expect(inProgress.header.vdom.cn[3]).toMatchObject({
            id          : `${inProgress.id}__lock`,
            cls         : ['neo-board-column-lock'],
            'aria-label': 'Locked column'
        });

        expect(zone.getSortableItems().map(col => col.status)).toEqual(['backlog', 'review', 'done']);

        // Runtime toggle of locked updates header ARIA, lock node, and sortable membership
        inProgress.locked = false;
        expect(inProgress.header.vdom['aria-disabled']).toBeUndefined();
        expect(inProgress.header.vdom.cn).toHaveLength(3);
        expect(inProgress.header.cls).toContain('neo-draggable');
        expect(zone.getSortableItems().map(col => col.status)).toEqual(['backlog', 'in-progress', 'review', 'done'])
    });

    test('ignores drags started on the collapse button, on a locked column header, or when columnsResortable is false', async () => {
        store = createStore();

        const zone = await startBoard({
            columns: [
                {status: 'backlog'},
                {status: 'in-progress', locked: true},
                {status: 'review'},
                {status: 'done'}
            ]
        });

        await zone.onDragStart({clientX: 20, clientY: 20, path: collapsePath('backlog')});
        expect(zone.dragComponent ?? null).toBeNull();

        await zone.onDragStart({clientX: 320, clientY: 20, path: headerPath('in-progress')});
        expect(zone.dragComponent ?? null).toBeNull();

        board.columnsResortable = false;
        expect(board.getColumn('backlog').header.cls).not.toContain('neo-draggable');

        await zone.onDragStart({clientX: 20, clientY: 20, path: headerPath('backlog')});
        expect(zone.dragComponent ?? null).toBeNull()
    });

    test('columnsResortable alone admits a column drag: cards off still reorders past a locked column and cancels, cards on with columns off stays still', async () => {
        store = createStore();

        const
            zone  = await startBoard({
                columns       : [{status: 'backlog'}, {status: 'in-progress', locked: true}, {status: 'review'}, {status: 'done'}],
                dragResortable: false
            }),
            moves = [];

        board.on('columnMove', data => moves.push(data));

        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});
        expect(zone.dragComponent).toBe(board.getColumn('backlog'));
        await zone.onDragMove({clientX: 400, clientY: 20});
        await zone.onDragEnd({});

        expect(statuses(board)).toEqual(['review', 'in-progress', 'backlog', 'done']);
        expect(moves).toHaveLength(1);
        board.items.forEach(column => expect(column.wrapperStyle?.position ?? null).toBeNull());

        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('review')});
        await zone.onDragMove({clientX: 400, clientY: 20});
        await zone.onDragCancel({});

        expect(statuses(board)).toEqual(['review', 'in-progress', 'backlog', 'done']);
        expect(moves).toHaveLength(1);

        board.set({columnsResortable: false, dragResortable: true});

        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('review')});
        expect(zone.dragComponent ?? null).toBeNull()
    });

    test('reorders unlocked columns on drop, drags the whole column, preserves column and card instances, and fires one columnMove event', async () => {
        store = createStore();

        const
            zone          = await startBoard(),
            columnsBefore = [...board.items],
            cardsBefore   = ['c1', 'c2', 'c3', 'c4'].map(id => board.getCard(id)),
            moves         = [];

        board.on('columnMove', data => moves.push(data));

        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});

        expect(zone.dragComponent).toBe(board.getColumn('backlog'));
        const treeIds = [];
        (function collect(node) { node.id && treeIds.push(node.id); node.cn?.forEach(collect) })(zone.dragElement);

        expect(zone.dragElement.id, 'the drag element is the whole column').toBe(board.getColumn('backlog').id);
        expect(treeIds, 'with its header and its card').toEqual(expect.arrayContaining([board.getColumn('backlog').header.id, board.getCard('c1').id]));
        expect(treeIds, 'and no other column\'s card').not.toContain(board.getCard('c2').id);

        // Drag backlog (index 0, x=0) past in-progress (index 1, x=300) and review (index 2, x=600)
        await zone.onDragMove({clientX: 200, clientY: 20});
        expect(zone.currentIndex).toBe(1);

        await zone.onDragMove({clientX: 500, clientY: 20});
        expect(zone.currentIndex).toBe(2);

        await zone.onDragEnd({});

        expect(statuses(board)).toEqual(['in-progress', 'review', 'backlog', 'done']);
        expect(board.columns.map(col => col.status)).toEqual(['in-progress', 'review', 'backlog', 'done']);
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({status: 'backlog', laneValue: null, fromIndex: 0, toIndex: 2});

        // Every column and card instance survived the move without recreation
        columnsBefore.forEach(column => expect(board.getColumn(column.status)).toBe(column));
        cardsBefore.forEach(card => expect(board.getCard(card.record.id)).toBe(card));

        // All drag wrapper styles are cleared after drop
        board.items.forEach(column => {
            expect(column.wrapperStyle?.position ?? null).toBeNull();
            expect(column.wrapperStyle?.visibility ?? null).toBeNull()
        })
    });

    test('a locked column keeps its index when other columns drag across it in either direction', async () => {
        store = createStore();

        const
            zone  = await startBoard({
                columns: [
                    {status: 'backlog'},
                    {status: 'in-progress', locked: true},
                    {status: 'review'},
                    {status: 'done'}
                ]
            }),
            moves = [];

        board.on('columnMove', data => moves.push(data));

        // Drag backlog (index 0) across locked in-progress (index 1) to review (index 2)
        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});

        // Locked in-progress is pinned at its slot (x=300) while unlocked columns sort
        expect(board.getColumn('in-progress').wrapperStyle.position).toBe('absolute');
        expect(board.getColumn('in-progress').wrapperStyle.left).toBe('300px');

        await zone.onDragMove({clientX: 400, clientY: 20});
        expect(zone.currentIndex).toBe(1);

        await zone.onDragEnd({});

        expect(statuses(board)).toEqual(['review', 'in-progress', 'backlog', 'done']);
        expect(board.items.indexOf(board.getColumn('in-progress'))).toBe(1);
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({status: 'backlog', laneValue: null, fromIndex: 0, toIndex: 2});
        expect(board.getColumn('in-progress').wrapperStyle.position).toBeNull()
    });

    test('preserves ownerRect when the first column is locked and reorders unlocked columns after it', async () => {
        store = createStore();

        const zone = await startBoard({
            columns: [
                {status: 'backlog', locked: true},
                {status: 'in-progress'},
                {status: 'review'},
                {status: 'done'}
            ]
        });

        await zone.onDragStart({clientX: 610, clientY: 20, path: headerPath('review')});
        expect(zone.ownerRect.x).toBe(0);
        expect(board.getColumn('backlog').wrapperStyle.left).toBe('0px');
        expect(board.getColumn('in-progress').wrapperStyle.left).toBe('300px');

        await zone.onDragMove({clientX: 400, clientY: 20});
        expect(zone.currentIndex).toBe(0);

        await zone.onDragEnd({});

        expect(statuses(board)).toEqual(['backlog', 'review', 'in-progress', 'done']);
        expect(board.items.indexOf(board.getColumn('backlog'))).toBe(0)
    });

    test('materializes board.columns on first drop when columns started as null', async () => {
        store = createStore();

        const zone = await startBoard({columns: null});

        expect(board.columns).toBeNull();
        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'review', 'done']);

        board.getColumn('in-progress').locked = true;

        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});
        await zone.onDragMove({clientX: 400, clientY: 20});
        await zone.onDragEnd({});

        expect(Array.isArray(board.columns)).toBe(true);
        expect(board.columns.map(col => col.status)).toEqual(['review', 'in-progress', 'backlog', 'done']);
        expect(board.columns[1].locked).toBe(true);
        expect(statuses(board)).toEqual(['review', 'in-progress', 'backlog', 'done'])
    });

    test('Escape (onDragCancel) and a drop at startIndex write nothing and fire no columnMove', async () => {
        store = createStore();

        const
            zone  = await startBoard(),
            moves = [];

        board.on('columnMove', data => moves.push(data));

        // 1. Move then cancel with Escape
        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});
        await zone.onDragMove({clientX: 200, clientY: 20});
        expect(zone.currentIndex).toBe(1);

        await zone.onDragCancel({});

        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'review', 'done']);
        expect(moves).toEqual([]);
        board.items.forEach(column => expect(column.wrapperStyle?.position ?? null).toBeNull());

        // 2. Drop at startIndex without moving past threshold
        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});
        await zone.onDragMove({clientX: 40, clientY: 20});
        expect(zone.currentIndex).toBe(0);

        await zone.onDragEnd({});

        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'review', 'done']);
        expect(moves).toEqual([])
    });

    test('delegates onDragStart and processDragEnd to Neo.draggable.container.SortZone and latches duplicate drag:end deliveries', async () => {
        expect(Object.hasOwn(ColumnSortZone.prototype, 'onDragStart')).toBe(false);
        expect(Object.hasOwn(ColumnSortZone.prototype, 'processDragEnd')).toBe(false);
        expect(ColumnSortZone.prototype.onDragStart).toBe(SortZone.prototype.onDragStart);
        expect(ColumnSortZone.prototype.processDragEnd).toBe(SortZone.prototype.processDragEnd);

        store = createStore();

        let held = null;
        const
            zone  = await startBoard({
                columnSortZoneConfig: {
                    module : ColumnSortZone,
                    timeout: () => new Promise(resolve => held ? held.push(resolve) : resolve())
                }
            }),
            moves = [];

        board.on('columnMove', data => moves.push(data));

        await zone.onDragStart({clientX: 10, clientY: 20, path: headerPath('backlog')});
        await zone.onDragMove({clientX: 200, clientY: 20});

        // Hold the first delivery's drag-end timeout while the second delivery runs
        held = [];
        const ends = Promise.all([zone.onDragEnd({}), zone.onDragEnd({})]);
        await new Promise(resolve => setTimeout(resolve, 0));
        const release = held;
        held = null;
        release.forEach(resolve => resolve());
        await ends;

        expect(statuses(board)).toEqual(['in-progress', 'backlog', 'review', 'done']);
        expect(moves).toHaveLength(1);
        expect(zone.dragComponent).toBeNull()
    });

    test('locks vertical movement off, honors targetPath ignoreDragSelector, and preserves queued back-to-back drags (#22153)', async () => {
        store = createStore();

        let held = null;
        const
            zone  = await startBoard({
                columnSortZoneConfig: {
                    module : ColumnSortZone,
                    timeout: () => new Promise(resolve => held ? held.push(resolve) : resolve())
                }
            }),
            moves = [];

        board.on('columnMove', data => moves.push(data));

        expect(zone.moveVertical).toBe(false);

        const backlog = board.getColumn('backlog');
        await zone.onDragStart({
            clientX   : 20,
            clientY   : 20,
            path      : headerPath('backlog').slice(1),
            targetPath: collapsePath('backlog')
        });
        expect(zone.dragComponent ?? null).toBeNull();

        await zone.startDrag({clientX: 10, clientY: 20, path: headerPath('backlog')});
        await zone.onDragMove({clientX: 200, clientY: 20});

        held = [];
        const firstEnd    = zone.onDragEnd({});
        const secondStart = zone.startDrag({clientX: 10, clientY: 20, path: headerPath('in-progress')});
        await zone.onDragMove({clientX: 200, clientY: 20});

        expect(zone.pendingDragMove).toEqual({clientX: 200, clientY: 20});

        const flushHeld = async () => {
            for (let i = 0; i < 6; i++) {
                await Promise.resolve();
                while (held?.length) {
                    held.shift()()
                }
            }
        };

        await flushHeld();
        held = null;
        await Promise.all([firstEnd, secondStart]);

        expect(zone.dragComponent).toBe(board.getColumn('in-progress'));
        expect(zone.currentIndex).toBe(1);

        await zone.onDragEnd({});

        expect(statuses(board)).toEqual(['backlog', 'in-progress', 'review', 'done']);
        expect(moves).toHaveLength(2);
        expect(zone.dragComponent).toBeNull()
    })
});
