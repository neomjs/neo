import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import FunctionalBase        from '../../../../src/functional/component/Base.mjs';
import DomApiVnodeCreator    from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import HtmlStringToVdom      from '../../../../src/main/addon/HtmlStringToVdom.mjs';
import HtmlTemplateProcessor from '../../../../src/functional/util/HtmlTemplateProcessor.mjs';
import VdomHelper            from '../../../../src/vdom/Helper.mjs';
import {html}                from '../../../../src/functional/util/html.mjs';

// IMPORTANT: This test file uses real components and expects them to render.
// We need to enable unitTestMode for isolation, but also allow VDOM updates.
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;
// This ensures that the VdomHelper uses the correct renderer for the assertions.
Neo.config.useDomApiRenderer = true;

// Since the test environment is the main thread, we need to manually create
// the addon that would normally live there.
const ns = Neo.ns('Neo.main.addon', true);
ns['HtmlStringToVdom'] = Neo.create(HtmlStringToVdom);

// Create a mock application context, as the component lifecycle requires it for updates.
const appName = 'HtmlTemplateTest';
Neo.apps = Neo.apps || {};
Neo.apps[appName] = {
    name     : appName,
    fire     : Neo.emptyFn,
    isMounted: () => true,
    rendering: false
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

    createTemplateVdom(config) {
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

    createTemplateVdom(config) {
        return html`
            <div id="parent-div">
                <${TestComponent} id="child-comp" testText="${config.childText}" />
            </div>
        `;
    }
}

TestComponentWithChildren = Neo.setupClass(TestComponentWithChildren);



StartTest(t => {
    let component;

    t.beforeEach(async t => {
        component = Neo.create(TestComponent, {
            appName,
            id: 'my-test-component'
        });
        // The initial render() call is synchronous and returns the HtmlTemplate object.
        // The actual VDOM is built asynchronously after this.
        component.render();
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

        parentComponent.render();
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
        t.expect(childVdom.text).toBe('Inner Content');

        parentComponent.destroy();
    });
});
