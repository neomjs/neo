import {setup} from '../../setup.mjs';

const appName = 'VdomCalendarTest';

setup({
    neoConfig: {
        useDomApiRenderer: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import StringFromVnode from '../../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper      from '../../../../src/vdom/Helper.mjs';
import VDomUtil        from '../../../../src/util/VDom.mjs';

test.describe('VdomCalendar', () => {
    // tests are designed for this rendering mode
    // Neo.config.useDomApiRenderer = false;

    test('Week view: Infinite Scrolling', () => {
        let vdom =
        {id: 'neo-vnode-1', cn: [
            {id: 'col-6'},
            {id: 'col-7'},
            {id: 'col-8'},
            {id: 'col-9'},
            {id: 'col-10'},
            {id: 'col-11'},
            {id: 'col-12'},
            {id: 'col-13'},
            {id: 'col-14'},
            {id: 'col-15'}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-vnode-1', cn: [
            {id: 'col-1'},
            {id: 'col-2'},
            {id: 'col-3'},
            {id: 'col-4'},
            {id: 'col-5'},
            {id: 'col-6'},
            {id: 'col-7'},
            {id: 'col-8'},
            {id: 'col-9'},
            {id: 'col-10'}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});
        vnode = VdomHelper.update({vdom, vnode}).vnode;

        expect(deltas.length).toBe(10);

        expect(deltas).toEqual([
            {action: 'insertNode', index: 0, outerHTML: '<div id="col-1"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 1, outerHTML: '<div id="col-2"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 2, outerHTML: '<div id="col-3"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 3, outerHTML: '<div id="col-4"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 4, outerHTML: '<div id="col-5"></div>', parentId: 'neo-vnode-1'},
            {action: 'removeNode', id: 'col-11'},
            {action: 'removeNode', id: 'col-12'},
            {action: 'removeNode', id: 'col-13'},
            {action: 'removeNode', id: 'col-14'},
            {action: 'removeNode', id: 'col-15'}
        ]);

        // Revert operation
        vdom =
        {id: 'neo-vnode-1', cn: [
            {id: 'col-6'},
            {id: 'col-7'},
            {id: 'col-8'},
            {id: 'col-9'},
            {id: 'col-10'},
            {id: 'col-11'},
            {id: 'col-12'},
            {id: 'col-13'},
            {id: 'col-14'},
            {id: 'col-15'}
        ]};

        ({deltas} = VdomHelper.update({vdom, vnode}));

        expect(deltas.length).toBe(10);

        expect(deltas).toEqual([
            {action: 'insertNode', index: 10, outerHTML: '<div id="col-11"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 11, outerHTML: '<div id="col-12"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 12, outerHTML: '<div id="col-13"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 13, outerHTML: '<div id="col-14"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 14, outerHTML: '<div id="col-15"></div>', parentId: 'neo-vnode-1'},
            {action: 'removeNode', id: 'col-1'},
            {action: 'removeNode', id: 'col-2'},
            {action: 'removeNode', id: 'col-3'},
            {action: 'removeNode', id: 'col-4'},
            {action: 'removeNode', id: 'col-5'}
        ]);
    });

    test('Drag an event to the top inside the same column', () => {
        let vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]},
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time',  html: '10:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]}
            ]}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time',  html: '06:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]},
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]}
            ]}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});
        vnode = VdomHelper.update({vdom, vnode}).vnode;

        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-1'},
            {innerHTML: '06:00', id: 'neo-event-2__time'}
        ]);

        // Revert operation
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]},
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time',  html: '10:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]}
            ]}
        ]};

        ({deltas} = VdomHelper.update({vdom, vnode}));

        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {innerHTML: '10:00', id: 'neo-event-2__time'}
        ]);
    });

    test('Event moving to the right', () => {
        let vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-1', cls: ['neo-event']}]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-2', cls: ['neo-event']}]}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: []},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-1', cls: ['neo-event', 'foo']},
                {id: 'neo-event-2', cls: ['neo-event']}
            ]}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});
        vnode = VdomHelper.update({vdom, vnode}).vnode;

        expect(deltas.length).toBe(2);
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-2'},
            {cls: {add: ['foo']}, id: 'neo-event-1'}
        ]);

        // Revert operation
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-1', cls: ['neo-event']}]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-2', cls: ['neo-event']}]}
        ]};

        ({deltas} = VdomHelper.update({vdom, vnode}));

        expect(deltas.length).toBe(2);
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {cls: {remove: ['foo']}, id: 'neo-event-1'}
        ]);
    });

    test('Event moving to the left', () => {
        let vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-1', cls: ['neo-event']}]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-2', cls: ['neo-event']}]}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event', 'foo']},
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: []}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});
        vnode = VdomHelper.update({vdom, vnode}).vnode;

        expect(deltas.length).toBe(2);
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-1'},
            {cls: {add: ['foo']}, id: 'neo-event-2'}
        ]);

        // Revert operation
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-1', cls: ['neo-event']}]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [{id: 'neo-event-2', cls: ['neo-event']}]}
        ]};

        ({deltas} = VdomHelper.update({vdom, vnode}));

        expect(deltas.length).toBe(2);
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-2'},
            {cls: {remove: ['foo']}, id: 'neo-event-2'}
        ]);
    });

    test('removeDom vdom property: Remove the DOM of the first child node', () => {
        let vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', removeDom: true},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});
        vnode = VdomHelper.update({vdom, vnode}).vnode;

        expect(deltas).toEqual([{action: 'removeNode', id: 'neo-column-1'}]);

        // Revert operation
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        ({deltas} = VdomHelper.update({vdom, vnode}));

        expect(deltas).toEqual([
            {action: 'insertNode', index: 0, outerHTML: '<div id="neo-column-1"></div>', parentId: 'neo-calendar-week'}
        ]);
    });

    test('removeDom vdom property: Remove the DOM of the last child node', () => {
        let vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3', removeDom: true}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});
        vnode = VdomHelper.update({vdom, vnode}).vnode;

        expect(deltas).toEqual([{action: 'removeNode', id: 'neo-column-3'}]);

        // Revert operation
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        ({deltas} = VdomHelper.update({vdom, vnode}));

        expect(deltas).toEqual([
            {action: 'insertNode', index: 2, outerHTML: '<div id="neo-column-3"></div>', parentId: 'neo-calendar-week'}
        ]);
    });

    test('removeDom vdom property: Remove a top level node', () => {
        let vdom = {id: 'neo-1'};
        let vnode = VdomHelper.create({vdom}).vnode;

        vdom = {id: 'neo-1', removeDom: true};

        let {deltas} = VdomHelper.update({vdom, vnode});

        expect(deltas).toEqual([{action: 'removeNode', id: 'neo-1'}]);
    });

    test('removeDom vdom property: Move an event with a higher index sibling into a non empty column', () => {
        let vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [{id: 'neo-event-1'}]},
            {id: 'neo-column-2', cn: [{id: 'neo-event-2'}, {id: 'neo-event-3'}]}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [{id: 'neo-event-1'}, {id: 'neo-event-2'}]},
            {id: 'neo-column-2', cn: [{id: 'neo-event-3'}]}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});

        expect(deltas.length).toBe(1);
        expect(deltas).toEqual([{action: 'moveNode', id: 'neo-event-2', index: 1, parentId: 'neo-column-1'}]);
    });

    test('removeDom vdom property: Remove the first item inside the calendars list', () => {
        let vdom =
        {tag: 'ul', id: 'neo-calendar-calendars-list-1', cn: [
            {tag: 'li', id: 'neo-calendar-calendars-list-1__1', cn: [
                {id: 'neo-calendar-calendars-list-1__component__1', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__1-label'},
                    {id: 'neo-calendar-calendars-list-1__component__1-input'}
                ]}
            ]},
            {tag: 'li', id: 'neo-calendar-calendars-list-1__2', cn: [
                {id: 'neo-calendar-calendars-list-1__component__2', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__2-label'},
                    {id: 'neo-calendar-calendars-list-1__component__2-input'}
                ]}
            ]},
            {tag: 'li', id: 'neo-calendar-calendars-list-1__3', cn: [
                {id: 'neo-calendar-calendars-list-1__component__3', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__3-label'},
                    {id: 'neo-calendar-calendars-list-1__component__3-input'}
                ]}
            ]}
        ]};

        let vnode = VdomHelper.create({vdom}).vnode;

        vdom =
        {tag: 'ul', id: 'neo-calendar-calendars-list-1', cn: [
            {tag: 'li', id: 'neo-calendar-calendars-list-1__2', cn: [
                {id: 'neo-calendar-calendars-list-1__component__2', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__2-label'},
                    {id: 'neo-calendar-calendars-list-1__component__2-input'}
                ]}
            ]},
            {tag: 'li', id: 'neo-calendar-calendars-list-1__3', cn: [
                {id: 'neo-calendar-calendars-list-1__component__3', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__3-label'},
                    {id: 'neo-calendar-calendars-list-1__component__3-input'}
                ]}
            ]}
        ]};

        let {deltas} = VdomHelper.update({vdom, vnode});

        expect(deltas).toEqual([{action: 'removeNode', id: 'neo-calendar-calendars-list-1__1'}]);
    });
});

