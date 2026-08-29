/**
 * @module Neo.dashboard.dock.window.VesselPark
 * @summary The in-gesture vessel lifecycle authority — the pure choreography deciding what happens
 * to a dragged popup's REAL OS window between conversion and the gesture terminal: park it, never
 * close it; re-show the SAME window; dispose exactly once, on commit only.
 *
 * Why park exists (the platform law this machine encodes): popup acquisition consumes WHATWG
 * transient user activation, and `windowOpen` reports failure by BOOLEAN — a blocked popup never
 * throws. A popup→proxy→popup round-trip within ONE continuous gesture therefore cannot count on
 * re-acquisition: the activation that opened the vessel may be consumed, and a mid-gesture reopen
 * reads as unsolicited to popup blocking. Close-and-reopen is a one-way door — the user drags over
 * a target, changes their mind, drags out, and their window is unrecoverable without a fresh
 * gesture. The park contract removes the door: **conversion parks the vessel (a render-target
 * effect behind a host seam), out-conversion re-shows the same OS window, and the activation wall
 * is unreachable BY CONSTRUCTION — this machine has no acquisition seam to call.**
 *
 * The choreography contract this implements (the docking design record, multi-window amendment):
 * - **The in-gesture segment only.** The conversion DECISION belongs to the companion sensor
 *   ({@link Neo.dashboard.dock.window.VesselConversion}); the gesture terminals belong to the outcome
 *   machine; the reintegration close POLICY belongs to the host behind the dispose seam. This
 *   machine owns the ordering between them: convert-in → park; convert-out → re-show; terminal →
 *   dispose (commit) or restore (everything else).
 * - **Commit is the ONLY disposition.** A committed target owns the item now, so the parked vessel
 *   retires through the host's one `disposeVessel` settlement — one in-flight close at a time, and
 *   the slot clears only after strict success. A refusal retains exact retry authority. EVERY other
 *   outcome — cancel, reject, or any terminal the host routes while parked — fails toward RESTORE:
 *   the machine never loses the user's window to a lifecycle edge.
 * - **Two rect sources, one rule.** Out-conversion re-shows at the out-event's LIVE rect when the
 *   caller supplies one (the design record's `resumeWindowDrag(widgetName, proxyRect)` semantics —
 *   the popup resumes under the pointer, where the drag is NOW); absent a supplied rect it falls
 *   back to the recorded pre-conversion rect (origin semantics — the restore path's meaning). The
 *   recorded rect preserves the user's own mid-session sizing either way.
 * - **Stale events are no-ops, not errors.** Duplicate convert-in with a live slot, convert-out or
 *   terminal with no slot, and terminals for a different `itemId` all return silently — the
 *   exact-once/idempotent cleanup bar every gesture surface owes its terminals.
 */

/**
 * Creates the in-gesture park handlers a dock composition binds to the conversion sensor's
 * actuation seams, closed over one single-gesture park slot. One handler set serves one workspace
 * composition — a pointer drives at most one drag per window (the tear-out choreography's
 * single-slot reasoning), so the slot never needs a map.
 * @param {Object} seams
 * @param {Function} seams.disposeVessel Host retirement seam:
 *     `({itemId, windowName}) => Boolean|Promise<Boolean>` — the ONE close path for a committed
 *     tear-in, routed to the host's reintegration close policy. Only strict `true` clears cleanup
 *     authority; refusal retains the slot for an exact retry.
 * @param {Function} seams.parkVessel Host park seam: `({itemId, windowName}) => Boolean|Promise<Boolean>` —
 *     the platform mechanic (hide, offscreen move, minimize — matrix-selected, the host's
 *     business). Only strict `true` publishes parked ownership; dispatch is never admission.
 * @param {Function} seams.reshowVessel Host re-show seam:
 *     `({itemId, rect, terminal, windowName}) => Boolean|Promise<Boolean>` — re-presents the SAME
 *     parked window at `rect`. `terminal` distinguishes a final restore from live pointer-follow
 *     resumption. A refusal retains the slot for retry; zero re-acquisition by construction.
 * @returns {Object} `{onConversionIn, onConversionOut, onGestureTerminal, onVesselRetired,
 *     parkedVessel, transition}` — sensor handlers, terminal/external-retirement routers,
 *     admitted slot, and in-flight phase
 */
