import Neo        from '../../../../../src/Neo.mjs';
import * as core  from '../../../../../src/core/_export.mjs';
import VdomHelper from '../../../../../src/vdom/Helper.mjs';

let oldVdom, oldVnode, vdom;

StartTest(t => {
    t.it('Remove all Table Rows', t => {
        oldVdom =
        {id: 'neo-table-container-1', cn: [
            {tag: 'tbody', id: 'neo-table-view-1', cn: [
                {tag: 'tr', id: 'neo-table-row-1'},
                {tag: 'tr', id: 'neo-table-row-2'},
                {tag: 'tr', id: 'neo-table-row-3'},
                {tag: 'tr', id: 'neo-table-row-4'},
                {tag: 'tr', id: 'neo-table-row-5'}
            ]}
        ]};

        let oldVnode = VdomHelper.create(oldVdom);

        vdom =
        {id: 'neo-table-container-1', cn: [
            {tag: 'tbody', id: 'neo-table-view-1', cn: []}
        ]};

        let {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        t.is(deltas.length, 5, 'Count deltas equals 5');

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-table-row-1'},
            {action: 'removeNode', id: 'neo-table-row-2'},
            {action: 'removeNode', id: 'neo-table-row-3'},
            {action: 'removeNode', id: 'neo-table-row-4'},
            {action: 'removeNode', id: 'neo-table-row-5'}
        ], 'Deltas got created successfully');
    });
});
