import {setup} from '../../setup.mjs';

const appName = 'BoardCardTest';

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

import {test, expect}                                               from '@playwright/test';
import Neo                                                          from '../../../../src/Neo.mjs';
import * as core                                                    from '../../../../src/core/_export.mjs';
import InstanceManager                                              from '../../../../src/manager/Instance.mjs';
import BoardContainer                                               from '../../../../src/board/Container.mjs';
import Card                                                         from '../../../../src/board/Card.mjs';
import CardModel                                                    from '../../../../src/board/CardModel.mjs';
import {cardItems, isCardOverdue, registerCardItem, renderCardItem} from '../../../../src/board/CardItems.mjs';

/**
 * @summary The card item renderers as pure functions, and a card rendering its record through them.
 */
const record = {
    id  : 'k1', title: 'Helix trace', description: 'Trace the helix feed', status: 'ready', order: 1000,
    tags: ['trace'], progress: 140, assignees: ['Maryam Mirzakhani'], color: '#5eead4'
};

test.describe('Neo.board.CardItems', () => {
    test('title and text read their field and render nothing for an empty one', () => {
        expect(cardItems.title(record, {type: 'title'})).toEqual({cls: ['neo-board-card-title'], text: 'Helix trace'});
        expect(cardItems.title({}, {type: 'title'})).toBeNull();
        expect(cardItems.text(record, {type: 'text', field: 'description'}).text).toBe('Trace the helix feed');
        expect(cardItems.text(record, {type: 'text'})).toBeNull()
    });

    test('tags accept an array or one value', () => {
        expect(cardItems.tags(record, {type: 'tags'}).cn.map(node => node.text)).toEqual(['trace']);
        expect(cardItems.tags({tags: 'solo'}, {type: 'tags'}).cn.map(node => node.text)).toEqual(['solo']);
        expect(cardItems.tags({tags: []}, {type: 'tags'})).toBeNull()
    });

    test('progress caps at 100, carries the ARIA values, and draws no bar without progress', () => {
        const node = cardItems.progress(record, {type: 'progress'});

        expect(node.role).toBe('progressbar');
        expect(node['aria-valuenow']).toBe(100);
        expect(node.cn[0].style.width).toBe('100%');
        expect(cardItems.progress({progress: 35}, {type: 'progress'})['aria-valuenow']).toBe(35);
        expect(cardItems.progress({progress: 0}, {type: 'progress'})).toBeNull();
        expect(cardItems.progress({progress: -5}, {type: 'progress'})).toBeNull();
        expect(cardItems.progress({progress: 'n/a'}, {type: 'progress'})).toBeNull();
        expect(cardItems.progress({}, {type: 'progress'})).toBeNull()
    });

    test('avatars render initials from names or name objects', () => {
        const node = cardItems.avatars({assignees: ['Ada Lovelace', {name: 'Vega'}]}, {type: 'avatars'});

        expect(node.cn.map(item => item.text)).toEqual(['AL', 'V']);
        expect(node.cn[0].title).toBe('Ada Lovelace')
    });

    test('dueDate formats ISO strings and Dates deterministically and returns null when empty or invalid', () => {
        const ref = {type: 'dueDate', referenceDate: '2026-11-20'};

        expect(cardItems.dueDate({dueDate: '2026-12-01'}, ref)).toEqual({
            tag     : 'time',
            cls     : ['neo-board-card-due-date'],
            datetime: '2026-12-01',
            title   : '2026-12-01',
            text    : 'Due Dec 1'
        });
        expect(cardItems.dueDate({dueDate: '2026-12-01T23:45:00Z'}, ref).datetime).toBe('2026-12-01');
        expect(cardItems.dueDate({dueDate: new Date(2026, 11, 15)}, ref)).toEqual({
            tag     : 'time',
            cls     : ['neo-board-card-due-date'],
            datetime: '2026-12-15',
            title   : '2026-12-15',
            text    : 'Due Dec 15'
        });
        expect(cardItems.dueDate(
            {targetDate: '2026-12-01'},
            {type: 'dueDate', field: 'targetDate', prefix: '', referenceDate: '2026-11-20', formatOptions: {month: 'short', day: 'numeric', year: 'numeric'}}
        ).text).toBe('Dec 1, 2026');
        expect(cardItems.dueDate(
            {dueDate: '2026-12-01'},
            {type: 'dueDate', referenceDate: '2026-11-20', formatter: value => `Due ${value}`}
        ).text).toBe('Due 2026-12-01');
        expect(cardItems.dueDate({dueDate: '2026-12-01'}, {type: 'dueDate', referenceDate: '2026-11-20', formatter: () => ''})).toBeNull();
        expect(cardItems.dueDate({}, ref)).toBeNull();
        expect(cardItems.dueDate({dueDate: ''}, ref)).toBeNull();
        expect(cardItems.dueDate({dueDate: '   '}, ref)).toBeNull();
        expect(cardItems.dueDate({dueDate: '2026-02-31'}, ref)).toBeNull();
        expect(cardItems.dueDate({dueDate: new Date('invalid')}, ref)).toBeNull()
    });

    test('dueDate marks active past dates overdue without color alone, skips completed statuses, and formats relative offsets', () => {
        const
            base = {type: 'dueDate', referenceDate: '2026-11-22'},
            rel  = {...base, relative: true};

        expect(isCardOverdue({dueDate: '2026-11-19', status: 'in-progress'}, base)).toBe(true);
        expect(isCardOverdue({dueDate: '2026-11-19', status: 'done'}, base)).toBe(false);
        expect(isCardOverdue({dueDate: '2026-11-19', status: 'shipped'}, base)).toBe(false);
        expect(isCardOverdue({dueDate: '2026-11-22', status: 'in-progress'}, base)).toBe(false);
        expect(isCardOverdue({dueDate: '2026-11-19', status: 'in-progress'}, {...base, overdue: false})).toBe(false);

        expect(cardItems.dueDate({dueDate: '2026-11-19', status: 'in-progress'}, base)).toEqual({
            tag     : 'time',
            cls     : ['neo-board-card-due-date', 'neo-board-card-due-date-overdue'],
            datetime: '2026-11-19',
            title   : '2026-11-19',
            text    : 'Overdue · Nov 19'
        });

        expect(cardItems.dueDate({dueDate: '2026-11-19', status: 'in-progress'}, rel).text).toBe('Overdue 3d · Nov 19');
        expect(cardItems.dueDate({dueDate: '2026-11-22', status: 'in-progress'}, rel)).toMatchObject({
            cls : ['neo-board-card-due-date', 'neo-board-card-due-date-today'],
            text: 'Today · Nov 22'
        });
        expect(cardItems.dueDate({dueDate: '2026-11-23', status: 'in-progress'}, rel).text).toBe('Tomorrow · Nov 23');
        expect(cardItems.dueDate({dueDate: '2026-11-25', status: 'in-progress'}, rel).text).toBe('In 3d · Nov 25');
        expect(cardItems.dueDate({dueDate: '2026-12-05', status: 'in-progress'}, rel).text).toBe('Due Dec 5');
        expect(cardItems.dueDate({dueDate: '2026-11-18', status: 'shipped'}, rel)).toEqual({
            tag     : 'time',
            cls     : ['neo-board-card-due-date'],
            datetime: '2026-11-18',
            title   : '2026-11-18',
            text    : 'Due Nov 18'
        })
    });

    test('an unknown type renders nothing; a registered one renders', () => {
        expect(renderCardItem(record, {type: 'nope'})).toBeNull();

        registerCardItem('due', record => record.dueDate ? {cls: ['due'], text: record.dueDate} : null);

        expect(renderCardItem({dueDate: '2026-12-01'}, {type: 'due'})).toEqual({cls: ['due'], text: '2026-12-01'});
        expect(renderCardItem({}, {type: 'due'})).toBeNull()
    })
});

