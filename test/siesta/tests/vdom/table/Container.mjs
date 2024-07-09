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

        t.is(deltas.length, 1, 'Count deltas equals 1');

        t.isDeeplyStrict(deltas, [
            {action: 'removeAll', parentId: 'neo-table-view-1'}
        ], 'Deltas got created successfully');
    });

    t.it('Remove all Table Rows & move 2 into a different Table', t => {
        oldVdom =
        {id: 'neo-wrapper-1', cn: [
            {id: 'neo-table-container-1', cn: [
                {tag: 'tbody', id: 'neo-table-view-1', cn: [
                    {tag: 'tr', id: 'neo-table-row-1'},
                    {tag: 'tr', id: 'neo-table-row-2'},
                    {tag: 'tr', id: 'neo-table-row-3'},
                    {tag: 'tr', id: 'neo-table-row-4'},
                    {tag: 'tr', id: 'neo-table-row-5'}
                ]}
            ]},
            {id: 'neo-table-container-2', cn: [
                {tag: 'tbody', id: 'neo-table-view-2', cn: []}
            ]}
        ]};

        let oldVnode = VdomHelper.create(oldVdom);

        vdom =
        {id: 'neo-wrapper-1', cn: [
            {id: 'neo-table-container-1', cn: [
                {tag: 'tbody', id: 'neo-table-view-1', cn: []}
            ]},
            {id: 'neo-table-container-2', cn: [
                {tag: 'tbody', id: 'neo-table-view-2', cn: [
                    {tag: 'tr', id: 'neo-table-row-2'},
                    {tag: 'tr', id: 'neo-table-row-4'}
                ]}
            ]}
        ]};

        let {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-table-row-2', index: 0, parentId: 'neo-table-view-2'},
            {action: 'moveNode', id: 'neo-table-row-4', index: 1, parentId: 'neo-table-view-2'},
            {action: 'removeAll', parentId: 'neo-table-view-1'}
        ], 'Deltas got created successfully');
    });
});
