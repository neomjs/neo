import NeoArray from '../../../util/Array.mjs';
import Plugin   from '../../../plugin/Base.mjs';

/**
 * @summary The dock's lock concern: one committed item flag, its action, and the presentation that
 * follows from it.
 *
 * Locking is a complete vertical — a toggle on the action rail, a `setItemLocked` commit against the
 * document, and a presentation pass that makes the locked state visible on the pane, its tab button
 * and any rail-revealed copy. All three lived on the dock workspace, which owns neither the pane's
 * `inert` attribute nor the tab button's drag token.
 *
 * The workspace keeps what only it can answer — whether the feature is on, which item is active, and
 * how to commit an operation — and this plugin owns the rest. Its two `WeakMap`s exist solely for the
 * exact-restore contract below and have no other reader.
 *
 * ## Presentation is a second layer beneath the model guards
 *
 * Lock stamps `vdom.inert` plus `neo-dock-pane-locked` in one pane update and removes only the tab
 * button's `neo-draggable` source token. Unlock restores the exact prior inert ownership/value and the
 * exact prior drag-token ownership: the recorded state decides the reversal, never the current probe,
 * so a pane cannot be handed an unlock it never received a lock for. Locked headers remain legal drop
 * targets.
 *
 * ## The content half is delegable
 *
 * A pane implementing `dockLock(locked)` owns what locked means for its content — a form disables its
 * fields, a grid turns cell editing off, a stream keeps scrolling — and the engine writes no `inert`
 * for it. The probe is a pure `typeof` on the live card, never a resolver call, and the hook fires
 * once per transition, recorded in the same per-pane state as the inert snapshot, so a sweep running
 * on every active-item change never re-locks a pane its author already locked.
 *
 * @class Neo.dashboard.dock.plugin.Lock
 * @extends Neo.plugin.Base
 */
