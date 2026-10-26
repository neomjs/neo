import Base          from '../../../core/Base.mjs';
import WindowManager from '../../../manager/Window.mjs';

/**
 * @summary The native window transactions dock hosts share: the parked vessel's re-show behind
 * {@link Neo.dashboard.dock.window.VesselPark}'s `reshowVessel` seam, tear-out close, and Workspace
 * close-return / native replay.
 *
 * `VesselPark` owns gesture-local admission, one-in-flight settlement and disposal ordering, and
 * requires strict effects it deliberately does not implement — native window ownership stays with
 * the Group, and the arbiter holds no host reference. The receipts speak one fixed `authority` block
 * ({@link #authorityKeys}), so a host's park and this re-show report the same decision under the
 * same shape.
 *
 * The statics are stateless and host-free. An INSTANCE is one host's re-show owner: its four seam
 * configs are the whole host-varying surface (which window the park targets, how a vessel resolves,
 * where the receipt lands), and {@link #reshowVessel} is a prototype method, so a subclass or a
 * `Neo.overwrites` entry replaces the re-show that actually runs. The host that creates it destroys it;
 * anything genuinely app-specific stays an override with a stated product reason.
 *
 * @class Neo.dashboard.dock.window.NativeVesselTransaction
 * @extends Neo.core.Base
 */
