import {setup} from '../../setup.mjs';

const appName = 'VdomFragmentHelperTest';

setup({
    neoConfig: {
        useDomApiRenderer: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import StringFromVnode from '../../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import VDomUtil       from '../../../../src/util/VDom.mjs';

test.describe('Neo.vdom.Helper (Fragments)', () => {

    test('Attribute updates on Fragments are ignored', () => {
        let vdom = {tag: 'fragment', id: 'frag-1', style: {color: 'red'}};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Attempt to change style
        vdom.style = {color: 'blue'};
        let { deltas } = VdomHelper.update({vdom, vnode});

        // Should be empty because fragment attributes are ignored
        expect(deltas).toEqual([]);
    });

    test('Index calculation with simple fragment sibling', () => {
        // Initial: [Fragment(Div, Div), Button]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'fragment', id: 'frag-1', cn: [
                    {tag: 'div', id: 'child-1'},
                    {tag: 'div', id: 'child-2'}
                ]},
                {tag: 'button', id: 'btn-1'}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Insert Span at the end
        vdom.cn.push({tag: 'span', id: 'new-span'});

        let { deltas } = VdomHelper.update({vdom, vnode});

        // Fragment (frag-1) count: 2 (anchors) + 2 (children) = 4.
        // Button (btn-1) count: 1.
        // Previous siblings physical count: 4 (fragment) + 1 (button) = 5.
        // So new node should be at index 5.
        
        expect(deltas.length).toBe(1);
        expect(deltas[0].action).toBe('insertNode');
        // insertNode delta: {action: 'insertNode', parentId, index, outerHTML}
        expect(deltas[0].index).toBe(5);
        expect(deltas[0].outerHTML).toContain('id="new-span"');
    });

    test('Index calculation with nested fragments', () => {
        // Initial: [Fragment(Div, Fragment(Span)), Button]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'fragment', id: 'outer', cn: [
                    {tag: 'div', id: 'div-1'},
                    {tag: 'fragment', id: 'inner', cn: [
                        {tag: 'span', id: 'span-1'}
                    ]}
                ]},
                {tag: 'button', id: 'btn-1'}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Insert at end
        vdom.cn.push({tag: 'i', id: 'new-icon'});

        let { deltas } = VdomHelper.update({vdom, vnode});

        // Inner Frag count: 2 (anchors) + 1 (span) = 3.
        // Outer Frag count: 2 (anchors) + 1 (div) + 3 (inner frag) = 6.
        // Button count: 1.
        // Total before: 6 + 1 = 7.
        // Index should be 7.

        expect(deltas.length).toBe(1);
        expect(deltas[0].action).toBe('insertNode');
        expect(deltas[0].index).toBe(7);
    });

    test('Index calculation with Text Nodes and Fragments', () => {
        // Initial: [Fragment(Text), Text]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'fragment', id: 'frag-1', cn: [
                    {vtype: 'text', text: 'Hello'}
                ]},
                {vtype: 'text', text: 'World'}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Insert at end
        vdom.cn.push({tag: 'b', id: 'bold'});

        let { deltas } = VdomHelper.update({vdom, vnode});

        // Frag count: 2 (anchors) + 3 (text node physical) = 5.
        // Text count: 3.
        // Total before: 5 + 3 = 8.
        // Index should be 8.

        expect(deltas.length).toBe(1);
        expect(deltas[0].action).toBe('insertNode');
        expect(deltas[0].index).toBe(8);
    });
});
