/**
 * @module Neo.dashboard.dock.interaction.KeyboardCommands
 * @summary The keyboard command surface for the multi-window docking choreography — the a11y
 * parity path, and the always-works acquisition fallback (a keystroke IS a user activation, so
 * the command path acquires popups by definition where a platform's boundary-acquisition fails).
 *
 * The pointer path is a continuous gesture: {@link Neo.dashboard.dock.interaction.TabSortZone} fires boundary
 * hysteresis + detached terminals, and {@link Neo.dashboard.dock.window.TearOut} choreographs admission
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
 * closed over the host's seams. One command set serves one workspace composition. The detach
 * command is discrete and awaited (no slot); the transfer commands form a short EXPLICIT cycle
 * (start → next/prev → commit|cancel) over one cycle slot — the host routes arrow/Enter/Escape
 * to the cycle commands ONLY while a cycle is active, so outside a cycle those keys keep their
 * ordinary meaning.
 * @param {Object} seams
 * @param {Function} seams.announce Host announcement seam: `({command, itemId, terminal, focusTransferred, message}) => void` —
 *     renders to the composition's `aria-live` region. The `message` is a complete default
 *     sentence; hosts localize by composing their own seam.
 * @param {Function} seams.applyOperation Host model seam: `({operation, itemId}) => {document, errors}` —
 *     the workspace's pure reducer (`applyDockZoneOperation`). Called exactly once per admitted command.
 * @param {Function} seams.closeVessel Host vessel retirement: `({itemId, windowName}) => void|Promise` —
 *     closes the OS window a refused commit leaves behind. Never called for a committed detach.
 * @param {Function} seams.commitTransfer Host transfer seam:
 *     `({itemId, target: {workspaceId, tabsId}}) => {errors: String[]}|Promise<{errors: String[]}>` —
 *     the host runs `DockZoneModel.transferItem` (commit-or-neither document pair) and lands the
 *     pair through its workspace set's both-or-neither adoption. Called exactly once per commit
 *     and AWAITED to settlement — a rejection or a malformed result is treated as a refusal.
 * @param {Function} seams.enumerateTargets Host target enumeration: `({itemId}) => Object[]` —
 *     `[{workspaceId, tabsId, label}]` in a STABLE order (the workspace set's registry order),
 *     excluding the item's current tabs. Empty = no legal targets (announced, fail-closed).
 * @param {Function} seams.focusVessel Host focus seam: `({itemId, windowName}) => Boolean|Promise<Boolean>` —
 *     transfers focus into the vessel window; answers `false` when the platform declines (never throws).
 * @param {Function} seams.focusWorkspace Host workspace-focus seam: `({workspaceId}) => Boolean|Promise<Boolean>` —
 *     transfers focus to the window rendering `workspaceId` after a committed transfer; the same
 *     Boolean-admission discipline as `focusVessel`.
 * @param {Function} seams.highlightTarget Host affordance seam: `(target|null) => void` — renders the
 *     current cycle candidate through the shared drag-affordance consumer (`null` clears). The
 *     highlight must pair hue with a non-color carrier — the seam owner's WCAG 1.4.1 duty.
 * @param {Function} seams.onDocumentChange Host view-sync seam: `(document, operation) => void` —
 *     receives the committed post-detach document (the adapter's `moveTo` listener seam shape).
 * @param {Function} seams.openVessel Host vessel acquisition:
 *     `({itemId, proxyRect, sortZone}) => Promise<{popupHeight, popupWidth, windowName}|null>` —
 *     the SAME seam shape the pointer path injects; the keyboard path passes `proxyRect: null` and
 *     `sortZone: null`, so one host implementation serves both paths without branching.
 * @returns {Object} `{cycleCancel, cycleCommit, cycleNext, cyclePrev, cycleStart, detachItem, getActiveCycle}`
 */
