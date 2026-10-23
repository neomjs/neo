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
const realApplyDeltas = Neo.applyDeltas; // patched at import; restored in afterAll below

Neo.applyDeltas = async () => {};

test.afterAll(() => {
    Neo.applyDeltas = realApplyDeltas;
});

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

    test('A floating child hidden (removeDom) via Parent Update is unmounted, and mounts again when shown (#19973)', async () => {
        const parent = Neo.create(ParentComponent, {
            appName,
            autoMount: true,
            items    : [{module: ChildComponent, floating: true, reference: 'myChild'}]
        });

        await parent.initVnode(true);

        const child = parent.getItem('myChild');

        expect(child.mounted).toBe(true);

        // A floating item renders inside its parent's node, so the parent update that removes it unmounts it
        child.hidden = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(child.mounted, 'the parent update that removed it unmounts it').toBe(false);

        child.hidden = false;
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(child.mounted, 'showing it mounts it again').toBe(true);
        expect(child.vnode).not.toBeNull();

        parent.destroy();
    });
});
