import { it }     from '@bryntum/siesta/index.js';
import Neo        from '../../../../src/Neo.mjs';
import * as core  from '../../../../src/core/_export.mjs';
import VdomHelper from '../../../../src/vdom/Helper.mjs';

let deltas, output, vdom, vnode;

it('Test section', t => {
    t.it('Move & Edit multiple Events', t => {
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
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
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
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 8, 'Count deltas equals 8');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-1'},
            {                    id: 'neo-event-3', cls: {add: ['foo1']}},
            {action: 'moveNode', id: 'neo-event-4', index: 1, parentId: 'neo-column-1'},
            {                    id: 'neo-event-4', cls: {add: ['foo2']}},
            {action: 'moveNode', id: 'neo-event-2', index: 2, parentId: 'neo-column-1'},
            {                    id: 'neo-event-2', cls: {add: ['foo3']}},
            {                    id: 'neo-event-2__time', innerHTML: '06:00'},
            {                    id: 'neo-column-2', cls: {add: ['foo4']}}
        ], 'Deltas got created successfully');

        t.diag('Revert operation');

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
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 8, 'Count deltas equals 8');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {                    id: 'neo-event-2', cls: {remove: ['foo3']}},
            {                    id: 'neo-event-2__time', innerHTML: '10:00'},
            {                    id: 'neo-column-2', cls: {remove: ['foo4']}},
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-2'},
            {                    id: 'neo-event-3',  cls: {remove: ['foo1']}},
            {action: 'moveNode', id: 'neo-event-4', index: 1, parentId: 'neo-column-2'},
            {                    id: 'neo-event-4',  cls: {remove: ['foo2']}}
        ], 'Deltas got created successfully')
    });

    t.it('Add, Move & Edit multiple Events', t => {
        vdom =
        {id: 'neo-calendar-week', cn: [
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
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-5', cn: [ // new node
                    {id: 'neo-event-5__time',  html: '08:00'},
                    {id: 'neo-event-5__title', html: 'Event 5'}
                ]},
                {id: 'neo-event-6', cn: [ // new node
                    {id: 'neo-event-6__time',  html: '08:00'},
                    {id: 'neo-event-6__title', html: 'Event 6'}
                ]},
                {id: 'neo-event-1', cls: ['foo1'], cn: [
                    {id: 'neo-event-4__time',  html: '08:00'},      // switched the content with event 4
                    {id: 'neo-event-4__title', html: 'Event 4_new'} // and changed the html value
                ]},
                {id: 'neo-event-4', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},      // switched the content with event 1
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]}
            ]},
            {id: 'neo-column-2', cn: [
                {id: 'neo-event-7', cn: [ // new node
                    {id: 'neo-event-7__time',  html: '08:00'},
                    {id: 'neo-event-7__title', html: 'Event 7'}
                ]},
                {id: 'neo-event-2', cn: [ // moved from column-1
                    {id: 'neo-event-2__time',  html: '10:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 12, 'Count deltas equals 12');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode',                           index: 0, parentId: 'neo-column-1', outerHTML: t.any(String)},
            {action: 'insertNode',                           index: 1, parentId: 'neo-column-1', outerHTML: t.any(String)},
            {action: 'moveNode',   id: 'neo-event-4__time',  index: 0, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-4__title', index: 1, parentId: 'neo-event-1'},
            {                      id: 'neo-event-4__title', innerHTML: 'Event 4_new'},
            {action: 'moveNode',   id: 'neo-event-1__time',  index: 0, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-1__title', index: 1, parentId: 'neo-event-4'},
            {                      id: 'neo-column-2',       cls: {remove: ['foo4']}},
            {action: 'insertNode',                           index: 0, parentId: 'neo-column-2', outerHTML: t.any(String)},
            {action: 'moveNode',   id: 'neo-event-2',        index: 1, parentId: 'neo-column-2'},
            {                      id: 'neo-event-2',        cls: {remove: ['foo2']}},
            {action: 'removeNode', id: 'neo-event-3'}
        ], 'Deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
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
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 12, 'Count deltas equals 12');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'neo-event-1__time',  index: 0, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-1__title', index: 1, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-2',        index: 1, parentId: 'neo-column-1'},
            {                      id: 'neo-event-2',        cls: {add: ['foo2']}},
            {action: 'insertNode',                           index: 2, parentId: 'neo-column-1', outerHTML: t.any(String)},
            {action: 'moveNode',   id: 'neo-event-4__time',  index: 0, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-4__title', index: 1, parentId: 'neo-event-4'},
            {                      id: 'neo-event-4__title', innerHTML: 'Event 4'},
            {                      id: 'neo-column-2',       cls: {add: ['foo4']}},
            {action: 'removeNode', id: 'neo-event-5'},
            {action: 'removeNode', id: 'neo-event-6'},
            {action: 'removeNode', id: 'neo-event-7'}
        ], 'Deltas got created successfully');
    });

    t.it('Wrapping nodes multiple times', t => {
        vdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-component-1'},
            {id: 'neo-component-2'},
            {id: 'neo-component-3'},
            {id: 'neo-component-4'},
            {id: 'neo-component-5'},
            {id: 'neo-component-6'}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-wrapper-1', cn: [ // single wrapper
                {id: 'neo-component-1', cls: ['foo1']}
            ]},
            {id: 'neo-wrapper-2', cn: [ // double wrapper
                {id: 'neo-wrapper-3', cn: [
                    {id: 'neo-component-2', cls: ['foo2']}
                ]}
            ]},
            {id: 'neo-wrapper-4', cn: [ // wrapping multiple nodes
                {id: 'neo-component-3', cls: ['foo3']},
                {id: 'neo-component-4', cls: ['foo4']}
            ]},
            {id: 'neo-wrapper-5', cn: [ // nested wrapping
                {id: 'neo-component-5', cls: ['foo5']},
                {id: 'neo-wrapper-6', cn: [
                    {id: 'neo-component-6', cls: ['foo6']}
                ]}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 16, 'Count deltas equals 16');

        t.isDeeplyStrict(deltas, [
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
        ], 'Deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-component-1'},
            {id: 'neo-component-2'},
            {id: 'neo-component-3'},
            {id: 'neo-component-4'},
            {id: 'neo-component-5'},
            {id: 'neo-component-6'}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 16, 'Count deltas equals 16');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'neo-component-1', index: 0, parentId: 'neo-container-1'},
            {                      id: 'neo-component-1', cls: {remove: ['foo1']}},
            {action: 'moveNode',   id: 'neo-component-2', index: 1, parentId: 'neo-container-1'},
            {                      id: 'neo-component-2', cls: {remove: ['foo2']}},
            {action: 'moveNode',   id: 'neo-component-3', index: 2, parentId: 'neo-container-1'},
            {                      id: 'neo-component-3', cls: {remove: ['foo3']}},
            {action: 'moveNode',   id: 'neo-component-4', index: 3, parentId: 'neo-container-1'},
            {                      id: 'neo-component-4', cls: {remove: ['foo4']}},
            {action: 'moveNode',   id: 'neo-component-5', index: 4, parentId: 'neo-container-1'},
            {                      id: 'neo-component-5', cls: {remove: ['foo5']}},
            {action: 'moveNode',   id: 'neo-component-6', index: 5, parentId: 'neo-container-1'},
            {                      id: 'neo-component-6', cls: {remove: ['foo6']}},
            {action: 'removeNode', id: 'neo-wrapper-1'},
            {action: 'removeNode', id: 'neo-wrapper-2'},
            {action: 'removeNode', id: 'neo-wrapper-4'},
            {action: 'removeNode', id: 'neo-wrapper-5'}
        ], 'Deltas got created successfully');
    });
});
