import Neo        from '../../../../../src/Neo.mjs';
import * as core  from '../../../../../src/core/_export.mjs';
import VdomHelper from '../../../../../src/vdom/Helper.mjs';

let deltas, output, vdom, vnode;

StartTest(t => {
    t.it('Wrap Container Items', t => {
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
            {id: 'neo-vnode-1', cn: [
                {id: 'neo-vnode-2', cn: [
                    {id: 'neo-component-1'},
                    {id: 'neo-component-2'},
                    {id: 'neo-component-3'},
                    {id: 'neo-component-4'},
                    {id: 'neo-component-5'},
                    {id: 'neo-component-6'}
                ]}
            ]}
        ]};

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 7, 'Count deltas equals 7');

        t.isDeeplyStrict(deltas, [
            {
                action   : 'insertNode',
                id       : 'neo-vnode-1',
                index    : 0,
                outerHTML: '<div id="neo-vnode-1"><div id="neo-vnode-2"></div></div>',
                parentId : 'neo-container-1'
            },
            {action: 'moveNode', id: 'neo-component-1', index: 0, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-2', index: 1, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-3', index: 2, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-4', index: 3, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-5', index: 4, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-6', index: 5, parentId: 'neo-vnode-2'},
        ], 'Deltas got created successfully');
    });
});
