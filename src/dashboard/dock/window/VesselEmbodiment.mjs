import Base              from '../../../core/Base.mjs';
import VesselPlaceholder from './VesselPlaceholder.mjs';

/**
 * @summary Moves one live dock pane into an admitted tear-out vessel while preserving the source card
 * slot until document truth decides the gesture terminal.
 *
 * This class owns render topology only. It never opens, closes, identifies, or authorizes a native
 * window, and it never mutates a dock document. The host must first validate the exact vessel, then
 * call {@link #stage}. A deliberate status placeholder keeps tab-header and card-body indices paired
 * while the live pane renders in the vessel; the active source slot therefore explains its transient
 * ownership instead of becoming a black void. Zero-mutation retirement restores through the
 * placeholder's LIVE index; committed ownership calls {@link #promote} and leaves the placeholder for
 * the ordinary dock projection to retire alongside the obsolete tab button.
 *
 * Ownership: the placeholders it creates are its own and die with it; staged panes stay borrowed and
 * follow {@link #restore} or {@link #promote}. The creating host destroys it.
 * @class Neo.dashboard.dock.window.VesselEmbodiment
 * @extends Neo.core.Base
 */
class VesselEmbodiment extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.VesselEmbodiment'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.VesselEmbodiment',
        /**
         * Host pane resolution: `(itemId) => Neo.component.Base|null`.
         * @member {Function|null} resolvePane=null
         */
        resolvePane: null,
        /**
         * Host target resolution: `(windowId) => Neo.container.Base|null` — the container a staged pane
         * renders into.
         * @member {Function|null} resolveTarget=null
         */
        resolveTarget: null
    }

    /**
     * Staged render records per item id: `{itemId, pane, placeholder, settlement, sourceParent, windowId}`.
     * @member {Map<String, Object>} records=new Map()
     * @protected
     */
    records = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (typeof this.resolvePane !== 'function' || typeof this.resolveTarget !== 'function') {
            throw new Error(`${this.className} requires resolvePane and resolveTarget seams`)
        }
    }

    /**
     * @summary Destroys any remaining transient placeholders. Staged panes are borrowed and stay alive.
     * @param {...*} args
     */
    destroy(...args) {
        this.records.forEach(({placeholder}) => {
            if (!placeholder.isDestroyed) {
                placeholder.parent?.remove(placeholder, true, true);
                placeholder.isDestroyed || placeholder.destroy()
            }
        });
        this.records.clear();

        super.destroy(...args)
    }

    /**
     * @summary Returns the exact staged target identity without exposing the render record.
     * @param {String} itemId
     * @returns {String|null}
     */
    getWindowId(itemId) {
        return this.records.get(itemId)?.windowId ?? null
    }

    /**
     * @summary Reports whether one item currently renders through a staged vessel.
     * @param {String} itemId
     * @returns {Boolean}
     */
    isStaged(itemId) {
        return this.records.has(itemId)
    }

    /**
     * @summary Commits render ownership to the vessel without touching the source placeholder.
     * @description The next document projection owns placeholder + obsolete-button cleanup.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String} identity.windowId
     * @returns {Boolean}
     */
    promote({itemId, windowId} = {}) {
        const record = this.records.get(itemId);

        if (!record || record.windowId !== windowId) return false;

        this.records.delete(itemId);

        return true
    }

    /**
     * @summary Restores a zero-mutation gesture through the placeholder's current live slot.
     * @description The placeholder may have shifted while the vessel was open, so its current
     * parent/index — never a stale captured number — is the only restoration authority.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String} identity.windowId
     * @returns {Boolean}
     */
    restore({itemId, windowId} = {}) {
        const
            record      = this.records.get(itemId),
            placeholder = record?.placeholder,
            parent      = placeholder?.parent,
            index       = parent?.items?.indexOf(placeholder) ?? -1;

        if (!record || record.windowId !== windowId || !parent || index < 0 || record.pane.isDestroyed) {
            return false
        }

        try {
            record.pane.parent?.remove(record.pane, false);
            parent.removeAt(index, true, true);
            parent.insert(index, record.pane, true);
            parent.updateDepth = -1;
            parent.update();
            this.records.delete(itemId);

            return true
        } catch {
            return false
        }
    }

    /**
     * @summary Stages the same live pane in one admitted vessel and reserves its exact source slot.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String} identity.windowId
     * @returns {Boolean|Promise<Boolean>}
     */
    stage({itemId, windowId} = {}) {
        const me       = this,
              existing = me.records.get(itemId);

        if (existing) return existing.windowId === windowId ? existing.settlement : false;

        const
            pane         = me.resolvePane(itemId),
            sourceParent = pane?.parent,
            sourceIndex  = sourceParent?.items?.indexOf(pane) ?? -1,
            target       = me.resolveTarget(windowId);

        if (!itemId || !windowId || !pane || pane.isDestroyed || !sourceParent || sourceIndex < 0 || !target) {
            return false
        }

        // The stand-in holds a real pane's slot, so a projection must be able to name it rather than
        // infer it from position. Live-pane lookups exclude this class by category.
        const placeholder = Neo.create(VesselPlaceholder, {dockItemId: itemId}),
              record      = {itemId, pane, placeholder, settlement: null, sourceParent, windowId};

        me.records.set(itemId, record);
        record.settlement = me.settleStage(record, sourceIndex, target);

        return record.settlement
    }

    /**
     * @summary Swaps the pane for its placeholder and mounts it in the target, settling once the
     * target renderer has acknowledged the mount.
     *
     * Cross-window insertion is not complete when `add()` returns: the exact vessel could otherwise be
     * published to gesture logic, parked, and only THEN finish its pane mount. Both structural mutations
     * are silent, so staging owns exactly one settlement transaction per parent. A parked source
     * renderer may reject or never acknowledge another frame, so its transaction starts without being
     * allowed to veto or deadlock the target's independently provable readability. A failure restores
     * the pane through the placeholder's live slot.
     * @param {Object} record
     * @param {Number} sourceIndex
     * @param {Neo.container.Base} target
     * @returns {Promise<Boolean>}
     * @protected
     */
    async settleStage(record, sourceIndex, target) {
        const me                                        = this,
              {itemId, pane, placeholder, sourceParent} = record;

        try {
            sourceParent.removeAt(sourceIndex, false, true);
            sourceParent.insert(sourceIndex, placeholder, true);
            sourceParent.updateDepth = -1;
            target.add(pane, true);
            target.updateDepth = -1;

            Promise.resolve()
                .then(() => sourceParent.promiseUpdate?.())
                .catch(() => {});
            await Promise.resolve().then(() => target.promiseUpdate?.());

            return me.records.get(itemId) === record
        } catch {
            if (me.records.get(itemId) !== record) return false;

            me.records.delete(itemId);

            const liveParent = placeholder.parent,
                  liveIndex  = liveParent?.items?.indexOf(placeholder) ?? -1;

            if (liveParent && liveIndex >= 0) {
                liveParent.removeAt(liveIndex, true, true);
                liveParent.insert(liveIndex, pane, true);
                liveParent.updateDepth = -1;
                liveParent.update()
            } else {
                placeholder.isDestroyed || placeholder.destroy()
            }

            return false
        }
    }
}

export default Neo.setupClass(VesselEmbodiment);
