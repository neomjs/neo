import Base          from '../../../core/Base.mjs';
import Rectangle     from '../../../util/Rectangle.mjs';
import WindowManager from '../../../manager/Window.mjs';

/**
 * @summary The default park / re-show / dispose transaction behind {@link Neo.dashboard.dock.window.VesselPark}'s
 * three required seams, and the tear-out close every host used to write for itself.
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
     * @summary Where a parked vessel goes so it covers the target as little as the display allows: the
     * corner of the target display's work area whose frame overlaps the target's content least, the
     * farthest one among equals, with the whole frame kept inside the work area.
     *
     * The park used to hide the vessel BEHIND the target and raise the target with `focus()`, which a
     * real OS mouse drag does not honour, so the vessel stayed on top of every affordance the
     * conversion produced (#19278). Clear of the target, it needs no z-order at all.
     * @param {Object} data
     * @param {{height:Number,width:Number}} data.frame The parked frame's outer extent
     * @param {Object} data.screen The target display's `availLeft`, `availTop`, `availWidth` and `availHeight`
     * @param {{height:Number,width:Number,x:Number,y:Number}} data.target The target's content rect
     * @returns {{cleared:Boolean,x:Number,y:Number}|null} The frame origin, and whether the frame misses the
     * target's content; `null` when an input is not measurable
     */
    static resolveClearPark({frame, screen, target} = {}) {
        const {availHeight, availLeft, availTop, availWidth} = screen ?? {};

        if (
            ![availHeight, availLeft, availTop, availWidth, frame?.height, frame?.width, target?.height, target?.width, target?.x, target?.y].every(Number.isFinite) ||
            availHeight <= 0 || availWidth <= 0 || frame.height <= 0 || frame.width <= 0
        ) {
            return null
        }

        const
            content = new Rectangle(target.x, target.y, target.width, target.height),
            right   = availLeft + Math.max(0, availWidth  - frame.width),
            bottom  = availTop  + Math.max(0, availHeight - frame.height);

        let best = null;

        for (const [x, y] of [[availLeft, availTop], [right, availTop], [availLeft, bottom], [right, bottom]]) {
            const
                overlap  = Rectangle.getIntersection(new Rectangle(x, y, frame.width, frame.height), content),
                area     = overlap ? overlap.width * overlap.height : 0,
                distance = Math.hypot(x + frame.width / 2 - content.x - content.width / 2, y + frame.height / 2 - content.y - content.height / 2);

            if (!best || area < best.area || (area === best.area && distance > best.distance)) {
                best = {area, distance, x, y}
            }
        }

        return {cleared: best.area === 0, x: best.x, y: best.y}
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
     * @param {Function} descriptor.publishReceipt `(key, receipt) => void`; `key` is `'park'` or `'restore'`.
     * @param {Function} descriptor.resolveVessel `itemId => entry|null`.
     * @param {Function} descriptor.retireVessel `({itemId, windowName}) => Promise<Boolean>`.
     * @param {Function} descriptor.targetWindowId Returns the conversion target's `windowId`.
     * @param {Function} [descriptor.restoreGeometry] `itemId => geometry|null`. Absent or returning
     * `null` declares a position-only transaction, which is NOT gated on `resize`.
     * @param {String} [descriptor.terminalRestoreOwner='route'] Who performs a TERMINAL restore —
     * `'drag'` asks the addon that may still own the gesture before addressing the route, `'route'`
     * addresses the route directly. A restore ending a drag wants `'drag'`; one ending a conversion
     * has no drag to hand back to and wants `'route'`.
     * @param {String} [descriptor.rectPlane='inner'] Which published rect the size metric and the
     * shrink extent speak — `'inner'` or `'outer'`. A child window may legitimately omit `outerRect`,
     * so a consumer whose admission does not depend on the frame stays on the inner plane rather
     * than refusing an otherwise-authorized live vessel.
     * @returns {{disposeVessel:Function,parkVessel:Function,reshowVessel:Function}}
     */
    static effectsFor(descriptor) {
        const
            restoreGeometry = descriptor.restoreGeometry ?? (() => null),
            // Which published rect the size metric and the shrink extent speak. A child window may
            // legitimately omit `outerRect`, so a consumer whose admission does not depend on the
            // frame stays on `innerRect` rather than rejecting an otherwise-authorized vessel.
            plane           = descriptor.rectPlane === 'outer' ? 'outerRect' : 'innerRect',
            snapshot        = rect => rect && {
                height: rect.height, width: rect.width, x: rect.x, y: rect.y
            };

        return {
            disposeVessel: async ({itemId, windowName}) => {
                const
                    entry    = descriptor.resolveVessel(itemId),
                    route    = entry?.nativeRoute ?? null,
                    disposed = await descriptor.retireVessel({itemId, windowName});

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

            parkVessel: async ({itemId, windowName}) => {
                const
                    entry          = descriptor.resolveVessel(itemId),
                    targetWindowId = descriptor.targetWindowId() ?? null,
                    geometry       = restoreGeometry(itemId),
                    sourceWindow   = WindowManager.get(entry?.windowId),
                    targetWindow   = WindowManager.get(targetWindowId),
                    route          = entry?.nativeRoute ?? null,
                    sourceRect     = sourceWindow?.[plane] ?? null,
                    targetRect     = targetWindow?.[plane] ?? null,
                    admissions     = NativeVesselTransaction.resolveAdmissions(descriptor, entry, targetWindowId),
                    authority      = NativeVesselTransaction.describeAuthority(admissions, entry?.windowName === windowName),
                    // The obligation, not the capability: `resize` is required exactly when this
                    // transaction has promised to restore an extent later.
                    owesResize     = Boolean(geometry),
                    receipt        = {authority, geometry, owesResize, sourceRect: snapshot(sourceRect), targetRect: snapshot(targetRect)};

                // The receipt is a stage machine this method amends as the choreography advances,
                // so it is published FIRST and mutated in place. A caller reading it after a
                // refusal must be able to see how far the transaction got, which a receipt
                // assembled only on success cannot express.
                descriptor.publishReceipt('park', receipt);
                descriptor.publishReceipt('restore', null);

                // The size precondition falls out of the same obligation, rather than being a second
                // policy: a parked vessel is no larger than the target, so a source that does not fit
                // must be shrunk first — and only a transaction that owes a geometry restore may
                // shrink it, because only that transaction has promised to give the extent back. One
                // consumer resizes and one refuses; both are this rule, read through their own
                // declared obligation.
                receipt.fits = Boolean(sourceRect && targetRect &&
                    sourceRect.width <= targetRect.width && sourceRect.height <= targetRect.height);

                if (
                    !admissions.sourcePos.granted || (owesResize && !admissions.sourceResize.granted) ||
                    !authority.entryNameMatches || !sourceRect || !targetRect || (!receipt.fits && !owesResize)
                ) {
                    receipt.reason = 'native route or live park geometry refused';
                    return false
                }

                try {
                    // The vessel parks clear of the target instead of behind it, so no step focuses
                    // anything (#19278); the parked frame is the shrunk extent, or the source's own.
                    const
                        extent = owesResize ? {
                            height: Math.min(sourceRect.height, targetRect.height),
                            width : Math.min(sourceRect.width, targetRect.width)
                        } : null,
                        frame  = extent ?? sourceWindow.outerRect ?? sourceRect,
                        {screen} = await Neo.Main.getWindowData({windowId: targetWindowId}),
                        park   = NativeVesselTransaction.resolveClearPark({frame, screen, target: targetWindow.innerRect ?? targetRect});

                    if (!park) {
                        receipt.refusedAt = 'screen';
                        return false
                    }

                    receipt.cleared = park.cleared;

                    if (extent) {
                        receipt.resized = await Neo.Main.windowNativeResizeTo({
                            ...extent,
                            nativeHandleKey: route.nativeHandleKey,
                            targetWindowId : route.targetWindowId,
                            windowId       : descriptor.ownerWindowId()
                        }) === true;

                        if (!receipt.resized) {
                            receipt.refusedAt = 'resize';
                            return false
                        }
                    }

                    receipt.requested = {x: park.x, y: park.y};
                    receipt.moved     = await Neo.main.addon.DragDrop.parkWindowDrag({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId       : descriptor.ownerWindowId(),
                        windowName,
                        x              : park.x,
                        y              : park.y
                    }) === true;

                    if (!receipt.moved) {
                        receipt.refusedAt = 'move';
                        return false
                    }

                    receipt.parked = true;
                    return true
                } catch (error) {
                    receipt.refusedAt = 'throw';
                    return false
                }
            },

            reshowVessel: async ({itemId, rect, terminal=false, windowName}) => {
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
