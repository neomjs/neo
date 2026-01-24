/**
 * @summary Verification test for the ComponentManager Reverse Map (childMap).
 *
 * This test suite ensures that the `childMap` in `Neo.manager.Component` is correctly maintained
 * during the lifecycle of components. It verifies that:
 * 1. Components are added to their parent's `childMap` entry upon registration.
 * 2. Components are moved correctly when `parentId` changes.
 * 3. Components are removed from the `childMap` upon destruction (unregister).
 *
 * This reverse map optimization (Issue #8872) allows for O(1) retrieval of direct children
 * via `ComponentManager.getDirectChildren(parentId)`, eliminating the need for O(N) linear scans.
 *
 * @see Neo.manager.Component
 */
import {setup} from '../../setup.mjs';

const appName = 'ParentIdChangeTest';

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
import ComponentManager from '../../../../src/manager/Component.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

// Mock applyDeltas to prevent errors during mount
Neo.applyDeltas = async () => {};

class ChildComponent extends Component {
    static config = {
        className: 'Test.ParentIdChange.ChildComponent',
        _vdom: {tag: 'div', cls: ['child']}
    }
}
ChildComponent = Neo.setupClass(ChildComponent);

class ParentComponent extends Container {
    static config = {
        className: 'Test.ParentIdChange.ParentComponent'
    }
}
ParentComponent = Neo.setupClass(ParentComponent);

test.describe('Issue 8872: ComponentManager Reverse Map', () => {

    test('childMap should update on parentId change', async () => {
        const parent1 = Neo.create(ParentComponent, { appName });
        const parent2 = Neo.create(ParentComponent, { appName });
        
        const child = Neo.create(ChildComponent, {
            appName,
            parentId: parent1.id
        });

        // Verify initial state
        let children1 = ComponentManager.getDirectChildren(parent1.id);
        let children2 = ComponentManager.getDirectChildren(parent2.id);

        expect(children1.length).toBe(1);
        expect(children1[0].id).toBe(child.id);
        expect(children2.length).toBe(0);

        // Move child to parent2
        child.parentId = parent2.id;

        // Verify updated state
        children1 = ComponentManager.getDirectChildren(parent1.id);
        children2 = ComponentManager.getDirectChildren(parent2.id);

        expect(children1.length).toBe(0);
        expect(children2.length).toBe(1);
        expect(children2[0].id).toBe(child.id);

        // Unregister
        child.destroy();
        
        children2 = ComponentManager.getDirectChildren(parent2.id);
        expect(children2.length).toBe(0);

        parent1.destroy();
        parent2.destroy();
    });
});