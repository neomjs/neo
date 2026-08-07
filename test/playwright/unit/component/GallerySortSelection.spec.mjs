import {setup} from '../../setup.mjs';

const appName = 'GallerySortSelectionTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Gallery        from '../../../../src/component/Gallery.mjs';
import Helix          from '../../../../src/component/Helix.mjs';
import SelectionModel from '../../../../src/selection/Model.mjs';

/**
 * Guards the selection state surviving a store-driven item rebuild.
 *
 * `Gallery#onStoreLoad` and `Helix#onStoreLoad` rebuild every item from `itemTpl`, which carries no
 * selection state — while `selection.Model` tracks *ids* and annotates the vdom *nodes* it resolved
 * earlier. Those nodes are discarded by the rebuild, so without a restore `hasSelection()` keeps
 * reporting a selection that nothing renders, and `aria-selected` goes with it.
 *
 * A store sort reaches this path too: `Store.onCollectionSort` re-fires a sort as a `load`. Gallery
 * additionally had an `onSort` handler whose reorder block was unreachable — the rebuild had already
 * corrected the order before it ran — so it was removed rather than fixed.
 */
test.describe('Gallery / Helix selection across an item rebuild', () => {
    let selectionModel, view;

    /**
     * @summary Fresh item nodes, as `createItems()` would build them from `itemTpl` — no selection state.
     */
    function buildItems(itemIds) {
        return itemIds.map(id => ({id, cls: ['neo-gallery-item']}))
    }

    /**
     * @summary Resolves an item node through the component's REAL `getVdomChild` traversal.
     */
    function itemNode(id) {
        return view.getVdomChild(id)
    }

    /**
     * A real component, not a literal: `Model#beforeSetView` stores the view as an **id** and
     * `beforeGetView` resolves it via `Neo.getComponent()`. A plain object is never registered, so the
     * model's `view` reads back `undefined` and every annotation silently goes nowhere.
     */
    test.beforeEach(() => {
        view = Neo.create(Component, {
            appName,
            vdom: {cn: buildItems(['item-1', 'item-2', 'item-3'])}
        });

        view.updateCalls = 0;
        view.update      = function() {
            this.updateCalls++
        };

        selectionModel = Neo.create(SelectionModel, {
            view
        })
    });

    test('CONTROL: a rebuild really does strip the annotation', () => {
        selectionModel.select('item-2');

        expect(itemNode('item-2').cls).toContain('neo-selected');

        // What `createItems()` does: fresh nodes built from the template, no selection state.
        view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3']);

        // Non-vacuity guard: if the rebuild did NOT strip it, the restore assertions below would pass
        // without the restore ever running.
        expect(itemNode('item-2').cls).not.toContain('neo-selected');
        expect(selectionModel.hasSelection()).toBe(true);
    });

    test('restoreSelection re-annotates the rebuilt nodes', () => {
        selectionModel.select('item-2');
        view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3']);

        selectionModel.restoreSelection();

        const node = itemNode('item-2');

        expect(node.cls).toContain('neo-selected');
        expect(node['aria-selected']).toBe(true);
    });

    test('restoreSelection is a no-op when nothing is selected', () => {
        view.updateCalls = 0;

        selectionModel.restoreSelection();

        expect(selectionModel.hasSelection()).toBe(false);
        expect(view.updateCalls).toBe(0);
        expect(view.vdom.cn.every(node => !node.cls.includes('neo-selected'))).toBe(true);
    });

    test('restoreSelection tolerates a tracked id whose item is no longer rendered', () => {
        selectionModel.select('item-3');

        // A store sort can drop an item past `maxItems`, leaving the id tracked with no node.
        view.vdom.cn = buildItems(['item-1', 'item-2']);

        expect(() => selectionModel.restoreSelection()).not.toThrow();
        expect(selectionModel.hasSelection()).toBe(true);
    });

    test('Gallery#onStoreLoad restores the selection its own rebuild destroyed', () => {
        selectionModel.select('item-2');

        let cameraRecentred = false;

        const gallery = {
            selectionModel,
            createItems() {
                // The real method rebuilds from `itemTpl`; the annotation loss is what matters here.
                view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3'])
            },
            getItemsRoot: () => view.vdom,
            onSelectionChange() {
                cameraRecentred = true
            }
        };

        Gallery.prototype.onStoreLoad.call(gallery, []);

        expect(itemNode('item-2').cls).toContain('neo-selected');
        expect(itemNode('item-2')['aria-selected']).toBe(true);

        // The camera must follow the selected item to its new cell — this call used to sit behind the
        // unreachable `hasChange` guard in `onSort`, so it never ran on a sort.
        expect(cameraRecentred).toBe(true);
    });

    test('Helix#onStoreLoad restores the annotation, without the camera pass', () => {
        selectionModel.select('item-2');

        const helix = {
            selectionModel,
            createItems() {
                view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3'])
            },
            getItemsRoot: () => view.vdom
        };

        Helix.prototype.onStoreLoad.call(helix, []);

        expect(itemNode('item-2').cls).toContain('neo-selected');

        // Helix's post-sort visual pass is owned by `onSort` → `sortItems`, so unlike Gallery it must
        // NOT also drive a camera/selection-change pass from here.
        expect(itemNode('item-2')['aria-selected']).toBe(true);
    })
});
