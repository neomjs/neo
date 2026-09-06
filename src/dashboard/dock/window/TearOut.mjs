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
 *     `({gestureToken, itemId, proxyRect, sortZone}) => Promise<{generationToken, popupHeight,
 *     popupWidth, windowName, workspaceKey}|null>` —
 *     the host performs the platform work (URL, geometry, `windowOpen`) and resolves FALSY on any
 *     failed admission (`windowOpen` returns a Boolean — a blocked popup never throws, so the host
 *     must check the Boolean, not catch).
 *
 * The pane-handoff seams below carry the live-component half. Every one of them is host-supplied
 * for the same reason the four above are: this module resolves, reparents and destroys nothing
 * itself, so it keeps zero imports and every witness drives it without a browser.
 * @param {Function} seams.awaitRefresh Host settle seam: `() => Promise<void>` — resolves when the
 *     host's projection has applied the document this machine just committed. Rejection means the
 *     return did not render, which is a failed reintegration, not a thrown gesture.
 * @param {Function} seams.commitReturn Host return commit: `(document) => void` — publishes a
 *     RETURNED document. Deliberately NOT `onDocumentChange`: that seam carries the detach
 *     operation and the vessel generation, and a return has neither. Routing a return through it
 *     would hand the host's zone-change path an operation and a source the return never had.
 * @param {Function} seams.findContainingTabsId Host document query:
 *     `(document, itemId) => String|null` — the tabs node currently holding an item, or null when
 *     the tree does not hold it. Supplied rather than imported: `model/WorkspaceDocument` is the
 *     only thing this choreography would otherwise need, and one import would cost the property
 *     that lets every witness drive it without a browser.
 * @param {Function} seams.getDocument Host document read: `() => Object|null` — the committed dock
 *     document a return resolves its semantic home against.
 * @param {Function} seams.onAdoptionFailed Host report seam:
 *     `({entry, itemId, pane, reintegrated}) => void` — an admitted connection that could not embody
 *     its live pane, after the compensating return resolved. `reintegrated` separates the
 *     recoverable case from the one worth alarming on.
 * @param {Function} seams.onPaneAdopted Host vessel-ownership write:
 *     `(itemId, entry|null) => void` — `entry` records post-terminal vessel ownership, `null`
 *     withdraws it. Vessel bookkeeping stays with the host deliberately: `window/Participation` and
 *     the admission/retirement paths read it, and that lifecycle is a different owner's leaf.
 * @param {Function} seams.onPaneReturn Host return observation:
 *     `({error, errors, itemId, pane, phase, returned}) => void` — `phase` is `'before'` or
 *     `'after'`. The one channel a consumer listens on to observe a pane coming home.
 * @param {Function} seams.reparentPane Host render-topology move:
 *     `(pane, target, itemId) => Boolean` — moves one live pane into the target window's view
 *     without changing document truth. `false` means the pane did not arrive. `itemId` travels with
 *     the pane because a host that staged the move already (a vessel embodiment) answers by
 *     identity, not by component reference.
 * @param {Function} seams.resolveReturnDescriptor Host return POLICY:
 *     `(document, itemId, placement|null) => Object|null` — the reducer descriptor that brings an
 *     item home, or null when nothing can. The choreography owns WHEN a return happens; WHERE it
 *     lands when the recorded home is gone is a product decision and stays with the host.
 *     `Operations.restoreTab` MINTS a node at the remembered parent/slot, which is right for a host
 *     that wants the exact position back and wrong for one whose contract is "never resurrect a
 *     node" — both shipped consumers hold the second contract, which is why both carried their own
 *     return before this seam existed.
 * @param {Function} seams.resolvePane Host pane resolution: `(itemId) => Neo.component.Base|null` —
 *     the live pane a vessel should embody. The stand-in exclusion that used to live here folded
 *     into the host's own resolver, which is the only place that knows what a pane is.
 * @param {Function} seams.settlePane Host pane teardown: `(pane) => void` — destroys a live pane
 *     only when no semantic home can own it.
 * @returns {Object} `{activeVessel, adoptPane, capturePane, forgetPlacement, onDockTearOutCancel,
 *     onDockTearOutEntry, onDockTearOutExit, onDockTearOutTerminal, onVesselRetired, recordPlacement,
 *     reintegrateItem, releasePane, retireActiveVessel, retirePaneState, takeReturningPane,
 *     updateAdoptedPane}`
 */
