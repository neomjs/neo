import Component from '../component/Base.mjs';

/**
 * @module Neo.dashboard.DockVesselEmbodiment
 * @summary Moves one live dock pane into an admitted tear-out vessel while preserving the source
 * card slot until document truth decides the gesture terminal.
 *
 * This helper owns render topology only. It never opens, closes, identifies, or authorizes a native
 * window, and it never mutates a dock document. The host must first validate the exact vessel, then
 * call {@link #stage}. A hidden placeholder keeps tab-header and card-body indices paired while the
 * live pane renders in the vessel. Zero-mutation retirement restores through the placeholder's LIVE
 * index; committed ownership calls {@link #promote} and leaves the placeholder for the ordinary dock
 * projection to retire alongside the obsolete tab button.
 */

/**
 * Creates one host-local transient embodiment registry.
 * @param {Object} seams
 * @param {Function} seams.resolvePane `(itemId) => Neo.component.Base|null`
 * @param {Function} seams.resolveTarget `(windowId) => Neo.container.Base|null`
 * @returns {Object}
 */
export function createDockVesselEmbodiment({resolvePane, resolveTarget} = {}) {
    if (typeof resolvePane !== 'function' || typeof resolveTarget !== 'function') {
        throw new Error('createDockVesselEmbodiment requires resolvePane and resolveTarget seams')
    }

    const records = new Map();

    /**
     * @summary Stages the same live pane in one admitted vessel and reserves its exact source slot.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String} identity.windowId
     * @returns {Boolean|Promise<Boolean>}
     */
    const stage = ({itemId, windowId} = {}) => {
        let existing = records.get(itemId);

        if (existing) return existing.windowId === windowId ? existing.settlement : false;

        const
            pane         = resolvePane(itemId),
            sourceParent = pane?.parent,
            sourceIndex  = sourceParent?.items?.indexOf(pane) ?? -1,
            target       = resolveTarget(windowId);

        if (!itemId || !windowId || !pane || pane.isDestroyed || !sourceParent || sourceIndex < 0 || !target) {
            return false
        }

        const placeholder = Neo.create({
            module  : Component,
            cls     : ['neo-dashboard-dock-vessel-placeholder'],
            hidden  : true,
            hideMode: 'visibility'
        });

        let record = {pane, placeholder, settlement: null, sourceParent, windowId};

        records.set(itemId, record);
        record.settlement = (async () => {
            try {
                sourceParent.removeAt(sourceIndex, false, true);
                sourceParent.insert(sourceIndex, placeholder, true);
                sourceParent.updateDepth = -1;
                sourceParent.update();
                target.add(pane);

                // Cross-window insertion is not complete when `add()` returns. The exact vessel
                // may otherwise be published to gesture logic, parked, and only THEN finish its
                // pane mount — a late focus/mount side effect that can raise the parked source.
                await Promise.all([
                    sourceParent.promiseUpdate?.(),
                    target.promiseUpdate?.()
                ]);

                return records.get(itemId) === record
            } catch {
                if (records.get(itemId) !== record) return false;

                records.delete(itemId);

                let liveParent = placeholder.parent,
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
        })();

        return record.settlement
    };

    return {
        /**
         * @summary Destroys any remaining transient placeholders during host teardown.
         */
        destroy() {
            records.forEach(({placeholder}) => {
                if (!placeholder.isDestroyed) {
                    placeholder.parent?.remove(placeholder, true, true);
                    placeholder.isDestroyed || placeholder.destroy()
                }
            });
            records.clear()
        },

        /**
         * @summary Reports whether one item currently renders through a staged vessel.
         * @param {String} itemId
         * @returns {Boolean}
         */
        isStaged(itemId) {
            return records.has(itemId)
        },

        /**
         * @summary Returns the exact staged target identity without exposing the render record.
         * @param {String} itemId
         * @returns {String|null}
         */
        getWindowId(itemId) {
            return records.get(itemId)?.windowId ?? null
        },

        /**
         * @summary Commits render ownership to the vessel without touching the source placeholder.
         * @description The next document projection owns placeholder + obsolete-button cleanup.
         * @param {Object} identity
         * @param {String} identity.itemId
         * @param {String} identity.windowId
         * @returns {Boolean}
         */
        promote({itemId, windowId} = {}) {
            const record = records.get(itemId);

            if (!record || record.windowId !== windowId) return false;

            records.delete(itemId);

            return true
        },

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
                record      = records.get(itemId),
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
                records.delete(itemId);

                return true
            } catch {
                return false
            }
        },

        stage
    }
}
