import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        useDomApiRenderer: false
    },
    appConfig: {
        name: 'SyncVdomStateTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import VDomUtil        from '../../../../src/util/VDom.mjs';

test.describe('Neo.util.VDom.syncVdomState', () => {

    test('Should not assign ID if tag names mismatch (Chimera prevention)', () => {
        // Local VDOM: Represents the new state we want to render.
        // It has a UL at index 1 which was previously hidden (removeDom: true)
        const vdom = {
            tag: 'div',
            cn: [
                {tag: 'li', id: 'item-1'},
                {tag: 'ul', cls: ['my-list']}, // The "new" node, currently no ID
                {tag: 'li', id: 'item-2'}
            ]
        };

        // Incoming VNode: Represents the *previous* state from the worker.
        // It thinks index 1 is 'item-2' because the UL was hidden/missing.
        // Note: In a real scenario, the VNode structure aligns with the *filtered* VDOM.
        // If the UL was removeDom: true, it wouldn't be in the VNode list.
        // But if the Sync happens *before* the VNode update reflects the new structure?
        // Or if there is a race condition where we are syncing a "Stale" VNode against a "Fresh" VDOM.

        // Simulating the Stale VNode state:
        // [Item 1, Item 2]
        const vnode = {
            nodeName: 'div',
            childNodes: [
                {nodeName: 'li', id: 'item-1'},
                {nodeName: 'li', id: 'item-2'} // This aligns with VDOM index 1 (the UL)
            ]
        };

        // Run the sync
        VDomUtil.syncVdomState(vnode, vdom);

        // Check the UL. It should NOT have acquired 'item-2' as its ID.
        const ul = vdom.cn[1];
        
        expect(ul.tag).toBe('ul');
        
        // This expectation fails if the bug is present
        expect(ul.id).toBeUndefined(); 
        
        // Just to be sure, it didn't get the wrong ID
        expect(ul.id).not.toBe('item-2');
    });

    test('Should sync ID if tag names match', () => {
        const vdom = {
            tag: 'div',
            cn: [
                {tag: 'div'} // No ID
            ]
        };

        const vnode = {
            nodeName: 'div',
            childNodes: [
                {nodeName: 'div', id: 'gen-id-1'}
            ]
        };

        VDomUtil.syncVdomState(vnode, vdom);

        expect(vdom.cn[0].id).toBe('gen-id-1');
    });
});