class NativeVesselTransaction extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.NativeVesselTransaction'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.NativeVesselTransaction',
        /**
         * Host seam: `() => String` — the host's current `windowId`, the native route's owner.
         * @member {Function|null} ownerWindowId=null
         */
        ownerWindowId: null,
        /**
         * Host seam: `receipt => void` — where the re-show's receipt lands.
         * @member {Function|null} publishReceipt=null
         */
        publishReceipt: null,
        /**
         * Host seam: `itemId => entry|null` — the vessel registry entry a re-show addresses.
         * @member {Function|null} resolveVessel=null
         */
        resolveVessel: null,
        /**
         * Host seam: `() => String|null` — the park target's `windowId`.
         * @member {Function|null} targetWindowId=null
         */
        targetWindowId: null
    }

    /**
     * @summary Detaches an opted-in workspace and returns its documents only on confirmed closure.
     * The Group's exact released binding owns the whole pending operation, including observation
     * and queued insertion. A warm rebind invalidates admission; an unknown physical state waits
     * for that binding's reconnect lease. Never-bound admissions do not return semantic documents.
     * @param {Object} descriptor WorkspaceSet and the Group's nativeWindows lifecycle.
     * @param {Object} data The manager's release or formerly-bound expiry envelope.
     * @returns {Boolean|Promise<Object|Boolean>} Retention disposition, independent of native presentation.
     */
    static releaseWorkspace({workspaceSet, nativeWindows}, data) {
        const source = workspaceSet?.getParticipantForBinding(data.workspaceKey),
              native = source?.participant.nativeWindow,
              policy = native?.policy();
        if (policy == null) return true;
        if (!['return', 'retain'].includes(policy)) throw new TypeError('unknown native workspace close policy');
        if (!nativeWindows?.isCurrentRelease(data)) return false;

        return nativeWindows.withReleasedBinding(data, async () => {
            const current = () => nativeWindows.isCurrentRelease(data) &&
                workspaceSet.getParticipant(source.workspaceId) === source.participant,
                  windowId = native.windowId(), route = native.route();
            if (!current() || windowId && windowId !== data.releasedWindowId) return false;
            const awaitingClosure = policy === 'return' && data.generation > 0 &&
                Object.keys(source.participant.getDocument().items).length > 0;
            native.detach(data);
            if (!awaitingClosure) return {retained: true, awaitingClosure: false};

            const observed = data.expired === true && nativeWindows.isLeaseExpired(data) ? true
                : route ? await Neo.Main.windowNativeIsClosed({nativeHandleKey: route.nativeHandleKey,
                    windowId: route.ownerWindowId}).catch(() => null) : null;
            if (!current()) return false;
            if (observed !== true && !nativeWindows.isLeaseExpired(data)) return {retained: true, awaitingClosure: true};

            const target = workspaceSet.getParticipantForBinding(native.returnTarget());
            let result;
            try {
                if (!target) throw new Error('native workspace return target is unavailable');
                result = await workspaceSet.returnWorkspace(source.workspaceId, target.workspaceId, {
                    cause     : nativeWindows.isLeaseExpired(data) ? 'popup-reconnect-expired' : 'popup-close',
                    placements: native.placements(),
                    guard     : () => current() && !native.windowId()
                });
            } catch (error) {
                if (current()) native.returned({returned: false, workspaceId: source.workspaceId,
                    itemIds: Object.keys(source.participant.getDocument().items), errors: [error.message]});
                return {retained: true, awaitingClosure: current() && awaitingClosure}
            }
            const receipt = {returned: true, itemIds: result.itemIds, workspaceId: source.workspaceId,
                transactionId: result.transactionId};
            if (current()) {
                try { native.returned(receipt) } catch (error) { Neo.logError(error) }
            }
            return {retained: true, awaitingClosure: false, receipt}
        })
    }

    /**
     * @summary Keeps a released tear-out vessel's pane for the vessel until the opener's handle says it closed.
     *
     * A reload releases the binding exactly as a close does, and the reloaded document binds again within
     * milliseconds, so the slot is held at once: its own lineage re-embodies the same live pane — a window
     * is a render target, never the state's owner. The opener's handle then decides: closed returns the
     * pane home, and a lease that ends first does too. An expiry, or a key the host holds no handle for,
     * releases at once, as before.
     * @param {Object} descriptor
     * @param {Object} descriptor.handles The host's opener handles by Group key (see {@link #watchVesselHandle}).
     * @param {Object|null} descriptor.nativeWindows The Group's native lifecycle.
     * @param {String} descriptor.sourceId The host's native source.
     * @param {Neo.dashboard.dock.window.TearOut|null} descriptor.tearOut The host's pane choreography.
     * @param {Object} data The Group's release envelope.
     * @returns {Boolean|Object} `true` releases; the object holds the key for its lineage, with the opener's
     *     answer as its `closed` promise.
     */
    static holdReleasedVessel({handles, nativeWindows, sourceId, tearOut}, data) {
        const {windowId, workspaceKey} = data,
              handle                   = handles[workspaceKey],
              owner                    = nativeWindows?.getOwner(sourceId, workspaceKey),
              pane                     = owner && tearOut?.heldPane(owner.itemId);

        if (data.expired || !handle || !owner) return true;

        // The departed window takes no more updates: the held pane leaves its viewport silently and stays
        // headless until its lineage re-embodies it, as a detached Workspace does (onNativeWindowDetached).
        if (pane && !pane.isDestroyed && pane.parent && pane.parent === Neo.apps[windowId]?.mainView) {
            pane.parent.remove(pane, false, true);
            pane.windowId = null
        }

        return {retained: true, awaitingClosure: true, readmit: true,
            closed: Neo.Main.windowNativeIsClosed({nativeHandleKey: handle.nativeHandleKey, windowId: handle.ownerWindowId})}
    }

    /**
     * @summary Records the opener's handle of a vessel that bound into `handles`, once its route is known.
     *
     * A window binds when its app registers, and its first geometry report can register it route-less, both
     * before the connect handshake that carries its route; a reloaded document connects without a route at
     * all, so the first document's handle stays.
     * @param {Object} handles The host's opener handles by Group key.
     * @param {Object} connection
     * @param {String} connection.windowId
     * @param {String} connection.workspaceKey
     */
    static watchVesselHandle(handles, {windowId, workspaceKey}) {
        const record = route => route?.nativeHandleKey && (handles[workspaceKey] =
                  {nativeHandleKey: route.nativeHandleKey, ownerWindowId: route.ownerWindowId}),
              known  = WindowManager.get(windowId)?.nativeRoute;

        if (known) return record(known);

        // A scope of its own, with an id: Observable drops a listener whose scope has none, and removes by scope
        const scope        = {id: Neo.getId('vessel-handle-watch')},
              stop         = () => Neo.currentWorker.un({connect: onConnect, disconnect: onDisconnect, scope}),
              onConnect    = data => data.windowId === windowId && (stop(), record(data.windowData?.nativeRoute)),
              onDisconnect = data => data.windowId === windowId && stop();

        Neo.currentWorker?.on?.({connect: onConnect, disconnect: onDisconnect, scope})
    }

    /**
     * @summary Opens a native render target for an existing semantic workspace identity.
     * Refusal revokes only this reservation and leaves its participant and history intact.
     * @param {Neo.dashboard.dock.window.WorkspaceSet} workspaceSet
     * @param {String} workspaceId
     * @returns {Promise<{opened:Boolean,errors:String[]}>}
     */
    static async embodyWorkspace(workspaceSet, workspaceId) {
        const participant = workspaceSet?.getParticipant(workspaceId), native = participant?.nativeWindow,
              groupId     = workspaceSet?.resolveGroupId(), manager = workspaceSet?.manager;
        if (!native || !groupId) return {opened: false, errors: ['unknown native workspace']};
        const reservation = manager.reserve({groupId, workspaceKey: participant.bindingKey});
        if (!reservation) return {opened: false, errors: ['workspace already has a window']};
        let opened = false;
        try {
            const config = native.openConfig(reservation);
            if (config && workspaceSet.getParticipant(workspaceId) === participant) {
                opened = await Neo.Main.windowOpen({...config, topologyIdentity: reservation,
                    windowId: native.ownerWindowId()}) === true
            }
        } catch {}
        if (!opened) manager.revoke(reservation);
        return {opened, errors: opened ? [] : ['window was refused; the workspace remains available']}
    }

    /**
     * @summary Publishes native replay evidence separately from committed semantic history.
     * @param {Neo.dashboard.dock.window.WorkspaceSet} workspaceSet
     * @param {String} workspaceId
     * @param {Object} context
     * @param {Object} observation
     * @protected
     */
    static publishWorkspaceEffect(workspaceSet, workspaceId, context, observation) {
        const receipt = {kind: 'native', id: workspaceId, transactionId: context.transactionId,
            observation, error: null};
        try { workspaceSet.manager.fire('effectReceipt', {groupId: workspaceSet.resolveGroupId(), receipt}) }
        catch (error) { Neo.logError(error) }
    }

    /**
     * @summary Keeps a popup's window in step with what an undo or redo leaves in it, whichever row the cursor
     * crossed: a popup the replay fills without a window is embodied before projection, and one it empties
     * while bound closes after projection settles, so no replay leaves a blank window on screen.
     * Each native refusal is an effectReceipt, never a semantic rollback. The close fences both sides
     * of identity clearing against the exact binding, generation and semantic snapshot. Only a popup
     * participant (one with a close policy) is touched; a root's window never is.
     * @param {Neo.dashboard.dock.window.WorkspaceSet} workspaceSet
     * @param {String} workspaceId
     * @param {Object} context Group projection context.
     * @param {Function} project The ordinary document projection.
     * @returns {Promise<*>} The ordinary projection's result.
     */
    static async replayWorkspaceReturn(workspaceSet, workspaceId, context, project) {
        const source = workspaceSet?.getParticipant(workspaceId),
              native = source?.nativeWindow,
              filled = () => Object.keys(source.getDocument().items).length > 0;
        if (native?.policy?.() == null || !['undo', 'redo'].includes(context.cursorAction)) return project();
        if (!native.windowId() && filled()) {
            this.publishWorkspaceEffect(workspaceSet, workspaceId, context, await this.embodyWorkspace(workspaceSet, workspaceId))
        }
        const result = await project();
        if (native.windowId() && !filled()) {
            const closed = await this.closeWorkspaceWindow(workspaceSet, workspaceId, {snapshot: context.snapshot});
            this.publishWorkspaceEffect(workspaceSet, workspaceId, context,
                {closed, errors: closed ? [] : ['native replay close was refused']})
        }
        return result
    }

    /**
     * @summary Closes an emptied participant's bound native window through its Group binding.
     * Both sides of identity clearing are fenced twice: the binding, generation and window stay the ones
     * found, and the participant stays empty in the Group snapshot the close was decided in (`snapshot`,
     * else the current one). The clear carries the binding's lineage token, so a same-Group successor that
     * bound in the window keeps its carrier; a binding without a token is refused. A pane arriving while
     * the clear is in flight leaves the window open with its carrier restored.
     * @param {Neo.dashboard.dock.window.WorkspaceSet} workspaceSet
     * @param {String} workspaceId
     * @param {Object} [options={}]
     * @param {Object} [options.snapshot] The Group snapshot the close was decided in; defaults to the current one.
     * @returns {Promise<Boolean>} `true` once the window accepted the close.
     */
    static async closeWorkspaceWindow(workspaceSet, workspaceId, {snapshot}={}) {
        const source            = workspaceSet?.getParticipant(workspaceId), native = source?.nativeWindow,
              manager           = workspaceSet?.manager, group = manager?.get(workspaceSet.resolveGroupId()),
              binding           = group?.bindings.get(source?.bindingKey), generation = binding?.generation,
              {generationToken} = binding ?? {},
              decided           = snapshot ?? group?.snapshot,
              windowId          = native?.windowId(),
              bound             = () => manager.get(group.id) === group && workspaceSet.getParticipant(workspaceId) === source &&
                  group.bindings.get(source.bindingKey) === binding && binding.generation === generation &&
                  binding.windowId === windowId && native.windowId() === windowId,
              emptied           = () => group.snapshot === decided && !Object.keys(source.getDocument()?.items ?? {}).length;
        if (!windowId || !binding || !generationToken || !bound() || !emptied()) return false;
        try {
            if (await Neo.Main.clearTopologyIdentity({generationToken, groupId: group.id, windowId}) !== true) return false;
            if (bound() && emptied()) return await Neo.Main.closeTopologyWindow({windowId}) === true;
            // The source changed during the clear: the still-bound window stays and gets its identity back;
            // `onlyIfEmpty` leaves a successor's carrier untouched.
            bound() && await Neo.Main.setTopologyIdentity({
                generationToken, groupId: group.id, onlyIfEmpty: true, windowId, workspaceKey: source.bindingKey
            })
        } catch {}
        return false
    }

    /**
     * The `authority` key order every receipt emits, fixed so two consumers cannot report the same
     * decision under different shapes. Emitted whole; the gated subset is decided per transaction
     * by its declared restore obligation, never by which keys a consumer remembered to include.
     * @member {String[]} authorityKeys
     * @static
     */
    static authorityKeys = [
        'entryNameMatches', 'sourceHasHandle', 'sourceOwnerMatches', 'sourcePositionCapable',
        'sourceResizeCapable', 'sourceTargetMatches', 'targetFocusCapable', 'targetHasHandle',
        'targetOwnerMatches', 'targetTargetMatches'
    ]

    /**
     * @summary Resolves the source and target native-route admissions for one vessel.
     *
     * Both consumers reached the identical pair independently: `position` on the source (the park
     * moves it) and `focus` on the target, which the park no longer uses and the receipt still
     * reports. `resize` is resolved unconditionally so the receipt can report the capability, and
     * gated separately — reporting a capability and requiring it are different questions, and
     * conflating them is what made one consumer's park look stricter than its own re-show.
     * @param {Object} descriptor
     * @param {Object|null} entry The resolved vessel registry entry.
     * @param {String|null} targetWindowId
     * @returns {{sourceFocusless:Boolean,sourcePos:Object,sourceResize:Object,targetFocus:Object}}
     * @protected
     */
    static resolveAdmissions(descriptor, entry, targetWindowId) {
        const
            ownerWindowId = descriptor.ownerWindowId(),
            route         = entry?.nativeRoute ?? null,
            targetRoute   = WindowManager.get(targetWindowId)?.nativeRoute ?? null,
            sourceArgs    = {ownerWindowId, route, targetWindowId: entry?.windowId ?? null},
            targetArgs    = {ownerWindowId, route: targetRoute, targetWindowId: targetWindowId ?? null};

        return {
            sourcePos   : WindowManager.resolveNativeRoute({...sourceArgs, capability: 'position'}),
            sourceResize: WindowManager.resolveNativeRoute({...sourceArgs, capability: 'resize'}),
            targetFocus : WindowManager.resolveNativeRoute({...targetArgs, capability: 'focus'})
        }
    }

    /**
     * @summary Builds the fixed ten-key authority block for one transaction.
     * @param {Object} admissions From {@link #resolveAdmissions}.
     * @param {Boolean} entryNameMatches
     * @returns {Object} Keys in {@link #authorityKeys} order.
     * @protected
     */
    static describeAuthority({sourcePos, sourceResize, targetFocus}, entryNameMatches) {
        return {
            entryNameMatches,
            sourceHasHandle      : sourcePos.hasHandle,
            sourceOwnerMatches   : sourcePos.ownerMatches,
            sourcePositionCapable: sourcePos.capable,
            sourceResizeCapable  : sourceResize.capable,
            sourceTargetMatches  : sourcePos.targetMatches,
            targetFocusCapable   : targetFocus.capable,
            targetHasHandle      : targetFocus.hasHandle,
            targetOwnerMatches   : targetFocus.ownerMatches,
            targetTargetMatches  : targetFocus.targetMatches
        }
    }

    /**
     * @summary Converts a CONTENT rect into the frame origin `moveTo` actually consumes.
     *
     * `Neo.Main#windowNativeMoveTo` ends in `win.moveTo(x, y)`, which positions the window's OUTER
     * frame, while a park rect describes content. A consumer handing the content origin straight in
     * places the window short by its own chrome on every platform that draws any. That is a property
     * of the platform call, not of any application — a window that never published chrome resolves
     * to a zero offset and re-shows content-on-frame, the pre-chrome behaviour.
     * @param {Object|null} rect
     * @param {String|null} windowId The window being moved, whose chrome offsets the origin.
     * @returns {{x:Number,y:Number}|null} `null` when the rect has no finite origin to convert.
     * @protected
     */
    static toFrameOrigin(rect, windowId) {
        if (!Number.isFinite(rect?.x) || !Number.isFinite(rect?.y)) {
            return null
        }

        const chrome = WindowManager.get(windowId)?.chrome;

        return {x: rect.x - (chrome?.left ?? 0), y: rect.y - (chrome?.top ?? 0)}
    }

    /**
     * @summary Resolves the live vessel one registration may address for an item, connect- or commit-side.
     *
     * A connection outranks a recorded owner, because it is the generation attached right now. An entry
     * without a `windowId` is not a vessel yet, so it resolves to nothing.
     * @param {Object} data
     * @param {Object|null} data.nativeWindows The Group's native lifecycle.
     * @param {String} data.sourceId The registration the host's effects were bound under.
     * @param {Function} data.windowNameFor `(itemId, workspaceKey) => String`, the host's semantic vessel name.
     * @param {String} itemId
     * @param {String} [workspaceKey] The vessel's Group key; without it the item's newest vessel answers.
     * @returns {Object|null}
     */
    static resolveVessel({nativeWindows, sourceId, windowNameFor}, itemId, workspaceKey=nativeWindows?.keyOf(sourceId, itemId)) {
        const entry = nativeWindows?.getConnection(sourceId, workspaceKey) ?? nativeWindows?.getOwner(sourceId, workspaceKey);

        if (!entry?.windowId) {
            return null
        }

        return {
            ...entry,
            itemId,
            nativeRoute: entry.nativeRoute ?? WindowManager.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? windowNameFor(itemId, workspaceKey)
        }
    }

    /**
     * @summary Closes one tear-out vessel: refuses a mismatched identity, authorizes the route, settles a
     * staged pane, dispatches, and reports what the platform answered.
     *
     * Each host that enabled tear-out used to write this sequence itself, and the copies drifted: they
     * read the admission under different keys, only one followed a connection still being decided, and
     * all of them reported a by-name close as success without reading its answer.
     *
     * **The order is the contract.** Identity refuses before anything resolves, and identity is the slot's
     * lineage token: a successor admission for the same item shares the window name, never the token, so a
     * retirement presenting a superseded token is refused and the live vessel survives it. A present route
     * that fails an axis refuses before the pane moves. The pane settles before its window goes, so a
     * refused close never strands content in a window that survives it. Every refusal is `false`, which is
     * what keeps the Group's retry authority.
     *
     * An absent route is not a refusal: a vessel that never connected closes by its semantic name, the only
     * authority that exists before connect. Once a route exists, a failed axis refuses — never a downgrade
     * to a same-name close.
     * @param {Object} descriptor The host-varying surface, built per call.
     * @param {Object|null} descriptor.nativeWindows The Group's native lifecycle.
     * @param {String} descriptor.ownerWindowId The host's current `windowId`, which dispatches the close.
     * @param {String} descriptor.sourceId The registration this close was bound under.
     * @param {Function} descriptor.windowNameFor `itemId => String`, the host's semantic vessel name.
     * @param {Function} [descriptor.beforeRestore] `({itemId}) => Boolean`, an unwind that must precede a
     * restoring settle; a falsy answer refuses.
     * @param {Object} [descriptor.embodiment] The staged-pane owner: `isStaged`, `getWindowId`, `restore`, `promote`.
     * @param {Function} [descriptor.publishReceipt] `receipt => void`. The receipt is published first and
     * amended in place, so a reader after a refusal sees how far the close got.
     * @param {Function} [descriptor.sourceOwns] `itemId => Boolean`, whether the source document still holds
     * the item: the settle restores when it does and promotes when a committed transfer moved it.
     * @param {Object} vessel
     * @param {String} [vessel.generationToken] The reservation's lineage token.
     * @param {String} vessel.itemId
     * @param {Object} [vessel.nativeRoute] The opener-minted route, when one is known.
     * @param {String} vessel.windowName
     * @param {String} vessel.workspaceKey The vessel's own Group key: a late close of an older vessel for the
     *     same item reaches that vessel and never the item's newer one.
     * @returns {Promise<Boolean>}
     */
    static async closeVessel(descriptor, {generationToken, itemId, nativeRoute, windowName, workspaceKey} = {}) {
        const
            {embodiment=null, nativeWindows, ownerWindowId, sourceId} = descriptor,
            // A vessel naming no key is its item's newest one
            vesselKey        = workspaceKey ?? nativeWindows?.keyOf(sourceId, itemId) ?? null,
            entry            = NativeVesselTransaction.resolveVessel(descriptor, itemId, vesselKey),
            admission        = nativeWindows?.getAdmission(sourceId, vesselKey),
            // A binding still being decided names its window as `connectingWindowId` and earns `windowId`
            // only on acceptance; a close arriving mid-decision must still reach that window.
            admittedWindowId = admission?.windowId ?? admission?.connectingWindowId ?? null,
            expected         = descriptor.windowNameFor(itemId, vesselKey),
            exactToken       = entry?.generationToken ?? admission?.generationToken ?? null,
            embodiedWindowId = entry?.windowId ?? admittedWindowId ?? embodiment?.getWindowId(itemId),
            receipt          = {
                identity: {
                    entryNameMatches : !entry || entry.windowName === windowName,
                    hasEntry         : Boolean(entry),
                    hasItemId        : Boolean(itemId),
                    lineageMatches   : !generationToken || !exactToken || generationToken === exactToken,
                    windowNameMatches: windowName === expected
                },
                itemId: itemId ?? null,
                stage : 'validating-identity'
            },
            {identity} = receipt;

        descriptor.publishReceipt?.(receipt);

        if (!itemId || !identity.windowNameMatches || !identity.entryNameMatches || !identity.lineageMatches) {
            receipt.stage = 'identity-refused';
            return false
        }

        nativeRoute ??= entry?.nativeRoute ?? (admittedWindowId && WindowManager.get(admittedWindowId)?.nativeRoute) ?? null;

        const
            exactWindowId = entry?.windowId ?? admittedWindowId,
            // No exact window means no target to constrain, which the key's ABSENCE says; passing it as
            // null would say the caller lost an id it needed, and refuse.
            auth          = WindowManager.resolveNativeRoute({
                capability: 'close', ownerWindowId, route: nativeRoute,
                ...(exactWindowId && {targetWindowId: exactWindowId})
            });

        receipt.route = {
            closeCapable      : !auth.present || auth.capable,
            exactTargetMatches: !auth.present || auth.targetMatches,
            exactWindowId     : exactWindowId ?? null,
            hasHandle         : !auth.present || auth.hasHandle,
            ownerMatches      : !auth.present || auth.ownerMatches,
            ownerWindowId     : nativeRoute?.ownerWindowId ?? null,
            present           : auth.present,
            targetPresent     : !auth.present || auth.hasTarget,
            targetWindowId    : nativeRoute?.targetWindowId ?? null
        };

        if (auth.present && !auth.granted) {
            receipt.stage = 'route-refused';
            return false
        }

        // The Group opened the retirement before this call, so a refused close keeps the exact route and
        // slot for retry while the content goes home first. A committed transfer promotes the staged pane
        // instead, letting the target-first reconciler take it without a false restoration.
        if (embodiedWindowId && embodiment?.isStaged(itemId)) {
            const
                sourceOwns = Boolean(descriptor.sourceOwns?.(itemId)),
                unwound    = !sourceOwns || !descriptor.beforeRestore || Boolean(descriptor.beforeRestore({itemId})),
                settled    = unwound && Boolean(embodiment[sourceOwns ? 'restore' : 'promote']({itemId, windowId: embodiedWindowId}));

            receipt.embodiment = {settled, sourceOwns, staged: true};

            if (!settled) {
                receipt.stage = 'embodiment-refused';
                return false
            }
        }

        // Which route carried the close outlives the final stage: a refused native close and a refused
        // by-name close end on the same stage, and only this tells them apart.
        receipt.dispatch = nativeRoute ? 'native' : 'semantic';

        try {
            if (nativeRoute) {
                receipt.stage  = 'native-dispatched';
                receipt.closed = await Neo.Main.windowNativeClose({
                    nativeHandleKey: nativeRoute.nativeHandleKey,
                    targetWindowId : nativeRoute.targetWindowId,
                    windowId       : ownerWindowId
                }) === true
            } else {
                receipt.stage  = 'semantic-dispatched';
                // Before connect there is no exact route to correlate yet; the slot's unguessable semantic
                // name is the only authority there is.
                receipt.closed = await Neo.Main.windowClose({names: [windowName], windowId: ownerWindowId}) === true
            }
        } catch (error) {
            receipt.error = String(error?.message || error);
            receipt.stage = 'threw';
            return false
        }

        receipt.stage = receipt.closed ? 'acknowledged' : 'platform-refused';

        return receipt.closed
    }

    /**
     * @summary `VesselPark`'s re-show effect: moves one parked vessel back to its recorded content rect.
     *
     * The statics it composes are reached through `this.constructor`, so a subclass's static override
     * applies to its own instances.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} data.rect The CONTENT rect the park recorded.
     * @param {String} data.windowName
     * @returns {Promise<Boolean>} Whether the platform admitted the move.
     */
    async reshowVessel({itemId, rect, windowName}) {
        const
            me         = this,
            ctor       = me.constructor,
            entry      = me.resolveVessel(itemId),
            route      = entry?.nativeRoute ?? null,
            frame      = ctor.toFrameOrigin(rect, entry?.windowId ?? null),
            admissions = ctor.resolveAdmissions(me, entry, me.targetWindowId() ?? null);

        const receipt = {
            authority: ctor.describeAuthority(admissions, entry?.windowName === windowName),
            frame,
            // Both are recorded because they answer different questions: `rect` is what the caller asked
            // for in content space, `frame` is what the platform was handed. A receipt carrying only one
            // cannot show that the chrome conversion happened.
            rect     : rect && {height: rect.height, width: rect.width, x: rect.x, y: rect.y}
        };

        // Published first and amended in place, same as the host's park: a caller reading it after a
        // refusal must see which beat refused.
        me.publishReceipt(receipt);

        if (!admissions.sourcePos.granted || entry?.windowName !== windowName || !frame) {
            receipt.reason = 'native route or restore geometry refused';
            return false
        }

        try {
            receipt.moved = await Neo.Main.windowNativeMoveTo({
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId       : me.ownerWindowId(),
                x              : frame.x,
                y              : frame.y
            }) === true
        } catch (error) {
            receipt.error     = String(error?.message || error);
            receipt.refusedAt = 'throw';
            return false
        }

        if (!receipt.moved) {
            receipt.refusedAt = 'move';
            return false
        }

        receipt.admitted = true;
        return true
    }
}

export default Neo.setupClass(NativeVesselTransaction);
