import {setup} from '../../../setup.mjs';

const appName = 'DomEventCustomVdomRootTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Component      from '../../../../../src/component/Base.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';
import VdomHelper     from '../../../../../src/vdom/Helper.mjs';

/**
 * Mocks a component that uses a custom VDOM root, similar to Neo.table.header.Button.
 * This class overrides `getVdomRoot` and `getVnodeRoot` to point to a child node.
 *
 * Structure:
 * <div id="wrapper"> (Physical Root, Wrapper)
 *     <button id="button"> (Logical Root, the "Button")
 *         <span>Icon</span>
 *         <span>Text</span>
 *     </button>
 * </div>
 *
 */
class CustomRootComponent extends Component {
    static config = {
        className: 'CustomRootComponent',
        ntype    : 'custom-root-component',

        _vdom:
        {cls: ['wrapper-cls'], cn: [
            {tag: 'button', cls: ['button-cls'], cn: [
                {tag: 'span', cls: ['icon-cls']},
                {tag: 'span', cls: ['text-cls']}
            ]}
        ]}
    }

    afterSetId(value, oldValue) {
        this.vdom.id = value + '__wrapper';
        super.afterSetId(value, oldValue);
    }

    /**
     * Override to point to the button element as the logical root.
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     * Override to point to the button element as the logical root.
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }
}
CustomRootComponent = Neo.setupClass(CustomRootComponent);

test.describe('Neo.manager.DomEvent Custom VDOM Root', () => {
    test('should fire event on component with custom vdom root (listener on component)', async () => {
        let eventFired = false;

        const component = Neo.create(CustomRootComponent, {
            appName,
            id: 'custom-root-cmp',
            domListeners: [{
                click: () => { eventFired = true; }
            }]
        });

        await component.initVnode();

        // Simulate click on the "Button" (logical root)
        const event = {
            eventName: 'click',
            data: {
                path: [
                    {id: 'custom-root-cmp', cls: ['button-cls']}, // The logical root has the component ID
                    {id: 'wrapper-node-id', cls: ['wrapper-cls']}, // The physical root has a generated ID
                    {id: 'body', cls: []}
                ]
            }
        };

        // Mock the wrapper ID generation which happens during initVnode/rendering
        // Since we can't easily predict the generated ID for the wrapper in this test setup without full rendering,
        // we can check what the component expects.
        // The wrapper 'div' will get a generated ID.

        // Let's verify the ID assignment structure first
        const buttonNode  = component.getVdomRoot();
        const wrapperNode = component.vdom;

        expect(buttonNode.id).toBe('custom-root-cmp');
        expect(wrapperNode.id).toBe('custom-root-cmp__wrapper');

        // Update the event path with the actual wrapper ID
        event.data.path[1].id = wrapperNode.id;

        DomEvent.fire(event);

        expect(eventFired).toBe(true);

        component.destroy();
    });

    test('should fire event when clicking on wrapper node (outside logical root)', async () => {
        let eventFired = false;

        const component = Neo.create(CustomRootComponent, {
            appName,
            id: 'custom-root-cmp-2',
            domListeners: [{
                click: () => { eventFired = true; }
            }]
        });

        await component.initVnode();

        const wrapperNode = component.vdom;
        expect(wrapperNode.id).toBe('custom-root-cmp-2__wrapper');

        const event = {
            eventName: 'click',
            data: {
                path: [
                    {id: wrapperNode.id, cls: ['wrapper-cls']}, // Click directly on wrapper
                    {id: 'body', cls: [] }
                ]
            }
        };

        DomEvent.fire(event);

        expect(eventFired).toBe(true);

        component.destroy();
    });

    test('should support event delegation inside logical root', async () => {
        let delegatedFired = false;

        const component = Neo.create(CustomRootComponent, {
            appName,
            id: 'custom-root-cmp-3',
            domListeners: [{
                click   : () => { delegatedFired = true; },
                delegate: '.icon-cls'
            }]
        });

        await component.initVnode();

        const buttonNode  = component.getVdomRoot();
        const wrapperNode = component.vdom;
        const iconNodeId  = buttonNode.cn[0].id; // We need the ID if it was generated, or we rely on class

        const event = {
            eventName: 'click',
            data: {
                path: [
                    {id: iconNodeId || 'gen-icon-id', cls: ['icon-cls']},
                    {id: buttonNode.id, cls: ['button-cls']},
                    {id: wrapperNode.id, cls: ['wrapper-cls']},
                    {id: 'body', cls: []}
                ]
            }
        };

        DomEvent.fire(event);

        expect(delegatedFired).toBe(true);

        component.destroy();
    });
});
