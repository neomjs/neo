import {setup} from '../../setup.mjs';

const appName = 'VdomFragmentHelperDomApiTest';

setup({
    neoConfig: {
        useDomApiRenderer: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import VDomUtil       from '../../../../src/util/VDom.mjs';

test.describe('Neo.vdom.Helper (Fragments) - DomApiRenderer', () => {

    test('Index calculation and Delta structure', () => {
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

        // Index should be 5 (same as string renderer)
        expect(deltas.length).toBe(1);
        expect(deltas[0].action).toBe('insertNode');
        expect(deltas[0].index).toBe(5);
        
        // Verify delta contains vnode, not outerHTML
        expect(deltas[0].outerHTML).toBeUndefined();
        expect(deltas[0].vnode).toBeDefined();
        expect(deltas[0].vnode.nodeName).toBe('span');
        expect(deltas[0].vnode.id).toBe('new-span');
    });

    test('Fragment Insertion Delta', () => {
        let vdom = {tag: 'div', id: 'root', cn: []};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Insert Fragment
        vdom.cn.push({tag: 'fragment', id: 'new-frag', cn: [{tag: 'b', id: 'bold'}]});

        let { deltas } = VdomHelper.update({vdom, vnode});

        expect(deltas.length).toBe(1);
        expect(deltas[0].action).toBe('insertNode');
        expect(deltas[0].vnode.nodeName).toBe('fragment');
        expect(deltas[0].vnode.childNodes.length).toBe(1);
        expect(deltas[0].vnode.childNodes[0].id).toBe('bold');
    });
});
