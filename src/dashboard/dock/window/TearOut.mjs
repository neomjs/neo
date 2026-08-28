/**
 * @module Neo.dashboard.dock.window.TearOut
 * @summary The tear-out gesture choreography a dock HOST composes — the admission chain and the
 * commit-at-terminal routing between the dock sort zone's gesture events and the host's own seams.
 *
 * {@link Neo.dashboard.dock.interaction.TabSortZone} fires four tear-out gesture events (re-fired boundary
 * hysteresis + the two detached terminals) and owns the drag embodiment; the dock MODEL owns the
 * document. This module owns what sits between: WHEN a vessel may be acquired, WHEN the one model
 * commit happens, and WHEN a vessel retires — with every seam injected, so the choreography is a
 * pure decision machine the host parameterizes and witnesses drive without a browser.
 *
 * The choreography contract it implements (the docking design record's multi-window amendment):
 * - **Admission is fail-closed.** `openVessel` resolving falsy means the popup was blocked, the
 *   bounded connect never completed, or the host refused — the gesture DEGRADES to its in-window
 *   fallback: the zone's window-drag embodiment is ended (the base armed it before firing the exit
 *   event), no vessel state is retained, and the drag continues on the live in-window proxy.
 * - **The model commits exactly once, at the detached terminal, never at the boundary.** A gesture
 *   that re-enters or cancels leaves the committed document untouched (zero-mutation invariant);
 *   only `dockTearOutTerminal` with an admitted vessel routes `detachItem` through the host's
 *   operation seam. Model commit precedes any window action — on success the vessel STAYS (it owns
 *   the item now); on a model refusal the vessel retires so no window survives showing an item the
 *   document still owns.
 * - **Re-entry and cancel retire the vessel with zero mutation.** Entry additionally resumes the
 *   in-window embodiment (the gesture continues); cancel just cleans up (the gesture is over).
 */

/**
 * Creates the four tear-out gesture handlers a dock composition threads into
 * {@link Neo.dashboard.dock.projection.LayoutAdapter#project} (`onDockTearOutExit` / `Entry` / `Terminal` /
 * `Cancel`), closed over one single-gesture vessel slot. One handler set serves one workspace
 * composition — a pointer drives at most one drag per window, so the slot never needs a map.
 * @param {Object} seams
 * @param {Function} seams.applyOperation Host model seam: `({operation, itemId}) => {document, errors}` —
 *     the workspace's pure reducer (`applyDockZoneOperation`). Called exactly once per successful
 *     tear-out, with `{operation: 'detachItem', itemId}`.
 * @param {Function} seams.closeVessel Host vessel retirement:
 *     `({itemId, windowName}) => Boolean|void|Promise<Boolean|void>` — closes the OS window a
 *     retired gesture leaves behind. Explicit `false` refuses retirement and preserves the slot;
 *     legacy void success remains admitted. Never called for a committed tear-out.
 * @param {Function} seams.onDocumentChange Host view-sync seam: `(document, operation, vessel) => void` —
 *     receives the committed post-detach document plus the exact admitted vessel generation (the
 *     same document/operation seam shape the adapter's `moveTo` listener feeds).
 * @param {Function} seams.openVessel Host vessel acquisition:
 *     `({admissionToken, itemId, proxyRect, sortZone}) => Promise<{admissionToken, generation,
 *     popupHeight, popupWidth, windowName}|null>` —
 *     the host performs the platform work (URL, geometry, `windowOpen`) and resolves FALSY on any
 *     failed admission (`windowOpen` returns a Boolean — a blocked popup never throws, so the host
 *     must check the Boolean, not catch).
 * @returns {Object} `{activeVessel, onDockTearOutCancel, onDockTearOutEntry,
 *     onDockTearOutExit, onDockTearOutTerminal, onVesselRetired, retireActiveVessel}`
 */
