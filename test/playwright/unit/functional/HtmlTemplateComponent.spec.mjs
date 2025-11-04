import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'HtmlTemplateTest'
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import FunctionalBase from '../../../../src/functional/component/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import {html}         from '../../../../src/functional/util/html.mjs';

Neo.vdom.Helper = VdomHelper;

const appName = 'HtmlTemplateTest';

/**
 * @class TestComponent
 * @extends Neo.functional.component.Base
 */
class TestComponent extends FunctionalBase {
    static config = {
        className          : 'TestComponent',
        enableHtmlTemplates: true,
        testText_          : 'Hello from Template!'
    }

    render(config) {
        return html`
            <div id="my-template-div">
                <p>${config.testText}</p>
                <span>Another element</span>
            </div>
        `;
    }
}

TestComponent = Neo.setupClass(TestComponent);

/**
 * @class TestComponentWithChildren
 * @extends Neo.functional.component.Base
 */
class TestComponentWithChildren extends FunctionalBase {
    static config = {
        className          : 'TestComponentWithChildren',
        enableHtmlTemplates: true,
        childText_         : 'Inner Content'
    }

    render(config) {
        return html`
            <div id="parent-div">
                <${TestComponent} id="child-comp" testText="${config.childText}" />
            </div>
        `;
    }
}

TestComponentWithChildren = Neo.setupClass(TestComponentWithChildren);

/**
 * @class TestConditionalComponent
 * @extends Neo.functional.component.Base
 */
class TestConditionalComponent extends FunctionalBase {
    static config = {
        className          : 'TestConditionalComponent',
        enableHtmlTemplates: true,
        showDetails_       : false,
        detailsText_       : 'Here are the details!'
    }

    render(config) {
        return html`
            <div id="conditional-div">
                <h1>Title</h1>
                ${config.showDetails && html`<p id="details-p">${config.detailsText}</p>`}
            </div>
        `;
    }
}

TestConditionalComponent = Neo.setupClass(TestConditionalComponent);


/**
 * @summary Verifies the functionality of functional components using html-tagged template literals.
 *
 * This test suite ensures that functional components with `enableHtmlTemplates: true`
 * can correctly parse an `html` template literal in their `render()` method to create a VDOM structure.
 * It validates initial rendering, reactive updates from config changes, support for nested components
 * within a template, and proper handling of conditional rendering logic.
 */
