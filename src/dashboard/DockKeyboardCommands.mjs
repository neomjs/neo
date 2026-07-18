/**
 * @module Neo.dashboard.DockKeyboardCommands
 * @summary The keyboard command surface for the multi-window docking choreography — the a11y
 * parity path, and the always-works acquisition fallback (a keystroke IS a user activation, so
 * the command path acquires popups by definition where a platform's boundary-acquisition fails).
 *
 * The pointer path is a continuous gesture: {@link Neo.dashboard.DockTabSortZone} fires boundary
 * hysteresis + detached terminals, and {@link Neo.dashboard.DockTearOut} choreographs admission
 * and the one model commit. A keyboard command is DISCRETE — no boundary hysteresis, no moving
 * embodiment — so the gesture phases collapse into admission-first → exactly-once model commit →
 * focus transfer, and EVERY terminal derives an announcement. This module owns exactly that
 * collapsed machine, over the SAME host seam shapes the tear-out choreography uses plus the two
 * keyboard-specific ones (`focusVessel`, `announce`): a pure decision machine the host
 * parameterizes, witnesses drive without a browser, and consumers (workstation, agentos) compose
 * without private registries or vessel state.
 *
 * The choreography contract (the docking design record's multi-window amendment, keyboard leg):
 * - **Admission is fail-closed and ANNOUNCED.** `openVessel` resolving falsy (blocked popup,
 *   bounded connect timeout, host refusal) degrades IN PLACE: focus stays where it is, nothing
 *   mutates, and the degraded state is announced — a silent no-op keystroke is indistinguishable
 *   from a broken one, which is precisely the failure a11y parity exists to prevent.
 * - **The model commits exactly once, after admission.** A model refusal retires the vessel (no
 *   window may survive showing an item the document still owns) and announces the rejection. A
 *   THROWING reducer lands on the same refusal path — an uncaught throw would orphan the vessel.
 * - **Focus-transfer denial is a TERMINAL, not an exception.** `focusVessel` answers a Boolean —
 *   the `windowOpen` admission discipline applied to focus. A denied transfer keeps the item
 *   committed, keeps focus in the source window, and announces the degraded arrival — never a
 *   silent focus limbo between two windows.
 * - **Announcements derive from outcome terminals, never from keystrokes** — what is announced
 *   can never diverge from what the model actually committed.
 */

/**
 * @summary Creates the keyboard command set a dock composition threads into its key handlers,
 * closed over the host's seams. One command set serves one workspace composition — commands are
 * discrete and awaited, so no gesture slot is needed.
 * @param {Object} seams
 * @param {Function} seams.announce Host announcement seam: `({command, itemId, terminal, focusTransferred, message}) => void` —
 *     renders to the composition's `aria-live` region. The `message` is a complete default
 *     sentence; hosts localize by composing their own seam.
 * @param {Function} seams.applyOperation Host model seam: `({operation, itemId}) => {document, errors}` —
 *     the workspace's pure reducer (`applyDockZoneOperation`). Called exactly once per admitted command.
 * @param {Function} seams.closeVessel Host vessel retirement: `({itemId, windowName}) => void|Promise` —
 *     closes the OS window a refused commit leaves behind. Never called for a committed detach.
 * @param {Function} seams.focusVessel Host focus seam: `({itemId, windowName}) => Boolean|Promise<Boolean>` —
 *     transfers focus into the vessel window; answers `false` when the platform declines (never throws).
 * @param {Function} seams.onDocumentChange Host view-sync seam: `(document, operation) => void` —
 *     receives the committed post-detach document (the adapter's `moveTo` listener seam shape).
 * @param {Function} seams.openVessel Host vessel acquisition:
 *     `({itemId, proxyRect, sortZone}) => Promise<{popupHeight, popupWidth, windowName}|null>` —
 *     the SAME seam shape the pointer path injects; the keyboard path passes `proxyRect: null` and
 *     `sortZone: null`, so one host implementation serves both paths without branching.
 * @returns {Object} `{detachItem}`
 */
export function createDockKeyboardCommands({announce, applyOperation, closeVessel, focusVessel, onDocumentChange, openVessel}) {
    return {
        /**
         * @summary Detach a focused dock item to its own OS popup window — the discrete command
         * twin of the pointer tear-out: admission-first, exactly-once commit, focus transfer,
         * every terminal announced.
         * @param {Object} data
         * @param {String} data.itemId The focused dock item's durable id.
         * @param {String} [data.itemLabel] Human label for announcements; falls back to the id.
         * @returns {Promise<{terminal: String, itemId: String, focusTransferred: Boolean, windowName: (String|undefined)}>} `windowName` only on a committed detach.
         */
        async detachItem({itemId, itemLabel}) {
            const label = itemLabel ?? itemId;

            // admission-first, fail-closed: the host performs the platform work (URL, geometry,
            // Boolean windowOpen) — falsy means blocked/refused, and the command degrades IN PLACE
            const vessel = await openVessel({itemId, proxyRect: null, sortZone: null});

            if (!vessel) {
                announce({
                    command         : 'detach',
                    focusTransferred: false,
                    itemId,
                    message         : `Detach unavailable: the popup window was not admitted. ${label} stays docked.`,
                    terminal        : 'REJECTED'
                });
                return {focusTransferred: false, itemId, terminal: 'REJECTED'}
            }

            const operation = {operation: 'detachItem', itemId};
            let   result;

            try {
                result = applyOperation(operation)
            } catch (error) {
                // a throwing reducer is a host bug, but it must land on the refusal path — an
                // uncaught throw here would skip the retirement and orphan the vessel
                result = {document: null, errors: [`detachItem threw: ${error?.message || error}`]}
            }

            if (!result || result.errors?.length || !result.document) {
                closeVessel(vessel);
                announce({
                    command         : 'detach',
                    focusTransferred: false,
                    itemId,
                    message         : `Detach rejected by the workspace. ${label} stays docked.`,
                    terminal        : 'REJECTED'
                });
                return {focusTransferred: false, itemId, terminal: 'REJECTED'}
            }

            // the model committed — the vessel owns the item now; sync the view BEFORE the focus
            // hop so the arriving window already renders the committed truth
            onDocumentChange(result.document, operation);

            // focus-transfer denial is a TERMINAL, not an exception: Boolean admission, announced
            const focusTransferred = !!(await focusVessel(vessel));

            announce({
                command: 'detach',
                focusTransferred,
                itemId,
                message: focusTransferred
                    ? `${label} detached to its own window. Focus moved with it.`
                    : `${label} detached to its own window. Focus stayed here: the platform declined the transfer.`,
                terminal: 'COMMITTED_TARGET'
            });

            return {focusTransferred, itemId, terminal: 'COMMITTED_TARGET', windowName: vessel.windowName}
        }
    }
}
