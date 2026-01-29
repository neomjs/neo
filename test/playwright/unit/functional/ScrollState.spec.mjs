import {setup} from '../../setup.mjs';

const appName = 'FunctionalScrollStateTest';

setup({
    appConfig: {
        name: appName
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import FunctionalBase     from '../../../../src/functional/component/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import VNode              from '../../../../src/util/VNode.mjs';

class MockComponent extends FunctionalBase {
    static config = {
        className: 'Test.Unit.Functional.ScrollState.MockComponent',
        id       : 'cmp-scroll-1',
        vdom     : {
            tag: 'div',
            style: {height: '100px', overflow: 'auto'},
            cn : [
                {tag: 'div', style: {height: '200px'}, text: 'Content'}
            ]
        }
    }

    createVdom(config) {
        return {
            tag: 'div',
            id : config.id,
            style: {height: '100px', overflow: 'auto'},
            cn : [
                {tag: 'div', style: {height: '200px'}, text: 'Content ' + (config.updateCount || 0)}
            ]
        };
    }
}

MockComponent = Neo.setupClass(MockComponent);

test.describe('Functional Component Scroll State Preservation', () => {
    let component;

    test.beforeEach(async () => {
        component = Neo.create(MockComponent, {appName});
        await component.initVnode(true); // Mount it
    });

    test.afterEach(() => {
        component.destroy();
    });

    test('Should preserve scrollTop across VDOM updates', async () => {
        // 1. Simulate a scroll event capture by manually setting state on the persistent VNODE
        const vnode = component.vnode;
        vnode.scrollTop = 50;
        
        // Verify it's there
        expect(component.vnode.scrollTop).toBe(50);

        // 2. Trigger a VDOM update (re-render)
        component.updateCount = 1;
        component.vdomEffect.run();

        // 3. Check if scrollTop is now present on the NEW VDOM
        expect(component.vdom.scrollTop).toBe(50);
    });
    
    test('Should preserve scrollLeft across VDOM updates', async () => {
        const vnode = component.vnode;
        vnode.scrollLeft = 25;
        
        expect(component.vnode.scrollLeft).toBe(25);

        component.updateCount = 2;
        component.vdomEffect.run();

        expect(component.vdom.scrollLeft).toBe(25);
    });

    test('Root Node: Should sync VDOM state with VNode state before update', async () => {
        // 1. Set scroll state on VNode (simulating user interaction)
        component.vnode.scrollTop = 100;
        
        // 2. Trigger update (re-render)
        component.updateCount = 5;
        component.vdomEffect.run();
        
        // 3. Verify VDOM has the state
        // This confirms that processVdomForComponents correctly copied the state from VNode
        expect(component.vdom.scrollTop).toBe(100);
    });

    test('Child Node: Should sync VDOM state with VNode state before update', async () => {
        // 1. Set scroll state on a child VNode
        const childVnodeId = component.vnode.childNodes[0].id;
        const childVnode = VNode.getById(component.vnode, childVnodeId);
        
        childVnode.scrollTop = 200;

        // 2. Trigger update (re-render)
        component.updateCount = 3;
        component.vdomEffect.run();
        
        // 3. Verify the NEW VDOM child has the preserved state
        const childVdom = component.getVdomChild(childVnodeId);
        expect(childVdom.scrollTop).toBe(200);
    });
});
