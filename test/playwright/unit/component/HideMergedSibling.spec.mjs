/**
 * @file test/playwright/unit/component/HideMergedSibling.spec.mjs
 * @summary Pins that `hide()` reaches the DOM when a sibling's own update merges into the same parent cycle.
 *
 * `hide()` changes the child's vdom silently and raises the parent to depth 2. When another child's own update
 * merges into that cycle, the cycle would build sparse (merged children only) and prune the hidden child to a
 * reference, so its removal was never diffed. The browser witness is
 * `component/component/HideMergedSibling.spec.mjs`.
 */

import {setup} from '../../setup.mjs';

const appName = 'HideMergedSiblingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Button         from '../../../../src/button/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

test.describe('component.Base: hide() beside a sibling whose own update merges into the parent cycle', () => {
    let applyDeltas, row;

    test.beforeEach(async () => {
        applyDeltas = Neo.applyDeltas;

        row = Neo.create(Container, {
            appName,
            layout: {ntype: 'hbox'},
            items : [
                {module: Component, text: 'model'},
                {module: Button,    text: 'Change'},
                {module: Button,    text: 'Adopt gpt-6-luna'}
            ]
        });

        await row.initVnode();
        row.mounted = true;

        // One settled update leaves the row at its default depth, the state a live app is in
        await row.promiseUpdate()
    });

    test.afterEach(() => {
        Neo.applyDeltas = applyDeltas;
        row?.destroy();
        row = null
    });

    test('both hidden children leave the delta stream and the vnode', async () => {
        const
            [label, change, adopt] = row.items,
            removed                = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            [deltas].flat().forEach(delta => delta.action === 'removeNode' && removed.push(delta.id))
        };

        // One synchronous pass: the second hide also renames, so its own update merges into the parent's cycle
        change.hidden = true;
        adopt.set({hidden: true, text: 'Adopt '});

        await expect.poll(() => !row.isVdomUpdating && !row.needsVdomUpdate && !adopt.isVdomUpdating).toBe(true);

        expect(change.vdom.removeDom).toBe(true);
        expect(removed).toEqual(expect.arrayContaining([change.id, adopt.id]));
        expect(row.vnode.childNodes.map(node => node.componentId ?? node.id)).toEqual([label.id])
    })
});
