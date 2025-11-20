import {setup} from '../../../setup.mjs';

// Call setup with the specific configuration for this test file
setup({
    neoConfig: {
        useDomApiRenderer: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import StringFromVnode from '../../../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper      from '../../../../../src/vdom/Helper.mjs';

test.describe('vdom/table/Container', () => {
    let deltas, output, vdom, vnode;

    test('Remove all Table Rows', () => {
        vdom = {
            id: 'neo-table-container-1', cn: [
                {
                    tag: 'tbody', id: 'neo-table-view-1', cn: [
                        {tag: 'tr', id: 'neo-table-row-1'},
                        {tag: 'tr', id: 'neo-table-row-2'},
                        {tag: 'tr', id: 'neo-table-row-3'},
                        {tag: 'tr', id: 'neo-table-row-4'},
                        {tag: 'tr', id: 'neo-table-row-5'}
                    ]
                }
            ]
        };

        vnode = VdomHelper.create({vdom}).vnode;

        vdom = {
            id: 'neo-table-container-1', cn: [
                {tag: 'tbody', id: 'neo-table-view-1', cn: []}
            ]
        };

        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(deltas.length).toBe(1);

        expect(deltas).toEqual([
            {action: 'removeAll', parentId: 'neo-table-view-1'}
        ]);

        // Revert operation
        vdom = {
            id: 'neo-table-container-1', cn: [
                {
                    tag: 'tbody', id: 'neo-table-view-1', cn: [
                        {tag: 'tr', id: 'neo-table-row-1'},
                        {tag: 'tr', id: 'neo-table-row-2'},
                        {tag: 'tr', id: 'neo-table-row-3'},
                        {tag: 'tr', id: 'neo-table-row-4'},
                        {tag: 'tr', id: 'neo-table-row-5'}
                    ]
                }
            ]
        };

        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(deltas.length).toBe(5);

        expect(deltas).toEqual([
            {action: 'insertNode', index: 0, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-1"></tr>'},
            {action: 'insertNode', index: 1, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-2"></tr>'},
            {action: 'insertNode', index: 2, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-3"></tr>'},
            {action: 'insertNode', index: 3, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-4"></tr>'},
            {action: 'insertNode', index: 4, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-5"></tr>'}
        ]);
    });

    test('Remove all Table Rows & move 2 into a different Table', () => {
        vdom = {
            id: 'neo-wrapper-1', cn: [
                {
                    id: 'neo-table-container-1', cn: [
                        {
                            tag: 'tbody', id: 'neo-table-view-1', cn: [
                                {tag: 'tr', id: 'neo-table-row-1'},
                                {tag: 'tr', id: 'neo-table-row-2'},
                                {tag: 'tr', id: 'neo-table-row-3'},
                                {tag: 'tr', id: 'neo-table-row-4'},
                                {tag: 'tr', id: 'neo-table-row-5'}
                            ]
                        }
                    ]
                },
                {
                    id: 'neo-table-container-2', cn: [
                        {tag: 'tbody', id: 'neo-table-view-2', cn: []}
                    ]
                }
            ]
        };

        vnode = VdomHelper.create({vdom}).vnode;

        vdom = {
            id: 'neo-wrapper-1', cn: [
                {
                    id: 'neo-table-container-1', cn: [
                        {tag: 'tbody', id: 'neo-table-view-1', cn: []}
                    ]
                },
                {
                    id: 'neo-table-container-2', cn: [
                        {
                            tag: 'tbody', id: 'neo-table-view-2', cn: [
                                {tag: 'tr', id: 'neo-table-row-2'},
                                {tag: 'tr', id: 'neo-table-row-4'}
                            ]
                        }
                    ]
                }
            ]
        };

        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(deltas.length).toBe(3);

        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-table-row-2', index: 0, parentId: 'neo-table-view-2'},
            {action: 'moveNode', id: 'neo-table-row-4', index: 1, parentId: 'neo-table-view-2'},
            {action: 'removeAll', parentId: 'neo-table-view-1'}
        ]);

        // Revert operation
        vdom = {
            id: 'neo-wrapper-1', cn: [
                {
                    id: 'neo-table-container-1', cn: [
                        {
                            tag: 'tbody', id: 'neo-table-view-1', cn: [
                                {tag: 'tr', id: 'neo-table-row-1'},
                                {tag: 'tr', id: 'neo-table-row-2'},
                                {tag: 'tr', id: 'neo-table-row-3'},
                                {tag: 'tr', id: 'neo-table-row-4'},
                                {tag: 'tr', id: 'neo-table-row-5'}
                            ]
                        }
                    ]
                },
                {
                    id: 'neo-table-container-2', cn: [
                        {tag: 'tbody', id: 'neo-table-view-2', cn: []}
                    ]
                }
            ]
        };

        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(deltas.length).toBe(5);

        expect(deltas).toEqual([
            {action: 'insertNode', index: 0, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-1"></tr>'},
            {action: 'moveNode', id: 'neo-table-row-2', index: 1, parentId: 'neo-table-view-1'},
            {action: 'insertNode', index: 2, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-3"></tr>'},
            {action: 'moveNode', id: 'neo-table-row-4', index: 3, parentId: 'neo-table-view-1'},
            {action: 'insertNode', index: 4, parentId: 'neo-table-view-1', outerHTML: '<tr id="neo-table-row-5"></tr>'}
        ]);
    });
});
