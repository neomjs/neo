import Neo        from '../../../../src/Neo.mjs';
import * as core  from '../../../../src/core/_export.mjs';
import Component  from '../../../../src/component/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';
import VdomHelper from '../../../../src/vdom/Helper.mjs';

// IMPORTANT: This test file uses real components and expects them to render.
// We need to enable unitTestMode for isolation, but also allow VDOM updates.
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;
// This ensures that the VdomHelper uses the correct renderer for the assertions.
Neo.config.useDomApiRenderer = true;
VdomHelper.onNeoConfigChange({useDomApiRenderer: true});

// Create a mock application context, as the component lifecycle requires it for updates.
const appName = 'VdomRealWorldTestApp';
Neo.apps = Neo.apps || {};
Neo.apps[appName] = {
    name     : appName,
    fire     : Neo.emptyFn,
    isMounted: () => true,
    rendering: false
};

class TestGrandchild extends Component {
    static config = {
        className: 'Test.Grandchild',
        ntype: 'test-grandchild',

        // Since Component already defines 'text_', we provide a default value for 'text'.
        text: 'initial grandchild',
        tag : 'span'
    }
}
Neo.setupClass(TestGrandchild);

class TestChild extends Container {
    static config = {
        className: 'Test.Child',
        ntype: 'test-child',
        layout: {ntype: 'vbox'},

        title_: 'initial child',
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // The "chrome" component for this container's title is created and managed internally.
        // We pass a config object, and insert() will create the instance for us.
        me.titleComponent = me.insert(0, {
            module: Component,
            vdom: {
                tag : 'h2',
                id  : me.id + '__title',
                text: me.title
            }
        }, true);
    }

    afterSetTitle(value, oldValue) {
        if (oldValue !== undefined) {
            this.titleComponent.vdom.text = value;
            this.titleComponent.update();
        }
    }
}
Neo.setupClass(TestChild);

class TestParent extends Container {
    static config = {
        className: 'Test.Parent',
        ntype: 'test-parent',
        layout: {ntype: 'vbox'},

        heading_: 'initial parent',
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // The "chrome" component for this container's heading is created and managed internally.
        // We pass a config object, and insert() will create the instance for us.
        me.headingComponent = me.insert(0, {
            module: Component,
            vdom: {
                tag: 'h1',
                id: me.id + '__heading',
                text: me.heading
            }
        }, true);
    }

    afterSetHeading(value, oldValue) {
        if (oldValue !== undefined) {
            this.headingComponent.vdom.text = value;
            this.headingComponent.update();
        }
    }
}
Neo.setupClass(TestParent);

StartTest(t => {
    t.it('Should merge updates from multiple component levels into a single DOM update', async t => {
        let parent = Neo.create(TestParent, {
            appName,
            id   : 'test-parent-1',
            items: [
                {
                    ntype: 'test-child',
                    id: 'test-child-1',
                    items: [{ntype: 'test-grandchild'}]
                }
            ]
        });

        // 1. Render without mounting to generate the initial vnode state.
        await parent.render();

        let child = Neo.getComponent('test-child-1');
        let grandchild = child.down('test-grandchild');

        // For a pure VDOM test, we set mounted to true. This will trigger the afterSetMounted hook,
        // which will propagate down the component tree. This is necessary for promiseUpdate() to run.
        parent.mounted = true;

        // 2. Trigger updates on the parent and the grandchild in the same event loop tick.
        // The framework's EffectManager should batch these changes. The grandchild update
        // should merge into the parent's update cycle.
        parent.heading = 'Updated Parent';
        grandchild.text = 'Updated Grandchild';

        // 3. Wait for the update cycle & get the deltas without rendering to DOM.
        const updateData = await parent.promiseUpdate();
        const { deltas } = updateData;

        // 4. Assert that the generated deltas are correct.
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        t.ok(parentUpdate, 'Should have a delta for the parent heading component');
        t.is(parentUpdate.textContent, 'Updated Parent', 'Parent delta text is correct');

        t.ok(grandchildUpdate, 'Should have a delta for the grandchild component');
        t.is(grandchildUpdate.textContent, 'Updated Grandchild', 'Grandchild delta text is correct');

        parent.destroy();
    });
});
