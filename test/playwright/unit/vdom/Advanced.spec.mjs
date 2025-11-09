import {setup} from '../../setup.mjs';

// tests are designed for this rendering mode
setup({
    neoConfig: {
        useDomApiRenderer: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import StringFromVnode from '../../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper      from '../../../../src/vdom/Helper.mjs';

let deltas, output, vdom, vnode;

test.describe('Neo.vdom.Helper Advanced (Node.js)', () => {

    test('Move & Edit multiple Events', () => {
        vdom = {
            id: 'neo-calendar-week', cn: [
                {id: 'neo-column-1', cn: [
                    {id: 'neo-event-1', cn: [
                        {id: 'neo-event-1__time',  html: '08:00'},
                        {id: 'neo-event-1__title', html: 'Event 1'}
                    ]},
                    {id: 'neo-event-2', cn: [
                        {id: 'neo-event-2__time',  html: '10:00'},
                        {id: 'neo-event-2__title', html: 'Event 2'}
                    ]}
                ]},
                {id: 'neo-column-2', cn: [
                    {id: 'neo-event-3', cn: [
                        {id: 'neo-event-3__time',  html: '08:00'},
                        {id: 'neo-event-3__title', html: 'Event 3'}
                    ]},
                    {id: 'neo-event-4', cn: [
                        {id: 'neo-event-4__time',  html: '10:00'},
                        {id: 'neo-event-4__title', html: 'Event 4'}
                    ]}
                ]}
            ]
        };

        vnode = VdomHelper.create({vdom}).vnode;

        vdom = {
            id: 'neo-calendar-week', cn: [
                {id: 'neo-column-1', cn: [
                    {id: 'neo-event-3', cls: ['foo1'], cn: [
                        {id: 'neo-event-3__time',  html: '08:00'},
                        {id: 'neo-event-3__title', html: 'Event 3'}
                    ]},
                    {id: 'neo-event-4', cls: ['foo2'], cn: [
                        {id: 'neo-event-4__time',  html: '10:00'},
                        {id: 'neo-event-4__title', html: 'Event 4'}
                    ]},
                    {id: 'neo-event-2', cls: ['foo3'], cn: [
                        {id: 'neo-event-2__time',  html: '06:00'},
                        {id: 'neo-event-2__title', html: 'Event 2'}
                    ]},
                    {id: 'neo-event-1', cn: [
                        {id: 'neo-event-1__time',  html: '08:00'},
                        {id: 'neo-event-1__title', html: 'Event 1'}
                    ]}
                ]},
                {id: 'neo-column-2', cls: ['foo4'], cn: []}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(8);
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-1'},
            {                    id: 'neo-event-3', cls: {add: ['foo1']}},
            {action: 'moveNode', id: 'neo-event-4', index: 1, parentId: 'neo-column-1'},
            {                    id: 'neo-event-4', cls: {add: ['foo2']}},
            {action: 'moveNode', id: 'neo-event-2', index: 2, parentId: 'neo-column-1'},
            {                    id: 'neo-event-2', cls: {add: ['foo3']}},
            {                    id: 'neo-event-2__time', innerHTML: '06:00'},
            {                    id: 'neo-column-2', cls: {add: ['foo4']}}
        ]);

        // Revert operation
        vdom = {
            id: 'neo-calendar-week', cn: [
                {id: 'neo-column-1', cn: [
                    {id: 'neo-event-1', cn: [
                        {id: 'neo-event-1__time',  html: '08:00'},
                        {id: 'neo-event-1__title', html: 'Event 1'}
                    ]},
                    {id: 'neo-event-2', cn: [
                        {id: 'neo-event-2__time',  html: '10:00'},
                        {id: 'neo-event-2__title', html: 'Event 2'}
                    ]}
                ]},
                {id: 'neo-column-2', cn: [
                    {id: 'neo-event-3', cn: [
                        {id: 'neo-event-3__time',  html: '08:00'},
                        {id: 'neo-event-3__title', html: 'Event 3'}
                    ]},
                    {id: 'neo-event-4', cn: [
                        {id: 'neo-event-4__time',  html: '10:00'},
                        {id: 'neo-event-4__title', html: 'Event 4'}
                    ]}
                ]}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(8);
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {                    id: 'neo-event-2', cls: {remove: ['foo3']}},
            {                    id: 'neo-event-2__time', innerHTML: '10:00'},
            {                    id: 'neo-column-2', cls: {remove: ['foo4']}},
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-2'},
            {                    id: 'neo-event-3',  cls: {remove: ['foo1']}},
            {action: 'moveNode', id: 'neo-event-4', index: 1, parentId: 'neo-column-2'},
            {                    id: 'neo-event-4',  cls: {remove: ['foo2']}}
        ]);
    });

    test('Add, Move & Edit multiple Events', () => {
        vdom = {
            id: 'neo-calendar-week', cn: [
                {id: 'neo-column-1', cn: [
                    {id: 'neo-event-1', cls: ['foo1'], cn: [
                        {id: 'neo-event-1__time',  html: '08:00'},
                        {id: 'neo-event-1__title', html: 'Event 1'}
                    ]},
                    {id: 'neo-event-2', cls: ['foo2'], cn: [
                        {id: 'neo-event-2__time',  html: '10:00'},
                        {id: 'neo-event-2__title', html: 'Event 2'}
                    ]},
                    {id: 'neo-event-3', cls: ['foo3'], cn: [
                        {id: 'neo-event-3__time',  html: '06:00'},
                        {id: 'neo-event-3__title', html: 'Event 3'}
                    ]},
                    {id: 'neo-event-4', cn: [
                        {id: 'neo-event-4__time',  html: '08:00'},
                        {id: 'neo-event-4__title', html: 'Event 4'}
                    ]}
                ]},
                {id: 'neo-column-2', cls: ['foo4'], cn: []}
            ]
        };

        vnode = VdomHelper.create({vdom}).vnode;

        vdom = {
            id: 'neo-calendar-week', cn: [
                {id: 'neo-column-1', cn: [
                    {id: 'neo-event-5', cn: [
                        {id: 'neo-event-5__time',  html: '08:00'},
                        {id: 'neo-event-5__title', html: 'Event 5'}
                    ]},
                    {id: 'neo-event-6', cn: [
                        {id: 'neo-event-6__time',  html: '08:00'},
                        {id: 'neo-event-6__title', html: 'Event 6'}
                    ]},
                    {id: 'neo-event-1', cls: ['foo1'], cn: [
                        {id: 'neo-event-4__time',  html: '08:00'},
                        {id: 'neo-event-4__title', html: 'Event 4_new'}
                    ]},
                    {id: 'neo-event-4', cn: [
                        {id: 'neo-event-1__time',  html: '08:00'},
                        {id: 'neo-event-1__title', html: 'Event 1'}
                    ]}
                ]},
                {id: 'neo-column-2', cn: [
                    {id: 'neo-event-7', cn: [
                        {id: 'neo-event-7__time',  html: '08:00'},
                        {id: 'neo-event-7__title', html: 'Event 7'}
                    ]},
                    {id: 'neo-event-2', cn: [
                        {id: 'neo-event-2__time',  html: '10:00'},
                        {id: 'neo-event-2__title', html: 'Event 2'}
                    ]}
                ]}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(12);
        expect(deltas).toEqual([
            {action: 'insertNode',                           index: 0, parentId: 'neo-column-1', outerHTML: expect.any(String)},
            {action: 'insertNode',                           index: 1, parentId: 'neo-column-1', outerHTML: expect.any(String)},
            {action: 'moveNode',   id: 'neo-event-4__time',  index: 0, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-4__title', index: 1, parentId: 'neo-event-1'},
            {                      id: 'neo-event-4__title', innerHTML: 'Event 4_new'},
            {action: 'moveNode',   id: 'neo-event-1__time',  index: 0, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-1__title', index: 1, parentId: 'neo-event-4'},
            {                      id: 'neo-column-2',       cls: {remove: ['foo4']}},
            {action: 'insertNode',                           index: 0, parentId: 'neo-column-2', outerHTML: expect.any(String)},
            {action: 'moveNode',   id: 'neo-event-2',        index: 1, parentId: 'neo-column-2'},
            {                      id: 'neo-event-2',        cls: {remove: ['foo2']}},
            {action: 'removeNode', id: 'neo-event-3'}
        ]);

        // Revert operation
        vdom = {
            id: 'neo-calendar-week', cn: [
                {id: 'neo-column-1', cn: [
                    {id: 'neo-event-1', cls: ['foo1'], cn: [
                        {id: 'neo-event-1__time',  html: '08:00'},
                        {id: 'neo-event-1__title', html: 'Event 1'}
                    ]},
                    {id: 'neo-event-2', cls: ['foo2'], cn: [
                        {id: 'neo-event-2__time',  html: '10:00'},
                        {id: 'neo-event-2__title', html: 'Event 2'}
                    ]},
                    {id: 'neo-event-3', cls: ['foo3'], cn: [
                        {id: 'neo-event-3__time',  html: '06:00'},
                        {id: 'neo-event-3__title', html: 'Event 3'}
                    ]},
                    {id: 'neo-event-4', cn: [
                        {id: 'neo-event-4__time',  html: '08:00'},
                        {id: 'neo-event-4__title', html: 'Event 4'}
                    ]}
                ]},
                {id: 'neo-column-2', cls: ['foo4'], cn: []}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(13);
        expect(deltas).toEqual([
            {action: 'moveNode',   id: 'neo-event-1__time',  index: 0, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-1__title', index: 1, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-2',        index: 3, parentId: 'neo-column-1'},
            {                      id: 'neo-event-2',        cls: {add: ['foo2']}},
            {action: 'insertNode',                           index: 4, parentId: 'neo-column-1', outerHTML: expect.any(String)},
            {action: 'moveNode',   id: 'neo-event-4',        index: 5, parentId: 'neo-column-1'},
            {action: 'moveNode',   id: 'neo-event-4__time',  index: 0, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-4__title', index: 1, parentId: 'neo-event-4'},
            {                      id: 'neo-event-4__title', innerHTML: 'Event 4'},
            {                      id: 'neo-column-2',       cls: {add: ['foo4']}},
            {action: 'removeNode', id: 'neo-event-5'},
            {action: 'removeNode', id: 'neo-event-6'},
            {action: 'removeNode', id: 'neo-event-7'}
        ]);
    });

    test('Wrapping nodes multiple times', () => {
        vdom = {
            id: 'neo-container-1', cn: [
                {id: 'neo-component-1'},
                {id: 'neo-component-2'},
                {id: 'neo-component-3'},
                {id: 'neo-component-4'},
                {id: 'neo-component-5'},
                {id: 'neo-component-6'}
            ]
        };

        vnode = VdomHelper.create({vdom}).vnode;

        vdom = {
            id: 'neo-container-1', cn: [
                {id: 'neo-wrapper-1', cn: [
                    {id: 'neo-component-1', cls: ['foo1']}
                ]},
                {id: 'neo-wrapper-2', cn: [
                    {id: 'neo-wrapper-3', cn: [
                        {id: 'neo-component-2', cls: ['foo2']}
                    ]}
                ]},
                {id: 'neo-wrapper-4', cn: [
                    {id: 'neo-component-3', cls: ['foo3']},
                    {id: 'neo-component-4', cls: ['foo4']}
                ]},
                {id: 'neo-wrapper-5', cn: [
                    {id: 'neo-component-5', cls: ['foo5']},
                    {id: 'neo-wrapper-6', cn: [
                        {id: 'neo-component-6', cls: ['foo6']}
                    ]}
                ]}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(16);
        expect(deltas).toEqual([
            {action: 'insertNode',                        index: 0, parentId: 'neo-container-1', outerHTML: '<div id="neo-wrapper-1"></div>'},
            {action: 'moveNode',   id: 'neo-component-1', index: 0, parentId: 'neo-wrapper-1'},
            {                      id: 'neo-component-1', cls: {add: ['foo1']}},
            {action: 'insertNode',                        index: 1, parentId: 'neo-container-1', outerHTML: '<div id="neo-wrapper-2"><div id="neo-wrapper-3"></div></div>'},
            {action: 'moveNode',   id: 'neo-component-2', index: 0, parentId: 'neo-wrapper-3'},
            {                      id: 'neo-component-2', cls: {add: ['foo2']}},
            {action: 'insertNode',                        index: 2, parentId: 'neo-container-1', outerHTML: '<div id="neo-wrapper-4"></div>'},
            {action: 'moveNode',   id: 'neo-component-3', index: 0, parentId: 'neo-wrapper-4'},
            {                      id: 'neo-component-3', cls: {add: ['foo3']}},
            {action: 'moveNode',   id: 'neo-component-4', index: 1, parentId: 'neo-wrapper-4'},
            {                      id: 'neo-component-4', cls: {add: ['foo4']}},
            {action: 'insertNode',                        index: 3, parentId: 'neo-container-1', outerHTML: '<div id="neo-wrapper-5"><div id="neo-wrapper-6"></div></div>'},
            {action: 'moveNode',   id: 'neo-component-5', index: 0, parentId: 'neo-wrapper-5'},
            {                      id: 'neo-component-5', cls: {add: ['foo5']}},
            {action: 'moveNode',   id: 'neo-component-6', index: 0, parentId: 'neo-wrapper-6'},
            {                      id: 'neo-component-6', cls: {add: ['foo6']}}
        ]);

        // Revert operation
        vdom = {
            id: 'neo-container-1', cn: [
                {id: 'neo-component-1'},
                {id: 'neo-component-2'},
                {id: 'neo-component-3'},
                {id: 'neo-component-4'},
                {id: 'neo-component-5'},
                {id: 'neo-component-6'}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(16);
        expect(deltas).toEqual([
            {action: 'moveNode',   id: 'neo-component-1', index: 4, parentId: 'neo-container-1'},
            {                      id: 'neo-component-1', cls: {remove: ['foo1']}},
            {action: 'moveNode',   id: 'neo-component-2', index: 5, parentId: 'neo-container-1'},
            {                      id: 'neo-component-2', cls: {remove: ['foo2']}},
            {action: 'moveNode',   id: 'neo-component-3', index: 6, parentId: 'neo-container-1'},
            {                      id: 'neo-component-3', cls: {remove: ['foo3']}},
            {action: 'moveNode',   id: 'neo-component-4', index: 7, parentId: 'neo-container-1'},
            {                      id: 'neo-component-4', cls: {remove: ['foo4']}},
            {action: 'moveNode',   id: 'neo-component-5', index: 8, parentId: 'neo-container-1'},
            {                      id: 'neo-component-5', cls: {remove: ['foo5']}},
            {action: 'moveNode',   id: 'neo-component-6', index: 9, parentId: 'neo-container-1'},
            {                      id: 'neo-component-6', cls: {remove: ['foo6']}},
            {action: 'removeNode', id: 'neo-wrapper-1'},
            {action: 'removeNode', id: 'neo-wrapper-2'},
            {action: 'removeNode', id: 'neo-wrapper-4'},
            {action: 'removeNode', id: 'neo-wrapper-5'}
        ]);
    });

    test('Ignoring static nodes', () => {
        vdom = {
            id: 'neo-container-1', cn: [
                {id: 'neo-component-1', static: true},
                {id: 'neo-component-2', cn: [
                    {id: 'neo-component-3', static: true}
                ]},
                {id: 'neo-component-4', static: true, cn: [
                    {id: 'neo-component-5'},
                    {id: 'neo-component-6'}
                ]}
            ]
        };

        const result = vnode = VdomHelper.create({vdom});
        const outerHTML = result.outerHTML;
        vnode = result.vnode;

        expect(outerHTML.includes('static')).toBe(false);
        expect(vnode.static).toBe(undefined);
        expect(vnode.childNodes[0].static).toBe(true);

        vdom = {
            id: 'neo-container-1', cn: [
                {id: 'neo-component-1', cls: ['foo1'], static: true},
                {id: 'neo-component-2', cn: [
                    {id: 'neo-component-3', cls: ['foo3'], static: true}
                ]},
                {id: 'neo-component-4', static: true, cn: [
                    {id: 'neo-component-6'},
                    {id: 'neo-component-5', cls: ['foo5']}
                ]}
            ]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        expect(deltas.length).toBe(0);
    });
});
