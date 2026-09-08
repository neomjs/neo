import Controller        from '../../../src/controller/Component.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @summary Workstation's native vessel policy: which OS window a torn pane converts onto, the
 * platform effects that park and re-show it, and the receipts that make a refusal legible.
 *
 * The engine already owns the DECISIONS. `Neo.dashboard.dock.window.VesselPark` is the in-gesture
 * authority — park it, never close it; re-show the same window; dispose exactly once on commit —
 * and it reaches a host through `callEffect`. What lives here is the other side of that seam: the
 * effects themselves, and the product policy choosing their target.
 *
 * Those effects are intricate rather than clever. Popup acquisition consumes transient user
 * activation and `windowOpen` reports failure by boolean, so a mid-gesture reopen cannot be relied
 * on; conversion therefore parks the real window behind its target and re-shows the same
 * generation. A source whose outer frame cannot fit shrinks first through its exact native route,
 * and a refocus refusal compensates back to the original extent.
 *
 * **Borrowed, never owned.** `tearOutHandlers`, `vesselParkHandlers`, `nativeWindows` and the
 * embodiments belong to the workspace and are reached through {@link #component}. This controller
 * owns only the park geometry, the retry counters, the conversion target and its own receipts —
 * so destroying it releases those and disturbs no lifecycle the engine or the workspace is running.
 *
 * @class Workstation.view.VesselController
 * @extends Neo.controller.Component
 */
class VesselController extends Controller {
    static config = {
        /**
         * @member {String} className='Workstation.view.VesselController'
         * @protected
         */
        className: 'Workstation.view.VesselController'
    }

    /**
     * Exact pre-conversion and target-cover outer geometry for parked tear-out vessels.
     * Runtime-only physical recovery authority; never persisted workspace state.
     * @member {Object} tearOutParkGeometries={}
     * @protected
     */
    tearOutParkGeometries = {}
    /**
     * Park attempts per vessel item id since that vessel last parked. The coordinator retries a
     * refused park; a stalled retry reads live as a rising count with the same `refusedAt`.
     * @member {Object} tearOutParkAttempts={}
     * @protected
     */
    tearOutParkAttempts = {}
    /**
     * The runtime window id of the vessel an in-flight conversion is hovering over — stashed by the
     * conversion-in seam so the park's cover geometry resolves the exact target. Never persisted
     * workspace state: a window is a render target.
     * @member {String|Number|null} vesselConversionTargetWindowId=null
     * @protected
     */
    vesselConversionTargetWindowId = null
    /**
     * Most recent exact-handle park admission receipt.
     *
     * `parked` and `physical` are separate answers, and the pair is the point: `parked: true` says
     * the park was SATISFIED, `physical: false` that it performed no platform effect. A main-window
     * target under a native titlebar is exactly that case — there is nothing to move, so the park
     * succeeds having done nothing. A reader taking `parked` as proof of a platform call would go
     * looking for a move that never happened.
     * @member {Object|null} lastVesselParkReceipt=null
     * @protected
     */
    lastVesselParkReceipt = null
    /**
     * Most recent exact-handle restore admission receipt.
     * @member {Object|null} lastVesselRestoreReceipt=null
     * @protected
     */
    lastVesselRestoreReceipt = null
    /**
     * Most recent vessel-open receipt. Declared here rather than assigned ad hoc, which is what it
     * was on the workspace — an undeclared field a reader could only find by grepping its writes.
     * @member {Object|null} lastVesselOpen=null
     * @protected
     */
    lastVesselOpen = null
    /**
     * Most recent exact vessel-close attempt for bounded headed-failure diagnosis. Native handle
     * authority is represented only by presence/match booleans; its secret key never enters this
     * worker-visible receipt.
     * @member {Object|null} lastTearOutClose=null
     * @protected
     */
    lastTearOutClose = null

    /**
     * @summary True from the first line of `destroy()` until `super.destroy()` returns, so an effect
     * that has not yet dispatched a platform call refuses to start one while an already-dispatched
     * effect still settles and honours its obligations.
     *
     * It covers only that window on purpose: `core.Base#destroy` deletes every writable own
     * property, so this flag is gone afterwards and `isDestroyed` — which that same method sets —
     * carries the signal from there. The guards test both, and the pair is total.
     * @member {Boolean} isTearingDown=false
     * @protected
     */
    isTearingDown = false

    /**
     * @summary Releases only what this controller owns, without stranding an effect still in flight.
     *
     * Teardown is **not** quiescent — a gesture can be mid-dispatch when the workspace goes away —
     * so the contract has two halves:
     *
     * - **Cancellation before dispatch.** Every effect entry point refuses while `isTearingDown` or
     *   `isDestroyed` holds, in its own return shape, so no NEW platform call is started.
     * - **Settlement after dispatch.** An already-dispatched effect runs to completion and keeps its
     *   platform obligations. It can, because its receipt is a local object rather than a field read
     *   back off the instance, and because park-geometry release goes through
     *   {@link #releaseParkGeometry}. Both matter: `core.Base#destroy` DELETES own properties, so a
     *   settling effect touching them directly throws into a surrounding catch — reporting a
     *   successful platform call as a refusal.
     *
     * Nothing is written back onto a torn-down controller, and each platform effect still happens
     * exactly once. The borrowed owners are deliberately untouched: retiring a Group participant or
     * a tear-out handler from here would destroy something this controller never created.
     * @param {...*} args
     */
    destroy(...args) {
        const me = this;

        // Set before anything is cleared: an in-flight effect reads this at its next dispatch
        // boundary, so nothing new starts while the fields are going away.
        me.isTearingDown = true;

        me.tearOutParkGeometries = {};
        me.tearOutParkAttempts   = {};

        me.vesselConversionTargetWindowId = null;
        me.lastVesselParkReceipt          = null;
        me.lastVesselRestoreReceipt       = null;
        me.lastVesselOpen                 = null;
        me.lastTearOutClose               = null;

        super.destroy(...args)
    }

    /**
     * @summary Uses the document's semantic key for native admission too.
     * @param {String} itemId
     * @returns {String}
     */
    tearOutWorkspaceKey(itemId) {
        return this.component.constructor.vesselWorkspaceId(itemId)
    }

    /**
     * @summary Retries an exact retained vessel retirement before admitting a successor tear-out.
     *
     * A strict close refusal keeps both lifecycle owners so recovery remains possible. The next
     * boundary exit must retire that generation and clear its park owner before opening another
     * popup; a second refusal ends the newly armed window drag instead of leaving it wedged.
     * @param {Object} data
     * @returns {Promise<Boolean>}
     * @protected
     */
    async onDockTearOutExit(data) {
        let me        = this,
            component = me.component,
            active    = component.tearOutHandlers.activeVessel;

        if (active) {
            const retired = await component.tearOutHandlers.retireActiveVessel(active);

            if (!retired) {
                data.sortZone?.endWindowDrag();
                return false
            }

            component.vesselParkHandlers.onVesselRetired({itemId: active.itemId, retirement: true})
        }

        await component.tearOutHandlers.onDockTearOutExit(data);

        return true
    }

    /**
     * @summary Resolves the exact live vessel identity for one torn item, connect- or commit-side.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    resolveTearOutVessel(itemId) {
        let {component}     = this,
            {nativeWindows} = component,
            entry           = nativeWindows?.getConnection(component.id, itemId) ?? nativeWindows?.getOwner(component.id, itemId);

        if (!entry?.windowId) return null;

        return {
            ...entry,
            itemId,
            nativeRoute: entry.nativeRoute ?? Neo.manager?.Window?.get(entry.windowId)?.nativeRoute ?? null,
            windowName : entry.windowName ?? `tearout-${itemId}`
        }
    }

    /**
     * @summary Drops one item's park geometry, tolerating a teardown that landed mid-effect.
     *
     * Clearing the map is bookkeeping this controller owns; the platform obligations around it are
     * not. `core.Base#destroy` DELETES own properties, so an effect still settling would throw on
     * `delete undefined[itemId]` — and the surrounding catch swallowed that throw, turning a
     * successful platform call into a reported refusal. One seam, because a guard added to the site
     * someone happens to be reading leaves the other five unguarded.
     * @param {String} itemId
     * @protected
     */
    releaseParkGeometry(itemId) {
        this.tearOutParkGeometries && delete this.tearOutParkGeometries[itemId]
    }

    /**
     * @summary Records one item's park geometry, tolerating a teardown that landed mid-effect.
     * @param {String} itemId
     * @param {Object} geometry
     * @protected
     */
    storeParkGeometry(itemId, geometry) {
        this.tearOutParkGeometries && (this.tearOutParkGeometries[itemId] = geometry)
    }

    /**
     * @summary Counts one park attempt and returns the new count; 1 when the map is already gone.
     *
     * The counter is retry authority, so an effect settling after teardown still needs an answer —
     * it just has nowhere durable to keep it, and the workspace it would have served is going away.
     * @param {String} itemId
     * @returns {Number}
     * @protected
     */
    bumpParkAttempts(itemId) {
        const me = this;

        if (!me.tearOutParkAttempts) return 1;

        return me.tearOutParkAttempts[itemId] = (me.tearOutParkAttempts[itemId] ?? 0) + 1
    }

    /**
     * @summary Clears one item's retry count, tolerating a teardown that landed mid-effect.
     * @param {String} itemId
     * @protected
     */
    releaseParkAttempts(itemId) {
        this.tearOutParkAttempts && delete this.tearOutParkAttempts[itemId]
    }

    /**
     * @summary Retires a parked vessel outright — the disposal half of the park lifecycle.
     * Consumes the tear-out machine's active slot, then closes its exact parked vessel — the ONE
     * settle path for a committed conversion; a refusal retains exact retry authority.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async disposeParkedTearOutVessel({itemId, windowName}) {
        if (this.isTearingDown || this.isDestroyed) return false;

        let me    = this,

            component = me.component,
            entry = me.resolveTearOutVessel(itemId),
            route = entry?.nativeRoute;

        const disposed = await component.tearOutHandlers.retireActiveVessel({itemId, windowName});

        if (disposed) {
            me.releaseParkGeometry(itemId);
            me.releaseParkAttempts(itemId);

            route?.nativeHandleKey && await Neo.main.addon.DragDrop.retireWindowDragOrphanRecovery({
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId       : component.windowId,
                windowName
            })
        }

        return disposed
    }

    /**
     * @summary Opens one theme-correct vessel window for a mid-gesture boundary exit.
     *
     * Reuses the workstation viewport's `?popout=` pure-pane-host mode. The vessel carries the slot the
     * engine reserved in this workspace's Group through `Main.windowOpen`; which pane it shows is
     * content and stays in the URL, whom it belongs to is identity and never does. The bound child
     * immediately carries the same live pane through {@link Neo.dashboard.dock.window.VesselEmbodiment};
     * it owns no workspace document. Fail-closed per the admission contract: `windowOpen` returns
     * a BOOLEAN (a blocked popup never throws), and any falsy/throwing acquisition returns `null`
     * so the gesture degrades to its in-window fallback. The theme bootstrap is part of that
     * acquisition rather than optional presentation: an unavailable authority reaches the outer
     * diagnostic boundary and prevents an unthemed child from opening.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @param {Object} request.topologyIdentity The reserved slot, written into the vessel's carrier.
     * @returns {Promise<{popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({itemId, proxyRect, topologyIdentity}) {
        if (this.isTearingDown || this.isDestroyed) return null;

        let me         = this,
            component  = me.component,
            {windowId} = component,
            windowName = `tearout-${itemId}`;

        // Diagnostic trail for the birth gate: absence has three distinct layers (admission
        // refused / platform refused the window / window granted but never bound), and the
        // failure diag must name which one this gesture died in.
        const openReceipt = me.lastVesselOpen = {itemId, stage: 'invoked'};

        try {
            let [winData, bootstrap] = await Promise.all([
                    Neo.Main.getWindowData({windowId}),
                    Neo.Main.getByPath({path: 'WorkstationBootstrap', windowId})
                ]),
                schemes       = bootstrap?.schemes || {},
                selectedTheme = Object.hasOwn(schemes, component.theme)
                    ? component.theme
                    : bootstrap?.defaultTheme || component.theme,
                width  = Math.max(Math.round(proxyRect?.width  || 480), 320),
                height = Math.max(Math.round(proxyRect?.height || 360), 240),
                left   = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
                top    = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop);

            let opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true, resize: true},
                stagedColorScheme : schemes[selectedTheme],
                topologyIdentity,
                url               : `./index.html?popout=${itemId}&theme=${encodeURIComponent(selectedTheme)}`,
                windowFeatures    : `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName
            });

            openReceipt.stage = opened === false ? 'windowOpen-false' : 'granted';

            if (opened === false) {
                return null
            }

            component.tearOutVesselDims = {height, width};

            return {popupHeight: height, popupWidth: width, windowName}
        } catch (error) {
            openReceipt.stage = 'threw';
            openReceipt.error = String(error?.message || error);
            return null
        }
    }

    /**
     * @summary Consumes the tear-out slot, then closes that exact vessel; a refusal keeps retry authority.
     * The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry, cancel,
     * or a refused model commit). Identity is the slot's lineage token — a successor admission for
     * the same item shares the window name, never the token — so a retirement presenting a superseded
     * token is refused and the live vessel survives it. The Group's native retirement holds the
     * retirement fence and clears the ownership records around this call; the platform close and its
     * receipt are this host's, and an explicit refusal retains exact retry authority.
     * @param {Object} vessel
     * @param {String} [vessel.generationToken] The reservation's lineage token.
     * @param {String} vessel.itemId
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available.
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async closeTearOutVessel({generationToken, itemId, nativeRoute, windowName}) {
        if (this.isTearingDown || this.isDestroyed) return false;

        let me               = this,

            component = me.component,
            entry            = me.resolveTearOutVessel(itemId),
            admission        = component.nativeWindows?.getAdmission(component.id, itemId),
            expected         = `tearout-${itemId}`,
            exactToken       = entry?.generationToken ?? admission?.generationToken ?? null,
            embodiedWindowId = entry?.windowId ?? admission?.windowId ?? component.tearOutEmbodiment.getWindowId(itemId),
            closed           = false;

        const closeReceipt = me.lastTearOutClose = {
            identity: {
                entryNameMatches : !entry || entry.windowName === windowName,
                hasEntry         : Boolean(entry),
                hasItemId        : Boolean(itemId),
                lineageMatches   : !generationToken || !exactToken || generationToken === exactToken,
                windowNameMatches: windowName === expected
            },
            itemId: itemId ?? null,
            stage : 'validating-identity'
        };

        if (
            !itemId || windowName !== expected || (entry && entry.windowName !== windowName) ||
            (generationToken && exactToken && generationToken !== exactToken)
        ) {
            closeReceipt.stage = 'identity-refused';
            return false
        }

        nativeRoute ??= entry?.nativeRoute ?? (
            admission?.windowId && Neo.manager?.Window?.get(admission.windowId)?.nativeRoute
        );

        const exactWindowId = entry?.windowId ?? admission?.windowId;

        closeReceipt.route = {
            closeCapable      : !nativeRoute || nativeRoute.capabilities?.close === true,
            exactTargetMatches: !nativeRoute || !exactWindowId || nativeRoute.targetWindowId === exactWindowId,
            exactWindowId     : exactWindowId ?? null,
            hasHandle         : !nativeRoute || Boolean(nativeRoute.nativeHandleKey),
            ownerMatches      : !nativeRoute || nativeRoute.ownerWindowId === component.windowId,
            ownerWindowId     : nativeRoute?.ownerWindowId ?? null,
            present           : Boolean(nativeRoute),
            targetPresent     : !nativeRoute || Boolean(nativeRoute.targetWindowId),
            targetWindowId    : nativeRoute?.targetWindowId ?? null
        };

        if (nativeRoute && (
            !nativeRoute.nativeHandleKey || nativeRoute.ownerWindowId !== component.windowId ||
            !nativeRoute.targetWindowId || nativeRoute.capabilities?.close !== true ||
            (exactWindowId && nativeRoute.targetWindowId !== exactWindowId)
        )) {
            closeReceipt.stage = 'route-refused';
            return false
        }

        // The engine established retirement before this call; a refused close retains the exact
        // route + tear-out machine slot for retry, but the content goes safely home first.
        if (embodiedWindowId && component.tearOutEmbodiment.isStaged(itemId)) {
            const sourceOwns = Boolean(WorkspaceDocument.findContainingTabsId(component.dockModel, itemId)),
                  settled    = component.tearOutEmbodiment[sourceOwns ? 'restore' : 'promote']({
                      itemId, windowId: embodiedWindowId
                  });

            closeReceipt.embodiment = {settled, sourceOwns, staged: true};

            if (!settled) {
                closeReceipt.stage = 'embodiment-refused';
                return false
            }
        }

        try {
            if (nativeRoute) {
                closeReceipt.stage = 'native-dispatched';
                closed = await Neo.Main.windowNativeClose({
                    nativeHandleKey: nativeRoute.nativeHandleKey,
                    targetWindowId : nativeRoute.targetWindowId,
                    windowId       : component.windowId
                }) === true
            } else {
                closeReceipt.stage = 'semantic-dispatched';
                // Before connect there is no exact route to correlate yet; the active tear-out
                // slot's unguessable semantic name is the only available authority. Once a route
                // exists, ANY invalidity above fails closed — never downgrade to same-name close.
                await Neo.Main.windowClose({names: [windowName], windowId: component.windowId});
                closed = true
            }
        } catch (error) {
            closeReceipt.error = String(error?.message || error);
            closeReceipt.stage = 'threw';
            return false
        }

        closeReceipt.closed = closed;

        if (!closed) {
            closeReceipt.stage = 'platform-refused';
            return false
        }

        me.releaseParkGeometry(itemId);
        closeReceipt.stage = 'acknowledged';

        return true
    }

    /**
     * @summary Moves a live vessel off-screen for the duration of a gesture, recording why if the platform refuses.
     * Parks one converted vessel behind its conversion target — the cover geometry that keeps
     * the REAL OS window alive while the proxy embodies over the target. Close-and-reopen is a
     * one-way door (mid-gesture popup acquisition reads as unsolicited), so conversion parks
     * instead: the same exact generation re-shows on out-conversion or restore. The focus /
     * resize / move / refocus chain is the platform-law choreography (z-order hides the parked
     * vessel). A source whose outer frame cannot fit behind the target first shrinks through its
     * exact native route; a refocus refusal compensates to the original extent and source rect.
     * On the native-titlebar path to the MAIN window nothing is parked at all — the hold is the
     * gesture: the transfer lands when the dwell completes and the popup retires right after, so the
     * park answers satisfied with no platform effect (the platform never grants a popup an opener
     * focus without a user activation, and an OS titlebar drag carries none).
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {Boolean} [vessel.nativeTitlebar=false] The park follows an OS titlebar drag terminal
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async parkTearOutVessel({itemId, nativeTitlebar=false, windowName}) {
        if (this.isTearingDown || this.isDestroyed) return false;

        let me           = this,

            component = me.component,
            windowId     = component.windowId,
            entry        = me.resolveTearOutVessel(itemId),
            route        = entry?.nativeRoute,
            sourceWindow = Neo.manager?.Window?.get(entry?.windowId),
            targetWindow = Neo.manager?.Window?.get(me.vesselConversionTargetWindowId),
            targetRoute  = targetWindow?.nativeRoute,
            targetIsMain = me.vesselConversionTargetWindowId === windowId,
            // The size check and the authority check speak published inner-window geometry (a child
            // omitting outerRect never rejects an authorized live vessel); the park POSITION is a
            // frame: `moveTo` places the source frame on the target's frame origin, so the parked
            // window lies behind the target's chrome and content alike.
            sourceRect   = sourceWindow?.innerRect,
            sourceOuter  = sourceWindow?.outerRect ?? sourceRect,
            targetRect   = targetWindow?.innerRect,
            targetOuter  = targetWindow?.outerRect ?? targetRect,
            needsResize  = !nativeTitlebar && Boolean(sourceOuter && targetRect && (
                sourceOuter.width > targetRect.width || sourceOuter.height > targetRect.height
            )),
            parkSize      = needsResize ? {
                height: Math.min(sourceOuter.height, targetRect.height),
                width : Math.min(sourceOuter.width, targetRect.width)
            } : null,
            restoreRect   = sourceOuter ? {
                height: sourceOuter.height,
                width : sourceOuter.width,
                x     : sourceOuter.x,
                y     : sourceOuter.y
            } : null,
            parkGeometry  = needsResize ? {
                park   : {...parkSize, x: targetOuter?.x, y: targetOuter?.y},
                restore: restoreRect
            } : null;

        const parkReceipt = me.lastVesselParkReceipt = {
            authority: {
                entryNameMatches     : entry?.windowName === windowName,
                sourceHasHandle      : Boolean(route?.nativeHandleKey),
                sourceOwnerMatches   : route?.ownerWindowId === windowId,
                sourcePositionCapable: route?.capabilities?.position === true,
                sourceResizeCapable  : route?.capabilities?.resize === true,
                sourceTargetMatches  : route?.targetWindowId === entry?.windowId,
                targetFocusCapable   : targetRoute?.capabilities?.focus === true,
                targetHasHandle      : Boolean(targetRoute?.nativeHandleKey),
                targetOwnerMatches   : targetRoute?.ownerWindowId === windowId,
                targetTargetMatches  : targetRoute?.targetWindowId === me.vesselConversionTargetWindowId
            },
            needsResize,
            parkSize,
            sourceInner: sourceRect && {
                height: sourceRect.height, width: sourceRect.width, x: sourceRect.x, y: sourceRect.y
            },
            sourceOuter: sourceOuter && {
                height: sourceOuter.height, width: sourceOuter.width, x: sourceOuter.x, y: sourceOuter.y
            },
            targetInner: targetRect && {
                height: targetRect.height, width: targetRect.width, x: targetRect.x, y: targetRect.y
            },
            targetOuter: targetOuter && {
                height: targetOuter.height, width: targetOuter.width, x: targetOuter.x, y: targetOuter.y
            }
        };
        me.lastVesselRestoreReceipt = null;

        parkReceipt.parkAttempts = me.bumpParkAttempts(itemId);

        if (
            !route?.nativeHandleKey || route.ownerWindowId !== windowId ||
            route.targetWindowId !== entry.windowId || route.capabilities?.position !== true ||
            (needsResize && route.capabilities?.resize !== true) ||
            (!targetIsMain && (
                !targetRoute?.nativeHandleKey || targetRoute.ownerWindowId !== windowId ||
                targetRoute.targetWindowId !== me.vesselConversionTargetWindowId ||
                targetRoute.capabilities?.focus !== true
            )) ||
            entry.windowName !== windowName || !sourceRect || !sourceOuter || !targetRect ||
            (nativeTitlebar && (
                sourceRect.width > targetRect.width || sourceRect.height > targetRect.height
            ))
        ) {
            parkReceipt.reason = 'native route or live cover geometry refused';
            return false
        }

        // The hold is the gesture for a native-titlebar drop INTO this main window: the transfer lands
        // when the dwell completes and the popup is retired right after, so there is nothing to park —
        // and the park's focus step could never be granted on this path anyway (no user activation
        // reaches a popup during an OS titlebar drag, so a popup asking its opener to take focus is
        // declined for as long as the user holds, and after). The strict park is answered as satisfied
        // with no physical effect; the receipt says so, the attempt counter resets as after a park, and
        // the conversion bookkeeping around this call runs exactly as for a parked vessel. Popup
        // targets keep the physical park below.
        if (nativeTitlebar && targetIsMain) {
            me.releaseParkAttempts(itemId);
            parkReceipt.parked   = true;
            parkReceipt.physical = false;
            parkReceipt.reason   = 'main-window target: nothing to park, the popup retires after the commit';
            return true
        }

        // The root window has no opener-minted nativeRoute, so a main target is focused through the
        // popup's own Main actor (`opener.focus()`, granted under the user activation a keyboard
        // command carries — the pointer conversion path); a popup target is focused by its owner
        // through the handle it minted.
        //
        // A main-window target under a native titlebar never arrives here: it returns satisfied
        // above, having nothing to park. So the main branch below serves the pointer conversion
        // path alone — there is no native-titlebar main case to find.
        const focusTarget = () => targetIsMain
            ? Neo.Main.windowFocus({windowId: entry.windowId})
            : Neo.Main.windowNativeFocus({
                nativeHandleKey: targetRoute.nativeHandleKey,
                targetWindowId : targetRoute.targetWindowId,
                windowId       : windowId
            });

        try {
            let focused = await focusTarget() === true;

            parkReceipt.focused = focused;

            if (!focused) {
                // A popup target: the owner focuses a window it opened, which the platform grants
                // once the OS releases the dragged source. The coordinator retries the park.
                parkReceipt.refusedAt = 'focus';
                return false
            }

            const moveData = {
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId,
                windowName,
                x              : targetOuter.x,
                y              : targetOuter.y
            };

            if (!nativeTitlebar) {
                moveData.parkSize    = parkSize;
                moveData.restoreRect = restoreRect
            }

            let moved = await (nativeTitlebar
                ? Neo.Main.windowNativeMoveTo(moveData)
                : Neo.main.addon.DragDrop.parkWindowDrag(moveData)) === true;

            parkReceipt.moved = moved;

            if (!moved) {
                parkReceipt.refusedAt = 'move';
                return false
            }

            parkGeometry && me.storeParkGeometry(itemId, parkGeometry);

            let refocused = await focusTarget() === true;

            parkReceipt.refocused = refocused;

            if (!refocused) {
                const restoreData = {
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    windowId,
                    windowName,
                    x              : sourceOuter.x,
                    y              : sourceOuter.y
                };
                let compensated = await (nativeTitlebar
                    ? Neo.Main.windowNativeMoveTo(restoreData)
                    : Neo.main.addon.DragDrop.resumeWindowDrag(restoreData)) === true;

                parkReceipt.compensated = compensated;
                parkReceipt.parked      = !compensated;
                parkReceipt.refusedAt   = 'refocus';
                compensated && me.releaseParkGeometry(itemId);

                // Recovery ownership and visual admission are separate: if target refocus failed,
                // the real source may still cover the target. Never publish conversion-ready on
                // that frame, even when exact source restoration also needs a later retry.
                return false
            }

            me.releaseParkAttempts(itemId);
            parkReceipt.parked = true;

            return true
        } catch (error) {
            parkReceipt.error  = String(error?.message || error);
            parkReceipt.reason = 'platform effect threw';
            return false
        }
    }

    /**
     * @summary Returns a parked vessel to its recorded geometry and acknowledges the recovery obligation.
     * Re-shows the same exact parked generation at the logical pointer-owned origin. During a
     * live gesture the DragDrop addon also resumes physical pointer-follow; at a native drag
     * terminal that addon has already reset its session, so a strict refusal falls through to
     * the same exact Main route for the final restore; semantic-name routing is never used.
     * @param {Object} vessel
     * @param {String} vessel.itemId
     * @param {Object} vessel.rect
     * @param {Boolean} [vessel.terminal=false]
     * @param {String} vessel.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async reshowTearOutVessel({itemId, rect, terminal=false, windowName}) {
        if (this.isTearingDown || this.isDestroyed) return false;

        let me       = this,

            component = me.component,
            windowId = component.windowId,
            entry    = me.resolveTearOutVessel(itemId),
            route    = entry?.nativeRoute,
            geometry = me.tearOutParkGeometries?.[itemId] ?? null,
            // `rect` is where the pane's CONTENT re-shows — the proxy's logical rect, or the
            // viewport rect captured at conversion-in. `moveTo` places the FRAME, so the window's
            // own chrome comes off the content origin; a window that never published chrome
            // re-shows content-on-frame, the pre-chrome behaviour.
            chrome   = Neo.manager?.Window?.get(entry?.windowId)?.chrome,
            frame    = Number.isFinite(rect?.x) && Number.isFinite(rect?.y) ? {
                x: rect.x - (chrome?.left ?? 0),
                y: rect.y - (chrome?.top  ?? 0)
            } : null;

        const restoreReceipt = me.lastVesselRestoreReceipt = {
            frame,
            geometry,
            rect: rect && {height: rect.height, width: rect.width, x: rect.x, y: rect.y},
            terminal
        };

        if (
            !route?.nativeHandleKey || route.ownerWindowId !== windowId ||
            route.targetWindowId !== entry.windowId || route.capabilities?.position !== true ||
            (geometry && route.capabilities?.resize !== true) ||
            entry.windowName !== windowName ||
            !Number.isFinite(rect?.x) || !Number.isFinite(rect?.y)
        ) {
            restoreReceipt.reason = 'native route or restore geometry refused';
            return false
        }

        let data = {
            nativeHandleKey: route.nativeHandleKey,
            targetWindowId : route.targetWindowId,
            windowId,
            windowName,
            x              : frame.x,
            y              : frame.y
        };

        try {
            if (!terminal) {
                const admitted = await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true;

                restoreReceipt.admitted = admitted;
                admitted && me.releaseParkGeometry(itemId);

                return admitted
            }

            const addonRestored = await Neo.main.addon.DragDrop.resumeWindowDrag(data) === true;

            restoreReceipt.addonRestored = addonRestored;

            if (addonRestored) {
                me.releaseParkGeometry(itemId);
                restoreReceipt.admitted = true;

                return true
            }

            const recoveryPending = await Neo.main.addon.DragDrop.hasWindowDragOrphanRecovery(data) === true;

            restoreReceipt.recoveryPending = recoveryPending;

            // A matching predecessor effect still owns exact recovery. Never race it with a second
            // direct route mutation or degrade a required extent restore into position-only success.
            if (recoveryPending) return false;

            if (geometry) {
                const resized = await Neo.Main.windowNativeResizeTo({
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    windowId,
                    ...geometry.restore
                }) === true;

                restoreReceipt.resized = resized;

                if (!resized) {
                    await Neo.Main.windowNativeResizeTo({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId,
                        ...geometry.park
                    });
                    return false
                }
            }

            const moved = await Neo.Main.windowNativeMoveTo({
                nativeHandleKey: route.nativeHandleKey,
                targetWindowId : route.targetWindowId,
                windowId,
                x              : rect.x,
                y              : rect.y
            }) === true;

            restoreReceipt.moved = moved;

            if (!moved) {
                if (geometry) {
                    const compensationResized = await Neo.Main.windowNativeResizeTo({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        windowId,
                        ...geometry.park
                    }) === true;

                    restoreReceipt.compensationResized = compensationResized;

                    if (compensationResized) {
                        restoreReceipt.compensationMoved =
                            await Neo.Main.windowNativeMoveTo({
                                nativeHandleKey: route.nativeHandleKey,
                                targetWindowId : route.targetWindowId,
                                windowId,
                                x              : geometry.park.x,
                                y              : geometry.park.y
                            }) === true
                    }
                }

                return false
            }

            restoreReceipt.admitted = true;
            // The map is gone if a teardown landed mid-flight. Clearing it is bookkeeping this
            // controller owns; the acknowledgement below is an obligation to the platform, and it
            // must not be skipped because our own bookkeeping no longer has anywhere to write.
            me.releaseParkGeometry(itemId);
            await Neo.main.addon.DragDrop.acknowledgeWindowDragOrphanRecovery(data);

            return true
        } catch (error) {
            restoreReceipt.error = String(error?.message || error);
            return false
        }
    }
}

export default Neo.setupClass(VesselController);