test.describe('functional/HtmlTemplateComponent', () => {
    let component;

    test.beforeEach(async () => {
        Neo.vdom.Helper = VdomHelper; // Ensure VdomHelper is available
        component = Neo.create(TestComponent, {
            appName,
            id: 'my-test-component'
        });
        // The initial initVnode() call is synchronous and returns the HtmlTemplate object.
        // The actual VDOM is built asynchronously after this.
        component.initVnode();
        component.mounted = true; // Manually mount to enable updates in the test env
        component.vdomEffect.run();
    });

    test.afterEach(() => {
        component?.destroy();
        component = null;
    });

    test('should create initial vdom correctly using html template', async () => {
        // Wait for the async VDOM update to complete
        await test.step('wait for vdom to be created', async () => {
            while (component.vdom.tag !== 'div') {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        const vdom = component.vdom;

        expect(vdom.id).toBe('my-test-component'); // The component's own ID
        expect(vdom.tag).toBe('div');
        expect(vdom.cn.length).toBe(2);

        const pNode = vdom.cn[0];
        expect(pNode.tag).toBe('p');
        expect(pNode.text).toBe('Hello from Template!');

        const spanNode = vdom.cn[1];
        expect(spanNode.tag).toBe('span');
        expect(spanNode.text).toBe('Another element');
    });

    test('should update vdom when reactive config changes', async () => {
        // Wait for the initial render to finish
        await test.step('wait for initial vdom render', async () => {
            while (component.vdom.tag !== 'div') {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        const initialVdom = {...component.vdom};

        // Update the component
        component.testText = 'Updated Text!';

        // Wait for the async VDOM update to complete after the change
        await test.step('wait for vdom update', async () => {
            while (component.vdom.cn?.[0]?.text !== 'Updated Text!') {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        const updatedVdom = component.vdom;

        expect(updatedVdom.cn[0].text).toBe('Updated Text!');
        // Ensure the rest of the VDOM structure remains the same
        expect(updatedVdom.tag).toBe(initialVdom.tag);
        expect(updatedVdom.cn.length).toBe(initialVdom.cn.length);
    });

    test('should handle nested components defined in a template', async () => {
        const parentComponent = Neo.create(TestComponentWithChildren, {
            appName,
            id: 'my-parent-component'
        });

        parentComponent.vdomEffect.run();
        parentComponent.mounted = true;

        // Wait for the parent component's VDOM to be created and child components to be initialized
        await test.step('wait for parent and child vdom to be created', async () => {
            while (!parentComponent.childComponents?.get('child-comp')) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        const parentVdom = parentComponent.vdom;
        expect(parentVdom.id).toBe('my-parent-component');
        expect(parentVdom.tag).toBe('div');

        // 1. Check that the parent's VDOM contains the correct reference
        const childVdomRef = parentVdom.cn[0];
        expect(childVdomRef.componentId).toBe('child-comp');

        // 2. Get the child instance and check its properties
        const childInstance = parentComponent.childComponents.get('child-comp').instance;

        expect(childInstance.constructor).toBe(TestComponent); // t.is -> expect().toBe()

        expect(childInstance.testText).toBe('Inner Content');

        // 3. Check the child's own VDOM directly
        const childVdom = childInstance.vdom;

        expect(childVdom.tag).toBe('div');
        expect(childVdom.cn[0].tag).toBe('p');
        expect(childVdom.cn[0].text).toBe('Inner Content');

        parentComponent.destroy();
    });

    test('should handle camelCase attributes correctly', async () => {
        const parentComponent = Neo.create(TestComponentWithChildren, {
            appName,
            id: 'my-parent-component',
            childText: 'Custom Text for camelCase'
        });

        parentComponent.vdomEffect.run();
        parentComponent.mounted = true;

        await test.step('wait for child component to be available', async () => {
            while (!parentComponent.childComponents?.get('child-comp')) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        const childInstance = parentComponent.childComponents.get('child-comp').instance;

        await test.step('wait for child vdom to update with custom text', async () => {
            while (childInstance.vdom.cn?.[0]?.text !== 'Custom Text for camelCase') {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        expect(childInstance.testText).toBe('Custom Text for camelCase');
        expect(childInstance.vdom.cn[0].text).toBe('Custom Text for camelCase');

        parentComponent.destroy();
    });

    test('should handle conditional rendering correctly', async () => {
        const conditionalComponent = Neo.create(TestConditionalComponent, {
            appName,
            id: 'my-conditional-component'
        });

        conditionalComponent.vdomEffect.run();
        conditionalComponent.mounted = true;

        // 1. Initial state: details should NOT be rendered
        await test.step('wait for initial conditional vdom render', async () => {
            while (!conditionalComponent.vdom?.cn) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        let vdom = conditionalComponent.vdom;
        expect(vdom.cn.length).toBe(1); // Only the h1
        expect(vdom.cn[0].tag).toBe('h1');
        expect(vdom.cn.find(n => n && n.id === 'details-p')).toBeFalsy(); // t.toBeFalsy -> expect().toBeFalsy()

        // 2. Update state: show the details
        conditionalComponent.showDetails = true;

        // 3. Wait for update and assert new state
        await test.step('wait for details to be rendered', async () => {
            while (conditionalComponent.vdom.cn.length <= 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        vdom = conditionalComponent.vdom;
        expect(vdom.cn.length).toBe(2); // h1 and the new p
        const detailsNode = vdom.cn.find(n => n.id === 'details-p');
        expect(detailsNode).toBeTruthy(); // t.ok -> expect().toBeTruthy()
        expect(detailsNode.tag).toBe('p');
        expect(detailsNode.text).toBe('Here are the details!');

        // 4. Update state again: hide the details
        conditionalComponent.showDetails = false;

        // 5. Wait for update and assert final state
        await test.step('wait for details to be removed', async () => {
            while (conditionalComponent.vdom.cn.length !== 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        vdom = conditionalComponent.vdom;
        expect(vdom.cn.length).toBe(1); // Back to just the h1
        expect(vdom.cn.find(n => n && n.id === 'details-p')).toBeFalsy();

        conditionalComponent.destroy();
    });
});
