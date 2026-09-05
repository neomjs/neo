import Base              from '../../../core/Base.mjs';
import Effect            from '../../../core/Effect.mjs';
import EffectManager     from '../../../core/EffectManager.mjs';
import NeoArray          from '../../../util/Array.mjs';
import Reconciler        from './Reconciler.mjs';
import WorkspaceDocument from '../model/WorkspaceDocument.mjs';

/**
 * The item a tabs node presents: the committed active item unless it is railed (committed
 * auto-hidden, surfaced by its owning edge zone), then the first item still in the tab flow — the
 * same fallback `LayoutAdapter.projectTabsNode` projects.
 * @param {Object} document
 * @param {Object} node
 * @returns {String|null}
 */
function effectiveActiveItemId(document, node) {
    const items = (Array.isArray(node?.items) ? node.items : []).filter(itemId => document?.items?.[itemId]?.autoHidden !== true),
          index = items.indexOf(node?.activeItemId);

    return items[index < 0 ? 0 : index] ?? null
}

/**
 * @summary The header-action presentation policy of a dock workspace: what each engine action shows,
 * enables or presses for the item its header presents — published once as data on the workspace's
 * dock state provider, which the retained action instances bind to.
 * @description Membership is owned elsewhere — `toolbar.Base#getActionItems` and
 * `tab.header.Toolbar#isTabButton` decide which actions exist, and the projection emits them once as
 * a constant row. This class owns the second layer, as two halves:
 *
 * **Header truth as data.** {@link #publishDocument} projects the committed document onto the
 * workspace's `dockStateProvider`: `items.<itemId>.{closable, lockable, locked, pinnable, edge}` and
 * `nodes.<tabsNodeId>.activeItemId`, plus `popOutAvailable` and `recreateFallback`. The workspace
 * publishes the runtime facts the document does not carry: `items.<itemId>.reloadable` when it
 * resolves a pane, `flights.<itemId>` at a reload's or recreate's edges. Every leaf is a
 * `core.Config` that self-diffs, so publishing an unchanged document moves nothing.
 *
 * **Bindings instead of sweeps.** {@link #createActionBindings} hands the projection one formatter
 * per action config key (`hidden`, `pressed`, `disabled`), closed over the tabs node. Each projected
 * tab header carries a child provider of the dock provider, so the action instance binds to it and
 * `state.Provider#createBinding` runs the formatter as a `core.Effect`: it reads through
 * `getData`, which registers exactly the leaf configs it touched, and re-runs only when one of them
 * changes. A commit that changes no header input — a split resize, another workspace's transaction
 * — evaluates nothing; a lock toggle re-evaluates the close and lock actions of the one header that
 * presents the item. The one presentation that is not a button config, the lock's pane `inert` and
 * tab-button drag token with their exact-restore memory, is a reactor of the same kind:
 * {@link #bindLockPresentation} binds an `Effect` over the item's `locked` for a pane or a header's
 * item, and {@link #bindChrome} registers those reactors for the live chrome — registration by
 * identity, never a re-derivation.
 *
 * Command execution stays with the workspace: its `onDockHeaderAction` router and `handleDock*Action`
 * handlers are the mutation boundary whose results reach this policy as published data. The
 * workspace resolves one instance through its `dockHeaderActionPolicy` config; a replacement
 * inherits the retiring policy's restore memory ({@link #inheritRestoreState}) before the workspace
 * destroys it, so a lock the old policy applied unwinds through the new one.
 *
 * @class Neo.dashboard.dock.projection.HeaderActionPolicy
 * @extends Neo.core.Base
 */
