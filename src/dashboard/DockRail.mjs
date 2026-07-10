import Button        from '../button/Base.mjs';
import Container     from '../container/Base.mjs';
import DockZoneModel from './DockZoneModel.mjs';
import NeoArray      from '../util/Array.mjs';

/**
 * @summary Runtime edge-rail affordance rendering committed auto-hidden items as real button
 * children, converting a tab click into a `setItemAutoHidden(false)` operation through the
 * dock-zone reducer.
 *
 * The rail is pure render projection (per-window, derived, never persisted): WHICH items rail — and
 * on which edge — is committed `dockZone.v1` truth the adapter derives
 * (`DockLayoutAdapter.collectAutoHiddenItems()`). Tabs are `Neo.button.Base` child components built
 * from plain `railItems` metadata rather than from the pane components themselves, so the pane never
 * learns it is railed (pane-blindness) and a destroyed or unresolvable pane cannot break its recall
 * affordance. Composition over synthesis: clicks ride the button `handler` contract and each button
 * carries its `dockItemId` — no hand-rolled DOM listeners, no tab-id bookkeeping.
 *
 * Model flips reconcile the button set IN PLACE (`reconcileTabs()`): surviving items keep their live
 * component instance — object permanence at the affordance level — while leavers and newcomers
 * remove/insert at their document-order position.
 *
 * Interaction contract (current slice): click = restore, committed through the owning reducer
 * callback (`applyDockZoneOperation`) or a local `DockZoneModel.applyOperation()` — never a parallel
 * mutation path. The follow-up reveal/dismiss slice upgrades click to a transient reveal overlay and
 * moves the persist to the overlay's pin control; this component is the mount point for that state
 * machine.
 *
 * Policy honesty: the model rejects `setItemAutoHidden(false)` for `pinnable: false` items, which is
 * reachable when an item's policy flips after it railed. Such a tab renders disabled and rejects
 * locally instead of emitting a doomed operation — the affordance mirrors what the executor would
 * answer.
 *
 * @class Neo.dashboard.DockRail
 * @extends Neo.container.Base
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockSplitter
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockRail extends Container {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockRail'
         * @protected
         */
        className: 'Neo.dashboard.DockRail',
        /**
         * @member {String} ntype='dashboard-dock-rail'
         * @protected
         */
        ntype: 'dashboard-dock-rail',
        /**
         * @member {String[]} baseCls=['neo-dashboard-dock-edge-rail']
         */
        baseCls: ['neo-dashboard-dock-edge-rail'],
        /**
         * Callback for an owning Harness/dashboard reducer. Receives `(descriptor, rail)`.
         * When absent, the component falls back to committing against its own `dockZoneDocument`.
         * @member {Function|null} applyDockZoneOperation=null
         */
        applyDockZoneOperation: null,
        /**
         * Current committed dock-zone document. Used when no reducer callback is supplied.
         * @member {Object|null} dockZoneDocument_=null
         * @reactive
         */
        dockZoneDocument_: null,
        /**
         * Owning workspace edge (`top`, `right`, `bottom`, `left`). Drives the per-edge cls hook
         * and the tab-flow layout direction; the tab writing-mode is a CSS concern keyed off the
         * cls hook.
         * @member {String} edge_='left'
         * @reactive
         */
        edge_: 'left',
        /**
         * Notified after a successful local document commit.
         * @member {Function|null} onDockZoneDocumentChange=null
         */
        onDockZoneDocumentChange: null,
        /**
         * Rail tab metadata, in document order: `[{dockEdge, dockItemId, restorable, title}]`.
         * Projection input from `DockLayoutAdapter.createRailTab()` — model-derived, never persisted.
         * @member {Object[]|null} railItems_=null
         * @reactive
         */
        railItems_: null
    }

    /**
     * Seeds the initial button set from `railItems` before the container creates its items —
     * later flips go through `reconcileTabs()` instead.
     * @param {Object} config
     */
    construct(config={}) {
        if (config.railItems?.length && !config.items) {
            config.items = config.railItems.map(railItem => this.createTabConfig(railItem, config.edge))
        }

        super.construct(config)
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEdge(value, oldValue) {
        let me         = this,
            edge       = me.getValidatedEdge(value),
            isVertical = edge === 'left' || edge === 'right',
            cls        = me.cls || [];

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-edge-rail-${me.getValidatedEdge(oldValue)}`)
        }

        NeoArray.add(cls, `neo-dashboard-dock-edge-rail-${edge}`);

        me.set({
            cls,
            layout: {ntype: isVertical ? 'vbox' : 'hbox', align: 'stretch'}
        })
    }

    /**
     * Construction seeds the button set directly (see `construct()`); only live model flips
     * reconcile — the initial pass would race the container's own item creation.
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetRailItems(value, oldValue) {
        if (oldValue !== undefined) {
            this.reconcileTabs(value || [])
        }
    }

    /**
     * Commits a restore descriptor through the owning reducer callback, falling back to a local
     * `DockZoneModel.applyOperation()` — identical commit contract to
     * `DockSplitter.commitResizeSplit()` so dashboard reducers handle both affordances with one
     * code path.
     * @param {Object} descriptor
     * @returns {{document:(Object|null), errors:String[]}}
     * @protected
     */
    commitRestore(descriptor) {
        let me     = this,
            result = null;

        if (typeof me.applyDockZoneOperation === 'function') {
            result = me.applyDockZoneOperation(descriptor, me) || null
        } else if (me.dockZoneDocument) {
            result = DockZoneModel.applyOperation(me.dockZoneDocument, descriptor)
        }

        if (!result) {
            result = {
                document: me.dockZoneDocument,
                errors  : ['DockRail requires `dockZoneDocument` or `applyDockZoneOperation` to commit setItemAutoHidden.']
            }
        }

        if (!result.errors?.length && result.document) {
            me.dockZoneDocument = result.document;

            if (typeof me.onDockZoneDocumentChange === 'function') {
                me.onDockZoneDocumentChange(result.document, descriptor, me)
            }
        }

        return result
    }

    /**
     * Builds one rail-tab button config from rail-item metadata. The button carries its
     * `dockItemId`, so click resolution is instance-based — no id bookkeeping.
     * @param {Object} railItem {dockEdge, dockItemId, restorable, title}
     * @param {String} edge
     * @returns {Object}
     * @protected
     */
    createTabConfig(railItem, edge) {
        let me = this;

        return {
            module         : Button,
            cls            : ['neo-dashboard-dock-rail-tab'],
            disabled       : railItem.restorable === false,
            dockItemId     : railItem.dockItemId,
            handler        : me.onTabClick,
            handlerScope   : me,
            text           : railItem.title || railItem.dockItemId,
            useRippleEffect: false
        }
    }

    /**
     * @param {String} edge
     * @returns {String}
     * @protected
     */
    getValidatedEdge(edge) {
        return ['top', 'right', 'bottom', 'left'].includes(edge) ? edge : 'left'
    }

    /**
     * Button handler for rail tabs: resolves the clicked button to its dock item, honours the
     * restore policy, and commits `setItemAutoHidden(false)` through the reducer path.
     * Fires `dockRailRestore` on commit, `dockRailRestoreRejected` on policy block or executor
     * error.
     * @param {Object} data The button click event data; `data.component` is the tab button.
     * @returns {{document:(Object|null), errors:String[]}|null}
     */
    onTabClick(data={}) {
        let me     = this,
            itemId = data.component?.dockItemId,
            descriptor, railItem, result;

        if (!itemId) {
            return null
        }

        railItem = (me.railItems || []).find(item => item.dockItemId === itemId);

        if (railItem?.restorable === false) {
            result = {
                document: me.dockZoneDocument,
                errors  : [`item "${itemId}" restore blocked by policy (pinnable: false)`]
            };

            me.fire('dockRailRestoreRejected', {descriptor: null, itemId, rail: me, result});

            return result
        }

        descriptor = {autoHidden: false, itemId, operation: 'setItemAutoHidden'};
        result     = me.commitRestore(descriptor);

        me.fire(result.errors?.length ? 'dockRailRestoreRejected' : 'dockRailRestore', {
            descriptor,
            itemId,
            rail: me,
            result
        });

        return result
    }

    /**
     * Reconciles the live button set against fresh rail-item metadata: surviving items keep their
     * component instance and receive in-place `set()` updates (object permanence at the affordance
     * level), leavers are removed, newcomers insert at their document-order position.
     * @param {Object[]} target Fresh rail-item metadata.
     * @protected
     */
    reconcileTabs(target) {
        let me       = this,
            existing = [...(me.items || [])],
            index;

        for (index = existing.length - 1; index >= 0; index--) {
            if (!target.some(railItem => railItem.dockItemId === existing[index].dockItemId)) {
                me.removeAt(index)
            }
        }

        target.forEach((railItem, targetIndex) => {
            let button       = (me.items || []).find(item => item.dockItemId === railItem.dockItemId),
                currentIndex = button ? me.items.indexOf(button) : -1;

            if (button) {
                button.set({
                    disabled: railItem.restorable === false,
                    text    : railItem.title || railItem.dockItemId
                });

                if (currentIndex !== targetIndex) {
                    me.remove(button, false, true);
                    me.insert(targetIndex, button)
                }
            } else {
                me.insert(targetIndex, me.createTabConfig(railItem, me.edge))
            }
        })
    }
}

export default Neo.setupClass(DockRail);
