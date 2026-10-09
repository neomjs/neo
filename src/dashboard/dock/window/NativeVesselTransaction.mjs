import Base          from '../../../core/Base.mjs';
import WindowManager from '../../../manager/Window.mjs';

/**
 * @summary The default park / re-show / dispose transaction behind {@link Neo.dashboard.dock.window.VesselPark}'s
 * three required seams, tear-out close, and shared Workspace close-return / native replay.
 *
 * `VesselPark` owns gesture-local admission, one-in-flight settlement and disposal ordering, and
 * requires three strict effects it deliberately does not implement — native window ownership stays
 * with the Group, and the arbiter holds no host reference. That left every consumer writing the
 * transaction itself, and two did, with the same contract and different bodies: the same
 * `lastVesselParkReceipt.authority` block in the same key order, the same `resolveNativeRoute`
 * admission pair, the same fail-closed gate, the same dispatch — reached independently, and already
 * diverged. The divergence is the reason this exists; a copy would at least have agreed.
 *
 * **The authority key set is a function of the transaction's declared restore obligation.** All ten
 * keys are emitted always, so a reader sees one fixed shape; only the required subset gates the
 * refusal. A transaction that restores geometry must hold `resize` at park, because park is where
 * that obligation is accepted. A transaction that restores position only must not — gating it there
 * refuses parks it would service completely.
 *
 * This class holds no state and no host. {@link #effectsFor} closes over a descriptor and returns
 * the three functions; a consumer overriding none inherits a working transaction without
 * re-deriving it, and `VesselPark`'s own construct-time throw still catches the partial-override
 * case. Anything genuinely app-specific stays an override with a stated product reason.
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
        className: 'Neo.dashboard.dock.window.NativeVesselTransaction'
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
     * @summary Re-embodies undo before projection and closes redo after projection settles.
     * Each native refusal is an effectReceipt, never a semantic rollback. Redo fences both sides
     * of identity clearing against the exact binding, generation and semantic snapshot.
     * @param {Neo.dashboard.dock.window.WorkspaceSet} workspaceSet
     * @param {String} workspaceId
     * @param {Object} context Group projection context.
     * @param {Function} project The ordinary document projection.
     * @returns {Promise<*>} The ordinary projection's result.
     */
    static async replayWorkspaceReturn(workspaceSet, workspaceId, context, project) {
        const row    = context.replayRow, source = workspaceSet?.getParticipant(workspaceId),
              native = source?.nativeWindow;
        if (!native || row?.operation !== 'returnPopupWorkspace' || row.workspaceId !== workspaceId) return project();
        if (context.cursorAction === 'undo' && !native.windowId() && Object.keys(source.getDocument().items).length) {
            this.publishWorkspaceEffect(workspaceSet, workspaceId, context, await this.embodyWorkspace(workspaceSet, workspaceId))
        }
        const result = await project();
        if (context.cursorAction === 'redo' && native.windowId() && !Object.keys(source.getDocument().items).length) {
            const manager  = workspaceSet.manager, group = manager.get(workspaceSet.resolveGroupId()),
                  binding  = group?.bindings.get(source.bindingKey), generation = binding?.generation,
                  windowId = native.windowId(), current = () => manager.get(group?.id) === group &&
                      group?.snapshot === context.snapshot && workspaceSet.getParticipant(workspaceId) === source &&
                      group?.bindings.get(source.bindingKey) === binding && binding?.generation === generation &&
                      binding?.windowId === windowId && native.windowId() === windowId;
            let closed = false;
            try {
                if (current() && await Neo.Main.clearTopologyIdentity({groupId: group.id, windowId}) === true && current()) {
                    closed = await Neo.Main.closeTopologyWindow({windowId}) === true
                }
            } catch {}
            this.publishWorkspaceEffect(workspaceSet, workspaceId, context,
                {closed, errors: closed ? [] : ['native replay close was refused']})
        }
        return result
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
     * @param {Function} data.windowNameFor `itemId => String`, the host's semantic vessel name.
     * @param {String} itemId
     * @returns {Object|null}
     */
    static resolveVessel({nativeWindows, sourceId, windowNameFor}, itemId) {
        const entry = nativeWindows?.getConnection(sourceId, itemId) ?? nativeWindows?.getOwner(sourceId, itemId);

        if (!entry?.windowId) {
            return null
        }

        return {
            ...entry,
            itemId,
            nativeRoute: entry.nativeRoute ?? WindowManager.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? windowNameFor(itemId)
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
     * @returns {Promise<Boolean>}
     */
    static async closeVessel(descriptor, {generationToken, itemId, nativeRoute, windowName} = {}) {
        const
            {embodiment=null, nativeWindows, ownerWindowId, sourceId} = descriptor,
            entry            = NativeVesselTransaction.resolveVessel(descriptor, itemId),
            admission        = nativeWindows?.getAdmission(sourceId, itemId),
            // A binding still being decided names its window as `connectingWindowId` and earns `windowId`
            // only on acceptance; a close arriving mid-decision must still reach that window.
            admittedWindowId = admission?.windowId ?? admission?.connectingWindowId ?? null,
            expected         = descriptor.windowNameFor(itemId),
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
     * @summary Closes over a host descriptor and returns the three `VesselPark` seams.
     *
     * The descriptor is the whole host-varying surface, measured across both existing consumers:
     * which window the conversion targets, whether the transaction owes a geometry restore, how a
     * vessel resolves, and where receipts land. Everything else is shared and lives here.
     * @param {Object} descriptor
     * @param {Function} descriptor.ownerWindowId Returns the host's current `windowId`.
     * @param {Function} descriptor.publishReceipt `(key, receipt) => void`; `key` is `'dispose'`, `'park'` or `'restore'`.
     * @param {Function} descriptor.resolveVessel `itemId => entry|null`.
     * @param {Function} descriptor.retireVessel `({generationToken, itemId, windowName}) => Promise<Boolean>`;
     * `generationToken` is present when the registry entry carries one and names the exact lineage a retry may close.
     * @param {Function} descriptor.targetWindowId Returns the conversion target's `windowId`.
     * @param {Function} [descriptor.restoreGeometry] `itemId => geometry|null`. Absent or returning
     * `null` declares a position-only transaction, which is NOT gated on `resize`.
     * @param {String} [descriptor.terminalRestoreOwner='route'] Who performs a TERMINAL restore —
     * `'drag'` asks the addon that may still own the gesture before addressing the route, `'route'`
     * addresses the route directly. A restore ending a drag wants `'drag'`; one ending a conversion
     * has no drag to hand back to and wants `'route'`.
     * @returns {{disposeVessel:Function,parkVessel:Function,reshowVessel:Function}}
     */
    static effectsFor(descriptor) {
        const
            heldInHand      = new Set(),
            restoreGeometry = descriptor.restoreGeometry ?? (() => null),
            snapshot        = rect => rect && {
                height: rect.height, width: rect.width, x: rect.x, y: rect.y
            };

        return {
            disposeVessel: async ({itemId, windowName}) => {
                heldInHand.delete(itemId);

                const
                    entry = descriptor.resolveVessel(itemId),
                    route = entry?.nativeRoute ?? null,
                    // The exact vessel the first call addresses. A successor admission for the same
                    // item shares the name, never the token or the window, so every call carries
                    // the lineage the registry named at the start.
                    identity = {itemId, windowName},
                    receipt  = {
                        admitted   : false,
                        attempts   : 0,
                        entry      : Boolean(entry),
                        itemId     : itemId ?? null,
                        nameMatches: !entry || entry.windowName === windowName,
                        refusal    : null,
                        stage      : 'retiring',
                        windowAlive: null,
                        windowName : windowName ?? null
                    };

                entry?.generationToken != null && (identity.generationToken = entry.generationToken);

                // Published before the first call and amended in place, like the park and restore
                // receipts: a reader after a refusal sees how far the dispose got and why.
                descriptor.publishReceipt?.('dispose', receipt);

                let disposed = false;

                // Bounded, exactly-once admitted: the host's retire refuses WITHOUT closing (the tear-out
                // keeps its slot on refusal), so one more attempt is made only while the vessel's window
                // still exists and the refusal was the host's close — a window already gone is never
                // closed twice, a missing or mismatched identity cannot change by waiting, and a second
                // refusal ends it. The classes say what the host's registry can say.
                while (!disposed && receipt.attempts < 2) {
                    receipt.attempts++;
                    disposed = Boolean(await descriptor.retireVessel({...identity}));

                    if (disposed) break;

                    receipt.refusal     = !entry ? 'no-vessel' : !receipt.nameMatches ? 'identity-mismatch' : 'host-close-refused';
                    receipt.windowAlive = entry?.windowId != null && Boolean(WindowManager.get(entry.windowId));

                    if (!receipt.windowAlive || receipt.refusal !== 'host-close-refused') break;

                    // One macrotask: whatever refused the close (a settle still in flight) gets to land.
                    await new Promise(resolve => setTimeout(resolve, 0));

                    // That macrotask may also have retired the vessel externally and admitted a successor
                    // under the same name: the retry re-reads the registry and closes nothing the first
                    // call did not address.
                    const live = descriptor.resolveVessel(itemId);

                    if (!live) {
                        receipt.refusal = 'no-vessel';
                        break
                    }

                    if (live.windowId !== entry.windowId || (live.generationToken ?? null) !== (entry.generationToken ?? null)) {
                        receipt.refusal = 'vessel-replaced';
                        break
                    }

                    receipt.windowAlive = Boolean(WindowManager.get(entry.windowId));

                    if (!receipt.windowAlive) break
                }

                receipt.admitted = disposed;
                receipt.stage    = disposed ? 'retired' : 'refused';

                // Retiring the vessel without retiring its orphan recovery leaves a matching
                // predecessor effect owning a window that no longer exists, which then competes
                // with the next park on the same handle. One consumer does this and one does not.
                // Same asymmetry as the acknowledgement: the retirement is bookkeeping over an
                // effect the consumer may never have armed, and it must not be able to revoke a
                // disposal that already happened.
                if (disposed && route?.nativeHandleKey) {
                    try {
                        await Neo.main.addon.DragDrop.retireWindowDragOrphanRecovery?.({
                            nativeHandleKey: route.nativeHandleKey,
                            targetWindowId : route.targetWindowId,
                            windowId       : descriptor.ownerWindowId(),
                            windowName
                        })
                    } catch (error) {/* nothing armed, or already retired: the disposal stands */}
                }

                return disposed
            },

            // The pointer path keeps the vessel in the hand: it is the window the user drags, so no
            // other window appears for it, and a re-exit onto the desktop still carries it. Nothing
            // moves, resizes or pauses pointer-follow; admission is the vessel's identity alone.
            parkVessel: ({itemId, windowName}) => {
                const held = descriptor.resolveVessel(itemId)?.windowName === windowName;

                held && heldInHand.add(itemId);
                descriptor.publishReceipt('park', {held, itemId, parked: held, physical: false, windowName});
                descriptor.publishReceipt('restore', null);

                return held
            },

            reshowVessel: async ({itemId, rect, terminal=false, windowName}) => {
                // A vessel held in the hand never moved: re-showing it means only that it is still
                // the same window.
                if (heldInHand.delete(itemId)) {
                    const admitted = descriptor.resolveVessel(itemId)?.windowName === windowName;

                    descriptor.publishReceipt('restore', {admitted, held: true, itemId, terminal});
                    return admitted
                }

                const
                    entry      = descriptor.resolveVessel(itemId),
                    route      = entry?.nativeRoute ?? null,
                    geometry   = restoreGeometry(itemId),
                    frame      = NativeVesselTransaction.toFrameOrigin(rect, entry?.windowId ?? null),
                    admissions = NativeVesselTransaction.resolveAdmissions(descriptor, entry, descriptor.targetWindowId() ?? null),
                    owesResize = Boolean(geometry);

                const receipt = {
                    authority: NativeVesselTransaction.describeAuthority(admissions, entry?.windowName === windowName),
                    frame,
                    geometry,
                    owesResize,
                    // Both are recorded because they answer different questions: `rect` is what the
                    // caller asked for in content space, `frame` is what the platform was handed.
                    // A receipt carrying only one cannot show that the chrome conversion happened.
                    rect     : snapshot(rect),
                    terminal
                };

                // Published first and amended in place, same as the park: a caller reading it
                // after a refusal must see which beat refused and what was compensated.
                descriptor.publishReceipt('restore', receipt);

                if (
                    !admissions.sourcePos.granted || (owesResize && !admissions.sourceResize.granted) ||
                    entry?.windowName !== windowName || !frame
                ) {
                    receipt.reason = 'native route or restore geometry refused';
                    return false
                }

                const
                    handle = {
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId       : descriptor.ownerWindowId()
                    },
                    // The addon owns a NAMED drag and needs the name to find it; `Neo.Main`'s
                    // window calls address the route alone. Sending the name to both worked and
                    // was still wrong: it put a field the platform ignores into an exactly-asserted
                    // payload, so the witness could no longer describe the call it was pinning.
                    data   = {...handle, windowName, x: frame.x, y: frame.y},
                    origin = {...handle, x: frame.x, y: frame.y},
                    resize = extent => Neo.Main.windowNativeResizeTo({...handle, ...extent});

                try {
                    // A non-terminal re-show always goes through the addon: the drag is live by
                    // definition, it holds the gesture's state, and a direct route mutation
                    // alongside it would be a second writer.
                    if (!terminal) {
                        receipt.admitted = await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true;
                        return receipt.admitted
                    }

                    // At TERMINAL time the two consumers legitimately differ, because they differ
                    // on whether a drag still exists. A restore that ends a drag asks its owner
                    // first and only then addresses the route; a restore that ends a CONVERSION has
                    // no drag to hand back to and addresses the route directly. Declared, not
                    // guessed — asking a nonexistent owner would silently succeed against a stale
                    // effect, and skipping a live one would make this a second writer.
                    if (descriptor.terminalRestoreOwner === 'drag') {
                        receipt.addonRestored = await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true;

                        if (receipt.addonRestored) {
                            receipt.admitted = true;
                            return true
                        }
                    }

                    // A matching predecessor effect still owns exact recovery. Never race it with a
                    // direct route mutation, and never let a position-only success stand in for an
                    // extent restore the recovery is still responsible for.
                    receipt.recoveryPending = await Neo.main.addon.DragDrop.hasWindowDragOrphanRecovery?.(data) === true;

                    if (receipt.recoveryPending) {
                        receipt.refusedAt = 'recovery-pending';
                        return false
                    }

                    // Extent before position: a window restored to its old size at the park origin
                    // is briefly visible in the wrong place, whereas the reverse ordering is not
                    // observable. On refusal the park extent is put back, so a half-restored
                    // window never survives the failure.
                    if (owesResize) {
                        receipt.resized = await resize(geometry.restore) === true;

                        if (!receipt.resized) {
                            await resize(geometry.park);
                            receipt.refusedAt = 'resize';
                            return false
                        }
                    }

                    receipt.moved = await Neo.Main.windowNativeMoveTo(origin) === true;

                    if (!receipt.moved) {
                        // Compensating a failed move means undoing the extent too, in the same
                        // order it was applied — otherwise the vessel keeps its restored size at
                        // the park origin and the next re-show measures from a lie.
                        if (owesResize) {
                            receipt.compensationResized = await resize(geometry.park) === true;

                            if (receipt.compensationResized) {
                                receipt.compensationMoved = await Neo.Main.windowNativeMoveTo({
                                    ...handle, x: geometry.park.x, y: geometry.park.y
                                }) === true
                            }
                        }

                        receipt.refusedAt = 'move';
                        return false
                    }

                    receipt.admitted = true;

                    // The vessel is home; this releases the recovery effect that was owning the
                    // failure case, and it is deliberately unable to revoke the success above.
                    // A consumer that never arms orphan recovery has nothing to release, and a
                    // bookkeeping release that threw would otherwise convert a completed restore
                    // into a refusal — losing a success claim after an await.
                    try {
                        receipt.recoveryAcknowledged =
                            await Neo.main.addon.DragDrop.acknowledgeWindowDragOrphanRecovery?.(data) === true
                    } catch (error) {
                        receipt.recoveryAcknowledged = false
                    }

                    return true
                } catch (error) {
                    receipt.error     = String(error?.message || error);
                    receipt.refusedAt = 'throw';
                    return false
                }
            }
        }
    }
}

export default Neo.setupClass(NativeVesselTransaction);
