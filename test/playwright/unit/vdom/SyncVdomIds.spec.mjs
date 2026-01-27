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
});
