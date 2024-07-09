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
                    {id: 'neo-event-1__time', html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]},
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time', html: '10:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]}
            ]},
            {id: 'neo-column-2', cn: [
                {id: 'neo-event-3', cn: [
                    {id: 'neo-event-3__time', html: '08:00'},
                    {id: 'neo-event-3__title', html: 'Event 3'}
                ]},
                {id: 'neo-event-4', cn: [
                    {id: 'neo-event-4__time', html: '10:00'},
                    {id: 'neo-event-4__title', html: 'Event 4'}
                ]}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-3', cls: ['foo1'], cn: [
                    {id: 'neo-event-3__time', html: '08:00'},
                    {id: 'neo-event-3__title', html: 'Event 3'}
                ]},
                {id: 'neo-event-4', cls: ['foo2'], cn: [
                    {id: 'neo-event-4__time', html: '10:00'},
                    {id: 'neo-event-4__title', html: 'Event 4'}
                ]},
                {id: 'neo-event-2', cls: ['foo3'], cn: [
                    {id: 'neo-event-2__time', html: '06:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]},
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time', html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]}
            ]},
            {id: 'neo-column-2', cls: ['foo4'], cn: []}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        console.log(deltas);

        t.is(deltas.length, 8, 'Count deltas equals 8');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-1'},
            {                    id: 'neo-event-3', cls: {add: ['foo1']}},
            {action: 'moveNode', id: 'neo-event-4', index: 1, parentId: 'neo-column-1'},
            {                    id: 'neo-event-4', cls: {add: ['foo2']}},
            {action: 'moveNode', id: 'neo-event-2', index: 2, parentId: 'neo-column-1'}, // todo: not needed
            {                    id: 'neo-event-2', cls: {add: ['foo3']}},
            {                    id: 'neo-event-2__time', innerHTML: '06:00'},
            {                    id: 'neo-column-2', cls: {add: ['foo4']}}
        ], 'deltas got created successfully');
    });
});
