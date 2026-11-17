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

import {test, expect}                                from '@playwright/test';
import Neo                                           from '../../../../src/Neo.mjs';
import * as core                                     from '../../../../src/core/_export.mjs';
import InstanceManager                               from '../../../../src/manager/Instance.mjs';
import Card                                          from '../../../../src/board/Card.mjs';
import {cardItems, registerCardItem, renderCardItem} from '../../../../src/board/CardItems.mjs';

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
    })
});
