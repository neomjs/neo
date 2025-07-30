import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import FunctionalBase     from '../../../../src/functional/component/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import html               from '../../../../src/functional/util/html.mjs';

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


StartTest(t => {
    let component, vnode;

    t.beforeEach(async t => {
        component = Neo.create(TestComponent, {
            appName,
            id: 'my-test-component'
        });

        ({vnode} = await component.render());
        component.mounted = true; // Manually mount to enable updates in the test env
    });

    t.afterEach(t => {
        component?.destroy();
        component = null;
        vnode     = null;
    });

    t.it('should create initial vnode correctly using html template', async t => {
        t.expect(vnode.nodeName).toBe('div');
        t.expect(vnode.id).toBe('my-test-component'); // The component's own ID
        t.expect(vnode.childNodes.length).toBe(2);

        const pNode = vnode.childNodes[0];
        t.expect(pNode.nodeName).toBe('p');
        t.expect(pNode.id).toContain('neo-vnode-'); // Expecting a generated ID
        t.expect(pNode.textContent).toBe('Hello from Template!');

        const spanNode = vnode.childNodes[1];
        t.expect(spanNode.nodeName).toBe('span');
        t.expect(spanNode.id).toContain('neo-vnode-'); // Expecting a generated ID
        t.expect(spanNode.textContent).toBe('Another element');
    });

    t.it('should update vnode when reactive config changes', async t => {
        // Update the component to get the updated vnode
        const opts = await component.set({testText: 'Updated Text!'});
        vnode = opts.vnode;

        const pNode = vnode.childNodes[0];
        t.expect(pNode.textContent).toBe('Updated Text!');
    });
});
