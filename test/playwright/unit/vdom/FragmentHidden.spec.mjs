import {setup} from '../../setup.mjs';

const appName = 'VdomFragmentHiddenTest';

setup({
    neoConfig: {
        useDomApiRenderer: true // User requested domApiRenderer
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import VDomUtil       from '../../../../src/util/VDom.mjs';

// We need to import DomApiVnodeCreator because we useDomApiRenderer: true
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

test.describe('Neo.vdom.Helper (Fragment Hidden Config)', () => {

    test('Toggling hidden (removeDom) on a Fragment generates correct removeNode/insertNode deltas', () => {
        // 1. Initial State: Fragment is visible
        let vdom = {
            tag: 'div',
            id: 'root',
            cn: [
                {
                    tag: 'fragment',
                    id: 'frag-1',
                    cn: [
                        {tag: 'div', id: 'child-1', text: 'Child 1'}
                    ]
                }
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom); // Simulate initial mount completion

        // 2. Hide Fragment (removeDom: true)
        // We simulate what the component system does: update vdom to removeDom: true
        let hiddenVdom = Neo.clone(vdom, true);
        hiddenVdom.cn[0].removeDom = true;

        let result1 = VdomHelper.update({
            vdom: hiddenVdom,
            vnode: vnode // Compare against visible vnode tree
        });

        // Expectation: { action: 'removeNode', id: 'frag-1' }
        // Note: removeNode on a fragment ID should be handled by DeltaUpdates to remove the range.
        // VdomHelper.update returns a flat array of deltas (default + remove).
        const removeDelta = result1.deltas.find(d => d.id === 'frag-1' && d.action === 'removeNode');
        
        expect(removeDelta, 'Should generate removeNode delta for fragment ID').toBeDefined();
        
        // Critical check: parentId MUST be present for Fragments to be removable by DeltaUpdates
        expect(removeDelta.parentId, 'removeNode delta for Fragment must include parentId').toBe('root');

        // 3. Show Fragment (removeDom: false)
        // Now we update from the HIDDEN state back to VISIBLE state.
        
        let vnodeAfterHide = result1.vnode;
        
        // Restore visibility
        let visibleVdom = Neo.clone(vdom, true); // Original visible state
        
        let result2 = VdomHelper.update({
            vdom: visibleVdom,
            vnode: vnodeAfterHide
        });

        // Expectation: { action: 'insertNode', id: 'frag-1', ... }
        const insertDelta = result2.deltas.find(d => d.action === 'insertNode');
        
        expect(insertDelta, 'Should generate insertNode delta').toBeDefined();
        
        // Verify insert content
        // Since we use DomApiRenderer, 'vnode' property should be present in delta
        expect(insertDelta.vnode).toBeDefined();
        expect(insertDelta.vnode.id).toBe('frag-1');
        expect(insertDelta.vnode.nodeName).toBe('fragment');
    });
});