test('Month View infinite scrolling', () => {
    // Simplified VDOM for testing infinite scrolling
    let vdom =
    {cls: ['neo-c-m-scrollcontainer'], id: 'neo-vnode-150', cn: [
        {id: 'neo-component-6__week__2021-02-21', cn: [{id: 'day-1'}]},
        {id: 'neo-component-6__week__2021-02-28', cn: [{id: 'day-2'}]},
        {id: 'neo-component-6__week__2021-03-07', cn: [{id: 'day-3'}]},
        {id: 'neo-component-6__week__2021-03-14', cn: [{id: 'day-4'}]},
    ]};

    let vnode = VdomHelper.create({vdom}).vnode;

    vdom =
    {cls: ['neo-c-m-scrollcontainer'], id: 'neo-vnode-150', cn: [
        {id: 'neo-component-6__week__2021-03-21', cn: [{id: 'day-5'}]},
        {id: 'neo-component-6__week__2021-03-28', cn: [{id: 'day-6'}]},
        {id: 'neo-component-6__week__2021-04-04', cn: [{id: 'day-7'}]},
        {id: 'neo-component-6__week__2021-04-11', cn: [{id: 'day-8'}]},
    ]};

    let {deltas} = VdomHelper.update({vdom, vnode});

    expect(deltas.length).toBe(8);
    expect(deltas).toEqual([
        {action: 'insertNode', index: 4, parentId: 'neo-vnode-150', outerHTML: expect.any(String)},
        {action: 'insertNode', index: 5, parentId: 'neo-vnode-150', outerHTML: expect.any(String)},
        {action: 'insertNode', index: 6, parentId: 'neo-vnode-150', outerHTML: expect.any(String)},
        {action: 'insertNode', index: 7, parentId: 'neo-vnode-150', outerHTML: expect.any(String)},
        {action: 'removeNode', id: 'neo-component-6__week__2021-02-21'},
        {action: 'removeNode', id: 'neo-component-6__week__2021-02-28'},
        {action: 'removeNode', id: 'neo-component-6__week__2021-03-07'},
        {action: 'removeNode', id: 'neo-component-6__week__2021-03-14'}
    ]);
});
