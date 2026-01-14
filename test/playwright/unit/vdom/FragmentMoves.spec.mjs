import {setup} from '../../setup.mjs';

const appName = 'VdomFragmentMovesTest';

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

test.describe('Neo.vdom.Helper (Fragment Moves)', () => {

    test('Move In: Move a component from Container into a child Fragment', () => {
        // Initial: Root -> [Button(mover), Fragment(frag-1)->[Button(static)]]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'button', id: 'mover'},
                {tag: 'fragment', id: 'frag-1', cn: [
                    {tag: 'button', id: 'static'}
                ]}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Move 'mover' into 'frag-1' at index 1 (after 'static')
        // New State: Root -> [Fragment(frag-1)->[Button(static), Button(mover)]]
        vdom.cn = [
            {tag: 'fragment', id: 'frag-1', cn: [
                {tag: 'button', id: 'static'},
                {tag: 'button', id: 'mover'}
            ]}
        ];

        let { deltas } = VdomHelper.update({vdom, vnode});
        
        // Expected: moveNode for 'mover'.
        // Parent: 'frag-1' or 'root'? 
        // Index: ?
        
        expect(deltas.length).toBeGreaterThan(0);
        const moveDelta = deltas.find(d => d.id === 'mover');
        expect(moveDelta).toBeDefined();
        expect(moveDelta.action).toBe('moveNode');
        
        // Check delta details
        // If parentId is 'frag-1' (logical), index should be 1.
        // If parentId is 'root' (physical), index should be:
        // frag-start (0), static (1), mover (2), frag-end (3).
    });

    test('Move Out: Move a component from Fragment into parent Container', () => {
        // Initial: Root -> [Fragment(frag-1)->[Button(mover)]]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'fragment', id: 'frag-1', cn: [
                    {tag: 'button', id: 'mover'}
                ]}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Move 'mover' out to Root (after fragment)
        // New State: Root -> [Fragment(frag-1)->[], Button(mover)]
        vdom.cn = [
            {tag: 'fragment', id: 'frag-1', cn: []},
            {tag: 'button', id: 'mover'}
        ];

        let { deltas } = VdomHelper.update({vdom, vnode});

        const moveDelta = deltas.find(d => d.id === 'mover');
        expect(moveDelta).toBeDefined();
        expect(moveDelta.action).toBe('moveNode');
    });

    test('Cross-Fragment Move: Move component between sibling fragments', () => {
        // Initial: Root -> [Fragment(A)->[Mover], Fragment(B)->[]]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'fragment', id: 'frag-a', cn: [
                    {tag: 'button', id: 'mover'}
                ]},
                {tag: 'fragment', id: 'frag-b', cn: []}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Move Mover to B
        // New State: Root -> [Fragment(A)->[], Fragment(B)->[Mover]]
        vdom.cn = [
            {tag: 'fragment', id: 'frag-a', cn: []},
            {tag: 'fragment', id: 'frag-b', cn: [
                {tag: 'button', id: 'mover'}
            ]}
        ];

        let { deltas } = VdomHelper.update({vdom, vnode});

        const moveDelta = deltas.find(d => d.id === 'mover');
        expect(moveDelta).toBeDefined();
        expect(moveDelta.action).toBe('moveNode');
    });

     test('Nested Move: Move component deeper into nested fragment', () => {
        // Initial: Root -> [Fragment(Outer)->[Mover, Fragment(Inner)]]
        let vdom = {
            tag: 'div', id: 'root', cn: [
                {tag: 'fragment', id: 'frag-outer', cn: [
                    {tag: 'button', id: 'mover'},
                    {tag: 'fragment', id: 'frag-inner', cn: []}
                ]}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);

        // Move Mover into Inner
        // New State: Root -> [Fragment(Outer)->[Fragment(Inner)->[Mover]]]
        vdom.cn = [
            {tag: 'fragment', id: 'frag-outer', cn: [
                {tag: 'fragment', id: 'frag-inner', cn: [
                     {tag: 'button', id: 'mover'}
                ]}
            ]}
        ];

        let { deltas } = VdomHelper.update({vdom, vnode});

        const moveDelta = deltas.find(d => d.id === 'mover');
        expect(moveDelta).toBeDefined();
        expect(moveDelta.action).toBe('moveNode');
    });
});
