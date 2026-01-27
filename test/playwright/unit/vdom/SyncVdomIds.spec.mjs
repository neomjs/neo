import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Component      from '../../../../src/component/Base.mjs';
import VDomUtil       from '../../../../src/util/VDom.mjs';

test.describe('VDOM ID Sync', () => {
    test('syncVdomState should NOT corrupt IDs when structure shifts (Row Recycling)', async () => {
        // 1. Setup Component with Initial State [Row A, Row B]
        const comp = Neo.create(Component, {
            _vdom: {
                tag: 'div',
                cn: [
                    {
                        tag: 'div', id: 'row-1', cls: ['row'], 
                        cn: [{tag: 'span', id: null}] // Child A (Auto ID)
                    },
                    {
                        tag: 'div', id: 'row-2', cls: ['row'],
                        cn: [{tag: 'span', id: null}] // Child B (Auto ID)
                    }
                ]
            }
        });

        // 2. Simulate Worker Response for Initial State (Order: 1, 2)
        const workerVNode = {
            id: comp.id,
            childNodes: [
                {
                    id: 'row-1', nodeName: 'div',
                    childNodes: [{id: 'vnode-100', nodeName: 'span'}]
                },
                {
                    id: 'row-2', nodeName: 'div',
                    childNodes: [{id: 'vnode-200', nodeName: 'span'}]
                }
            ]
        };

        // 3. Simulate Async State Change on App Side (Recycling/Swap)
        // New Order: [Row B, Row A]
        comp.vdom.cn = [
            {
                tag: 'div', id: 'row-2', cls: ['row'],
                cn: [{tag: 'span', id: null}] // Should map to vnode-200, but would get vnode-100 if buggy
            },
            {
                tag: 'div', id: 'row-1', cls: ['row'],
                cn: [{tag: 'span', id: null}] // Should map to vnode-100, but would get vnode-200 if buggy
            }
        ];

        // 4. Execute ID Sync (Simulate late arrival of Worker Response)
        // The Worker Response is STALE (Order 1, 2).
        // The App State is NEW (Order 2, 1).
        VDomUtil.syncVdomState(workerVNode, comp.vdom);

        const childB = comp.vdom.cn[0].cn[0]; // Child inside Row B (Index 0)
        
        // 5. Assert Correctness (Fix Verification)
        // Child B should NOT receive ID 'vnode-100' (which belongs to Row 1).
        // It should remain null (indicating it needs a fresh ID from worker).
        expect(childB.id).toBe(null); 
        expect(childB.id).not.toBe('vnode-100');
    });

    test('syncVdomState SHOULD reuse IDs for plain nodes (Keyless Recycling)', async () => {
        // 1. Setup Component with Initial State [Div A]
        const comp = Neo.create(Component, {
            _vdom: {
                tag: 'div',
                cn: [
                    {tag: 'span', id: null} // Child A (Auto ID)
                ]
            }
        });

        // 2. Simulate Worker Response (Child A has ID 100)
        const workerVNode = {
            id: comp.id,
            childNodes: [
                {
                    id: 'vnode-100', nodeName: 'span',
                    childNodes: [{id: 'text-100', nodeName: '#text', textContent: 'Hello'}]
                }
            ]
        };

        // 3. Simulate App Update (New Div, No ID) replacing Old Div
        // "Keyless" update: We want to reuse the DOM node 100.
        comp.vdom.cn = [
            {tag: 'span', id: null, cn: [{vtype: 'text', text: 'World'}]} 
        ];

        // 4. Sync
        // Worker: 100. App: null.
        // Mismatch check: '100' && null -> False. NO ABORT.
        // Assignment: App -> 100.
        // Recursion: Syncs children.
        VDomUtil.syncVdomState(workerVNode, comp.vdom);

        const newChild = comp.vdom.cn[0];
        
        // 5. Assert Reuse
        // The new span should inherit ID 100.
        // The new text node should inherit ID text-100 (via recursion).
        expect(newChild.id).toBe('vnode-100');
        expect(newChild.cn[0].id).toBe('text-100');
    });

    test('syncVdomState should NOT corrupt IDs when structure changes on stable parent (Length Mismatch)', async () => {
        // 1. Setup Component [Text]
        const comp = Neo.create(Component, {
            _vdom: {
                tag: 'div', id: 'comp-1',
                cn: [{tag: 'span', id: null, cls: ['text']}] // Index 0
            }
        });

        // 2. Simulate Worker Response (Old State: [Text])
        const workerVNode = {
            id: 'comp-1',
            childNodes: [
                {id: 'text-100', nodeName: 'span'} // Index 0
            ]
        };

        // 3. Simulate App Update (Add Icon): [Icon, Text]
        comp.vdom.cn = [
            {tag: 'span', id: null, cls: ['icon']}, // Index 0 (Should be new)
            {tag: 'span', id: null, cls: ['text']}  // Index 1 (Should be text-100)
        ];

        // 4. Sync
        // Worker (Len 1) vs App (Len 2).
        // Index 0: Worker(Text 100) vs App(Icon).
        // App(Icon) gets 100. CORRUPTION.
        VDomUtil.syncVdomState(workerVNode, comp.vdom);

        const icon = comp.vdom.cn[0];
        const text = comp.vdom.cn[1];
        
        console.log('Icon ID:', icon.id);
        
        // Expect FIX (No Corruption)
        expect(icon.id).toBe(null); 
        // Text might lose ID because we abort. That is acceptable (re-id later).
        // We just want to ensure Icon doesn't steal Text's ID.
        expect(icon.id).not.toBe('text-100');
    });
});
