/**
 * @module Neo.dashboard.DockTearOut
 * @summary The tear-out gesture choreography a dock HOST composes — the admission chain and the
 * commit-at-terminal routing between the dock sort zone's gesture events and the host's own seams.
 *
 * {@link Neo.dashboard.DockTabSortZone} fires four tear-out gesture events (re-fired boundary
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
 * {@link Neo.dashboard.DockLayoutAdapter#project} (`onDockTearOutExit` / `Entry` / `Terminal` /
 * `Cancel`), closed over one single-gesture vessel slot. One handler set serves one workspace
 * composition — a pointer drives at most one drag per window, so the slot never needs a map.
 * @param {Object} seams
 * @param {Function} seams.applyOperation Host model seam: `({operation, itemId}) => {document, errors}` —
 *     the workspace's pure reducer (`applyDockZoneOperation`). Called exactly once per successful
 *     tear-out, with `{operation: 'detachItem', itemId}`.
 * @param {Function} seams.closeVessel Host vessel retirement: `({itemId, windowName}) => void|Promise` —
 *     closes the OS window a retired gesture leaves behind. Never called for a committed tear-out.
 * @param {Function} seams.onDocumentChange Host view-sync seam: `(document, operation) => void` —
 *     receives the committed post-detach document (the same seam shape the adapter's `moveTo`
 *     listener feeds).
 * @param {Function} seams.openVessel Host vessel acquisition:
 *     `({itemId, proxyRect, sortZone}) => Promise<{popupHeight, popupWidth, windowName}|null>` —
 *     the host performs the platform work (URL, geometry, `windowOpen`) and resolves FALSY on any
 *     failed admission (`windowOpen` returns a Boolean — a blocked popup never throws, so the host
 *     must check the Boolean, not catch).
 * @returns {Object} `{onDockTearOutCancel, onDockTearOutEntry, onDockTearOutExit, onDockTearOutTerminal}`
 */
export function createDockTearOutHandlers({applyOperation, closeVessel, onDocumentChange, openVessel}) {
    // The single-gesture vessel slot: `{itemId, windowName}` while a vessel is admitted, else null.
    let activeVessel = null;

    return {
        /**
         * Cancel while detached: the vessel retires, the document was never touched. The zone's
         * base cleanup owns the embodiment teardown (the drag is over), so unlike entry there is
         * no embodiment to resume.
         * @param {Object} data
         */
        onDockTearOutCancel(data) {
            let vessel = activeVessel;

            if (!vessel) return;

            activeVessel = null;
            closeVessel(vessel)
        },

        /**
         * The drag re-entered the source window past the reattach threshold: a resumed in-window
         * gesture, not an outcome. The vessel retires with zero model mutation and the zone
         * resumes its in-window embodiment.
         * @param {Object} data
         */
        onDockTearOutEntry(data) {
            let vessel = activeVessel;

            data.sortZone?.endWindowDrag();

            if (!vessel) return;

            activeVessel = null;
            closeVessel(vessel)
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
            if (activeVessel) return;

            let vessel = await openVessel({itemId: data.itemId, proxyRect: data.proxyRect, sortZone: data.sortZone});

            if (!vessel) {
                data.sortZone?.endWindowDrag();
                return
            }

            activeVessel = {itemId: data.itemId, windowName: vessel.windowName};

            data.sortZone?.startWindowDrag({
                dragData   : data,
                popupHeight: vessel.popupHeight,
                popupWidth : vessel.popupWidth,
                windowName : vessel.windowName
            })
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
            let vessel = activeVessel;

            if (!vessel || vessel.itemId !== data.itemId) return;

            activeVessel = null;

            let operation = {operation: 'detachItem', itemId: data.itemId},
                result;

            try {
                result = applyOperation(operation)
            } catch (error) {
                result = {document: null, errors: [`detachItem threw: ${error?.message || error}`]}
            }

            if (result && !result.errors?.length && result.document) {
                onDocumentChange(result.document, operation)
            } else {
                closeVessel(vessel)
            }
        }
    }
}