class Lock extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.plugin.Lock'
         * @protected
         */
        className: 'Neo.dashboard.dock.plugin.Lock',
        /**
         * @member {String} ntype='plugin-dock-lock'
         * @protected
         */
        ntype: 'plugin-dock-lock'
    }

    /**
     * Per-button record of the drag token this plugin removed, so unlock restores the exact prior
     * ownership rather than assuming the button was draggable.
     * @member {WeakMap<Neo.tab.header.Button,Boolean>} dragState=new WeakMap()
     */
    dragState = new WeakMap()
    /**
     * Per-pane record of how the lock was applied — delegated to the pane's own `dockLock()`, or the
     * engine's `inert` default with the prior ownership and value it replaced.
     * @member {WeakMap<Neo.component.Base,Object>} paneState=new WeakMap()
     */
    paneState = new WeakMap()

    /**
     * @summary Commits the lock toggle for the active item and re-syncs the actions that depend on it.
     * @param {Object} data
     * @param {String} data.dockNodeId
     * @param {Neo.tab.Container|null} data.tabContainer
     * @returns {Object} The reducer result, or an errors envelope when there is nothing to commit.
     */
    handleAction({dockNodeId, tabContainer} = {}) {
        let me      = this,
            {owner} = me,
            itemId  = owner.getActiveDockItemId(tabContainer);

        if (!itemId) {
            return {document: owner.dockModel, errors: ['Dock lock action requires an active item']}
        }

        if (!owner.dockModel) {
            return {document: owner.dockModel, errors: ['Dock lock action requires a committed document']}
        }

        let descriptor = {
                operation: 'setItemLocked',
                itemId,
                locked   : owner.dockModel.items[itemId]?.locked !== true
            },
            result = owner.applyDockZoneOperation(descriptor);

        if (result && !result.errors?.length && result.document) {
            owner.onDockZoneDocumentChange(result.document, descriptor, tabContainer);
            owner.syncDockCloseAction(tabContainer);
            me.syncAction(tabContainer)
        }

        return result
    }

    /**
     * @summary Re-projects the lock action and every visible item's lock presentation against item truth.
     *
     * The action stays one stable instance; per-item hidden/icon state moves on it. The ordinary lock
     * gesture is focus-gated; once the protective state persists, its unlock reversal becomes persistent
     * too, so discoverability never depends on re-entering a transient focus context.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncAction(tabContainer) {
        let me      = this,
            {owner} = me;

        if (!owner.enableDockLockAction) return;

        let action       = tabContainer?.getActionItem?.('lock'),
            activeItemId = owner.getActiveDockItemId(tabContainer),
            activeItem   = owner.dockModel?.items?.[activeItemId],
            hidden       = !activeItemId || activeItem?.lockable === false,
            iconCls      = activeItem?.locked === true ? owner.dockUnlockIconCls : owner.dockLockIconCls,
            ariaLabel    = activeItem?.locked === true ? 'unlock' : 'lock',
            tooltipKey   = activeItem?.locked === true ? 'unlock' : 'lock',
            showOnFocus  = activeItem?.locked !== true,
            changes      = {};

        if (action) {
            let ariaLabelChanged = action.vdom?.['aria-label'] !== ariaLabel;

            action.hidden  !== hidden  && (changes.hidden  = hidden);
            action.iconCls !== iconCls && (changes.iconCls = iconCls);
            action.showOnFocus !== showOnFocus && (changes.showOnFocus = showOnFocus);
            owner.syncDockActionTooltip(action, tooltipKey, changes);

            if (Object.keys(changes).length || ariaLabelChanged) {
                // `setSilent()` consumes non-config class-field keys from its input, so remember
                // this transition BEFORE handing the batch over.
                let focusGateChanged = Object.hasOwn(changes, 'showOnFocus');

                Object.keys(changes).length && action.setSilent(changes);
                ariaLabelChanged && (action.vdom['aria-label'] = ariaLabel);

                // `showOnFocus` is a stable-instance policy flip, not an action-list rebuild. The
                // toolbar owns the inert/aria/tab-index presentation and must release/re-arm it
                // before this one update publishes the changed action.
                focusGateChanged && tabContainer?.getTabBar?.()?.applyContextualActionState(true);

                action.update()
            }
        }

        let itemIds = tabContainer?.getTabBar?.()?.sortZoneConfig?.dockItemIds || [],
            panes   = tabContainer?.getCardContainer?.()?.items || [],
            buttons = tabContainer?.getTabButtons?.() || [];

        itemIds.forEach((itemId, index) => {
            me.syncItemPresentation({
                button: buttons[index],
                locked: owner.dockModel?.items?.[itemId]?.locked === true,
                pane  : panes[index]
            })
        })
    }

    /**
     * @summary Synchronizes the currently materialized rail-reveal panes against committed lock truth.
     *
     * Rails are synthetic affordances retained across stable-topology reconciliation, so their
     * projection config is not a state-update channel. The materialization callback covers first
     * reveal; this sweep covers a lock transition while the same overlay remains open. Dismissed
     * cached panes restore on their next materialization callback.
     */
    syncRails() {
        let me      = this,
            {owner} = me;

        if (!owner.enableDockLockAction) return;

        owner.forEachDockRail(rail => {
            let itemId = rail.revealOverlay?.revealPaneItemId,
                pane   = rail.revealOverlay?.paneSlot?.items?.[0];

            if (itemId && pane) {
                me.syncItemPresentation({
                    locked: owner.dockModel?.items?.[itemId]?.locked === true,
                    pane
                })
            }
        })
    }

    /**
     * @summary Applies or restores one item's lock presentation without changing model state.
     * @param {Object} data
     * @param {Neo.tab.header.Button|null} data.button
     * @param {Boolean} data.locked
     * @param {Neo.component.Base|null} data.pane
     */
    syncItemPresentation({button, locked, pane} = {}) {
        let me = this;

        if (pane && !pane.isDestroyed) {
            let cls       = Array.isArray(pane.cls) ? [...pane.cls] : pane.cls ? [pane.cls] : [],
                hadCls    = cls.includes('neo-dock-pane-locked'),
                changed   = false,
                delegated = typeof pane.dockLock === 'function',
                prior,
                vdom      = pane.vdom;

            if (locked) {
                if (delegated) {
                    if (!me.paneState.has(pane)) {
                        me.paneState.set(pane, {delegated: true});
                        pane.dockLock(true)
                    }
                } else {
                    if (!me.paneState.has(pane)) {
                        me.paneState.set(pane, {
                            owned: Object.hasOwn(vdom, 'inert'),
                            value: vdom.inert
                        })
                    }

                    if (vdom.inert !== true) {
                        vdom.inert = true;
                        changed = true
                    }
                }
            } else if (me.paneState.has(pane)) {
                prior = me.paneState.get(pane);
                me.paneState.delete(pane);

                // Reverse along the path that locked: the record decides, never the current probe,
                // so a pane cannot be handed an unlock it never received a lock for.
                if (prior.delegated) {
                    pane.dockLock(false)
                } else {
                    if (prior.owned) {
                        vdom.inert = prior.value
                    } else {
                        delete vdom.inert
                    }

                    changed = true
                }
            }

            NeoArray.toggle(cls, 'neo-dock-pane-locked', locked);

            if (hadCls !== locked) {
                pane.setSilent({cls});
                changed = true
            }

            changed && pane.update()
        }

        if (button && !button.isDestroyed) {
            let cls       = Array.isArray(button.wrapperCls) ? [...button.wrapperCls] : [],
                draggable = cls.includes('neo-draggable'),
                restore;

            if (locked) {
                !me.dragState.has(button) && me.dragState.set(button, draggable);
                NeoArray.remove(cls, 'neo-draggable')
            } else if (me.dragState.has(button)) {
                restore = me.dragState.get(button);
                me.dragState.delete(button);
                NeoArray.toggle(cls, 'neo-draggable', restore)
            }

            draggable !== cls.includes('neo-draggable') && (button.wrapperCls = cls)
        }
    }
}

export default Neo.setupClass(Lock);