export function createDockTearOutHandlers({
    applyOperation, awaitRefresh, closeVessel, commitReturn, findContainingTabsId, getDocument,
    onAdoptionFailed, onDocumentChange, onPaneAdopted, onPaneReturn, openVessel, reparentPane,
    resolvePane, resolveReturnDescriptor, settlePane
}) {
    // The admitted slot is deliberately separate from provisional acquisition and cleanup-only
    // late authority. A terminal can invalidate an in-flight host Promise before it settles; its
    // result may then be retired, but can never become active/committable for a dead gesture.
    let activeVessel        = null,
        admissionGeneration = 0,
        lateVessel          = null,
        pendingAdmission    = null,
        retirement          = null;

    // The pane-handoff state. It lives in this closure for the same reason the vessel slot does:
    // it is gesture bookkeeping, and a host that holds it has to be told when to clear it.
    //   paneHandles — the live pane captured BEFORE detach re-projection can retire it;
    //   placements  — the exact semantic home a return restores into;
    //   returning   — a pane in flight home, which the host's resolver must prefer over a fresh build.
    let paneHandles = {},
        placements  = {},
        returning   = {};

    /**
     * @summary Creates the exact vessel identity without widening its enumerable public payload.
     * @param {String} itemId
     * @param {Object} vessel
     * @param {Number} fallbackToken The gesture's own correlation id, when the host did not echo it.
     * @returns {Object}
     */
    const createVesselIdentity = (itemId, vessel, fallbackToken) => {
        const identity = {itemId, windowName: vessel.windowName},
              token    = Number.isFinite(vessel.gestureToken) ? vessel.gestureToken : fallbackToken;

        // The slot and its lineage token, when the host's admission carries them: a retirement that
        // presents a superseded token then names a vessel this machine no longer holds.
        vessel.generationToken !== undefined && (identity.generationToken = vessel.generationToken);
        vessel.workspaceKey    !== undefined && (identity.workspaceKey    = vessel.workspaceKey);

        // The gesture pair's own correlation id, echoed unread by the host — never part of the public payload.
        Object.defineProperty(identity, 'gestureToken', {value: token});

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

    /**
     * @summary The live pane for one item: the captured handle first, the host's resolver second.
     *
     * Handle-first is what makes adoption work at all. The sequence is capture → re-project → adopt:
     * the capture stores the pane while it is still in the tree, the detach re-projection then
     * removes it, and adoption runs afterwards. A resolver-only lookup therefore succeeds at capture
     * and returns null at the exact moment it matters.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     */
    const livePane = itemId => {
        const held = paneHandles[itemId];

        if (held && !held.isDestroyed) return held;

        return resolvePane(itemId) || null
    };

    // Named, not `this`: two hosts SPREAD this bundle into a projection context
    // (`dock/Workspace#getDockProjectionOptions`, `DemoBWorkspace`), and a spread rebinds `this` to
    // the copy. Every internal call therefore goes through the closure reference, which survives it.
    const api = {
        /**
         * @member {Object|null} activeVessel
         */
        get activeVessel() {
            return activeVessel
        },

        /**
         * @summary Captures the host-resolved live pane before detach re-projection can retire it.
         * @param {String} itemId
         * @returns {Boolean} Whether a live pane was held.
         */
        capturePane(itemId) {
            const pane = livePane(itemId);

            if (!pane || pane.isDestroyed) return false;

            paneHandles[itemId] = pane;

            return true
        },

        /**
         * @summary The pane adoption WOULD use for one item — the held handle, else the host's.
         *
         * Reads without consuming, so asking the question cannot change the answer.
         * @param {String} itemId
         * @returns {Neo.component.Base|null}
         */
        peekPane(itemId) {
            return livePane(itemId)
        },

        /**
         * @summary ONLY the captured handle — never the host's resolver.
         *
         * The distinction matters: {@link #peekPane} answers "what would adoption use", which falls
         * through to the tree. This answers "is a handle actually held", and a caller asking whether
         * capture happened must not be told yes by a pane that was merely findable.
         * @param {String} itemId
         * @returns {Neo.component.Base|null}
         */
        heldPane(itemId) {
            return paneHandles[itemId] || null
        },

        /**
         * @summary Releases one held pane handle for return, without retaining a second owner.
         * @param {String} itemId
         * @returns {Neo.component.Base|null}
         */
        releasePane(itemId) {
            const pane = paneHandles[itemId] || null;

            delete paneHandles[itemId];

            return pane
        },

        /**
         * @summary Records the exact semantic home a return restores into.
         * @param {String} itemId
         * @param {Object} placement `{tabsNodeId, index}` captured before the detach applies.
         * @returns {void}
         */
        recordPlacement(itemId, placement) {
            placement && (placements[itemId] = placement)
        },

        /**
         * @summary Drops a recorded home — a refused detach never earned one.
         * @param {String} itemId
         * @returns {void}
         */
        forgetPlacement(itemId) {
            delete placements[itemId]
        },

        /**
         * @summary Every recorded home, as a plain copy.
         *
         * A GETTER rather than a method on purpose: the end-to-end witnesses read lifecycle state by
         * property path (`tearOutHandlers.placements`, exactly as they already read
         * `tearOutHandlers.activeVessel`), so this keeps the closure observable without the host
         * carrying an accessor for state it no longer owns.
         * @member {Object} placements
         */
        get placements() {
            return {...placements}
        },

        /**
         * @summary Reads a recorded home WITHOUT consuming it.
         *
         * Hosts render the stored home in their own affordances — a return-here hint, a preview
         * target — and reading must not disturb the record the actual return depends on.
         * @param {String} itemId
         * @returns {Object|null}
         */
        peekPlacement(itemId) {
            return placements[itemId] || null
        },

        /**
         * @summary Hands one in-flight returning pane to the host's resolver, exactly once.
         *
         * The host's projection asks for this while rebuilding: a pane coming home must be reused,
         * never rebuilt, or the return silently swaps the user's live component for a fresh one.
         * @param {String} itemId
         * @returns {Neo.component.Base|null}
         */
        takeReturningPane(itemId) {
            const pane = returning[itemId] || null;

            pane && delete returning[itemId];

            return pane
        },

        /**
         * @summary Every live pane this machine still holds — the host's teardown sweep reads it.
         * @returns {Neo.component.Base[]}
         */
        heldPanes() {
            return [...Object.values(returning), ...Object.values(paneHandles)]
        },

        /**
         * @summary Item ids with a captured handle, for the host's own projection bookkeeping.
         * @returns {String[]}
         */
        heldPaneIds() {
            return Object.keys(paneHandles)
        },

        /**
         * @summary Promotes one committed item into post-terminal vessel ownership.
         *
         * The host writes the ownership record through {@link seams.onPaneAdopted} and clears its own
         * admission bookkeeping in the same call — the connection is consumed here, so nothing may
         * observe it afterwards. A connection that cannot embody its pane compensates and throws:
         * the caller is an event listener, and a silent failure here is a window that opened, took
         * the pane and died with the pane still inside it.
         * @param {String} itemId
         * @param {Object} [vessel={}]
         * @param {Object|null} [connection=null] The admitted window connection, when one bound.
         * @returns {void}
         */
        adoptPane(itemId, vessel={}, connection=null) {
            const entry = {
                generation     : vessel.generation      ?? connection?.generation      ?? null,
                generationToken: vessel.generationToken ?? connection?.generationToken ?? null,
                gestureToken   : vessel.gestureToken    ?? connection?.gestureToken    ?? null,
                windowId       : connection?.windowId ?? null,
                windowName     : vessel.windowName || connection?.windowName || `tearout-${itemId}`,
                workspaceKey   : vessel.workspaceKey ?? connection?.workspaceKey ?? null
            };

            onPaneAdopted(itemId, entry, connection);

            if (connection) {
                const pane = livePane(itemId);

                if (!pane || pane.isDestroyed || !reparentPane(pane, connection, itemId)) {
                    api.compensateFailedAdoption(itemId, entry);
                    throw new Error(`Dock tear-out: pane "${itemId}" could not enter its admitted vessel`)
                }

                // MERGE, never replace: a replace re-derives the record from `entry` alone, which
                // silently drops the `windowId` the connection just supplied.
                onPaneAdopted(itemId, connection, null, true)
            }
        },

        /**
         * @summary Folds a later-arriving window binding into an existing ownership record.
         * @param {String} itemId
         * @param {Object} target
         * @returns {void}
         */
        updateAdoptedPane(itemId, target) {
            target && onPaneAdopted(itemId, target, null, true)
        },

        /**
         * @summary Moves an ALREADY-adopted item's live pane into a window that bound afterwards.
         *
         * The connect-race partner of {@link #adoptPane}: the terminal adopted with no connection,
         * and the window bound later. Same decision, different arrival order — so it lives here
         * rather than being re-derived by every host that can hit the race.
         * @param {String} itemId
         * @param {Object} connection
         * @returns {Boolean} Whether the pane arrived.
         */
        reparentAdopted(itemId, connection) {
            const pane = livePane(itemId);

            if (!pane || pane.isDestroyed || !reparentPane(pane, connection, itemId)) return false;

            onPaneAdopted(itemId, connection, null, true);

            return true
        },

        /**
         * @summary Compensates an admitted connection that cannot embody its live pane.
         *
         * Returns the reporting promise. Both callers throw immediately after and ignore it, but the
         * compensation's own completion is otherwise unobservable — and an outcome nothing can await
         * is an outcome nothing can assert.
         *
         * The vessel retires through this machine's OWN retirement rather than back out through the
         * host: the slot being cleared is the one held here, so the round-trip the extraction removed
         * was never carrying information.
         * @param {String} itemId
         * @param {Object} [entry={}]
         * @returns {Promise<void>}
         */
        compensateFailedAdoption(itemId, entry={}) {
            const pane   = api.releasePane(itemId),
                  vessel = {...entry, itemId};

            onPaneAdopted(itemId, null);

            Promise.resolve(retireVessel(vessel)).then(closed => {
                closed && api.onVesselRetired(vessel)
            });

            // The report waits for the return to actually resolve. Reading a pane HANDLE instead
            // would answer a different question — one that is true in exactly the case worth
            // alarming on, since a failed adoption is precisely when a pane was held and could
            // still fail to come home.
            return Promise.resolve(api.reintegrateItem(itemId, pane)).then(reintegrated => {
                onAdoptionFailed({entry, itemId, pane, reintegrated})
            })
        },

        /**
         * @summary Returns a dead vessel's item to its exact semantic position and same live pane.
         * @param {String} itemId
         * @param {Neo.component.Base|null} pane
         * @returns {Promise<Boolean>}
         */
        async reintegrateItem(itemId, pane) {
            const document  = getDocument(),
                  placement = placements[itemId] || null,
                  live      = Boolean(pane && !pane.isDestroyed);

            let result;

            delete placements[itemId];

            // WHERE the item lands is the host's policy — see `resolveReturnDescriptor`. Asking
            // before the guard below means a host that can find no home says so once, here, rather
            // than by returning a descriptor the reducer then refuses.
            const descriptor = document ? resolveReturnDescriptor(document, itemId, placement) : null;

            if (!document?.items?.[itemId] || !descriptor) {
                settlePane(pane);
                onPaneReturn({itemId, pane, phase: 'after', returned: false});
                return false
            }

            if (live) {
                pane.parent?.remove(pane, false);
                returning[itemId] = pane
            }

            onPaneReturn({itemId, pane, phase: 'before'});

            /**
             * @summary Awaits the host projection, reporting the settle as the return's outcome.
             * @param {Object} nextDocument
             * @returns {Promise<Boolean>}
             */
            const settle = async nextDocument => {
                commitReturn(nextDocument);

                try {
                    await awaitRefresh();
                    onPaneReturn({itemId, pane, phase: 'after', returned: true});
                    return true
                } catch (error) {
                    onPaneReturn({error, itemId, pane, phase: 'after', returned: false});
                    return false
                }
            };

            // Already in the tree — some other flow re-treed it, typically an atomic recovery that
            // ran first. The document needs no operation; it needs a projection pass ONLY if a live
            // pane is coming home to be re-projected. With no pane there is nothing to show, and
            // committing anyway publishes a second, optionless projection over the recovery's own.
            if (findContainingTabsId(document, itemId)) {
                if (!live) {
                    onPaneReturn({itemId, pane, phase: 'after', returned: true});
                    return true
                }

                return settle(document)
            }

            result = applyOperation(descriptor);

            if (result?.errors?.length > 0 && placement) {
                // The host's first answer resolved to nothing — its zone AND the sibling it
                // collapsed into are both gone. Losing the position is bad; losing the pane is
                // worse, so ask again with no remembered home and take whatever the host offers.
                const fallback = resolveReturnDescriptor(document, itemId, null);

                fallback && (result = applyOperation(fallback))
            }

            if (result?.errors?.length === 0) {
                return settle(result.document)
            }

            delete returning[itemId];
            settlePane(pane);
            onPaneReturn({errors: result?.errors || [], itemId, pane, phase: 'after', returned: false});

            return false
        },

        /**
         * @summary Drops every pane-handoff record this machine holds, returning the live panes.
         *
         * The host destroys them: this machine resolves and reparents nothing itself, and teardown
         * is the one moment where that boundary would otherwise be tempting to cross.
         * @returns {Neo.component.Base[]} The panes that were still held.
         */
        retirePaneState() {
            const held = [...Object.values(returning), ...Object.values(paneHandles)];

            paneHandles = {};
            placements  = {};
            returning   = {};

            return held
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
         * @param {String} [identity.generationToken] The slot's lineage token; a superseded one clears nothing.
         * @param {Number} [identity.gestureToken] The gesture pair's correlation id, when the owner echoes it.
         * @param {String} identity.itemId
         * @param {String} identity.windowName
         * @returns {Boolean}
         */
        onVesselRetired({generationToken, gestureToken, itemId, windowName} = {}) {
            if (
                pendingAdmission?.itemId === itemId &&
                pendingAdmission.token === gestureToken
            ) {
                pendingAdmission.externallyRetired = true;
                return invalidateAdmission(itemId)
            }

            // A superseded lineage token names a vessel this machine no longer holds — a successor
            // admission for the same item shares the name, never the token — so it clears nothing.
            const matches = vessel => Boolean(
                vessel && vessel.itemId === itemId && vessel.windowName === windowName &&
                (!Number.isFinite(gestureToken) || vessel.gestureToken === gestureToken) &&
                (!generationToken || !vessel.generationToken || vessel.generationToken === generationToken)
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
                    gestureToken: state.token,
                    itemId      : data.itemId,
                    proxyRect   : data.proxyRect,
                    sortZone    : data.sortZone
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

            if (!result || result.errors?.length || !result.document) {
                return retireVessel(vessel)
            }

            activeVessel = null;

            /**
             * @summary Routes a refused publication back onto the existing retirement path.
             *
             * The slot is restored FIRST: `retireVessel` clears by identity, so a vessel that was
             * already nulled would retire without ever releasing the slot.
             * @returns {Boolean|Promise<Boolean>}
             */
            const refuse = () => {
                activeVessel = vessel;
                return retireVessel(vessel)
            };

            let published;

            try {
                published = onDocumentChange(result.document, operation, vessel)
            } catch {
                return refuse()
            }

            // A host that publishes synchronously returns undefined and is admitted unchanged —
            // only an explicit `false` or a rejected Promise is a refusal. An asynchronous owner
            // (the Group's admission barrier) is awaited, so the terminal never reports a commit
            // that has not actually landed, and never swallows a structured refusal.
            if (typeof published?.then !== 'function') {
                return published === false ? refuse() : true
            }

            return published.then(settled => settled === false ? refuse() : true, refuse)
        }
    };

    return api
}
