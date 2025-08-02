import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import HtmlTemplateProcessor from '../../../../src/functional/util/HtmlTemplateProcessor.mjs';
import FunctionalBase        from '../../../../src/functional/component/Base.mjs';
import DomApiVnodeCreator    from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper            from '../../../../src/vdom/Helper.mjs';
import {html}                from '../../../../src/functional/util/html.mjs';

// IMPORTANT: This test file uses real components and expects them to render.
// We need to enable unitTestMode for isolation, but also allow VDOM updates.
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;
// This ensures that the VdomHelper uses the correct renderer for the assertions.
Neo.config.useDomApiRenderer = true;

// Create a mock application context, as the component lifecycle requires it for updates.
const appName = 'HtmlTemplateTest';
Neo.apps = Neo.apps || {};
Neo.apps[appName] = {
    name             : appName,
    fire             : Neo.emptyFn,
    isMounted        : () => true,
    vnodeInitialising: false
};

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


StartTest(t => {
    let component;

    t.beforeEach(async t => {
        component = Neo.create(TestComponent, {
            appName,
            id: 'my-test-component'
        });
        // The initial initVnode() call is synchronous and returns the HtmlTemplate object.
        // The actual VDOM is built asynchronously after this.
        component.initVnode();
        component.mounted = true; // Manually mount to enable updates in the test env
    });

    t.afterEach(t => {
        component?.destroy();
        component = null;
    });

    t.it('should create initial vdom correctly using html template', async t => {
        // Wait for the async VDOM update to complete
        await t.waitFor(() => Object.keys(component.vdom).length > 0);

        const vdom = component.vdom;

        t.expect(vdom.id).toBe('my-test-component'); // The component's own ID
        t.expect(vdom.tag).toBe('div');
        t.expect(vdom.cn.length).toBe(2);

        const pNode = vdom.cn[0];
        t.expect(pNode.tag).toBe('p');
        t.expect(pNode.text).toBe('Hello from Template!');

        const spanNode = vdom.cn[1];
        t.expect(spanNode.tag).toBe('span');
        t.expect(spanNode.text).toBe('Another element');
    });

    t.it('should update vdom when reactive config changes', async t => {
        // Wait for the initial render to finish
        await t.waitFor(() => Object.keys(component.vdom).length > 0);

        const initialVdom = {...component.vdom};

        // Update the component
        component.testText = 'Updated Text!';

        // Wait for the async VDOM update to complete after the change
        await t.waitFor(() => component.vdom.cn[0].text === 'Updated Text!');

        const updatedVdom = component.vdom;

        t.expect(updatedVdom.cn[0].text).toBe('Updated Text!');
        // Ensure the rest of the VDOM structure remains the same
        t.expect(updatedVdom.tag).toBe(initialVdom.tag);
        t.expect(updatedVdom.cn.length).toBe(initialVdom.cn.length);
    });

    t.it('should handle nested components defined in a template', t => {
        const parentComponent = Neo.create(TestComponentWithChildren, {
            appName,
            id: 'my-parent-component'
        });

        parentComponent.initVnode();
        parentComponent.mounted = true;

        const parentVdom = parentComponent.vdom;
        t.expect(parentVdom.id).toBe('my-parent-component');
        t.expect(parentVdom.tag).toBe('div');

        // 1. Check that the parent's VDOM contains the correct reference
        const childVdomRef = parentVdom.cn[0];
        t.expect(childVdomRef.componentId).toBe('child-comp');

        // 2. Get the child instance and check its properties
        const childInstance = parentComponent.childComponents.get('child-comp').instance;

        t.is(childInstance.constructor, TestComponent, 'Child instance should be an instance of TestComponent');

        t.expect(childInstance.testText).toBe('Inner Content');

        // 3. Check the child's own VDOM directly
        const childVdom = childInstance.vdom;

        t.expect(childVdom.tag).toBe('div');
        t.expect(childVdom.cn[0].tag).toBe('p');
        t.expect(childVdom.cn[0].text).toBe('Inner Content');

        parentComponent.destroy();
    });

    t.it('should handle camelCase attributes correctly', async t => {
        const parentComponent = Neo.create(TestComponentWithChildren, {
            appName,
            id: 'my-parent-component',
            childText: 'Custom Text for camelCase'
        });

        parentComponent.initVnode();
        parentComponent.mounted = true;

        await t.waitFor(() => parentComponent.childComponents.get('child-comp'));

        const childInstance = parentComponent.childComponents.get('child-comp').instance;

        await t.waitFor(() => childInstance.vdom.cn?.[0]?.text === 'Custom Text for camelCase');

        t.expect(childInstance.testText).toBe('Custom Text for camelCase');
        t.expect(childInstance.vdom.cn[0].text).toBe('Custom Text for camelCase');

        parentComponent.destroy();
    });

    t.it('should handle conditional rendering correctly', async t => {
        const conditionalComponent = Neo.create(TestConditionalComponent, {
            appName,
            id: 'my-conditional-component'
        });

        conditionalComponent.initVnode();
        conditionalComponent.mounted = true;

        // 1. Initial state: details should NOT be rendered
        await t.waitFor(() => conditionalComponent.vdom?.cn);

        let vdom = conditionalComponent.vdom;
        t.expect(vdom.cn.length).toBe(1); // Only the h1
        t.expect(vdom.cn[0].tag).toBe('h1');
        t.expect(vdom.cn.find(n => n && n.id === 'details-p')).toBeFalsy('Details <p> should not exist initially');

        // 2. Update state: show the details
        conditionalComponent.showDetails = true;

        // 3. Wait for update and assert new state
        await t.waitFor(() => conditionalComponent.vdom.cn.length > 1);

        vdom = conditionalComponent.vdom;
        t.expect(vdom.cn.length).toBe(2); // h1 and the new p
        const detailsNode = vdom.cn.find(n => n.id === 'details-p');
        t.ok(detailsNode, 'Details <p> should now exist');
        t.expect(detailsNode.tag).toBe('p');
        t.expect(detailsNode.text).toBe('Here are the details!');

        // 4. Update state again: hide the details
        conditionalComponent.showDetails = false;

        // 5. Wait for update and assert final state
        await t.waitFor(() => conditionalComponent.vdom.cn.length === 1);

        vdom = conditionalComponent.vdom;
        t.expect(vdom.cn.length).toBe(1); // Back to just the h1
        t.expect(vdom.cn.find(n => n && n.id === 'details-p')).toBeFalsy('Details <p> should be removed');

        conditionalComponent.destroy();
    });
});
