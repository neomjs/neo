import {setup} from '../../setup.mjs';

const appName = 'VdomLifecycleStateTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// Mock applyDeltas to prevent errors during mount
Neo.applyDeltas = async () => {};

class MockComponent extends Component {
    static config = {
        className: 'Test.Unit.Vdom.VdomLifecycle.MockComponent',
        ntype: 'test-unit-vdom-vdomlifecycle-mock',
        hideMode: 'removeDom',
        _vdom: {tag: 'div', cls: ['child']}
    }
}
MockComponent = Neo.setupClass(MockComponent);

/**
 * @summary Verifies the state consistency of the VdomLifecycle mixin.
 * 
 * Focuses on critical state flags like `mounted` and properties like `vnode`
 * during lifecycle events such as initialization, mounting, and hiding (removeDom).
 * Ensuring these states are correct is essential for the reliability of the
 * `TreeBuilder` and `VdomHelper` logic.
 */
test.describe('VdomLifecycle State', () => {

    /**
     * Verifies that `initVnode` correctly initializes the component state even if
     * the component is configured to be hidden (`removeDom`) initially.
     * 
     * Expected behavior:
     * 1. `mounted` should be true because `initVnode(true)` was called.
     * 2. `vnode` should be populated (not null) because `initVnode` forces creation by clearing `removeDom`.
     */
    test('vnode should be null for initially hidden (removeDom) components', async () => {
        const comp = Neo.create(MockComponent, {
            appName,
            hidden  : true,
            hideMode: 'removeDom',
            autoMount: true // Try to mount
        });

        await comp.initVnode(true);

        expect(comp.mounted).toBe(true);
        expect(comp.vnode).not.toBeNull();

        comp.destroy();
    });

    /**
     * Verifies that the `vnode` property persists when a visible component is hidden
     * using `hideMode: 'removeDom'`.
     * 
     * This persistence is critical for race condition handling: logic that checks
     * `component.vnode` relies on it being truthy even if the component is temporarily unmounted.
     */
    test('vnode should PERSIST when component is hidden (removeDom) after being visible', async () => {
        const comp = Neo.create(MockComponent, {
            appName,
            autoMount: true
        });

        await comp.initVnode(true);
        
        expect(comp.mounted).toBe(true);
        expect(comp.vnode).not.toBeNull();

        // Hide the component (triggers removeDom logic)
        comp.hidden = true;
        
        // Wait for update cycle to complete
        await new Promise(resolve => setTimeout(resolve, 50));

        // Ensure vnode reference is not cleared upon unmounting
        expect(comp.mounted).toBe(false); 
        expect(comp.vnode).not.toBeNull(); 

        comp.destroy();
    });
});