test.describe('Neo.board.Card', () => {
    test('renders its record through its own card items, paints the accent, and re-renders on change', () => {
        const card = Neo.create(Card, {
            appName,
            cardItems: [{type: 'title'}, {type: 'text', field: 'description'}, {type: 'progress'}],
            record
        });

        expect(card.vdom.role).toBe('listitem');
        expect(card.vdom.tabIndex).toBe(0);
        expect(card.vdom.cn.map(node => node.cls[0])).toEqual([
            'neo-board-card-title', 'neo-board-card-text', 'neo-board-card-progress'
        ]);
        expect(card.vdom.cn.map(node => node.id)).toEqual([
            `${card.id}__title`, `${card.id}__text__description`, `${card.id}__progress`
        ]);
        expect(card.style['--neo-board-card-accent']).toBe('#5eead4');

        card.record = {...record, title: 'Helix trace II', description: null, color: null};

        expect(card.vdom.cn.map(node => node.cls[0])).toEqual(['neo-board-card-title', 'neo-board-card-progress']);
        expect(card.vdom.cn[0].text).toBe('Helix trace II');
        expect(card.style['--neo-board-card-accent']).toBeUndefined();

        card.destroy()
    });

    test('without a board and without its own items it renders an empty body', () => {
        const card = Neo.create(Card, {appName, record});

        expect(card.vdom.cn).toEqual([]);
        card.destroy()
    });

    test('a default board omits dueDate when unset, renders it once set, and toggles neo-board-card-overdue on date or status change', () => {
        const board = Neo.create(BoardContainer, {
            appName,
            cardItems: [{type: 'title'}, {type: 'tags'}, {type: 'dueDate', referenceDate: '2026-11-22'}],
            columns  : [{status: 'ready', title: 'Ready'}, {status: 'done', title: 'Done'}],
            store    : {
                model: CardModel,
                data : [{id: 'd1', title: 'Ship v14', status: 'ready', tags: ['release']}]
            }
        });

        const card = board.getCard('d1');

        expect(board.cardItems.map(item => item.type)).toContain('dueDate');
        expect(card.vdom.cn.some(node => node.cls?.includes('neo-board-card-due-date'))).toBe(false);
        expect(card.cls).not.toContain('neo-board-card-overdue');

        card.record.set({dueDate: '2026-11-25'});

        let dueNode = card.vdom.cn.find(node => node.cls?.includes('neo-board-card-due-date'));

        expect(dueNode).toMatchObject({
            tag     : 'time',
            id      : `${card.id}__dueDate`,
            datetime: '2026-11-25',
            text    : 'Due Nov 25'
        });
        expect(card.cls).not.toContain('neo-board-card-overdue');

        card.record.set({dueDate: '2026-11-19'});
        dueNode = card.vdom.cn.find(node => node.cls?.includes('neo-board-card-due-date'));

        expect(dueNode.cls).toContain('neo-board-card-due-date-overdue');
        expect(dueNode.text).toBe('Overdue · Nov 19');
        expect(card.cls).toContain('neo-board-card-overdue');

        card.record.set({status: 'done'});
        dueNode = card.vdom.cn.find(node => node.cls?.includes('neo-board-card-due-date'));

        expect(dueNode.cls).not.toContain('neo-board-card-due-date-overdue');
        expect(dueNode.text).toBe('Due Nov 19');
        expect(card.cls).not.toContain('neo-board-card-overdue');

        board.destroy()
    })
});