export function createVesselParkHandlers({disposeVessel, parkVessel, reshowVessel} = {}) {
    if (typeof disposeVessel !== 'function' || typeof parkVessel !== 'function' || typeof reshowVessel !== 'function') {
        throw new Error(
            'createVesselParkHandlers: disposeVessel, parkVessel and reshowVessel are required function seams — ' +
            'the machine owns ordering, the host owns every platform effect'
        )
    }

    // Admitted ownership and generation-scoped effects stay separate: a Promise dispatch can
    // never publish parked/restored truth, and duplicate terminals share one settlement.
    let generation        = 0,
        parked            = null,
        parking           = null,
        pendingOut        = null,
        pendingRetirement = null,
        pendingTerminal   = null,
        reshowing         = null;

    /**
     * @summary Normalizes a synchronous host throw into strict refusal.
     * @param {Function} fn
     * @param {Object} data
     * @returns {*}
     */
    const callEffect = (fn, data) => {
        try {
            return fn(data)
        } catch {
            return false
        }
    };

    /**
     * @summary Converts sync or async host results into strict Boolean admission.
     * @param {*} value
     * @returns {Boolean|Promise<Boolean>}
     */
    const settleEffect = value => typeof value?.then === 'function'
        ? Promise.resolve(value).then(result => result === true, () => false)
        : value === true;

    /**
     * @summary Re-shows one admitted vessel without clearing ownership before strict success.
     * @param {Object} vessel
     * @param {Object|null} rect
     * @param {Boolean} [terminal=false]
     * @returns {Boolean|Promise<Boolean>}
     */
    const restore = (vessel, rect, terminal=false) => {
        if (reshowing) return reshowing.promise;

        const result = settleEffect(callEffect(reshowVessel, {
            itemId    : vessel.itemId,
            rect      : rect ?? vessel.preConversionRect,
            terminal,
            windowName: vessel.windowName
        }));

        if (typeof result?.then !== 'function') {
            result && parked === vessel && (parked = null);
            return result
        }

        const state = {generation: vessel.generation, phase: 'reshowing', promise: null, vessel};

        reshowing = state;
        state.promise = result.then(admitted => {
            if (reshowing !== state || state.generation !== vessel.generation) return false;

            admitted && parked === vessel && (parked = null);
            reshowing = null;

            return admitted
        });

        return state.promise
    };

    /**
     * @summary Applies one admitted vessel's exact-once committed or restorative disposition.
     * @param {Object} vessel
     * @param {Object} data
     * @param {Boolean} [compensate=false] Restore even when async invalidation withheld admission
     * @returns {Boolean|Promise<Boolean>}
     */
    const finishTerminal = (vessel, data, compensate=false) => {
        if (data.outcome === 'committed') {
            const disposed = settleEffect(callEffect(disposeVessel, {
                itemId: vessel.itemId, windowName: vessel.windowName
            }));

            if (typeof disposed?.then !== 'function') {
                disposed && parked === vessel && (parked = null);
                return disposed
            }

            return disposed.then(admitted => {
                admitted && parked === vessel && (parked = null);
                return admitted
            })
        }

        return parked === vessel || compensate
            ? restore(vessel, vessel.preConversionRect, true)
            : true
    };

    return {
        /**
         * The sensor converted the dragged vessel into a proxy: PARK the OS window — never close
         * it (the one-way activation door this module exists to remove). Records the vessel's
         * pre-conversion rect as the restore anchor. A convert-in while a slot is live is a stale
         * re-fire: ignored.
         * @param {Object} data
         * @param {String} data.itemId
         * @param {Object} [data.sourceRect] The vessel's live rect at the conversion moment —
         *     recorded as the restore/origin anchor
         * @param {String} data.windowName
         */
        onConversionIn(data) {
            if (parked || parking || reshowing || pendingRetirement || pendingTerminal) return false;

            let {itemId, sourceRect, windowName} = data,
                vessel                           = {itemId, preConversionRect: sourceRect ?? null, windowName},
                result                           = settleEffect(callEffect(parkVessel, {itemId, windowName}));

            Object.defineProperty(vessel, 'generation', {value: ++generation});

            if (typeof result?.then !== 'function') {
                result && (parked = vessel);
                return result
            }

            const state = {generation: vessel.generation, phase: 'parking', promise: null, vessel};

            parking = state;
            state.promise = result.then(admitted => {
                if (parking !== state || state.generation !== vessel.generation) return false;

                parking = null;
                admitted && (parked = vessel);

                return admitted
            });

            return state.promise
        },

        /**
         * The sensor reverted the conversion: RE-SHOW the same parked window. At the supplied live
         * rect when the out-event carries one (the popup resumes under the pointer); at the
         * recorded pre-conversion rect otherwise (origin semantics). No slot = stale event = no-op.
         * @param {Object} [data]
         * @param {Object} [data.rect] The live rect to resume at (the sensor's out-record
         *     `sourceRect` is the natural feed)
         */
        onConversionOut(data) {
            if (pendingRetirement) return pendingRetirement.promise;
            if (pendingTerminal) return false;
            if (pendingOut) return pendingOut.promise;
            if (reshowing) return reshowing.promise;

            if (parking) {
                const state = {generation: parking.generation, phase: 'queued-out', promise: null, vessel: parking.vessel};

                pendingOut = state;
                state.promise = parking.promise.then(admitted => admitted && !pendingRetirement
                    ? restore(state.vessel, data?.rect)
                    : !admitted
                ).then(restored => {
                    pendingOut === state && (pendingOut = null);
                    return restored
                });

                return state.promise
            }

            return parked ? restore(parked, data?.rect) : false
        },

        /**
         * The gesture resolved while the vessel is parked — the outcome machine's terminal routed
         * here decides the parked window's fate:
         * - `committed`: the target owns the item now — the ONE `disposeVessel` call fires (the
         *   host's close policy takes it from there). Duplicate terminals coalesce while close is
         *   pending; strict refusal retains the slot, and strict success clears it.
         * - anything else (cancel, reject, host-routed disconnect): RESTORE — re-show at the
         *   pre-conversion rect with zero disposition. The machine fails toward never losing the
         *   user's window.
         * A terminal for a different `itemId` than the parked one is stale: no-op.
         * @param {Object} data
         * @param {String} data.itemId
         * @param {String} data.outcome `'committed'` disposes; every other value restores
         */
        onGestureTerminal(data) {
            if (pendingRetirement) {
                return pendingRetirement.vessel.itemId === data.itemId
                    ? pendingRetirement.promise
                    : false
            }
            if (pendingTerminal) {
                return pendingTerminal.vessel.itemId === data.itemId
                    ? pendingTerminal.promise
                    : false
            }

            let vessel = parked ?? parking?.vessel ?? reshowing?.vessel;

            if (!vessel || vessel.itemId !== data.itemId) return false;

            if (parking || reshowing) {
                const prerequisite = parking?.promise ?? reshowing.promise,
                      state        = {generation: vessel.generation, phase: 'terminal', promise: null, vessel};

                pendingTerminal = state;
                state.promise = prerequisite.then(() => {
                    if (
                        pendingTerminal !== state || pendingRetirement ||
                        state.generation !== vessel.generation
                    ) return false;

                    // False-after-reset does not prove the native park move never happened: Main
                    // can observe the move, then invalidate pointer-follow before the worker sees
                    // its terminal. Always run the compensating disposition for this generation.
                    return finishTerminal(vessel, data, true)
                }).then(result => {
                    pendingTerminal === state && (pendingTerminal = null);
                    return result
                });

                return state.promise
            }

            const state = {generation: vessel.generation, phase: 'terminal', promise: null, vessel};

            pendingTerminal = state;

            const result = finishTerminal(vessel, data);

            if (typeof result?.then !== 'function') {
                pendingTerminal = null;
                return result
            }

            state.promise = Promise.resolve(result).then(admitted => {
                if (pendingTerminal !== state || state.generation !== vessel.generation) return false;

                pendingTerminal = null;
                return admitted
            }, () => {
                pendingTerminal === state && (pendingTerminal = null);
                return false
            });

            return state.promise
        },

        /**
         * @summary Forgets a vessel another owning lifecycle has already retired.
         *
         * A detached cancel is owned by the tear-out machine: it consumes and closes the same
         * empty source vessel. This clear-only seam invalidates every pending effect generation
         * so no late park/re-show completion can resurrect ownership after that external close.
         * @param {Object} data
         * @param {String} data.itemId
         * @param {Boolean|Promise<Boolean>} [data.retirement=true] Strict outer-lifecycle close
         * @returns {Boolean|Promise<Boolean>}
         */
        onVesselRetired({itemId, retirement=true} = {}) {
            if (pendingRetirement) {
                return pendingRetirement.vessel.itemId === itemId
                    ? pendingRetirement.promise
                    : false
            }

            const vessel = pendingTerminal?.vessel ?? pendingOut?.vessel ?? reshowing?.vessel
                ?? parking?.vessel ?? parked;

            if (!vessel || vessel.itemId !== itemId) return false;

            const clear = () => {
                generation++;
                parked          = null;
                parking         = null;
                pendingOut      = null;
                pendingRetirement = null;
                pendingTerminal = null;
                reshowing       = null;

                return true
            };

            if (typeof retirement?.then === 'function') {
                const state = {
                    generation: vessel.generation,
                    phase     : 'retiring',
                    promise   : null,
                    vessel
                };

                pendingRetirement = state;
                state.promise = Promise.resolve(retirement).then(retired => {
                    if (pendingRetirement !== state || state.generation !== vessel.generation) return false;

                    pendingRetirement = null;

                    return retired === true ? clear() : false
                }, () => {
                    pendingRetirement === state && (pendingRetirement = null);
                    return false
                });

                return state.promise
            }

            return retirement === true ? clear() : false
        },

        /**
         * @member {Object|null} parkedVessel
         */
        get parkedVessel() {
            return parked
        },

        /**
         * @member {Object|null} transition
         */
        get transition() {
            return pendingRetirement ?? pendingTerminal ?? pendingOut ?? reshowing ?? parking
        }
    }
}
