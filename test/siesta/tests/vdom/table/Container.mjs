import Neo        from '../../../../../src/Neo.mjs';
import * as core  from '../../../../../src/core/_export.mjs';
import VdomHelper from '../../../../../src/vdom/Helper.mjs';

let deltas, output, vdom, vnode;

StartTest(t => {
    t.it('Remove all Table Rows', t => {
        vdom =
        {id: 'neo-table-container-1', cn: [
            {tag: 'tbody', id: 'neo-table-view-1', cn: [
                {tag: 'tr', id: 'neo-table-row-1'},
                {tag: 'tr', id: 'neo-table-row-2'},
                {tag: 'tr', id: 'neo-table-row-3'},
                {tag: 'tr', id: 'neo-table-row-4'},
                {tag: 'tr', id: 'neo-table-row-5'}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-table-container-1', cn: [
            {tag: 'tbody', id: 'neo-table-view-1', cn: []}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 1, 'Count deltas equals 1');

        t.isDeeplyStrict(deltas, [
            {action: 'removeAll', parentId: 'neo-table-view-1'}
        ], 'Deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-table-container-1', cn: [
            {tag: 'tbody', id: 'neo-table-view-1', cn: [
                {tag: 'tr', id: 'neo-table-row-1'},
                {tag: 'tr', id: 'neo-table-row-2'},
                {tag: 'tr', id: 'neo-table-row-3'},
                {tag: 'tr', id: 'neo-table-row-4'},
                {tag: 'tr', id: 'neo-table-row-5'}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 5, 'Count deltas equals 5');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', index: 0, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-1"></tr>'},
            {action: 'insertNode', index: 1, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-2"></tr>'},
            {action: 'insertNode', index: 2, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-3"></tr>'},
            {action: 'insertNode', index: 3, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-4"></tr>'},
            {action: 'insertNode', index: 4, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-5"></tr>'}
        ], 'Deltas got created successfully');
    });

    t.it('Remove all Table Rows & move 2 into a different Table', t => {
        vdom =
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

        vnode = VdomHelper.create(vdom);

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

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-table-row-2', index: 0, parentId: 'neo-table-view-2'},
            {action: 'moveNode', id: 'neo-table-row-4', index: 1, parentId: 'neo-table-view-2'},
            {action: 'removeAll', parentId: 'neo-table-view-1'}
        ], 'Deltas got created successfully');

        t.diag('Revert operation');

        vdom =
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

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 5, 'Count deltas equals 5');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode',                        index: 0, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-1"></tr>'},
            {action: 'moveNode',   id: 'neo-table-row-2', index: 1, parentId: 'neo-table-view-1'},
            {action: 'insertNode',                        index: 2, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-3"></tr>'},
            {action: 'moveNode',   id: 'neo-table-row-4', index: 3, parentId: 'neo-table-view-1'},
            {action: 'insertNode',                        index: 4, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-5"></tr>'}
        ], 'Deltas got created successfully');
    });
});
