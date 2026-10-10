import Base from '../../../core/Base.mjs';

/**
 * @summary The tear-out gesture choreography a dock HOST composes — the admission chain and the
 * commit-at-terminal routing between the dock sort zone's gesture events and the host's own seams.
 *
 * {@link Neo.dashboard.dock.interaction.TabSortZone} fires four tear-out gesture events (re-fired boundary
 * hysteresis + the two detached terminals) and owns the drag embodiment; the dock MODEL owns the
 * document. This class owns what sits between: WHEN a vessel may be acquired, WHEN the one model
 * commit happens, and WHEN a vessel retires. Every platform effect is a host seam config, so the
 * choreography is a decision machine the host parameterizes and witnesses drive without a browser,
 * and every internal call dispatches through the instance, so a subclass or a `Neo.overwrites` entry
 * replaces the behavior that actually runs.
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
 *
 * Ownership: one instance serves one workspace composition — a pointer drives at most one drag per
 * window, so the vessel slot never needs a map. The creating host destroys it. Panes are BORROWED:
 * destruction releases the held handles and never destroys a pane (`settlePane` stays the host's
 * call), and windows retire through the host's `closeVessel` seam and the Group's native lifecycle,
 * never through this destructor. Late async work after destruction acts on nothing.
 * @class Neo.dashboard.dock.window.TearOut
 * @extends Neo.core.Base
 */