class HeaderActionPolicy extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.HeaderActionPolicy'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.HeaderActionPolicy',
        /**
         * The workspace whose header actions this policy presents.
         * @member {Neo.dashboard.dock.Workspace|null} workspace=null
         */
        workspace: null
    }

    /**
     * Exact pre-lock root-inert snapshots keyed by the live pane instance:
     * `{owned:Boolean, value:*}`. A WeakMap cannot prolong a retired pane's lifetime.
     * @member {WeakMap<Neo.component.Base,Object>} lockPaneState=new WeakMap()
     * @protected
     */
    lockPaneState = new WeakMap()
    /**
     * Whether each live tab button owned the SortZone's `neo-draggable` token before lock
     * suppressed it. Unlock restores that exact ownership instead of globally arming drag.
     * @member {WeakMap<Neo.component.Base,Boolean>} lockDragState=new WeakMap()
     * @protected
     */
    lockDragState = new WeakMap()
    /**
     * The lock reactors, keyed by the component they present for — a header's tab container
     * (one reactor per item it holds) or a rail's reveal pane (one reactor). An owner's entry is
     * released when it is destroyed, so the map holds only live chrome.
     * @member {Map<Neo.component.Base,Map<String,Neo.core.Effect>>} lockEffects=new Map()
     * @protected
     */
    lockEffects = new Map()

    /**
     * Takes over the exact-restore memory of the policy this instance replaces. The memory is
     * keyed by the live panes and tab buttons — components that outlive the policy that locked
     * them — so a replacement installed while a lock is held must inherit it, or the next unlock
     * would find empty maps and leave a pane inert, a tab button disarmed, or a delegated
     * `dockLock(true)` without its `false`. The maps transfer whole; nothing is copied.
     * @param {Neo.dashboard.dock.projection.HeaderActionPolicy|null} previous
     */
    inheritRestoreState(previous) {
        if (!previous || previous === this) return;

        this.lockPaneState = previous.lockPaneState;
        this.lockDragState = previous.lockDragState
    }

    /**
     * Releases the reactors and the workspace reference; the WeakMaps retire with the instance
     * unless a replacement inherited them first ({@link #inheritRestoreState}).
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.lockEffects.forEach(byItem => byItem.forEach(effect => effect.destroy()));
        me.lockEffects.clear();
        me.workspace = null;

        super.destroy(...args)
    }

    /**
     * Registers the lock reactors the live chrome needs: one per item a tab container holds,
     * released when the item leaves it. Reactors are keyed by identity, so a container already bound
     * costs a lookup, never a write — this pass registers, it re-derives nothing. The workspace runs
     * it wherever chrome can be new: at a commit (a statically projected shell), once a refresh
     * settled, and when a never-refreshed shell mounts.
     * @param {Neo.component.Base|null} shell The dock shell
     */
    bindChrome(shell) {
        let me          = this,
            {workspace} = me;

        if (!shell || !workspace?.enableDockLockAction || workspace.isDestroyed) return;

        Reconciler.collectProjectedTabs(shell).forEach(tabContainer => {
            const itemIds = tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || [];

            itemIds.forEach(itemId => me.bindLockPresentation({itemId, tabContainer}));

            me.lockEffects.get(tabContainer)?.forEach((effect, itemId) => {
                if (!itemIds.includes(itemId)) {
                    effect.destroy();
                    me.lockEffects.get(tabContainer).delete(itemId)
                }
            })
        })
    }

    /**
     * Binds the lock presentation of one item — the pane's `inert` and `neo-dock-pane-locked`, the
     * tab button's drag token — to the item's committed `locked`, through one `core.Effect` that
     * re-runs only when that leaf changes. For a header, pass the tab container: the pane and the
     * button are resolved by item identity at each run, so an item whose pane materializes later,
     * or whose button Overflow moved, is presented from the same reactor. For a rail's reveal pane,
     * pass the pane: the rail materialization callback covers first reveal and every later switch.
     * Binding twice is a lookup; the reactor is released with its component.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Neo.component.Base} [data.pane] A reveal pane outside tab chrome
     * @param {Neo.tab.Container} [data.tabContainer] The header presenting the item
     */
    bindLockPresentation({itemId, pane=null, tabContainer=null}={}) {
        let me     = this,
            owner  = tabContainer || pane,
            byItem = owner && me.lockEffects.get(owner);

        if (!owner || owner.isDestroyed || !itemId) return;

        if (byItem?.has(itemId)) return;

        if (!byItem) {
            byItem = new Map();
            me.lockEffects.set(owner, byItem);

            me.observeConfig(owner.id, 'isDestroying', value => {
                if (value) {
                    me.lockEffects.get(owner)?.forEach(effect => effect.destroy());
                    me.lockEffects.delete(owner)
                }
            })
        }

        byItem.set(itemId, new Effect(() => {
            const {workspace} = me,
                  provider    = workspace?.dockStateProvider;

            if (!provider || owner.isDestroyed) return;

            // The one dependency: the item's committed lock state. Everything below resolves the
            // chrome by identity and writes presentation — reads of component configs on the way
            // must not become dependencies, or a `cls` write would re-run the reactor against a
            // pane a direct presentation call just changed.
            const locked = provider.getData(`items.${itemId}.locked`) === true;

            EffectManager.pauseTracking();

            try {
                if (tabContainer) {
                    const index   = (tabContainer.getTabBar()?.sortZoneConfig?.dockItemIds || []).indexOf(itemId),
                          buttons = tabContainer.getTabButtons?.() || [];

                    me.syncLockItemPresentation({
                        button: buttons.find(button => button.dockItemId === itemId) || null,
                        locked,
                        pane  : index > -1 ? tabContainer.getCard(index) : null
                    })
                } else {
                    me.syncLockItemPresentation({locked, pane})
                }
            } finally {
                EffectManager.resumeTracking()
            }
        }))
    }

    /**
     * The formatters the projection binds onto the engine actions of one tabs node: one function
     * per action config key, each closed over the node and reading the dock provider through
     * `getData`, so an `Effect` running it depends on exactly the leaves it read — the node's active
     * item and that item's fields. `this` is the header's own provider, a child of the dock provider.
     *
     * Every formatter answers for the ACTIVE item: `close` hides for an unclosable or locked item,
     * `lock` hides for an unlockable one and presses while locked, `pin` hides where the collapse
     * could not complete (no owning edge — §2.7, center never rails — or `pinnable: false`),
     * `pop-out` hides while no vessel can open, `reload` hides while neither path can serve the item
     * — no `dockReload()` contract and no recreate fallback — and disables while the item has a
     * flight. Each is the expression its projection constant and its former sync computed, in one
     * place.
     * @param {String} nodeId The tabs node
     * @returns {Object} `{close, lock, pin, 'pop-out', reload}` → `{configKey: formatter}`
     */
    createActionBindings(nodeId) {
        const active = provider => provider.getData(`nodes.${nodeId}.activeItemId`) || null,
              field  = (provider, itemId, key) => provider.getData(`items.${itemId}.${key}`);

        return {
            close: {
                hidden() {
                    const itemId = active(this);

                    return !itemId || field(this, itemId, 'closable') === false || field(this, itemId, 'locked') === true
                }
            },
            lock: {
                hidden() {
                    const itemId = active(this);

                    return !itemId || field(this, itemId, 'lockable') === false
                },
                pressed() {
                    const itemId = active(this);

                    return !!itemId && field(this, itemId, 'locked') === true
                }
            },
            pin: {
                hidden() {
                    const itemId = active(this);

                    return !itemId || field(this, itemId, 'pinnable') === false || !field(this, itemId, 'edge')
                }
            },
            'pop-out': {
                hidden() {
                    return !active(this) || this.getData('popOutAvailable') !== true
                }
            },
            reload: {
                disabled() {
                    const itemId = active(this);

                    return !!itemId && !!this.getData(`flights.${itemId}`)
                },
                hidden() {
                    const itemId = active(this);

                    return !itemId || (field(this, itemId, 'reloadable') !== true && this.getData('recreateFallback') !== true)
                }
            }
        }
    }

    /**
     * Publishes the header truth a committed document carries onto the dock provider: per item
     * `closable`, `lockable`, `locked`, `pinnable` and the owning `edge`
     * ({@link Neo.dashboard.dock.model.WorkspaceDocument#findOwningEdge}, the derivation the
     * projection rails by); per tabs node the item it presents; the workspace's `popOutAvailable`
     * and `recreateFallback`. Leaves self-diff, so an unchanged document evaluates nothing.
     *
     * The workspace publishes at the commit boundary — a retained action whose inputs changed
     * re-evaluates there — and again as it projects, which is a no-op after a commit and the one
     * publish a statically projected shell gets, so a header's bindings read committed truth on
     * their first run either way. The mount path of a never-refreshed shell publishes once more
     * before it registers the chrome.
     * @param {Object|null} document The committed document
     */
    publishDocument(document) {
        let me          = this,
            {workspace} = me,
            provider    = workspace?.dockStateProvider,
            flights     = {},
            items       = {},
            nodes       = {};

        if (!provider) return;

        Object.entries(document?.items || {}).forEach(([itemId, item]) => {
            items[itemId] = {
                closable: item?.closable !== false,
                edge    : WorkspaceDocument.findOwningEdge(document, itemId) || null,
                lockable: item?.lockable !== false,
                locked  : item?.locked   === true,
                pinnable: item?.pinnable !== false
            };

            // A leaf a binding reads must exist before the binding's first run: a formatter
            // registers the configs it read, and a key created later is not one of them. The
            // flight is owned by the workspace's reload path, so an existing value is never touched.
            !provider.getDataConfig(`flights.${itemId}`) && (flights[itemId] = null)
        });

        Object.entries(document?.nodes || {}).forEach(([nodeId, node]) => {
            if (node?.type === 'tabs') {
                nodes[nodeId] = {activeItemId: effectiveActiveItemId(document, node)}
            }
        });

        provider.setData({
            ...(Object.keys(flights).length > 0 && {flights}),
            items,
            nodes,
            popOutAvailable : workspace.dockPopOutActionActive === true,
            recreateFallback: workspace.hasDockRecreateFallback() === true
        })
    }

    /**
     * Applies or restores one item's lock presentation without changing model state.
     *
     * The content half is delegable, the reload precedent: a pane implementing
     * `dockLock(locked)` owns what locked means for its content — a form disables its fields, a
     * grid turns cell editing off, a stream keeps scrolling — and the engine writes no `inert` for
     * it. The probe is a pure `typeof` on the live card, never a resolver call. The hook fires
     * once per transition, recorded in the same per-pane state as the inert snapshot, so a reactor
     * that runs on every `locked` change never re-locks a pane its author already locked.
     * Without the hook the engine's inert default stands, byte-identical, with its exact-restore
     * clause.
     * @param {Object} data
     * @param {Neo.tab.header.Button|null} [data.button]
     * @param {Boolean} data.locked
     * @param {Neo.component.Base|null} [data.pane]
     */
    syncLockItemPresentation({button=null, locked, pane=null}={}) {
        let me = this;

        if (pane && !pane.isDestroyed) {
            let {vdom}  = pane,
                held    = me.lockPaneState.get(pane),
                changed = false,
                prior;

            if (locked && !held) {
                if (typeof pane.dockLock === 'function') {
                    me.lockPaneState.set(pane, {delegated: true});
                    pane.dockLock(true)
                } else {
                    me.lockPaneState.set(pane, {owned: Object.hasOwn(vdom, 'inert'), value: vdom.inert});
                    changed    = vdom.inert !== true;
                    vdom.inert = true
                }
            } else if (!locked && held) {
                prior = held;
                me.lockPaneState.delete(pane);

                // Reverse along the path that locked: the record decides, never the current probe,
                // so a pane cannot be handed an unlock it never received a lock for.
                if (prior.delegated) {
                    pane.dockLock(false)
                } else {
                    prior.owned ? (vdom.inert = prior.value) : delete vdom.inert;
                    changed = true
                }
            }

            if (pane.cls?.includes('neo-dock-pane-locked') !== locked) {
                let cls = [...pane.cls || []];

                NeoArray.toggle(cls, 'neo-dock-pane-locked', locked);
                pane.setSilent({cls});
                changed = true
            }

            changed && pane.update()
        }

        if (button && !button.isDestroyed) {
            let was = button.wrapperCls?.includes('neo-draggable'),
                next;

            if (locked) {
                !me.lockDragState.has(button) && me.lockDragState.set(button, was);
                next = false
            } else if (me.lockDragState.has(button)) {
                next = me.lockDragState.get(button);
                me.lockDragState.delete(button)
            } else {
                return
            }

            if (was !== next) {
                let cls = [...button.wrapperCls];

                NeoArray.toggle(cls, 'neo-draggable', next);
                button.wrapperCls = cls
            }
        }
    }

}

export default Neo.setupClass(HeaderActionPolicy);
