import {setup} from '../../setup.mjs';

const appName = 'VdomRealWorldUpdatesTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class TestGrandchild extends Component {
    static config = {
        className: 'Test.Grandchild',
        ntype    : 'test-grandchild',
        tag      : 'span',
        text     : 'initial grandchild'
    }
}
TestGrandchild = Neo.setupClass(TestGrandchild);

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
TestChild = Neo.setupClass(TestChild);

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
TestParent = Neo.setupClass(TestParent);

class TestChildContainer extends Container {
    static config = {
        className: 'Test.ChildContainer',
        ntype    : 'test-child-container',
        items    : [
            {ntype: 'test-grandchild', text: 'I am nested'}
        ]
    }
}
TestChildContainer = Neo.setupClass(TestChildContainer);

test.describe('Neo.vdom.VdomRealWorldUpdates', () => {
    let parent, child, grandchild, testRun = 0;

    test.beforeEach(async () => {
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

        await parent.initVnode();
        child      = parent.items[1];
        grandchild = child.items[0];
        parent.mounted = true;
    });

    test.afterEach(() => {
        parent.destroy();
        parent     = null;
        child      = null;
        grandchild = null;
    });

    test('Should handle a simple parent-only update', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(1);
        const parentUpdate = deltas[0];
        expect(parentUpdate.id).toBe(parent.headingComponent.id);
        expect(parentUpdate.textContent).toBe('Updated Parent');
    });

    test('Should handle a simple child-only update', async () => {
        await Promise.resolve();

        grandchild.setSilent({text: 'Updated Grandchild'});
        const {deltas} = await grandchild.promiseUpdate();

        expect(deltas.length).toBe(1);
        const grandchildUpdate = deltas[0];
        expect(grandchildUpdate.id).toBe(grandchild.id);
        expect(grandchildUpdate.textContent).toBe('Updated Grandchild');
    });

    test('Should merge a parent update and a reactively-triggered child update', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        child.setSilent({title: 'Updated Child Title'});
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(2);

        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        expect(parentUpdate).toBeTruthy();
        expect(parentUpdate.textContent).toBe('Updated Parent');
        expect(grandchildUpdate).toBeTruthy();
        expect(grandchildUpdate.textContent).toBe('Updated Child Title');
    });

    test('Should handle silent child update merged with parent update', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        grandchild.setSilent({text: 'Silently Updated Grandchild'});
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(2);
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        expect(parentUpdate).toBeTruthy();
        expect(parentUpdate.textContent).toBe('Updated Parent');
        expect(grandchildUpdate).toBeTruthy();
        expect(grandchildUpdate.textContent).toBe('Silently Updated Grandchild');
    });

    test('Should handle structural change (add) in a silent child update', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        const newGrandchild = child.insert(1, {ntype: 'test-grandchild', id: 'new-grandchild-' + testRun, text: 'New Grandchild'}, true);
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(2);
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const insertionDelta = deltas.find(d => d.action === 'insertNode');

        expect(parentUpdate).toBeTruthy();
        expect(insertionDelta).toBeTruthy();
        expect(insertionDelta.parentId).toBe(child.getVdomItemsRoot().id);
        expect(insertionDelta.vnode.id).toBe(newGrandchild.vdom.id);
        expect(insertionDelta.vnode.textContent).toBe('New Grandchild');

        newGrandchild.destroy();
    });

    test('Should handle structural change (remove) in a silent child update', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        child.removeAt(0, false, true);
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(2);
        const parentUpdate = deltas.find(d => d.id === parent.headingComponent.id);
        const removalDelta = deltas.find(d => d.action === 'removeNode');

        expect(parentUpdate).toBeTruthy();
        expect(removalDelta).toBeTruthy();
        expect(removalDelta.id).toBe(grandchild.vdom.id);
    });

    test('Should handle silent insertion of a container with nested items', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        const newContainer = child.insert(1, {ntype: 'test-child-container', id: 'new-container-' + testRun}, true);
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(2);
        const insertionDelta = deltas.find(d => d.action === 'insertNode');

        expect(insertionDelta).toBeTruthy();
        expect(insertionDelta.vnode.id).toBe(newContainer.vdom.id);
        expect(insertionDelta.vnode.childNodes.length).toBe(1);

        const nestedChild = insertionDelta.vnode.childNodes[0];
        expect(nestedChild.id).toBe(newContainer.items[0].vdom.id);
        expect(nestedChild.textContent).toBe('I am nested');

        newContainer.destroy();
    });

    test('Should merge multiple property updates on a child into a single parent update cycle', async () => {
        parent.setSilent({heading: 'Updated Parent'});
        grandchild.setSilent({
            cls : ['new-class'],
            text: 'Updated Grandchild'
        });
        const {deltas} = await parent.promiseUpdate();

        expect(deltas.length).toBe(2);

        const parentUpdate     = deltas.find(d => d.id === parent.headingComponent.id);
        const grandchildUpdate = deltas.find(d => d.id === grandchild.id);

        expect(parentUpdate).toBeTruthy();
        expect(parentUpdate.textContent).toBe('Updated Parent');

        expect(grandchildUpdate).toBeTruthy();
        expect(grandchildUpdate.textContent).toBe('Updated Grandchild');
        expect(grandchildUpdate.cls.add).toEqual(['new-class']);
    });
});