class TearOut extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.TearOut'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.TearOut',
        /**
         * Host model seam: `({operation, itemId}) => {document, errors}` — the workspace's pure
         * reducer. Called exactly once per successful tear-out, with `{operation: 'detachItem', itemId}`.
         * @member {Function|null} applyOperation=null
         */
        applyOperation: null,
        /**
         * Host settle seam: `() => Promise<void>` — resolves when the host's projection has applied the
         * document this machine just committed. Rejection means the return did not render, which is a
         * failed reintegration, not a thrown gesture.
         * @member {Function|null} awaitRefresh=null
         */
        awaitRefresh: null,
        /**
         * Host vessel retirement: `({itemId, windowName}) => Boolean|void|Promise<Boolean|void>` — closes
         * the OS window a retired gesture leaves behind. Explicit `false` refuses retirement and
         * preserves the slot; legacy void success remains admitted. Never called for a committed tear-out.
         * @member {Function|null} closeVessel=null
         */
        closeVessel: null,
        /**
         * Host return commit: `(document) => void|Boolean|Promise<void|Boolean>` — publishes a RETURNED
         * document. **Awaited, and an explicit `false`, a throw or a rejection fails the return**; every
         * other resolution admits it. An asynchronous host must not resolve before its publication has
         * actually landed — that promise is the only thing standing between an unlanded return and a
         * `returned: true` report. Deliberately NOT `onDocumentChange`: that seam carries the detach
         * operation and the vessel generation, and a return has neither.
         * @member {Function|null} commitReturn=null
         */
        commitReturn: null,
        /**
         * Host document query: `(document, itemId) => String|null` — the tabs node currently holding an
         * item, or null when the tree does not hold it. Supplied rather than imported, so the class keeps
         * the model out of its imports and every witness drives it without a browser.
         * @member {Function|null} findContainingTabsId=null
         */
        findContainingTabsId: null,
        /**
         * Host document read: `() => Object|null` — the committed dock document a return resolves its
         * semantic home against.
         * @member {Function|null} getDocument=null
         */
        getDocument: null,
        /**
         * Host report seam: `({entry, itemId, pane, reintegrated}) => void` — an admitted connection that
         * could not embody its live pane, after the compensating return resolved. `reintegrated` separates
         * the recoverable case from the one worth alarming on.
         * @member {Function|null} onAdoptionFailed=null
         */
        onAdoptionFailed: null,
        /**
         * Host view-sync seam: `(document, operation, vessel) => void|Boolean|Promise<void|Boolean>` —
         * receives the committed post-detach document plus the exact admitted vessel generation.
         * @member {Function|null} onDocumentChange=null
         */
        onDocumentChange: null,
        /**
         * Host vessel-ownership write: `(itemId, entry|null, connection, isMerge) => void` — `entry`
         * records post-terminal vessel ownership, `null` withdraws it. Vessel bookkeeping stays with the
         * host: `window/Participation` and the admission/retirement paths read it.
         * @member {Function|null} onPaneAdopted=null
         */
        onPaneAdopted: null,
        /**
         * Host return observation: `({error, errors, itemId, pane, phase, returned}) => void` — `phase`
         * is `'before'` or `'after'`. The one channel a consumer listens on to observe a pane coming home.
         * @member {Function|null} onPaneReturn=null
         */
        onPaneReturn: null,
        /**
         * Host vessel acquisition: `({gestureToken, itemId, proxyRect, sortZone, sourceRect}) =>
         * Promise<{generationToken, popupHeight, popupWidth, windowName, workspaceKey}|null>` —
         * `sourceRect` is the card body the dragged pane filled, measured at drag arming (null when the
         * zone could not measure it): the size the vessel opens at, where the tab header's `proxyRect`
         * is only its position. The host performs the platform work and resolves FALSY on any failed
         * admission (a blocked popup never throws, so the host must check the Boolean, not catch).
         * @member {Function|null} openVessel=null
         */
        openVessel: null,
        /**
         * Host render-topology move: `(pane, target, itemId) => Boolean` — moves one live pane into the
         * target window's view without changing document truth. `false` means the pane did not arrive.
         * `itemId` travels with the pane because a host that staged the move already answers by identity.
         * @member {Function|null} reparentPane=null
         */
        reparentPane: null,
        /**
         * Host pane resolution: `(itemId) => Neo.component.Base|null` — the live pane a vessel embodies.
         * @member {Function|null} resolvePane=null
         */
        resolvePane: null,
        /**
         * Host return POLICY: `(document, itemId, placement|null) => Object|null` — the reducer descriptor
         * that brings an item home, or null when nothing can. This class owns WHEN a return happens;
         * WHERE it lands when the recorded home is gone is a product decision and stays with the host.
         * @member {Function|null} resolveReturnDescriptor=null
         */
        resolveReturnDescriptor: null,
        /**
         * Host pane teardown: `(pane) => void` — destroys a live pane only when no semantic home can own it.
         * @member {Function|null} settlePane=null
         */
        settlePane: null
    }

    /**
     * The admitted vessel slot. Deliberately separate from provisional acquisition and cleanup-only
     * late authority: a terminal can invalidate an in-flight host Promise before it settles; its result
     * may then be retired, but can never become active or committable for a dead gesture.
     * @member {Object|null} activeVessel=null
     * @protected
     */
    activeVessel = null
    /**
     * Correlation counter for provisional admissions.
     * @member {Number} admissionGeneration=0
     * @protected
     */
    admissionGeneration = 0
    /**
     * A vessel admitted after its gesture was invalidated — retirement authority only.
     * @member {Object|null} lateVessel=null
     * @protected
     */
    lateVessel = null
    /**
     * The live pane captured BEFORE detach re-projection can retire it, per item id.
     * @member {Object} paneHandles={}
     * @protected
     */
    paneHandles = {}
    /**
     * The provisional admission in flight: `{externallyRetired, invalidated, itemId, opening, token}`.
     * @member {Object|null} pendingAdmission=null
     * @protected
     */
    pendingAdmission = null
    /**
     * The exact semantic home a return restores into, per item id. End-to-end witnesses read it by
     * property path, as they read `activeVessel`.
     * @member {Object} placements={}
     * @protected
     */
    placements = {}
    /**
     * The in-flight vessel retirement: `{promise, vessel}`.
     * @member {Object|null} retirement=null
     * @protected
     */
    retirement = null
    /**
     * Panes in flight home, which the host's resolver must prefer over a fresh build, per item id.
     * @member {Object} returning={}
     * @protected
     */
    returning = {}

    /**
     * @summary Captures the host-resolved live pane before detach re-projection can retire it.
     * @param {String} itemId
     * @returns {Boolean} Whether a live pane was held.
     */
    capturePane(itemId) {
        const pane = this.livePane(itemId);

        if (!pane || pane.isDestroyed) return false;

        this.paneHandles[itemId] = pane;

        return true
    }

    /**
     * @summary Creates the exact vessel identity without widening its enumerable public payload.
     * @param {String} itemId
     * @param {Object} vessel
     * @param {Number} fallbackToken The gesture's own correlation id, when the host did not echo it.
     * @returns {Object}
     * @protected
     */
    createVesselIdentity(itemId, vessel, fallbackToken) {
        const identity = {itemId, windowName: vessel.windowName},
              token    = Number.isFinite(vessel.gestureToken) ? vessel.gestureToken : fallbackToken;

        // The slot and its lineage token, when the host's admission carries them: a retirement that
        // presents a superseded token then names a vessel this machine no longer holds.
        vessel.generationToken !== undefined && (identity.generationToken = vessel.generationToken);
        vessel.workspaceKey    !== undefined && (identity.workspaceKey    = vessel.workspaceKey);

        // The gesture pair's own correlation id, echoed unread by the host — never part of the public payload.
        Object.defineProperty(identity, 'gestureToken', {value: token});

        return identity
    }

    /**
     * @summary Releases the held pane records and any in-flight admission. Never destroys a pane and
     * never closes a window: both stay with their owners.
     * @param {...*} args
     */
    destroy(...args) {
        this.pendingAdmission && (this.pendingAdmission.invalidated = true);
        this.retirePaneState();

        super.destroy(...args)
    }

    /**
     * @summary Drops a recorded home — a refused detach never earned one.
     * @param {String} itemId
     * @returns {void}
     */
    forgetPlacement(itemId) {
        delete this.placements[itemId]
    }

    /**
     * @summary The four gesture callbacks {@link Neo.dashboard.dock.projection.LayoutAdapter#project} reads,
     * each dispatching through this instance — a host spreads them into its projection options.
     * @returns {{onDockTearOutCancel:Function, onDockTearOutEntry:Function, onDockTearOutExit:Function, onDockTearOutTerminal:Function}}
     */
    getProjectionCallbacks() {
        const me = this;

        return {
            onDockTearOutCancel  : data => me.onDockTearOutCancel(data),
            onDockTearOutEntry   : data => me.onDockTearOutEntry(data),
            onDockTearOutExit    : data => me.onDockTearOutExit(data),
            onDockTearOutTerminal: data => me.onDockTearOutTerminal(data)
        }
    }

    /**
     * @summary ONLY the captured handle — never the host's resolver.
     *
     * {@link #peekPane} answers "what would adoption use", which falls through to the tree. This answers
     * "is a handle actually held", and a caller asking whether capture happened must not be told yes by
     * a pane that was merely findable.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     */
    heldPane(itemId) {
        return this.paneHandles[itemId] || null
    }

    /**
     * @summary Item ids with a captured handle, for the host's own projection bookkeeping.
     * @returns {String[]}
     */
    heldPaneIds() {
        return Object.keys(this.paneHandles)
    }

    /**
     * @summary Every live pane this machine still holds — the host's teardown sweep reads it.
     * @returns {Neo.component.Base[]}
     */
    heldPanes() {
        return [...Object.values(this.returning), ...Object.values(this.paneHandles)]
    }

    /**
     * @summary Invalidates one matching provisional admission before any gesture terminal acts.
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    invalidateAdmission(itemId) {
        const admission = this.pendingAdmission;

        if (!admission || admission.itemId !== itemId || admission.invalidated) return false;

        admission.invalidated = true;
        this.admissionGeneration++;

        return true
    }

    /**
     * @summary The live pane for one item: the captured handle first, the host's resolver second.
     *
     * Handle-first is what makes adoption work at all. The sequence is capture → re-project → adopt:
     * the capture stores the pane while it is still in the tree, the detach re-projection then removes
     * it, and adoption runs afterwards. A resolver-only lookup therefore succeeds at capture and returns
     * null at the exact moment it matters.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     * @protected
     */
    livePane(itemId) {
        const held = this.paneHandles[itemId];

        if (held && !held.isDestroyed) return held;

        return this.resolvePane(itemId) || null
    }

    /**
     * @summary The pane adoption WOULD use for one item — the held handle, else the host's.
     *
     * Reads without consuming, so asking the question cannot change the answer.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     */
    peekPane(itemId) {
        return this.livePane(itemId)
    }

    /**
     * @summary Reads a recorded home WITHOUT consuming it.
     *
     * Hosts render the stored home in their own affordances — a return-here hint, a preview target —
     * and reading must not disturb the record the actual return depends on.
     * @param {String} itemId
     * @returns {Object|null}
     */
    peekPlacement(itemId) {
        return this.placements[itemId] || null
    }

    /**
     * @summary Records the exact semantic home a return restores into.
     * @param {String} itemId
     * @param {Object} placement `{tabsNodeId, index}` captured before the detach applies.
     * @returns {void}
     */
    recordPlacement(itemId, placement) {
        placement && (this.placements[itemId] = placement)
    }

    /**
     * @summary Releases one held pane handle for return, without retaining a second owner.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     */
    releasePane(itemId) {
        const pane = this.paneHandles[itemId] || null;

        delete this.paneHandles[itemId];

        return pane
    }

    /**
     * @summary Retires a vessel once and clears authority only after non-false success.
     * @param {Object} vessel
     * @returns {Boolean|Promise<Boolean>}
     * @protected
     */
    retireVessel(vessel) {
        const me = this;

        if (me.retirement) return me.retirement.promise;

        let result;

        try {
            result = me.closeVessel(vessel)
        } catch {
            return false
        }

        if (typeof result?.then !== 'function') {
            result !== false && me.clearVessel(vessel);

            return result !== false
        }

        const state = {promise: null, vessel};

        me.retirement = state;
        state.promise = Promise.resolve(result).then(closed => {
            if (me.retirement !== state) return false;

            me.retirement = null;
            closed !== false && me.clearVessel(vessel);

            return closed !== false
        }, () => {
            me.retirement === state && (me.retirement = null);
            return false
        });

        return state.promise
    }

    /**
     * @summary Releases the active and late slots one exact vessel holds.
     * @param {Object} vessel
     * @protected
     */
    clearVessel(vessel) {
        this.activeVessel === vessel && (this.activeVessel = null);
        this.lateVessel   === vessel && (this.lateVessel   = null)
    }

    /**
     * @summary Hands one in-flight returning pane to the host's resolver, exactly once.
     *
     * The host's projection asks for this while rebuilding: a pane coming home must be reused, never
     * rebuilt, or the return silently swaps the user's live component for a fresh one.
     * @param {String} itemId
     * @returns {Neo.component.Base|null}
     */
    takeReturningPane(itemId) {
        const pane = this.returning[itemId] || null;

        pane && delete this.returning[itemId];

        return pane
    }

    /**
     * @summary Promotes one committed item into post-terminal vessel ownership.
     *
     * The host writes the ownership record through `onPaneAdopted` and clears its own admission
     * bookkeeping in the same call — the connection is consumed here, so nothing may observe it
     * afterwards. A connection that cannot embody its pane compensates and throws: the caller is an
     * event listener, and a silent failure here is a window that opened, took the pane and died with
     * the pane still inside it.
     * @param {String} itemId
     * @param {Object} [vessel={}]
     * @param {Object|null} [connection=null] The admitted window connection, when one bound.
     * @returns {void}
     */
    adoptPane(itemId, vessel={}, connection=null) {
        const me    = this,
              entry = {
                  generation     : vessel.generation      ?? connection?.generation      ?? null,
                  generationToken: vessel.generationToken ?? connection?.generationToken ?? null,
                  gestureToken   : vessel.gestureToken    ?? connection?.gestureToken    ?? null,
                  windowId       : connection?.windowId ?? null,
                  windowName     : vessel.windowName || connection?.windowName || `tearout-${itemId}`,
                  workspaceKey   : vessel.workspaceKey ?? connection?.workspaceKey ?? null
              };

        me.onPaneAdopted(itemId, entry, connection);

        if (connection) {
            // The pane is OFFERED, never required. A host may answer by identity rather than by the
            // component this machine can see — `apps/workstation` promotes an already-staged vessel
            // embodiment. Only the host's own `false` is a refusal.
            if (!me.reparentPane(me.livePane(itemId), connection, itemId)) {
                me.compensateFailedAdoption(itemId, entry);
                throw new Error(`Dock tear-out: pane "${itemId}" could not enter its admitted vessel`)
            }

            // MERGE, never replace: a replace re-derives the record from `entry` alone, which silently
            // drops the `windowId` the connection just supplied.
            me.onPaneAdopted(itemId, connection, null, true)
        }
    }

    /**
     * @summary Folds a later-arriving window binding into an existing ownership record.
     * @param {String} itemId
     * @param {Object} target
     * @returns {void}
     */
    updateAdoptedPane(itemId, target) {
        target && this.onPaneAdopted(itemId, target, null, true)
    }

    /**
     * @summary Moves an ALREADY-adopted item's live pane into a window that bound afterwards.
     *
     * The connect-race partner of {@link #adoptPane}: the terminal adopted with no connection, and the
     * window bound later. Same decision, different arrival order.
     * @param {String} itemId
     * @param {Object} connection
     * @returns {Boolean} Whether the pane arrived.
     */
    reparentAdopted(itemId, connection) {
        const me = this;

        if (!me.reparentPane(me.livePane(itemId), connection, itemId)) return false;

        me.onPaneAdopted(itemId, connection, null, true);

        return true
    }

    /**
     * @summary Compensates an admitted connection that cannot embody its live pane.
     *
     * Returns the reporting promise: the compensation's own completion is otherwise unobservable, and an
     * outcome nothing can await is an outcome nothing can assert. The vessel retires through this
     * machine's OWN retirement: the slot being cleared is the one held here.
     * @param {String} itemId
     * @param {Object} [entry={}]
     * @returns {Promise<void>}
     */
    compensateFailedAdoption(itemId, entry={}) {
        const me     = this,
              pane   = me.releasePane(itemId),
              vessel = {...entry, itemId};

        me.onPaneAdopted(itemId, null);

        Promise.resolve(me.retireVessel(vessel)).then(closed => {
            closed && !me.isDestroyed && me.onVesselRetired(vessel)
        });

        // The report waits for the return to actually resolve. Reading a pane HANDLE instead would
        // answer a different question — one that is true in exactly the case worth alarming on.
        return Promise.resolve(me.reintegrateItem(itemId, pane)).then(reintegrated => {
            !me.isDestroyed && me.onAdoptionFailed({entry, itemId, pane, reintegrated})
        })
    }

    /**
     * @summary Returns a dead vessel's item to its exact semantic position and same live pane.
     * @param {String} itemId
     * @param {Neo.component.Base|null} pane
     * @returns {Promise<Boolean>}
     */
    async reintegrateItem(itemId, pane) {
        const me        = this,
              document  = me.getDocument(),
              placement = me.placements[itemId] || null,
              live      = Boolean(pane && !pane.isDestroyed);

        let result;

        delete me.placements[itemId];

        // WHERE the item lands is the host's policy. Asking before the guard below means a host that
        // can find no home says so once, here, rather than by returning a descriptor the reducer refuses.
        const descriptor = document ? me.resolveReturnDescriptor(document, itemId, placement) : null;

        if (!document?.items?.[itemId] || !descriptor) {
            me.settlePane(pane);
            me.onPaneReturn({itemId, pane, phase: 'after', returned: false});
            return false
        }

        if (live) {
            pane.parent?.remove(pane, false);
            me.returning[itemId] = pane
        }

        me.onPaneReturn({itemId, pane, phase: 'before'});

        // Already in the tree — some other flow re-treed it, typically an atomic recovery that ran first.
        // The document needs no operation; it needs a projection pass ONLY if a live pane is coming home.
        if (me.findContainingTabsId(document, itemId)) {
            if (!live) {
                me.onPaneReturn({itemId, pane, phase: 'after', returned: true});
                return true
            }

            return me.settleReturn(itemId, pane, document)
        }

        result = me.applyOperation(descriptor);

        if (result?.errors?.length > 0 && placement) {
            // The host's first answer resolved to nothing — its zone AND the sibling it collapsed into
            // are both gone. Losing the position is bad; losing the pane is worse, so ask again with no
            // remembered home and take whatever the host offers.
            const fallback = me.resolveReturnDescriptor(document, itemId, null);

            fallback && (result = me.applyOperation(fallback))
        }

        if (result?.errors?.length === 0) {
            return me.settleReturn(itemId, pane, result.document)
        }

        delete me.returning[itemId];
        me.settlePane(pane);
        me.onPaneReturn({errors: result?.errors || [], itemId, pane, phase: 'after', returned: false});

        return false
    }

    /**
     * @summary Publishes a returned document and awaits its projection, reporting the settle as the
     * return's outcome.
     *
     * A return has TWO barriers. `commitReturn` is the publication barrier — an asynchronous host (the
     * Group) resolves it only once its own projection is installed. The refresh is the projection
     * barrier, and it cannot stand in for the first: an already-settled previous refresh resolves at
     * once and witnesses nothing. A synchronous throw from `commitReturn` lands in the same report.
     * @param {String} itemId
     * @param {Neo.component.Base|null} pane
     * @param {Object} document
     * @returns {Promise<Boolean>}
     * @protected
     */
    async settleReturn(itemId, pane, document) {
        const me = this;

        try {
            // Only an explicit `false` refuses: a host that publishes without opinion returns undefined.
            if (await me.commitReturn(document) === false) {
                !me.isDestroyed && me.onPaneReturn({itemId, pane, phase: 'after', returned: false});
                return false
            }

            await me.awaitRefresh();

            if (me.isDestroyed) return false;

            me.onPaneReturn({itemId, pane, phase: 'after', returned: true});
            return true
        } catch (error) {
            !me.isDestroyed && me.onPaneReturn({error, itemId, pane, phase: 'after', returned: false});
            return false
        }
    }

    /**
     * @summary Drops every pane-handoff record this machine holds, returning the live panes.
     *
     * The host destroys them: this machine resolves and reparents nothing itself, and teardown is the
     * one moment where that boundary would otherwise be tempting to cross.
     * @returns {Neo.component.Base[]} The panes that were still held.
     */
    retirePaneState() {
        const held = this.heldPanes();

        this.paneHandles = {};
        this.placements  = {};
        this.returning   = {};

        return held
    }

    /**
     * @summary Resolves pane choreography after the Group releases its native binding.
     * @param {Object} context The Group's source-scoped ownership observation.
     * @returns {Promise<Neo.component.Base|null>} The pane handed back to projection.
     */
    async onBindingReleased({itemId, entry, admission, committed}) {
        const me   = this,
              pane = committed ? me.releasePane(itemId) : null;

        me.onVesselRetired({...entry, ...admission, itemId});

        if (committed) {
            me.onPaneAdopted(itemId, null);
            await me.reintegrateItem(itemId, pane)
        } else {
            admission?.context?.sortZone?.endWindowDrag()
        }

        return pane
    }

    /**
     * @summary Retires the exact active vessel without discarding retry authority first.
     *
     * A vessel whose close was refused stays the active slot; a host retires it before a successor
     * tear-out opens, and an abandoned pop-out retires it outright, neither through the detached
     * terminal. Strict refusal retains the slot; every stale or other-item request is inert.
     * @param {Object} identity
     * @param {String} [identity.generationToken] The slot's lineage token; a superseded one closes nothing.
     * @param {String} identity.itemId
     * @param {String} identity.windowName
     * @returns {Boolean|Promise<Boolean>}
     */
    retireActiveVessel({generationToken, itemId, windowName} = {}) {
        const vessel = this.activeVessel;

        // A successor admission for the same item shares the name, never the token: a request bound to
        // a superseded lineage names a vessel this machine no longer holds.
        if (
            !vessel || vessel.itemId !== itemId || vessel.windowName !== windowName ||
            (generationToken && vessel.generationToken && vessel.generationToken !== generationToken)
        ) return false;

        return this.retireVessel(vessel)
    }

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
        const me        = this,
              admission = me.pendingAdmission;

        if (admission?.itemId === itemId && admission.token === gestureToken) {
            admission.externallyRetired = true;
            return me.invalidateAdmission(itemId)
        }

        // A superseded lineage token names a vessel this machine no longer holds — a successor admission
        // for the same item shares the name, never the token — so it clears nothing.
        const matches = vessel => Boolean(
            vessel && vessel.itemId === itemId && vessel.windowName === windowName &&
            (!Number.isFinite(gestureToken) || vessel.gestureToken === gestureToken) &&
            (!generationToken || !vessel.generationToken || vessel.generationToken === generationToken)
        );

        const vessel = matches(me.activeVessel) ? me.activeVessel : me.lateVessel;

        if (!matches(vessel)) return false;

        me.clearVessel(vessel);
        me.retirement = null;

        return true
    }

    /**
     * Cancel while detached: the vessel retires, the document was never touched. The zone's base cleanup
     * owns the embodiment teardown (the drag is over), so unlike entry there is no embodiment to resume.
     * @param {Object} data
     * @returns {Boolean|Promise<Boolean>}
     */
    onDockTearOutCancel(data) {
        const me = this;

        me.invalidateAdmission(data?.itemId);

        return me.activeVessel ? me.retireVessel(me.activeVessel) : false
    }

    /**
     * The drag re-entered the source window past the reattach threshold: a resumed in-window gesture,
     * not an outcome. The vessel retires with zero model mutation and the zone resumes its in-window
     * embodiment.
     * @param {Object} data
     * @returns {Boolean|Promise<Boolean>}
     */
    onDockTearOutEntry(data) {
        const me = this;

        me.invalidateAdmission(data?.itemId);

        const vessel = me.activeVessel;

        data.sortZone?.endWindowDrag();

        return vessel ? me.retireVessel(vessel) : false
    }

    /**
     * The drag left the window past the detach threshold: acquire a vessel through the host's admission
     * seam. Falsy resolution = fail closed — end the window-drag embodiment the base armed before firing
     * this event, retain no state, and let the gesture continue on the live in-window proxy. An admitted
     * vessel engages the zone's OS pointer-follow.
     *
     * A pointer drag crosses the windows of its group (the docking design record §2.8.6), and the exit
     * fires once per crossing: a hand that leaves the next window while this gesture's previous vessel is
     * still being acquired or retired waits for that to settle instead of being refused, then stands down
     * if the drag came back into a window meanwhile.
     * @param {Object} data
     * @returns {Promise<Boolean>}
     */
    async onDockTearOutExit(data) {
        const me = this;

        for (let wait = 0; (me.pendingAdmission || me.retirement) && wait < 3; wait++) {
            await Promise.allSettled([me.pendingAdmission?.opening, me.retirement?.promise])
        }

        if (me.isDestroyed || data.sortZone?.isWindowDragging === false) return false;

        if (me.activeVessel || me.retirement || me.pendingAdmission) return false;

        if (me.lateVessel) {
            const retired = await me.retireVessel(me.lateVessel);

            if (me.isDestroyed) return false;

            if (!retired) {
                data.sortZone?.endWindowDrag();
                return false
            }
        }

        const state = {
            externallyRetired: false,
            invalidated      : false,
            itemId           : data.itemId,
            token            : ++me.admissionGeneration
        };

        me.pendingAdmission = state;

        let vessel;

        try {
            state.opening = me.openVessel({
                gestureToken: state.token,
                itemId      : data.itemId,
                proxyRect   : data.proxyRect,
                sortZone    : data.sortZone,
                sourceRect  : data.sourceRect ?? null
            });

            vessel = await state.opening
        } catch {
            vessel = null
        }

        // A destroyed owner admits nothing: the window it opened belongs to the Group's native lifecycle.
        if (me.isDestroyed) return false;

        me.pendingAdmission === state && (me.pendingAdmission = null);

        if (state.invalidated || state.token !== me.admissionGeneration) {
            if (!state.externallyRetired && vessel?.windowName) {
                me.lateVessel = me.createVesselIdentity(data.itemId, vessel, state.token);
                await me.retireVessel(me.lateVessel)
            }

            return false
        }

        if (!vessel) {
            data.sortZone?.endWindowDrag();
            return false
        }

        me.activeVessel = me.createVesselIdentity(data.itemId, vessel, state.token);

        data.sortZone?.startWindowDrag({
            dragData   : data,
            popupHeight: vessel.popupHeight,
            popupWidth : vessel.popupWidth,
            windowName : vessel.windowName
        });

        return true
    }

    /**
     * Released while detached — the ONE commit seam: `detachItem` routes through the host's reducer (tree
     * removal, catalog preserved for vessel ownership). Success: the committed document syncs and the
     * vessel STAYS — it owns the item now. A model refusal retires the vessel instead, so no window
     * survives showing an item the document still owns. A THROWING reducer lands on the same refusal
     * path — an uncaught throw here would skip the retirement and orphan the vessel. Without an admitted
     * vessel (failed admission earlier in the gesture) there is nothing to commit.
     * @param {Object} data
     * @returns {Boolean|Promise<Boolean>}
     */
    onDockTearOutTerminal(data) {
        const me = this;

        me.invalidateAdmission(data?.itemId);

        const vessel = me.activeVessel;

        if (!vessel || vessel.itemId !== data.itemId) return false;

        let operation = {operation: 'detachItem', itemId: data.itemId},
            result;

        try {
            result = me.applyOperation(operation)
        } catch (error) {
            result = {document: null, errors: [`detachItem threw: ${error?.message || error}`]}
        }

        if (!result || result.errors?.length || !result.document) {
            return me.retireVessel(vessel)
        }

        me.activeVessel = null;

        // A refused publication goes back onto the retirement path. The slot is restored FIRST:
        // `retireVessel` clears by identity, so a vessel that was already nulled would retire without
        // ever releasing the slot.
        const refuse = () => {
            me.activeVessel = vessel;
            return me.retireVessel(vessel)
        };

        let published;

        try {
            published = me.onDocumentChange(result.document, operation, vessel)
        } catch {
            return refuse()
        }

        // A host that publishes synchronously returns undefined and is admitted unchanged — only an
        // explicit `false` or a rejected Promise is a refusal. An asynchronous owner (the Group's
        // admission barrier) is awaited, so the terminal never reports a commit that has not landed.
        if (typeof published?.then !== 'function') {
            return published === false ? refuse() : true
        }

        return published.then(settled => settled === false ? refuse() : true, refuse)
    }
}

export default Neo.setupClass(TearOut);
