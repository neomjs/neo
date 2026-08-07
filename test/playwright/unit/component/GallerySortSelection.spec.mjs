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
import GalleryModel   from '../../../../src/selection/GalleryModel.mjs';
import Helix          from '../../../../src/component/Helix.mjs';
import HelixModel     from '../../../../src/selection/HelixModel.mjs';
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
     * @summary Fresh item nodes keyed the way the real views key them: `${view.id}__${recordId}`.
     *
     * `Gallery#createItem` / `Helix#createItem` set `vdomItem.id = getItemVnodeId(recordId)`, while
     * `GalleryModel` / `HelixModel` track the BARE record id. Building plain ids here is exactly the
     * fixture error that let a no-op restore ship green.
     */
    function buildItems(recordIds) {
        return recordIds.map(id => ({id: `${view.id}__${id}`, cls: ['neo-gallery-item']}))
    }

    /**
     * @summary Resolves an item by RECORD id through the component's real `getVdomChild` traversal.
     */
    function itemNode(recordId) {
        return view.getVdomChild(`${view.id}__${recordId}`)
    }

    /**
     * A real component whose `getItemVnodeId` mirrors Gallery's and Helix's, because the seam under test
     * is precisely the gap between the id a model TRACKS and the id a view's nodes CARRY.
     *
     * It must also be a real Neo instance rather than a literal: `Model#beforeSetView` stores the view as
     * an **id** and `beforeGetView` resolves it via `Neo.getComponent()`, so a plain object reads back
     * undefined and every annotation silently goes nowhere.
     */
    class PrefixedItemView extends Component {
        static config = {
            className: 'Test.Unit.Selection.PrefixedItemView'
        }

        getItemVnodeId(id) {
            return this.id + '__' + id
        }
    }

    PrefixedItemView = Neo.setupClass(PrefixedItemView);

    /**
     * @summary Builds a model of the given class bound to a fresh prefixed-id view.
     */
    function mount(ModelClass) {
        view = Neo.create(PrefixedItemView, {appName, vdom: {cn: []}});

        view.vdom.cn      = buildItems(['item-1', 'item-2', 'item-3']);
        view.updateCalls  = 0;
        view.update       = function() { this.updateCalls++ };

        return Neo.create(ModelClass, {view})
    }

    test.beforeEach(() => {
        selectionModel = mount(SelectionModel)
    });

    test('CONTROL: a rebuild really does strip the annotation', () => {
        const vdomId = `${view.id}__item-2`;

        // Base `Model` tracks ids that already ARE vdom ids, so it selects the prefixed id directly.
        selectionModel.select(vdomId);
        expect(view.getVdomChild(vdomId).cls).toContain('neo-selected');

        view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3']);

        // Non-vacuity guard: if the rebuild did NOT strip it, every restore assertion below would pass
        // without the restore running.
        expect(view.getVdomChild(vdomId).cls).not.toContain('neo-selected');
        expect(selectionModel.hasSelection()).toBe(true);
    });

    test('base Model restoreSelection re-annotates the rebuilt nodes', () => {
        const vdomId = `${view.id}__item-2`;

        selectionModel.select(vdomId);
        view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3']);

        selectionModel.restoreSelection();

        expect(view.getVdomChild(vdomId).cls).toContain('neo-selected');
        expect(view.getVdomChild(vdomId)['aria-selected']).toBe(true);
    });

    test('restoreSelection is a no-op when nothing is selected', () => {
        view.updateCalls = 0;

        selectionModel.restoreSelection();

        expect(selectionModel.hasSelection()).toBe(false);
        expect(view.updateCalls).toBe(0);
        expect(view.vdom.cn.every(node => !node.cls.includes('neo-selected'))).toBe(true);
    });

    test('restoreSelection tolerates a tracked id whose item is no longer rendered', () => {
        selectionModel.select(`${view.id}__item-3`);

        // A sort can drop an item past `maxItems`, leaving the id tracked with no node.
        view.vdom.cn = buildItems(['item-1', 'item-2']);

        expect(() => selectionModel.restoreSelection()).not.toThrow();
        expect(selectionModel.hasSelection()).toBe(true);
    });

    // ---------------------------------------------------------------------------------------------
    // The concrete models. These are the specs that matter: `GalleryModel` and `HelixModel` track the
    // BARE record id while the view's nodes carry `${view.id}__${recordId}`, so a restore that resolves
    // the tracked id directly finds nothing and silently does nothing. A fixture built on base `Model`
    // with plain ids cannot observe that at all — it was green against a component that does not exist.
    // ---------------------------------------------------------------------------------------------

    for (const [name, ModelClass] of [['GalleryModel', GalleryModel], ['HelixModel', HelixModel]]) {
        test(`${name} tracks the BARE record id — the seam that made the restore a no-op`, () => {
            const model = mount(ModelClass);

            model.items.push('item-2');

            // The defect in one assertion: the tracked id resolves nothing, the prefixed id resolves.
            expect(view.getVdomChild('item-2')).toBeFalsy();
            expect(view.getVdomChild(`${view.id}__item-2`)).toBeTruthy();

            // ...and the model must bridge exactly that gap.
            expect(model.getItemVdomId('item-2')).toBe(`${view.id}__item-2`);
        });

        test(`${name} restoreSelection annotates the real prefixed node`, () => {
            const model = mount(ModelClass);

            model.items.push('item-2');
            view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3']);

            model.restoreSelection(true);

            const node = itemNode('item-2');

            expect(node.cls).toContain('neo-selected');
            expect(node['aria-selected']).toBe(true);
        });
    }

    // ---------------------------------------------------------------------------------------------
    // The preservation chain, driven through the REAL select(). `items.push(...)` proves the mapping
    // seam but skips the half that matters: whether the annotation EXISTS before the rebuild. A restore
    // that adds `aria-selected` where select never set it has not preserved anything — it invented it.
    // ---------------------------------------------------------------------------------------------

    for (const [name, ModelClass] of [['GalleryModel', GalleryModel], ['HelixModel', HelixModel]]) {
        test(`${name}: select establishes the CSS + ARIA baseline BEFORE any rebuild`, () => {
            const model = mount(ModelClass);

            model.select('item-2');

            const node = itemNode('item-2');

            // This is the assertion the previous fixture could not make. Against the pre-repair models
            // it fails on ariaSelected: their select() emitted `{id, cls}` only.
            expect(node.cls).toContain('neo-selected');
            expect(node['aria-selected']).toBe(true);
            expect(model.items).toContain('item-2');
        });

        test(`${name}: select → rebuild → restore preserves the SAME annotation, not a new one`, () => {
            const model = mount(ModelClass);

            model.select('item-2');

            const before = {
                cls : [...itemNode('item-2').cls],
                aria: itemNode('item-2')['aria-selected']
            };

            // Non-vacuity: the baseline must be a real annotation, or "identical after" is trivially true.
            expect(before.cls).toContain('neo-selected');
            expect(before.aria).toBe(true);

            view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3']);

            expect(itemNode('item-2').cls).not.toContain('neo-selected');
            expect(itemNode('item-2')['aria-selected']).toBeUndefined();

            model.restoreSelection(true);

            const after = itemNode('item-2');

            // Identical restoration, both axes — the contract Cycle-1 RA1 asked for.
            expect(after.cls).toEqual(expect.arrayContaining(before.cls));
            expect(after['aria-selected']).toBe(before.aria);
        });
    }

    test('Gallery#onStoreLoad restores through the concrete model, not the base contract', () => {
        const model = mount(GalleryModel);

        model.items.push('item-2');

        let cameraRecentred = false;

        const gallery = {
            selectionModel: model,
            createItems() {
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
        const model = mount(HelixModel);

        model.items.push('item-2');

        const helix = {
            selectionModel: model,
            createItems() {
                view.vdom.cn = buildItems(['item-2', 'item-1', 'item-3'])
            },
            getItemsRoot: () => view.vdom
        };

        Helix.prototype.onStoreLoad.call(helix, []);

        expect(itemNode('item-2').cls).toContain('neo-selected');
        expect(itemNode('item-2')['aria-selected']).toBe(true);
    });

    // ---------------------------------------------------------------------------------------------
    // The INVERSE contract (@neo-gpt, exact-head falsifier). Everything above proves the annotation
    // arrives; none of it proved it LEAVES. Both un-select paths moved `items` to empty while the
    // prefixed node kept `neo-selected` and `aria-selected` — a collection and a tree disagreeing
    // about what is selected, which is the same defect as the missing restore pointing the other way.
    //
    // Two distinct causes, so two tests per model rather than one: `deselect` resolved the raw id
    // instead of the prefixed one, and `onContainerClick` wrote deltas straight to the DOM through
    // `Neo.applyDeltas`, never touching the vdom at all.
    // ---------------------------------------------------------------------------------------------

    for (const [name, ModelClass] of [['GalleryModel', GalleryModel], ['HelixModel', HelixModel]]) {
        test(`${name}: the inherited deselect strips CSS + ARIA from the prefixed node`, () => {
            const model = mount(ModelClass);

            model.select('item-2');

            // Control: without this the assertions below pass on a node that was never annotated.
            expect(itemNode('item-2').cls).toContain('neo-selected');
            expect(itemNode('item-2')['aria-selected']).toBe(true);

            model.deselect('item-2');

            expect(model.items).toHaveLength(0);
            expect(itemNode('item-2').cls).not.toContain('neo-selected');
            expect(itemNode('item-2')['aria-selected']).toBeFalsy();
        });

        test(`${name}: onContainerClick clears the vdom, not just the DOM`, () => {
            const model = mount(ModelClass);

            model.select('item-2');
            expect(itemNode('item-2').cls).toContain('neo-selected');

            model.onContainerClick();

            expect(model.items).toHaveLength(0);

            // The half `Neo.applyDeltas` could never reach. A DOM-only clear leaves these set, and the
            // next differ pass would re-assert the styling this method exists to remove.
            expect(itemNode('item-2').cls).not.toContain('neo-selected');
            expect(itemNode('item-2')['aria-selected']).toBeFalsy();
        });
    }
});
