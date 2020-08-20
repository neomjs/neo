import Neo                     from '../../../src/Neo.mjs';
import * as core               from '../../../src/core/_export.mjs';
import NeoArray                from '../../../src/util/Array.mjs';
import Style                   from '../../../src/util/Style.mjs';
import {default as VdomHelper} from '../../../src/vdom/Helper.mjs';
import {default as VDomUtil}   from '../../../src/util/VDom.mjs';

let deltas, output, tmp, vdom, vnode;

StartTest(t => {
    t.it('Event moving to the right', t => {
        t.diag("Insert event into a column on the right");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-1', cls: ['neo-event']}]},
                {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-2', cls: ['neo-event']}]}
            ]
        };

        vnode = VdomHelper.create(vdom);

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : []},
                {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-1', cls: ['neo-event', 'foo']}, {id: 'neo-event-2', cls: ['neo-event']}]}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-2'},
            {cls: {add: ['foo'], remove: []}, id: 'neo-event-1'}
        ], 'deltas got created successfully');

        t.diag("Revert operation");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-1', cls: ['neo-event']}]},
                {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-2', cls: ['neo-event']}]}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {cls: {add: [], remove: ['foo']}, id: 'neo-event-1'},
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-2'} // todo: does not hurt, but not needed
        ], 'deltas got created successfully');
    });

    t.it('Event moving to the left', t => {
        t.diag("Insert event into a column on the left");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-1', cls: ['neo-event']}]},
                {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-2', cls: ['neo-event']}]}
            ]
        };

        vnode = VdomHelper.create(vdom);

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-2', cls: ['neo-event', 'foo']}, {id: 'neo-event-1', cls: ['neo-event']}]},
                {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : []}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-1'},
            {cls: {add: ['foo'], remove: []}, id: 'neo-event-2'}
        ], 'deltas got created successfully');

        t.diag("Revert operation");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-1', cls: ['neo-event']}]},
                {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-2', cls: ['neo-event']}]}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-2'},
            {cls: {add: [], remove: ['foo']}, id: 'neo-event-2'},
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'} // todo: does not hurt, but not needed
        ], 'deltas got created successfully');
    });

    t.it('removeDom vdom property', t => {
        t.diag("Remove the DOM of the first child node");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1'},
                {id: 'neo-column-2'},
                {id: 'neo-column-3'}
            ]
        };

        vnode = VdomHelper.create(vdom);

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1', removeDom: true},
                {id: 'neo-column-2'},
                {id: 'neo-column-3'}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-column-1'}
        ], 'deltas got created successfully');

        t.diag("Revert operation");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1'},
                {id: 'neo-column-2'},
                {id: 'neo-column-3'}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-column-1', index:0, outerHTML: '<div id="neo-column-1"></div>', parentId: 'neo-calendar-week'}
        ], 'deltas got created successfully');

        t.diag("Remove the DOM of the last child node");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1'},
                {id: 'neo-column-2'},
                {id: 'neo-column-3', removeDom: true}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-column-3'}
        ], 'deltas got created successfully');

        t.diag("Revert operation");

        vdom = {
            id: 'neo-calendar-week',
            cn: [
                {id: 'neo-column-1'},
                {id: 'neo-column-2'},
                {id: 'neo-column-3'}
            ]
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-column-3', index:2, outerHTML: '<div id="neo-column-3"></div>', parentId: 'neo-calendar-week'}
        ], 'deltas got created successfully');

        t.diag("Remove a top level node");

        vdom = {
            id: 'neo-1'
        };

        vnode = VdomHelper.create(vdom);

        vdom = {
            id       : 'neo-1',
            removeDom: true
        };

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-1'}
        ], 'deltas got created successfully');
    });
});