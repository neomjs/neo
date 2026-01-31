import {setup} from '../../setup.mjs';

const appName = 'ComponentIdGenerationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class MockComponent extends Component {
    static config = {
        className: 'Test.Unit.Component.IdGeneration.MockComponent',
        id       : 'cmp-root',
        _vdom    : {
            tag: 'div',
            cn : [
                {tag: 'span', text: 'Static Node'}, // Should get auto-ID
                {tag: 'div',  id  : 'custom-id'}    // Should keep custom ID
            ]
        }
    }
}

MockComponent = Neo.setupClass(MockComponent);

test.describe('Class-Based Component ID Generation', () => {
    let component;

    test.beforeEach(async () => {
        VDomUpdate.mergedCallbackMap.clear();
        VDomUpdate.postUpdateQueueMap.clear();
        ComponentManager.wrapperNodes.clear();
        ComponentManager.clear();

        component = Neo.create(MockComponent, {appName});
        await component.initVnode(); // Triggers JIT ID generation via TreeBuilder
        component.mounted = true;
    });

    test.afterEach(() => {
        component.destroy();
    });

    test('Initial Generation: Should assign IDs to nodes missing them', async () => {
        const vdom = component.vdom;
        const vnode = component.vnode;

        // Root
        expect(vdom.id).toBe('cmp-root'); // From component.id

        // Child 1 (Auto-ID)
        const autoNode = vdom.cn[0];
        expect(autoNode.id).toBeDefined();
        expect(autoNode.id).toMatch(/^neo-vnode-\d+$/);
        expect(vnode.childNodes[0].id).toBe(autoNode.id); // VNode matches VDOM

        // Child 2 (Custom ID)
        const customNode = vdom.cn[1];
        expect(customNode.id).toBe('custom-id');
        expect(vnode.childNodes[1].id).toBe('custom-id');
    });

    test('Persistence: IDs should persist across updates', async () => {
        const initialAutoId = component.vdom.cn[0].id;

        // Trigger an update (e.g. style change)
        component.style = {color: 'red'};
        await component.promiseUpdate();

        // IDs should remain identical (Object Permanence)
        expect(component.vdom.cn[0].id).toBe(initialAutoId);
        expect(component.vnode.childNodes[0].id).toBe(initialAutoId);
    });

    test('Dynamic Insertion: New nodes should get IDs, existing nodes stay stable', async () => {
        const initialAutoId = component.vdom.cn[0].id;

        // Manually inject a new node without ID
        component.vdom.cn.push({tag: 'i', cls: ['fa', 'fa-user']});
        
        // Trigger update
        component.update();
        await component.promiseUpdate();

        // New node should have an ID
        const newNode = component.vdom.cn[2];
        expect(newNode.id).toBeDefined();
        expect(newNode.id).toMatch(/^neo-vnode-\d+$/);
        expect(newNode.id).not.toBe(initialAutoId);

        // Old node should preserve its ID
        expect(component.vdom.cn[0].id).toBe(initialAutoId);
    });
});
