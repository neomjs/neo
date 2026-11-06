import {setup} from '../../setup.mjs';

const appName = 'FunctionalDestroyParentVdomTest';

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
import {defineComponent}  from '../../../../src/functional/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import VNodeUtil          from '../../../../src/util/VNode.mjs';

const FunctionalLeaf = defineComponent({
    config: {
        className: 'Test.Unit.Functional.DestroyParentVdom.Leaf'
    },
    createVdom() {
        return {tag: 'span', text: 'functional leaf'}
    }
});

/**
 * @summary Whether a parent's vdom still names a child, inline or as a component reference.
 * @param {Object} vdom
 * @param {String} id
 * @returns {Boolean}
 */
const namesChild = (vdom, id) => JSON.stringify(vdom).includes(`"${id}"`);

test.describe('functional.component.Base#destroy(updateParentVdom) leaves its parent as the classic destroy does', () => {
    let container;

    test.beforeEach(async () => {
        container = Neo.create(Container, {
            appName,
            id   : 'destroy-parent-vdom-container',
            items: [
                {module: FunctionalLeaf, id: 'destroy-parent-vdom-functional'},
                {module: Component,      id: 'destroy-parent-vdom-classic', text: 'classic leaf'}
            ]
        });

        await container.initVnode();
        container.mounted = true
    });

    test.afterEach(() => {
        container?.destroy();
        container = null
    });

    test('destroy(true) takes a functional child out of the parent vdom, and the next update drops its node', async () => {
        const id = 'destroy-parent-vdom-functional';

        expect(namesChild(container.vdom, id)).toBe(true);
        expect(VNodeUtil.getById(container.vnode, id)).toBeTruthy();

        Neo.getComponent(id).destroy(true);

        expect(namesChild(container.vdom, id), 'the parent vdom no longer names the child').toBe(false);

        await container.promiseUpdate();

        expect(VNodeUtil.getById(container.vnode, id), 'the rendered node is gone').toBeFalsy()
    });

    test('destroy(true, true) edits the parent vdom silently, as the classic path does', async () => {
        const id     = 'destroy-parent-vdom-functional',
              before = container.vnode;

        Neo.getComponent(id).destroy(true, true);

        expect(namesChild(container._vdom, id), 'the silent write still drops the child').toBe(false);
        expect(container.vnode, 'no update ran').toBe(before)
    });

    test('a classic child is unchanged: destroy(true) still takes it out of the parent vdom', async () => {
        const id = 'destroy-parent-vdom-classic';

        Neo.getComponent(id).destroy(true);

        expect(namesChild(container.vdom, id)).toBe(false);

        await container.promiseUpdate();

        expect(VNodeUtil.getById(container.vnode, id)).toBeFalsy()
    });

    test('owner removal is unchanged for a functional child', async () => {
        const id = 'destroy-parent-vdom-functional';

        container.removeAt(0);
        await container.promiseUpdate();

        expect(Neo.getComponent(id)).toBeFalsy();
        expect(VNodeUtil.getById(container.vnode, id)).toBeFalsy()
    });

    test('a functional component parented by document.body leaves through removeNode', () => {
        const root     = Neo.create(FunctionalLeaf, {appName, id: 'destroy-parent-vdom-body-root', parentId: 'document.body'}),
              deltas   = [],
              original = Neo.applyDeltas;

        Neo.applyDeltas = (windowId, delta) => {deltas.push(delta)};

        try {
            root.destroy(true)
        } finally {
            Neo.applyDeltas = original
        }

        expect(deltas).toContainEqual({action: 'removeNode', id: 'destroy-parent-vdom-body-root'})
    })
});
