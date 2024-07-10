import Neo        from '../../../../src/Neo.mjs';
import * as core  from '../../../../src/core/_export.mjs';
import NeoArray   from '../../../../src/util/Array.mjs';
import Style      from '../../../../src/util/Style.mjs';
import VdomHelper from '../../../../src/vdom/Helper.mjs';
import VDomUtil   from '../../../../src/util/VDom.mjs';

let deltas, output, vdom, vnode;

StartTest(t => {
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
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-2'},
            {action: 'moveNode', id: 'neo-event-4', index: 1, parentId: 'neo-column-2'},
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {                    id: 'neo-event-2', cls: {remove: ['foo3']}},
            {                    id: 'neo-event-2__time', innerHTML: '10:00'},
            {                    id: 'neo-column-2', cls: {remove: ['foo4']}},
            {                    id: 'neo-event-3',  cls: {remove: ['foo1']}},
            {                    id: 'neo-event-4',  cls: {remove: ['foo2']}}
        ], 'Deltas got created successfully');
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
            {action: 'insertNode', id: 'neo-event-5',        index: 0, parentId: 'neo-column-1', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-event-6',        index: 1, parentId: 'neo-column-1', outerHTML: t.any(String)},
            {action: 'moveNode',   id: 'neo-event-1__time',  index: 0, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-1__title', index: 1, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-4__time',  index: 0, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-4__title', index: 1, parentId: 'neo-event-1'},
            {                      id: 'neo-event-4__title', innerHTML: 'Event 4_new'},
            // index: 0 would be correct, but a bigger index does not matter
            {action: 'moveNode',   id: 'neo-event-2',        index: 1, parentId: 'neo-column-2'},
            {                      id: 'neo-column-2',       cls: {remove: ['foo4']}},
            {action: 'insertNode', id: 'neo-event-7',        index: 0, parentId: 'neo-column-2', outerHTML: t.any(String)},
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
            {action: 'moveNode',   id: 'neo-event-4__time',  index: 0, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-4__title', index: 1, parentId: 'neo-event-4'},
            {action: 'moveNode',   id: 'neo-event-1__time',  index: 0, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-1__title', index: 1, parentId: 'neo-event-1'},
            {action: 'moveNode',   id: 'neo-event-2',        index: 1, parentId: 'neo-column-1'},
            {                      id: 'neo-event-2',        cls: {add: ['foo2']}},
            {action: 'insertNode', id: 'neo-event-3',        index: 2, parentId: 'neo-column-1', outerHTML: t.any(String)},
            {                      id: 'neo-event-4__title', innerHTML: 'Event 4'},
            {                      id: 'neo-column-2',       cls: {add: ['foo4']}},
            {action: 'removeNode', id: 'neo-event-5'},
            {action: 'removeNode', id: 'neo-event-6'},
            {action: 'removeNode', id: 'neo-event-7'}
        ], 'Deltas got created successfully');
    });
});