export function createDockKeyboardCommands({
    announce,
    applyOperation,
    closeVessel,
    commitTransfer,
    enumerateTargets,
    focusVessel,
    focusWorkspace,
    highlightTarget,
    onDocumentChange,
    openVessel
}) {
    // The single cycle slot: {itemId, label, candidates, index, instructions} while a target
    // cycle is active, else null — one keyboard drives at most one transfer cycle per composition.
    let activeCycle = null;

    const announceCandidate = () => {
        const
            {candidates, index, instructions, label} = activeCycle,
            target                                   = candidates[index];

        highlightTarget(target);
        announce({
            command         : 'transfer',
            focusTransferred: false,
            itemId          : activeCycle.itemId,
            message         : `Target ${index + 1} of ${candidates.length}: ${target.label}. `
                + (instructions || `Arrow keys cycle, Enter moves ${label}, Escape cancels.`),
            terminal        : 'HOVERING_CLAIM'
        })
    };

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
                // retirement carries the ITEM identity, not just the window's: the host's vessel
                // bookkeeping (e.g. connect-race entries) is keyed by itemId, and a retirement
                // that names only the window leaves that entry stale
                closeVessel({itemId, ...vessel});
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
        },

        /**
         * @summary Begin the target cycle for a transfer (or the return home — the same command
         * aimed at the main workspace): enumerate the legal targets, highlight the first, and
         * announce the cycle grammar. No targets = fail-closed AND announced.
         * @param {Object} data
         * @param {String} data.itemId The focused dock item's durable id.
         * @param {String} [data.itemLabel] Human label for announcements; falls back to the id.
         * @param {String} [data.instructions] Host-owned key-grammar sentence appended to every
         *     candidate announcement — the HOST binds the keys, so the host states them; the
         *     default names the bare-key grammar.
         * @returns {Object|null} `{terminal: 'HOVERING_CLAIM', candidates: Number}` or a REJECTED outcome.
         */
        cycleStart({instructions, itemId, itemLabel}) {
            const
                label      = itemLabel ?? itemId,
                candidates = enumerateTargets({itemId}) || [];

            if (!candidates.length) {
                announce({
                    command         : 'transfer',
                    focusTransferred: false,
                    itemId,
                    message         : `No transfer targets available. ${label} stays where it is.`,
                    terminal        : 'REJECTED'
                });
                return {candidates: 0, itemId, terminal: 'REJECTED'}
            }

            activeCycle = {candidates, index: 0, instructions, itemId, label};
            announceCandidate();

            return {candidates: candidates.length, itemId, terminal: 'HOVERING_CLAIM'}
        },

        /**
         * @summary Advance the cycle to the next candidate (wrap-around). The host routes arrow
         * keys here ONLY while a cycle is active — outside one, this is a guarded no-op.
         */
        cycleNext() {
            if (!activeCycle) return;

            activeCycle.index = (activeCycle.index + 1) % activeCycle.candidates.length;
            announceCandidate()
        },

        /**
         * @summary Step the cycle to the previous candidate (wrap-around). Guarded like {@link #cycleNext}.
         */
        cyclePrev() {
            if (!activeCycle) return;

            activeCycle.index = (activeCycle.index - 1 + activeCycle.candidates.length) % activeCycle.candidates.length;
            announceCandidate()
        },

        /**
         * @summary Commit the transfer to the current candidate — exactly one `commitTransfer`
         * (the host's commit-or-neither pair adoption), AWAITED TO SETTLEMENT: hosts commit
         * async document pairs, and success may only be announced (and focus moved) after the
         * pair actually landed. Returned errors, a rejection/throw, or a missing/malformed
         * result all land on the REJECTED path — an unproven commit is a refused one. The
         * highlight clears either way; the terminal says which.
         * @returns {Promise<Object|undefined>} The outcome, or `undefined` outside an active cycle.
         */
        async cycleCommit() {
            if (!activeCycle) return;

            const
                {itemId, label} = activeCycle,
                target          = activeCycle.candidates[activeCycle.index];

            activeCycle = null;
            highlightTarget(null);

            let result;

            try {
                // AWAITED to settlement: the first real host commits an async document pair —
                // announcing success before it settles would green-light a commit the workspace
                // may still refuse (a rejection/throw lands on the refusal path)
                result = await commitTransfer({itemId, target: {tabsId: target.tabsId, workspaceId: target.workspaceId}})
            } catch (error) {
                result = {errors: [`commitTransfer threw: ${error?.message || error}`]}
            }

            // shape validation IS the fail-close: a host answering undefined/null/non-object has
            // not proven a settled commit, and an unproven commit is a refused one
            if (!result || !Array.isArray(result.errors)) {
                result = {errors: ['commitTransfer answered without a settled result shape']}
            }

            if (result.errors.length) {
                announce({
                    command         : 'transfer',
                    focusTransferred: false,
                    itemId,
                    message         : `Move rejected by the workspace. ${label} stays where it is.`,
                    terminal        : 'REJECTED'
                });
                return {focusTransferred: false, itemId, terminal: 'REJECTED'}
            }

            const focusTransferred = !!(await focusWorkspace({workspaceId: target.workspaceId}));

            announce({
                command: 'transfer',
                focusTransferred,
                itemId,
                message: focusTransferred
                    ? `${label} moved to ${target.label}. Focus moved with it.`
                    : `${label} moved to ${target.label}. Focus stayed here: the platform declined the transfer.`,
                terminal: 'COMMITTED_TARGET'
            });

            return {focusTransferred, itemId, target, terminal: 'COMMITTED_TARGET'}
        },

        /**
         * @summary Cancel the cycle: zero model mutation, the highlight cleared, the cancellation
         * announced — the outcome machine's CANCELLED terminal, keyboard leg.
         * @returns {Object|undefined} The outcome, or `undefined` outside an active cycle.
         */
        cycleCancel() {
            if (!activeCycle) return;

            const {itemId, label} = activeCycle;

            activeCycle = null;
            highlightTarget(null);

            announce({
                command         : 'transfer',
                focusTransferred: false,
                itemId,
                message         : `Move cancelled. ${label} stays where it is.`,
                terminal        : 'CANCELLED'
            });

            return {itemId, terminal: 'CANCELLED'}
        },

        /**
         * @summary The active cycle's read-only state — `{itemId, index, count}` or `null`. The
         * host's key-routing gate: route arrows/Enter/Escape to the cycle ONLY while non-null.
         * @returns {Object|null}
         */
        getActiveCycle() {
            return activeCycle && {count: activeCycle.candidates.length, index: activeCycle.index, itemId: activeCycle.itemId}
        }
    }
}
