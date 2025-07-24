import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

// IMPORTANT: This test file uses real components and expects them to render.
// We need to enable unitTestMode for isolation, but also allow VDOM updates.
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;
// This ensures that the VdomHelper uses the correct renderer for the assertions.
Neo.config.useDomApiRenderer = true;

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
        ntype    : 'test-grandchild',
        tag      : 'span',
        text     : 'initial grandchild'
    }
}
Neo.setupClass(TestGrandchild);

class TestChild extends Container {
    static config = {
        className: 'Test.Child',
        ntype    : 'test-child',
        layout   : {ntype: 'vbox'},
        title_   : 'initial child'
    }

    afterSetTitle(value, oldValue) {
        if (oldValue !== undefined) {
            this.items[0].text = value;
        }
    }
}
Neo.setupClass(TestChild);

class TestParent extends Container {
    static config = {
        className: 'Test.Parent',
        ntype    : 'test-parent',
        layout   : {ntype: 'vbox'},
        heading_ : 'initial parent'
    }

    construct(config) {
        super.construct(config);
        let me = this;
        me.headingComponent = me.insert(0, {
            module: Component,
            vdom  : {
                tag : 'h1',
                id  : me.id + '__heading',
                text: me.heading
            }
        }, true);
    }

    afterSetHeading(value, oldValue) {
        if (oldValue !== undefined) {
            this.headingComponent.text = value;
        }
    }
}
Neo.setupClass(TestParent);

// A container with its own nested item to test deep structural changes
class TestChildContainer extends Container {
    static config = {
        className: 'Test.ChildContainer',
        ntype    : 'test-child-container',
        items    : [
            {ntype: 'test-grandchild', text: 'I am nested'}
        ]
    }
}
Neo.setupClass(TestChildContainer);


