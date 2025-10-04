import { test, expect } from '@playwright/test';
import VdomHelper from '../../../../../src/vdom/Helper.mjs';
import Neo from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs'; // CRITICAL: Required for Neo.mjs environment setup in Node.js
import StringFromVnode from '../../../../../src/vdom/util/StringFromVnode.mjs';

// tests are designed for this rendering mode
// Neo.config.useDomApiRenderer = false;

let oldVdom, vdom;

test.describe('vdom/layout/Cube', () => {
    /**
     * @summary Verifies the VdomHelper's ability to handle wrapping and unwrapping of container items for cube layouts.
     * This suite ensures that when items are dynamically wrapped or unwrapped in nested divs, the VdomHelper
     * generates the correct sequence of deltas (insert, move, remove) to reflect the structural changes,
     * including attribute modifications on the moved items.
     */
    test.beforeEach(() => {
        Neo.config.useDomApiRenderer = false;
    });

    test('Wrap Container Items', () => {
        oldVdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-component-1'},
            {id: 'neo-component-2'},
            {id: 'neo-component-3'},
            {id: 'neo-component-4'},
            {id: 'neo-component-5'},
            {id: 'neo-component-6'}
        ]};

        let oldVnode = VdomHelper.create({vdom: oldVdom}).vnode;

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

        let {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        expect(deltas.length).toBe(7);

        expect(deltas).toEqual([
            {
                action   : 'insertNode',
                index    : 0,
                outerHTML: '<div id="neo-vnode-1"><div id="neo-vnode-2"></div></div>',
                parentId : 'neo-container-1'
            },
            {action: 'moveNode', id: 'neo-component-1', index: 0, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-2', index: 1, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-3', index: 2, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-4', index: 3, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-5', index: 4, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-6', index: 5, parentId: 'neo-vnode-2'}
        ]);
    });

    test('Unwrap Container Items', () => {
        oldVdom =
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

        let oldVnode = VdomHelper.create({vdom: oldVdom}).vnode;

        vdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-component-1'},
            {id: 'neo-component-2'},
            {id: 'neo-component-3'},
            {id: 'neo-component-4'},
            {id: 'neo-component-5'},
            {id: 'neo-component-6'}
        ]};

        let {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        expect(deltas.length).toBe(7);

        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-component-1', index: 1, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-2', index: 2, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-3', index: 3, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-4', index: 4, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-5', index: 5, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-6', index: 6, parentId: 'neo-container-1'},
            {action: 'removeNode', id: 'neo-vnode-1'}
        ]);
    });

    test('Wrap Container Items & Change Item Attributes', () => {
        oldVdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-component-1'},
            {id: 'neo-component-2'},
            {id: 'neo-component-3'},
            {id: 'neo-component-4'},
            {id: 'neo-component-5'},
            {id: 'neo-component-6'}
        ]};

        let oldVnode = VdomHelper.create({vdom: oldVdom}).vnode;

        vdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-vnode-1', cn: [
                {id: 'neo-vnode-2', cn: [
                    {id: 'neo-component-1'},
                    {id: 'neo-component-2', style: {backgroundColor: 'red'}},
                    {id: 'neo-component-3'},
                    {id: 'neo-component-4', cls: ['custom-cls']},
                    {id: 'neo-component-5'},
                    {id: 'neo-component-6'}
                ]}
            ]}
        ]};

        let {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        expect(deltas.length).toBe(9);

        expect(deltas).toEqual([
            {
                action   : 'insertNode',
                index    : 0,
                outerHTML: '<div id="neo-vnode-1"><div id="neo-vnode-2"></div></div>',
                parentId : 'neo-container-1'
            },
            {action: 'moveNode', id: 'neo-component-1', index: 0, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-2', index: 1, parentId: 'neo-vnode-2'},
            {                    id: 'neo-component-2', style: {backgroundColor: 'red'}},
            {action: 'moveNode', id: 'neo-component-3', index: 2, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-4', index: 3, parentId: 'neo-vnode-2'},
            {                    id: 'neo-component-4', cls: {add: ['custom-cls']}},
            {action: 'moveNode', id: 'neo-component-5', index: 4, parentId: 'neo-vnode-2'},
            {action: 'moveNode', id: 'neo-component-6', index: 5, parentId: 'neo-vnode-2'}
        ]);
    });

    test('Unwrap Container Items & Change Item Attributes', () => {
        oldVdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-vnode-1', cn: [
                {id: 'neo-vnode-2', cn: [
                    {id: 'neo-component-1'},
                    {id: 'neo-component-2', style: {backgroundColor: 'red'}},
                    {id: 'neo-component-3'},
                    {id: 'neo-component-4', cls: ['custom-cls']},
                    {id: 'neo-component-5'},
                    {id: 'neo-component-6'}
                ]}
            ]}
        ]};

        let oldVnode = VdomHelper.create({vdom: oldVdom}).vnode;

        vdom =
        {id: 'neo-container-1', cn: [
            {id: 'neo-component-1'},
            {id: 'neo-component-2'},
            {id: 'neo-component-3'},
            {id: 'neo-component-4'},
            {id: 'neo-component-5'},
            {id: 'neo-component-6'}
        ]};

        let {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        expect(deltas.length).toBe(9);

        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-component-1', index: 1, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-2', index: 2, parentId: 'neo-container-1'},
            {id: 'neo-component-2', style: {backgroundColor: null}},
            {action: 'moveNode', id: 'neo-component-3', index: 3, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-4', index: 4, parentId: 'neo-container-1'},
            {id: 'neo-component-4', cls: {remove: ['custom-cls']}},
            {action: 'moveNode', id: 'neo-component-5', index: 5, parentId: 'neo-container-1'},
            {action: 'moveNode', id: 'neo-component-6', index: 6, parentId: 'neo-container-1'},
            {action: 'removeNode', id: 'neo-vnode-1'}
        ]);
    });
});
