import NeoArray from '../../../util/Array.mjs';
import Plugin   from '../../../plugin/Base.mjs';

/**
 * @summary The dock's lock concern: the `setItemLocked` commit, its action, and the presentation.
 *
 * Unlock reverses along the path that locked — the recorded state decides, never the current probe.
 * A pane implementing `dockLock(locked)` owns what locked means for its content and gets no `inert`.
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
     * `neo-draggable` ownership per button before lock removed it.
     * @member {WeakMap<Neo.tab.header.Button,Boolean>} dragState=new WeakMap()
     */
    dragState = new WeakMap()
    /**
     * How each pane was locked: `{delegated}` or `{owned, value}` for the replaced `inert`.
     * @member {WeakMap<Neo.component.Base,Object>} paneState=new WeakMap()
     */
    paneState = new WeakMap()

    /**
     * @param {Object} data
     * @param {Neo.tab.Container|null} data.tabContainer
     * @returns {Object} The reducer result, or an errors envelope.
     */
    handleAction({tabContainer} = {}) {
        let {owner}     = this,
            {dockModel} = owner,
            itemId      = owner.getActiveDockItemId(tabContainer),
            missing     = !itemId ? 'an active item' : !dockModel ? 'a committed document' : null;

        if (missing) {
            return {document: dockModel, errors: [`Dock lock action requires ${missing}`]}
        }

        let descriptor = {operation: 'setItemLocked', itemId, locked: dockModel.items[itemId]?.locked !== true},
            result     = owner.applyDockZoneOperation(descriptor);

        if (result?.document && !result.errors?.length) {
            owner.onDockZoneDocumentChange(result.document, descriptor, tabContainer);
            owner.syncDockCloseAction(tabContainer);
            this.syncAction(tabContainer)
        }

        return result
    }

    /**
     * Re-projects the action and every visible item against committed truth.
     * @param {Neo.tab.Container|null} tabContainer
     */
    syncAction(tabContainer) {
        let {owner} = this;

        if (!owner.enableDockLockAction) return;

        let bar    = tabContainer?.getTabBar?.(),
            action = tabContainer?.getActionItem?.('lock'),
            itemId = owner.getActiveDockItemId(tabContainer),
            item   = owner.dockModel?.items?.[itemId],
            locked = item?.locked === true,
            // Names the control for what it does NEXT — accessible name and tooltip key are one word.
            label    = locked ? 'unlock' : 'lock';

        if (action) {
            let labelChanged = action.vdom?.['aria-label'] !== label,
                gateChanged  = action.showOnFocus === locked,
                values       = {
                    hidden : !itemId || item?.lockable === false,
                    iconCls: locked ? owner.dockUnlockIconCls : owner.dockLockIconCls
                };

            owner.syncDockActionTooltip(action, label, values);
            action.set(values);

            if (gateChanged || labelChanged) {
                // `showOnFocus` is a plain class field, so it takes the silent path; the toolbar
                // owns the inert/aria/tab-index presentation it gates and must re-arm first.
                gateChanged  && action.setSilent({showOnFocus: !locked});
                labelChanged && (action.vdom['aria-label'] = label);
                gateChanged  && bar?.applyContextualActionState(true);

                action.update()
            }
        }

        let panes   = tabContainer?.getCardContainer?.()?.items || [],
            buttons = tabContainer?.getTabButtons?.() || [];

        (bar?.sortZoneConfig?.dockItemIds || []).forEach((id, index) => {
            this.syncItemPresentation({
                button: buttons[index],
                locked: owner.dockModel?.items?.[id]?.locked === true,
                pane  : panes[index]
            })
        })
    }

    /**
     * Re-applies lock truth to rail-reveal panes materialized while the overlay stayed open.
     */
    syncRails() {
        let {owner} = this;

        if (!owner.enableDockLockAction) return;

        owner.forEachDockRail(rail => {
            let {revealOverlay} = rail,
                pane            = revealOverlay?.paneSlot?.items?.[0];

            pane && this.syncItemPresentation({
                locked: owner.dockModel?.items?.[revealOverlay.revealPaneItemId]?.locked === true,
                pane
            })
        })
    }

    /**
     * Applies or restores one item's lock presentation without changing model state.
     * @param {Object} data
     * @param {Neo.tab.header.Button|null} [data.button]
     * @param {Boolean} data.locked
     * @param {Neo.component.Base|null} [data.pane]
     */
    syncItemPresentation({button, locked, pane} = {}) {
        this.syncPane(pane, locked);
        this.syncButton(button, locked)
    }

    /**
     * @param {Neo.tab.header.Button|null} button
     * @param {Boolean} locked
     * @protected
     */
    syncButton(button, locked) {
        if (!button || button.isDestroyed) return;

        let {dragState} = this,
            cls         = [...button.wrapperCls || []],
            was         = cls.includes('neo-draggable');

        if (locked) {
            !dragState.has(button) && dragState.set(button, was);
            NeoArray.remove(cls, 'neo-draggable')
        } else if (dragState.has(button)) {
            NeoArray.toggle(cls, 'neo-draggable', dragState.get(button));
            dragState.delete(button)
        }

        was !== cls.includes('neo-draggable') && (button.wrapperCls = cls)
    }

    /**
     * @param {Neo.component.Base|null} pane
     * @param {Boolean} locked
     * @protected
     */
    syncPane(pane, locked) {
        if (!pane || pane.isDestroyed) return;

        let {paneState} = this,
            {vdom}      = pane,
            cls         = [...pane.cls || []],
            was         = cls.includes('neo-dock-pane-locked'),
            changed     = false,
            prior;

        if (locked && !paneState.has(pane)) {
            if (typeof pane.dockLock === 'function') {
                paneState.set(pane, {delegated: true});
                pane.dockLock(true)
            } else {
                paneState.set(pane, {owned: Object.hasOwn(vdom, 'inert'), value: vdom.inert});
                changed    = vdom.inert !== true;
                vdom.inert = true
            }
        } else if (!locked && paneState.has(pane)) {
            prior = paneState.get(pane);
            paneState.delete(pane);

            if (prior.delegated) {
                pane.dockLock(false)
            } else {
                prior.owned ? (vdom.inert = prior.value) : delete vdom.inert;
                changed = true
            }
        }

        NeoArray.toggle(cls, 'neo-dock-pane-locked', locked);

        if (was !== locked) {
            pane.setSilent({cls});
            changed = true
        }

        changed && pane.update()
    }
}

export default Neo.setupClass(Lock);
