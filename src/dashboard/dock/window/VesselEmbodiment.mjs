import Component          from '../../../component/Base.mjs';
import DragProxyContainer from '../../../draggable/DragProxyContainer.mjs';

/**
 * @module Neo.dashboard.dock.window.VesselEmbodiment
 * @summary Moves one live dock pane into an admitted tear-out vessel while preserving the source
 * card slot until document truth decides the gesture terminal.
 *
 * This helper owns render topology only. It never opens, closes, identifies, or authorizes a native
 * window, and it never mutates a dock document. The host must first validate the exact vessel, then
 * call {@link #stage}. A deliberate status placeholder keeps tab-header and card-body indices paired
 * while the live pane renders in the vessel; the active source slot therefore explains its transient
 * ownership instead of becoming a black void. Zero-mutation retirement restores through the
 * placeholder's LIVE index; committed ownership calls {@link #promote} and leaves the placeholder for
 * the ordinary dock projection to retire alongside the obsolete tab button.
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
            module   : Component,
            cls      : ['neo-dashboard-dock-vessel-placeholder'],
            isLoading: 'Moving pane to another window…',
            role     : 'status'
        });

        let record = {pane, placeholder, settlement: null, sourceParent, windowId};

        records.set(itemId, record);
        record.settlement = (async () => {
            try {
                sourceParent.removeAt(sourceIndex, false, true);
                sourceParent.insert(sourceIndex, placeholder, true);
                sourceParent.updateDepth = -1;
                target.add(pane, true);
                target.updateDepth = -1;

                // Cross-window insertion is not complete when `add()` returns. The exact vessel
                // may otherwise be published to gesture logic, parked, and only THEN finish its
                // pane mount — a late focus/mount side effect could raise the parked source.
                // Both structural mutations are silent above so staging owns exactly one
                // settlement transaction per parent before publishing the embodiment. A parked
                // source renderer may reject OR never acknowledge another frame after physical
                // parking. Start that source-slot transaction, but do not let it veto or deadlock
                // the target renderer's independently provable readability.
                Promise.resolve()
                    .then(() => sourceParent.promiseUpdate?.())
                    .catch(() => {});
                await Promise.resolve().then(() => target.promiseUpdate?.());

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

/**
 * Whether one target-local proxy rectangle is finite and drawable.
 * @param {Object} rect
 * @returns {Boolean}
 * @private
 */
function isMeasurableProxyRect(rect) {
    return Boolean(rect) &&
        Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) && rect.width > 0 &&
        Number.isFinite(rect.height) && rect.height > 0
}

/**
 * Creates one host-local target-proxy embodiment over {@link createDockVesselEmbodiment}.
 *
 * The nested registry preserves the pane's exact slot in the parked source popup while the SAME
 * live pane renders inside one target-window {@link Neo.draggable.DragProxyContainer}. Its
 * generation fence makes a late renderer settlement from a restored predecessor unable to retire
 * a successor proxy. The host remains the lifecycle authority: pointer movement calls
 * {@link #move}, convert-out/cancel calls {@link #restore}, and a committed transfer calls
 * {@link #promote}. No document or native-window state enters this helper.
 *
 * @param {Object} seams
 * @param {Function} [seams.createProxy] Injectable proxy factory for focused tests.
 * @param {Function} seams.resolvePane `(itemId) => Neo.component.Base|null`
 * @param {Function} seams.resolveProxyConfig `({draggedItem, proxyRect, sourceSortZone,
 *     sourceWindowId, targetWindowId}) => Object|null`
 * @returns {Object}
 */
