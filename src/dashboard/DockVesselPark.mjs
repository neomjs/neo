/**
 * @module Neo.dashboard.DockVesselPark
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
 *   ({@link Neo.dashboard.DockVesselConversion}); the gesture terminals belong to the outcome
 *   machine; the reintegration close POLICY belongs to the host behind the dispose seam. This
 *   machine owns the ordering between them: convert-in → park; convert-out → re-show; terminal →
 *   dispose (commit) or restore (everything else).
 * - **Commit is the ONLY disposition.** A committed target owns the item now, so the parked vessel
 *   retires through the host's one `disposeVessel` call — exactly once, slot-cleared-first, so a
 *   duplicate terminal (stale event) disposes nothing further. EVERY other outcome — cancel,
 *   reject, or any terminal the host routes while parked — fails toward RESTORE: the machine never
 *   loses the user's window to a lifecycle edge.
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
 * @param {Function} seams.disposeVessel Host retirement seam: `({itemId, windowName}) => void|Promise` —
 *     the ONE close path for a committed tear-in, routed to the host's reintegration close policy.
 *     Called exactly once per commit, never for any other outcome.
 * @param {Function} seams.parkVessel Host park seam: `({itemId, windowName}) => void|Promise` — the
 *     platform mechanic (hide, offscreen move, minimize — matrix-selected, the host's business).
 *     Parking is a render-target effect: it must never close the window or touch model documents.
 * @param {Function} seams.reshowVessel Host re-show seam: `({itemId, rect, windowName}) => void|Promise` —
 *     re-presents the SAME parked window at `rect`. Zero re-acquisition: the machine guarantees
 *     `windowName` is the one it parked.
 * @returns {Object} `{onConversionIn, onConversionOut, onGestureTerminal, parkedVessel}` — the two
 *     sensor-driven handlers, the terminal router, and the read-only park-slot view
 */
export function createVesselParkHandlers({disposeVessel, parkVessel, reshowVessel} = {}) {
    if (typeof disposeVessel !== 'function' || typeof parkVessel !== 'function' || typeof reshowVessel !== 'function') {
        throw new Error(
            'createVesselParkHandlers: disposeVessel, parkVessel and reshowVessel are required function seams — ' +
            'the machine owns ordering, the host owns every platform effect'
        )
    }

    // The single-gesture park slot: `{itemId, preConversionRect, windowName}` while parked, else null.
    let parked = null;

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
            if (parked) return;

            let {itemId, sourceRect, windowName} = data;

            parked = {itemId, preConversionRect: sourceRect ?? null, windowName};

            parkVessel({itemId, windowName})
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
            let vessel = parked;

            if (!vessel) return;

            parked = null;

            reshowVessel({
                itemId    : vessel.itemId,
                rect      : data?.rect ?? vessel.preConversionRect,
                windowName: vessel.windowName
            })
        },

        /**
         * The gesture resolved while the vessel is parked — the outcome machine's terminal routed
         * here decides the parked window's fate:
         * - `committed`: the target owns the item now — the ONE `disposeVessel` call fires (the
         *   host's close policy takes it from there). Slot cleared first: a duplicate terminal
         *   disposes nothing further.
         * - anything else (cancel, reject, host-routed disconnect): RESTORE — re-show at the
         *   pre-conversion rect with zero disposition. The machine fails toward never losing the
         *   user's window.
         * A terminal for a different `itemId` than the parked one is stale: no-op.
         * @param {Object} data
         * @param {String} data.itemId
         * @param {String} data.outcome `'committed'` disposes; every other value restores
         */
        onGestureTerminal(data) {
            let vessel = parked;

            if (!vessel || vessel.itemId !== data.itemId) return;

            parked = null;

            if (data.outcome === 'committed') {
                disposeVessel({itemId: vessel.itemId, windowName: vessel.windowName})
            } else {
                reshowVessel({
                    itemId    : vessel.itemId,
                    rect      : vessel.preConversionRect,
                    windowName: vessel.windowName
                })
            }
        },

        /**
         * @member {Object|null} parkedVessel
         */
        get parkedVessel() {
            return parked
        }
    }
}
