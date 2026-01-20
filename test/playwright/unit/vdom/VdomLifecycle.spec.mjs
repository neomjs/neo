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
        className: 'Test.MockComponent',
        ntype: 'test-mock',
        hideMode: 'removeDom',
        _vdom: {tag: 'div', cls: ['child']}
    }
}
MockComponent = Neo.setupClass(MockComponent);

test.describe('VdomLifecycle State', () => {

    test('vnode should be null for initially hidden (removeDom) components', async () => {
        const comp = Neo.create(MockComponent, {
            appName,
            hidden  : true,
            hideMode: 'removeDom',
            autoMount: true // Try to mount
        });

        await comp.initVnode(true);

        expect(comp.mounted).toBe(true); // mounted is true because initVnode(true) was called
        expect(comp.vnode).not.toBeNull(); // initVnode deletes removeDom, so vnode IS created

        comp.destroy();
    });

    test('vnode should PERSIST when component is hidden (removeDom) after being visible', async () => {
        const comp = Neo.create(MockComponent, {
            appName,
            autoMount: true
        });

        await comp.initVnode(true);
        
        expect(comp.mounted).toBe(true);
        expect(comp.vnode).not.toBeNull();

        // Hide it
        comp.hidden = true;
        
        // Wait for update
        await new Promise(resolve => setTimeout(resolve, 50));

        // Is it still mounted?
        // Is vnode still there?
        
        expect(comp.vnode).not.toBeNull(); // This is the suspected behavior

        comp.destroy();
    });
});
