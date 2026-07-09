import Component     from '../component/Base.mjs';
import DockZoneModel from './DockZoneModel.mjs';
import NeoArray      from '../util/Array.mjs';

/**
 * @summary Runtime edge-rail affordance rendering committed auto-hidden items as labeled rail tabs,
 * converting a tab click into a `setItemAutoHidden(false)` operation through the dock-zone reducer.
 *
 * The rail is pure render projection (per-window, derived, never persisted): WHICH items rail — and on
 * which edge — is committed `dockZone.v1` truth the adapter derives
 * (`DockLayoutAdapter.collectAutoHiddenItems()`). Tabs render from plain `railItems` metadata rather
 * than from the pane components themselves, so the pane never learns it is railed (pane-blindness) and
 * a destroyed or unresolvable pane cannot break its recall affordance.
 *
 * Interaction contract (current slice): click = restore, committed through the owning reducer callback
 * (`applyDockZoneOperation`) or a local `DockZoneModel.applyOperation()` — never a parallel mutation
 * path. The follow-up reveal/dismiss slice upgrades click to a transient reveal overlay and moves the
 * persist to the overlay's pin control; this component is the mount point for that state machine.
 *
 * Policy honesty: the model rejects `setItemAutoHidden(false)` for `pinnable: false` items, which is
 * reachable when an item's policy flips after it railed. Such a tab renders disabled and rejects locally
 * instead of emitting a doomed operation — the affordance mirrors what the executor would answer.
 *
 * @class Neo.dashboard.DockRail
 * @extends Neo.component.Base
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockSplitter
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockRail extends Component {
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
         * Owning workspace edge (`top`, `right`, `bottom`, `left`). Drives the per-edge cls hook;
         * tab flow direction and writing-mode are CSS concerns keyed off that hook.
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
     * Maps projected tab node ids to dock item ids for delegate-click resolution.
     * Runtime-only lookup state, rebuilt on every `railItems` pass — id-based resolution avoids
     * parsing dataset payloads out of serialized event paths.
     * @member {Object} tabIdToItemId={}
     * @protected
     */
    tabIdToItemId = {}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onRailClick, delegate: '.neo-dashboard-dock-rail-tab', scope: me}
        ])
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEdge(value, oldValue) {
        let me   = this,
            edge = me.getValidatedEdge(value),
            cls  = me.cls || [];

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-edge-rail-${me.getValidatedEdge(oldValue)}`)
        }

        NeoArray.add(cls, `neo-dashboard-dock-edge-rail-${edge}`);

        me.cls = cls;

        me.data = {
            ...(me.data || {}),
            dockEdge: edge
        }
    }

    /**
     * Rebuilds the tab vdom in place — the component instance and its root node stay stable across
     * model flips (object permanence at the affordance level); only the tab children re-render.
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetRailItems(value, oldValue) {
        let me   = this,
            edge = me.getValidatedEdge(me.edge),
            vdom = me.vdom;

        me.tabIdToItemId = {};

        vdom.cn = (value || []).map((railItem, index) => {
            let tabId      = `${me.id}__tab-${index}`,
                restorable = railItem.restorable !== false,
                cls        = ['neo-dashboard-dock-rail-tab'];

            if (!restorable) {
                cls.push('neo-dashboard-dock-rail-tab-disabled')
            }

            me.tabIdToItemId[tabId] = railItem.dockItemId;

            return {
                tag     : 'button',
                cls,
                data    : {dockEdge: railItem.dockEdge || edge, dockItemId: railItem.dockItemId, dockRailTab: true},
                disabled: restorable ? null : true,
                id      : tabId,
                text    : railItem.title || railItem.dockItemId
            }
        });

        me.update()
    }

    /**
     * Commits a restore descriptor through the owning reducer callback, falling back to a local
     * `DockZoneModel.applyOperation()` — identical commit contract to `DockSplitter.commitResizeSplit()`
     * so dashboard reducers handle both affordances with one code path.
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
     * @param {String} edge
     * @returns {String}
     * @protected
     */
    getValidatedEdge(edge) {
        return ['top', 'right', 'bottom', 'left'].includes(edge) ? edge : 'left'
    }

    /**
     * Delegate click handler for rail tabs: resolves the clicked tab to its dock item, honours the
     * restore policy, and commits `setItemAutoHidden(false)` through the reducer path.
     * Fires `dockRailRestore` on commit, `dockRailRestoreRejected` on policy block or executor error.
     * @param {Object} data
     * @returns {{document:(Object|null), errors:String[]}|null}
     */
    onRailClick(data={}) {
        let me     = this,
            itemId = me.tabIdToItemId[data.currentTarget],
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
}

export default Neo.setupClass(DockRail);