export function createDockVesselProxyEmbodiment({
    createProxy=config => Neo.create(config),
    resolvePane,
    resolveProxyConfig
} = {}) {
    if (
        typeof createProxy !== 'function' ||
        typeof resolvePane !== 'function' ||
        typeof resolveProxyConfig !== 'function'
    ) {
        throw new Error(
            'createDockVesselProxyEmbodiment requires createProxy, resolvePane, and resolveProxyConfig seams'
        )
    }

    let active     = null,
        generation = 0;

    const embodiment = createDockVesselEmbodiment({
        resolvePane,
        resolveTarget: targetWindowId => active?.targetWindowId === targetWindowId
            ? active.proxy
            : null
    });

    /**
     * @summary Retires one exact proxy without destroying its reusable live pane.
     * @param {Object} record
     * @private
     */
    const retireProxy = record => {
        if (!record || active !== record) return false;

        active = null;

        if (!record.proxy?.isDestroyed) {
            record.proxy.hidden = true;
            record.proxy.destroy()
        }

        return true
    };

    /**
     * @summary Resolves an optional exact identity against the current generation.
     * @param {Object} identity
     * @returns {Object|null}
     * @private
     */
    const resolveRecord = ({itemId, sourceWindowId, targetWindowId} = {}) => {
        if (
            !active || active.itemId !== itemId ||
            (sourceWindowId != null && active.sourceWindowId !== sourceWindowId) ||
            (targetWindowId != null && active.targetWindowId !== targetWindowId)
        ) {
            return null
        }

        return active
    };

    return {
        /**
         * @summary Restores any active proxy during host teardown, then retires transient state.
         */
        destroy() {
            let record = active;

            if (record && !record.promoted) {
                embodiment.restore({
                    itemId  : record.itemId,
                    windowId: record.targetWindowId
                })
            }

            record && active === record && retireProxy(record);
            embodiment.destroy()
        },

        /**
         * @summary Reports whether one pane still has an exact source-slot reservation.
         * @param {String} itemId
         * @returns {Boolean}
         */
        isStaged(itemId) {
            return embodiment.isStaged(itemId)
        },

        /**
         * @summary Moves or updates one admitted target-local live proxy.
         *
         * The move is synchronously fail-closed: by return time the pane either has a recorded
         * exact source slot and a target proxy parent, or no proxy is admitted. Renderer
         * settlement continues behind the generation fence and is exposed through
         * {@link #snapshot} for release gating.
         * @param {Object} data
         * @param {Neo.component.Base} data.draggedItem
         * @param {Object} data.proxyRect Target-window-local `{x,y,width,height}`
         * @param {Neo.draggable.container.SortZone} data.sourceSortZone
         * @param {String|Number} [data.sourceWindowId] Exact physical source vessel identity.
         *     Falls back to the source sort zone's window for ordinary cross-window drags.
         * @param {String|Number} data.targetWindowId
         * @returns {Boolean}
         */
        move({draggedItem, proxyRect, sourceSortZone, sourceWindowId, targetWindowId} = {}) {
            const itemId = draggedItem?.dockItemId;

            sourceWindowId ??= sourceSortZone?.windowId;

            if (
                !itemId || sourceWindowId == null || targetWindowId == null ||
                !isMeasurableProxyRect(proxyRect)
            ) {
                return false
            }

            if (active && (
                active.itemId !== itemId ||
                active.sourceWindowId !== sourceWindowId ||
                active.targetWindowId !== targetWindowId
            )) {
                if (!this.restore({itemId: active.itemId})) return false
            }

            if (!active) {
                let proxyConfig;

                try {
                    proxyConfig = resolveProxyConfig({
                        draggedItem,
                        proxyRect,
                        sourceSortZone,
                        sourceWindowId,
                        targetWindowId
                    })
                } catch {
                    return false
                }

                if (!proxyConfig || typeof proxyConfig !== 'object') return false;

                const record = {
                    generation: ++generation,
                    itemId,
                    promoted  : false,
                    proxy     : null,
                    settlement: null,
                    settled   : false,
                    sourceWindowId,
                    targetWindowId
                };

                try {
                    record.proxy = createProxy({
                        ...proxyConfig,
                        module          : DragProxyContainer,
                        height          : `${proxyRect.height}px`,
                        items           : [],
                        moveInMainThread: false,
                        style           : {
                            ...(proxyConfig.style || {}),
                            left: `${proxyRect.x}px`,
                            top : `${proxyRect.y}px`
                        },
                        width   : `${proxyRect.width}px`,
                        windowId: targetWindowId
                    })
                } catch {
                    return false
                }

                if (!record.proxy) return false;

                active = record;

                let settlement;

                try {
                    settlement = embodiment.stage({itemId, windowId: targetWindowId})
                } catch {
                    retireProxy(record);
                    return false
                }

                if (!embodiment.isStaged(itemId)) {
                    retireProxy(record);
                    return false
                }

                record.settlement = Promise.resolve(settlement).then(admitted => {
                    if (active !== record) return false;

                    record.settled = admitted === true;

                    if (!record.settled) {
                        retireProxy(record)
                    }

                    return record.settled
                }, () => {
                    active === record && retireProxy(record);
                    return false
                })
            }

            active.proxy.hidden = false;
            active.proxy.height = `${proxyRect.height}px`;
            active.proxy.width  = `${proxyRect.width}px`;
            active.proxy.style  = {
                ...(active.proxy.style || {}),
                left: `${proxyRect.x}px`,
                top : `${proxyRect.y}px`
            };

            return embodiment.isStaged(itemId) && resolvePane(itemId)?.parent === active.proxy
        },

        /**
         * @summary Promotes one committed pane out of transient source-slot ownership.
         * @description The proxy is retired without destroying the pane; the queued committed
         * projection reparents that same cached instance into its document-owned target.
         * @param {Object} identity
         * @param {String} identity.itemId
         * @param {String|Number} [identity.sourceWindowId]
         * @param {String|Number} [identity.targetWindowId]
         * @returns {Boolean}
         */
        promote(identity = {}) {
            const record = resolveRecord(identity);

            if (!record || !embodiment.promote({
                itemId  : record.itemId,
                windowId: record.targetWindowId
            })) {
                return false
            }

            record.promoted = true;
            retireProxy(record);

            return true
        },

        /**
         * @summary Restores one zero-mutation proxy through the parked popup's live placeholder.
         * @param {Object} identity
         * @param {String} identity.itemId
         * @param {String|Number} [identity.sourceWindowId]
         * @param {String|Number} [identity.targetWindowId]
         * @returns {Boolean}
         */
        restore(identity = {}) {
            const record = resolveRecord(identity);

            if (!record || record.promoted || !embodiment.restore({
                itemId  : record.itemId,
                windowId: record.targetWindowId
            })) {
                return false
            }

            retireProxy(record);

            return true
        },

        /**
         * @summary Restores the active proxy when either participating native window departs.
         * @param {String|Number} windowId
         * @returns {Boolean}
         */
        restoreByWindow(windowId) {
            const record = active;

            return record && (
                record.sourceWindowId === windowId || record.targetWindowId === windowId
            )
                ? this.restore({itemId: record.itemId})
                : false
        },

        /**
         * @summary Waits for the exact active proxy generation to finish cross-window rendering.
         *
         * Synchronous staging reserves source ownership, but target `promiseUpdate()` settlement is
         * the first point at which a retained handoff interval may honestly begin. A restored,
         * promoted, or superseded generation resolves false.
         * @param {Object} identity
         * @param {String} identity.itemId
         * @param {String|Number} [identity.sourceWindowId]
         * @param {String|Number} [identity.targetWindowId]
         * @returns {Promise<Boolean>}
         */
        async whenSettled(identity = {}) {
            const record = resolveRecord(identity);

            if (!record?.settlement) return false;

            const admitted = await record.settlement;

            return admitted === true &&
                active === record &&
                resolveRecord(identity) === record &&
                embodiment.isStaged(record.itemId) &&
                resolvePane(record.itemId)?.parent === record.proxy
        },

        /**
         * @summary Returns clone-safe target-proxy truth for semantic release witnesses.
         * @param {String|null} [itemId=null]
         * @returns {Object|null}
         */
        snapshot(itemId=null) {
            const
                record = active,
                pane   = record && resolvePane(record.itemId),
                proxy  = record?.proxy;

            if (!record || (itemId != null && record.itemId !== itemId)) return null;

            return {
                cls           : Array.isArray(proxy?.cls) ? [...proxy.cls] : [],
                generation    : record.generation,
                itemId        : record.itemId,
                ownsPane      : pane?.parent === proxy,
                proxyId       : proxy?.id ?? null,
                settled       : record.settled,
                sourceWindowId: record.sourceWindowId,
                targetWindowId: record.targetWindowId,
                visible       : Boolean(proxy) && !proxy.isDestroyed && proxy.hidden !== true &&
                    proxy.style?.display !== 'none' && String(proxy.style?.opacity ?? 1) !== '0'
            }
        }
    }
}