StartTest(t => {
    let parent, child, grandchild, testRun = 0;

    t.beforeEach(async t => {
        testRun++;
        parent = Neo.create(TestParent, {
            appName,
            id   : 'test-parent-' + testRun,
            items: [
                {
                    ntype: 'test-child',
                    id   : 'test-child-' + testRun,
                    items: [{ntype: 'test-grandchild', id: 'test-grandchild-' + testRun}]
                }
            ]
        });

        await parent.render();
        child      = parent.items[1]; // TestParent inserts a component at index 0
        grandchild = child.items[0];
        parent.mounted = true;
    });

    t.afterEach(t => {
        parent.destroy();
        parent     = null;
        child      = null;
        grandchild = null;
    });

    t.it('Should handle a simple parent-only update', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 1, 'Should generate exactly one delta');
        const parentUpdate = deltas[0];
        t.is(parentUpdate.id, parent.headingComponent.id, 'Delta should target the heading component');
        t.is(parentUpdate.textContent, 'Updated Parent', 'Parent delta text is correct');
    });

    t.it('Should handle a simple child-only update', async t => {
        // A small delay to ensure any in-flight updates from the initial
        // render() and mount cycle have fully completed before this test runs.
        await Promise.resolve();

        grandchild.setSilent({text: 'Updated Grandchild'});
        const {deltas} = await grandchild.promiseUpdate();

        t.is(deltas.length, 1, 'Should generate exactly one delta');
        const grandchildUpdate = deltas[0];
        t.is(grandchildUpdate.id, grandchild.id, 'Delta should target the grandchild component');
        t.is(grandchildUpdate.textContent, 'Updated Grandchild', 'Grandchild delta text is correct');
    });

    t.it('Should merge a parent update and a reactively-triggered child update', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        child.setSilent({title: 'Updated Child Title'}); // This reactively updates the grandchild's text
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 2, 'Should generate exactly two deltas');

        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        t.ok(parentUpdate, 'Should have a delta for the parent heading component');
        t.is(parentUpdate.textContent, 'Updated Parent', 'Parent delta text is correct');
        t.ok(grandchildUpdate, 'Should have a delta for the grandchild component');
        t.is(grandchildUpdate.textContent, 'Updated Child Title', 'Grandchild delta text is correct');
    });

    t.it('Should handle silent child update merged with parent update', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        grandchild.setSilent({text: 'Silently Updated Grandchild'});
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 2, 'Should generate exactly two deltas');
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        t.ok(parentUpdate, 'Should have a delta for the parent heading component');
        t.is(parentUpdate.textContent, 'Updated Parent', 'Parent delta text is correct');
        t.ok(grandchildUpdate, 'Should have a delta for the grandchild component');
        t.is(grandchildUpdate.textContent, 'Silently Updated Grandchild', 'Grandchild delta text is correct');
    });

    t.it('Should handle structural change (add) in a silent child update', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        const newGrandchild = child.insert(1, {ntype: 'test-grandchild', id: 'new-grandchild-' + testRun, text: 'New Grandchild'}, true);
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 2, 'Should generate exactly two deltas');
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const insertionDelta = deltas.find(d => d.action === 'insertNode');

        t.ok(parentUpdate, 'Should have a delta for the parent heading component');
        t.ok(insertionDelta, 'Should have a delta for the node insertion');
        t.is(insertionDelta.parentId, child.getVdomItemsRoot().id, 'Insertion delta has correct parentId');
        t.is(insertionDelta.vnode.id, newGrandchild.vdom.id, 'Inserted vnode has the correct ID');
        t.is(insertionDelta.vnode.textContent, 'New Grandchild', 'Inserted vnode has correct text');

        newGrandchild.destroy();
    });

    t.it('Should handle structural change (remove) in a silent child update', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        child.removeAt(0, false, true);
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 2, 'Should generate exactly two deltas');
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const removalDelta = deltas.find(d => d.action === 'removeNode');

        t.ok(parentUpdate, 'Should have a delta for the parent heading component');
        t.ok(removalDelta, 'Should have a delta for the node removal');
        t.is(removalDelta.id, grandchild.vdom.id, 'Removal delta has the correct ID');
    });

    t.it('Should handle silent insertion of a container with nested items', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        const newContainer = child.insert(1, {ntype: 'test-child-container', id: 'new-container-' + testRun}, true);
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 2, 'Should generate exactly two deltas');
        const insertionDelta = deltas.find(d => d.action === 'insertNode');

        t.ok(insertionDelta, 'Should have a delta for the node insertion');
        t.is(insertionDelta.vnode.id, newContainer.vdom.id, 'Inserted vnode has the correct ID');
        t.is(insertionDelta.vnode.childNodes.length, 1, 'Inserted vnode should have one child node');

        const nestedChild = insertionDelta.vnode.childNodes[0];
        t.is(nestedChild.id, newContainer.items[0].vdom.id, 'Nested child vnode has the correct ID');
        t.is(nestedChild.textContent, 'I am nested', 'Nested child vnode has the correct text');

        newContainer.destroy();
    });

    t.it('Should merge multiple property updates on a child into a single parent update cycle', async t => {
        parent.setSilent({heading: 'Updated Parent'});
        grandchild.setSilent({
            cls : ['new-class'],
            text: 'Updated Grandchild'
        });
        const {deltas} = await parent.promiseUpdate();

        t.is(deltas.length, 2, 'Should generate exactly two deltas');

        const parentUpdate     = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        t.ok(parentUpdate, 'Should have a delta for the parent heading component');
        t.is(parentUpdate.textContent, 'Updated Parent', 'Parent delta text is correct');

        t.ok(grandchildUpdate, 'Should have a delta for the grandchild changes');
        t.is(grandchildUpdate.textContent, 'Updated Grandchild', 'Grandchild text delta is correct');
        t.isDeeplyStrict(grandchildUpdate.cls.add, ['new-class'], 'Grandchild class delta is correct');
    });
});