export function createDockTearOutHandlers({applyOperation, closeVessel, onDocumentChange, openVessel}) {
    // The admitted slot is deliberately separate from provisional acquisition and cleanup-only
    // late authority. A terminal can invalidate an in-flight host Promise before it settles; its
    // result may then be retired, but can never become active/committable for a dead gesture.
    let activeVessel        = null,
        admissionGeneration = 0,
        lateVessel          = null,
        pendingAdmission    = null,
        retirement          = null;

    /**
     * @summary Creates the exact vessel identity without widening its enumerable public payload.
     * @param {String} itemId
     * @param {Object} vessel
     * @param {Number} fallbackGeneration
     * @returns {Object}
     */
    const createVesselIdentity = (itemId, vessel, fallbackGeneration) => {
        const identity = {itemId, windowName: vessel.windowName};

        Object.defineProperties(identity, {
            admissionToken: {
                value: Number.isFinite(vessel.admissionToken) ? vessel.admissionToken : fallbackGeneration
            },
            generation: {
                value: Number.isFinite(vessel.generation) ? vessel.generation : fallbackGeneration
            }
        });

        return identity
    };

    /**
     * @summary Invalidates one matching provisional admission before any gesture terminal acts.
     * @param {String} itemId
     * @returns {Boolean}
     */
    const invalidateAdmission = itemId => {
        if (
            !pendingAdmission || pendingAdmission.itemId !== itemId || pendingAdmission.invalidated
        ) return false;

        pendingAdmission.invalidated = true;
        admissionGeneration++;

        return true
    };

    /**
     * @summary Retires the active vessel once and clears authority only after non-false success.
     * @param {Object} vessel
     * @returns {Boolean|Promise<Boolean>}
     */
    const retireVessel = vessel => {
        if (retirement) return retirement.promise;

        let result;

        try {
            result = closeVessel(vessel)
        } catch {
            return false
        }

        if (typeof result?.then !== 'function') {
            if (result !== false) {
                activeVessel === vessel && (activeVessel = null);
                lateVessel   === vessel && (lateVessel   = null)
            }

            return result !== false
        }

        const state = {promise: null, vessel};

        retirement = state;
        state.promise = Promise.resolve(result).then(closed => {
            if (retirement !== state) return false;

            retirement = null;

            if (closed !== false) {
                activeVessel === vessel && (activeVessel = null);
                lateVessel   === vessel && (lateVessel   = null)
            }

            return closed !== false
        }, () => {
            retirement === state && (retirement = null);
            return false
        });

        return state.promise
    };

    return {
        /**
         * @member {Object|null} activeVessel
         */
        get activeVessel() {
            return activeVessel
        },

        /**
         * @summary Retires the exact active vessel without discarding retry authority first.
         *
         * A committed remote target consumes the source vessel without traversing the detached
         * terminal below. The conversion lifecycle therefore needs one exact, item-guarded close
         * path. Strict refusal retains this private slot; every stale or other-item request is inert.
         * @param {Object} identity
         * @param {String} identity.itemId
         * @param {String} identity.windowName
         * @returns {Boolean|Promise<Boolean>}
         */
        retireActiveVessel({itemId, windowName} = {}) {
            let vessel = activeVessel;

            if (
                !vessel || vessel.itemId !== itemId || vessel.windowName !== windowName
            ) return false;

            return retireVessel(vessel)
        },

        /**
         * @summary Clears one exact vessel after its external owner observed physical retirement.
         * @param {Object} identity
         * @param {String} identity.itemId
         * @param {String} identity.windowName
         * @returns {Boolean}
         */
        onVesselRetired({admissionToken, generation, itemId, windowName} = {}) {
            if (
                pendingAdmission?.itemId === itemId &&
                pendingAdmission.token === admissionToken
            ) {
                pendingAdmission.externallyRetired = true;
                return invalidateAdmission(itemId)
            }

            const matches = vessel => Boolean(
                vessel && vessel.itemId === itemId && vessel.windowName === windowName &&
                (!Number.isFinite(generation) || vessel.generation === generation) &&
                (!Number.isFinite(admissionToken) || vessel.admissionToken === admissionToken)
            );

            let vessel = matches(activeVessel) ? activeVessel : lateVessel;

            if (!matches(vessel)) return false;

            activeVessel === vessel && (activeVessel = null);
            lateVessel   === vessel && (lateVessel   = null);
            retirement = null;

            return true
        },

        /**
         * Cancel while detached: the vessel retires, the document was never touched. The zone's
         * base cleanup owns the embodiment teardown (the drag is over), so unlike entry there is
         * no embodiment to resume.
         * @param {Object} data
         */
        onDockTearOutCancel(data) {
            invalidateAdmission(data?.itemId);

            let vessel = activeVessel;

            if (!vessel) return false;

            return retireVessel(vessel)
        },

        /**
         * The drag re-entered the source window past the reattach threshold: a resumed in-window
         * gesture, not an outcome. The vessel retires with zero model mutation and the zone
         * resumes its in-window embodiment.
         * @param {Object} data
         */
        onDockTearOutEntry(data) {
            invalidateAdmission(data?.itemId);

            let vessel = activeVessel;

            data.sortZone?.endWindowDrag();

            if (!vessel) return false;

            return retireVessel(vessel)
        },

        /**
         * The drag left the window past the detach threshold: acquire a vessel through the host's
         * admission seam. Falsy resolution = fail closed — end the window-drag embodiment the base
         * armed before firing this event, retain no state, and let the gesture continue on the
         * live in-window proxy. An admitted vessel engages the zone's OS pointer-follow.
         * @param {Object} data
         * @returns {Promise<void>}
         */
        async onDockTearOutExit(data) {
            if (activeVessel || retirement || pendingAdmission) return false;

            if (lateVessel) {
                const retired = await retireVessel(lateVessel);

                if (!retired) {
                    data.sortZone?.endWindowDrag();
                    return false
                }
            }

            const state = {
                externallyRetired: false,
                invalidated      : false,
                itemId           : data.itemId,
                token            : ++admissionGeneration
            };

            pendingAdmission = state;

            let vessel;

            try {
                vessel = await openVessel({
                    admissionToken: state.token,
                    itemId        : data.itemId,
                    proxyRect     : data.proxyRect,
                    sortZone      : data.sortZone
                })
            } catch {
                vessel = null
            }

            pendingAdmission === state && (pendingAdmission = null);

            if (state.invalidated || state.token !== admissionGeneration) {
                if (!state.externallyRetired && vessel?.windowName) {
                    lateVessel = createVesselIdentity(data.itemId, vessel, state.token);
                    await retireVessel(lateVessel)
                }

                return false
            }

            if (!vessel) {
                data.sortZone?.endWindowDrag();
                return false
            }

            activeVessel = createVesselIdentity(data.itemId, vessel, state.token);

            data.sortZone?.startWindowDrag({
                dragData   : data,
                popupHeight: vessel.popupHeight,
                popupWidth : vessel.popupWidth,
                windowName : vessel.windowName
            });

            return true
        },

        /**
         * Released while detached — the ONE commit seam: `detachItem` routes through the host's
         * reducer (tree removal, catalog preserved for vessel ownership). Success: the committed
         * document syncs and the vessel STAYS — it owns the item now. A model refusal retires the
         * vessel instead, so no window survives showing an item the document still owns. A THROWING
         * reducer is a host bug, but it must land on the same refusal path — an uncaught throw here
         * would skip the retirement and orphan the vessel, the exact class this machine prevents.
         * Without an admitted vessel (failed admission earlier in the gesture) there is nothing to
         * commit.
         * @param {Object} data
         */
        onDockTearOutTerminal(data) {
            invalidateAdmission(data?.itemId);

            let vessel = activeVessel;

            if (!vessel || vessel.itemId !== data.itemId) return false;

            let operation = {operation: 'detachItem', itemId: data.itemId},
                result;

            try {
                result = applyOperation(operation)
            } catch (error) {
                result = {document: null, errors: [`detachItem threw: ${error?.message || error}`]}
            }

            if (result && !result.errors?.length && result.document) {
                activeVessel = null;
                onDocumentChange(result.document, operation, vessel);
                return true
            } else {
                return retireVessel(vessel)
            }
        }
    }
}
