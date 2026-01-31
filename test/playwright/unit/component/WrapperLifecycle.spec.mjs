/**
 * @summary Verification test for Wrapper Node lifecycle, ID changes, and Reverse Map integrity.
 * @see Neo.manager.Component
 */
import {setup} from '../../setup.mjs';

const appName = 'WrapperLifecycleTest';

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
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// Mock applyDeltas to prevent errors during mount
Neo.applyDeltas = async () => {};

class WrapperComponent extends Component {
    static config = {
        className: 'Test.WrapperLifecycle.WrapperComponent',
        _vdom: {
            cn: [{ tag: 'div', cls: ['wrapped-content'] }]
        }
    }
    // Force a wrapper node structure
    getVdomRoot() { return this.vdom.cn[0]; }
    getVnodeRoot() { return this.vnode ? this.vnode.childNodes[0] : null; }
}
WrapperComponent = Neo.setupClass(WrapperComponent);

class ParentComponent extends Container {
    static config = {
        className: 'Test.WrapperLifecycle.ParentComponent'
    }
}
ParentComponent = Neo.setupClass(ParentComponent);

test.describe('Wrapper Node & Reverse Map Lifecycle', () => {

    test('Should register wrapper and childMap correctly', async () => {
        const parent = Neo.create(ParentComponent, { appName });
        const child  = Neo.create(WrapperComponent, {
            appName,
            parentId: parent.id
        });

        await child.initVnode();

        const wrapperId = child.id + '__wrapper';
        
        // Check Wrapper Node Registration
        expect(ComponentManager.wrapperNodes.get(wrapperId)).toBe(child);
        
        // Check Child Map
        const siblings = ComponentManager.getDirectChildren(parent.id);
        expect(siblings.length).toBe(1);
        expect(siblings[0].id).toBe(child.id);

        parent.destroy();
        child.destroy();
    });

    test('Should clean up maps on ID change', async () => {
        const parent = Neo.create(ParentComponent, { appName });
        const child  = Neo.create(WrapperComponent, {
            appName,
            parentId: parent.id,
            id: 'old-id'
        });

        await child.initVnode();

        const oldWrapperId = 'old-id__wrapper';
        expect(ComponentManager.wrapperNodes.get(oldWrapperId)).toBe(child);
        
        const childrenBefore = ComponentManager.getDirectChildren(parent.id).map(c => c.id);
        expect(childrenBefore).toContain('old-id');

        // CHANGE ID
        // This triggers ComponentManager.unregister('old-id') then register('new-id')
        child.id = 'new-id';

        // Verify Child Map Cleanup
        const childrenAfter = ComponentManager.getDirectChildren(parent.id).map(c => c.id);
        
        expect(childrenAfter).toContain('new-id');
        expect(childrenAfter).not.toContain('old-id');

        // Note: Wrapper cleanup on ID change is complex.
        // unregister('old-id') calls wrapperNodes.delete('old-id').
        // But the wrapper ID is 'old-id__wrapper'.
        // unregister('old-id') also checks component.vdom.id.
        // If component.vdom.id is still 'old-id__wrapper', it should be deleted.
        // However, we need to ensure unregister logic uses the correct ID.
        
        expect(ComponentManager.wrapperNodes.has(oldWrapperId)).toBe(false);

        parent.destroy();
        child.destroy();
    });
});
