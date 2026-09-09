import Base          from '../../../core/Base.mjs';
import WindowManager from '../../../manager/Window.mjs';

/**
 * @summary The default park / re-show / dispose transaction behind {@link Neo.dashboard.dock.window.VesselPark}'s
 * three required seams.
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
     * moves it) and `focus` on the target (the parked window hides behind it). `resize` is resolved
     * unconditionally so the receipt can report the capability, and gated separately — reporting a
     * capability and requiring it are different questions, and conflating them is what made one
     * consumer's park look stricter than its own re-show.
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
     * @returns {{disposeVessel:Function,parkVessel:Function,reshowVessel:Function}}
     */
    static effectsFor(descriptor) {
        const restoreGeometry = descriptor.restoreGeometry ?? (() => null);

        return {
            disposeVessel: async ({itemId, windowName}) => {
                const
                    entry    = descriptor.resolveVessel(itemId),
                    route    = entry?.nativeRoute ?? null,
                    disposed = await descriptor.retireVessel({itemId, windowName});

                // Retiring the vessel without retiring its orphan recovery leaves a matching
                // predecessor effect owning a window that no longer exists, which then competes
                // with the next park on the same handle. One consumer does this and one does not.
                if (disposed && route?.nativeHandleKey) {
                    await Neo.main.addon.DragDrop.retireWindowDragOrphanRecovery({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId       : descriptor.ownerWindowId(),
                        windowName
                    })
                }

                return disposed
            },

            parkVessel: async ({itemId, windowName}) => {
                const
                    entry          = descriptor.resolveVessel(itemId),
                    targetWindowId = descriptor.targetWindowId() ?? null,
                    geometry       = restoreGeometry(itemId),
                    admissions     = NativeVesselTransaction.resolveAdmissions(descriptor, entry, targetWindowId),
                    authority      = NativeVesselTransaction.describeAuthority(admissions, entry?.windowName === windowName),
                    // The obligation, not the capability: `resize` is required exactly when this
                    // transaction has promised to restore an extent later.
                    owesResize     = Boolean(geometry);

                descriptor.publishReceipt('park', {authority, geometry, owesResize});
                descriptor.publishReceipt('restore', null);

                if (
                    !admissions.sourcePos.granted || (owesResize && !admissions.sourceResize.granted) ||
                    !admissions.targetFocus.granted || !authority.entryNameMatches
                ) {
                    return false
                }

                return true
            },

            reshowVessel: async ({itemId, rect, terminal=false, windowName}) => {
                const
                    entry      = descriptor.resolveVessel(itemId),
                    route      = entry?.nativeRoute ?? null,
                    geometry   = restoreGeometry(itemId),
                    frame      = NativeVesselTransaction.toFrameOrigin(rect, entry?.windowId ?? null),
                    admissions = NativeVesselTransaction.resolveAdmissions(descriptor, entry, descriptor.targetWindowId() ?? null),
                    owesResize = Boolean(geometry);

                descriptor.publishReceipt('restore', {
                    authority: NativeVesselTransaction.describeAuthority(admissions, entry?.windowName === windowName),
                    frame,
                    geometry,
                    owesResize,
                    terminal
                });

                if (
                    !admissions.sourcePos.granted || (owesResize && !admissions.sourceResize.granted) ||
                    entry?.windowName !== windowName || !frame
                ) {
                    return false
                }

                const data = {
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    windowId       : descriptor.ownerWindowId(),
                    windowName,
                    x              : frame.x,
                    y              : frame.y
                };

                try {
                    return terminal
                        ? await Neo.Main.windowNativeMoveTo(data) === true
                        : await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true
                } catch (error) {
                    return false
                }
            }
        }
    }
}

export default Neo.setupClass(NativeVesselTransaction);
