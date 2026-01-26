import {setup} from '../../setup.mjs';

const appName = 'HiddenChildrenTest';

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
import Container      from '../../../../src/container/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
// Ensure Neo.get is defined
import InstanceManager from '../../../../src/manager/Instance.mjs';

// Mock applyDeltas to prevent errors during mount
Neo.applyDeltas = async () => {};

class ChildComponent extends Component {
    static config = {
        className: 'Test.ChildComponent',
        ntype: 'test-child-hidden',
        hideMode: 'removeDom',
        _vdom: {tag: 'div', cls: ['child'], flag: 'child-flag'}
    }
}
ChildComponent = Neo.setupClass(ChildComponent);

class ParentComponent extends Container {
    static config = {
        className: 'Test.ParentComponent',
        ntype: 'test-parent-hidden',
        items: [{
            module: ChildComponent,
            reference: 'myChild'
        }]
    }
}
ParentComponent = Neo.setupClass(ParentComponent);

test.describe('Issue 8868: SyncVnodeTree Child Removal', () => {

    test('Child should be unmounted when hidden (removeDom) via Parent Update', async () => {
        const parent = Neo.create(ParentComponent, {
            appName,
            autoMount: true
        });

        await parent.initVnode(true);

        const child = parent.getItem('myChild');

        expect(child).toBeDefined();
        expect(child.mounted).toBe(true);
        expect(child.vnode).not.toBeNull();

        // Hide the child using removeDom
        // This triggers a VDOM update in the parent (see Component.mjs hide())
        child.hidden = true;

        // Wait for update cycle to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // With the bug, child.mounted remains true because syncVnodeTree skips it.
        // With the fix, child.mounted should be false.
        expect(child.mounted).toBe(false);
        expect(child.vnode).toBeNull();

        parent.destroy();
    });
});
