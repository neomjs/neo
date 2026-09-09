import GestureDriver     from './GestureDriver.mjs';
import DockLayoutAdapter from '../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @summary Optional Workstation native-window gesture scripts over the existing workspace owners.
 * @class Workstation.tour.NativeGestureDriver
 * @extends Workstation.tour.GestureDriver
 */
class NativeGestureDriver extends GestureDriver {
    static config = {
        /** @member {String} className='Workstation.tour.NativeGestureDriver' */
        className: 'Workstation.tour.NativeGestureDriver'
    }

    /**
     * @summary Polls one exact cross-window transfer through model adoption and queued projection.
     * @param {Object} expected
     * @param {String} expected.sourceWorkspaceId
     * @param {String} expected.targetWorkspaceId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object|null>}
     * @protected
     */
    async waitForCrossWindowTransfer(expected, {attempts=240, delay=16}={}) {
        let me = this.workspace, driver = this,
            receipt;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            receipt = me.lastCrossWindowTransfer;

            if (
                receipt?.applied === true && receipt.reconciled === true &&
                receipt.sourceWorkspaceId === expected?.sourceWorkspaceId &&
                receipt.targetWorkspaceId === expected?.targetWorkspaceId
            ) {
                return receipt
            }

            attempt < attempts && await driver.timeout(delay)
        }

        return receipt ?? null
    }

    /**
     * @summary Scene 3's real-pointer executor: converts a second tear-out while the gesture remains
     * down, parks that exact OS window over a committed sibling vessel, and releases only after one
     * semantic + rendered target claim has settled.
     *
     * The source stays on the ordinary tab-drag path. It first crosses the source workspace boundary
     * to acquire its real vessel; subsequent events keep source-local coordinates outside while
     * moving in global screen space over the target vessel. The landed conversion sensor and
     * coordinator therefore own the park, preview, arbitration, and atomic transfer. This method
     * drives and reports those seams; it never calls a reducer or target commit directly.
     * @param {Object} step
     * @param {String} step.itemId Incoming pane id.
     * @param {String} step.sourceNodeId Main-workspace tabs node currently holding the pane.
     * @param {String} step.targetItemId Existing detached pane whose vessel becomes the target.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.dwellDelay=0] Optional headed-witness hold after target readiness.
     * @param {Number} [options.moveDelay=16]
     * @param {Number} [options.moveSteps=4]
     * @param {Boolean} [options.showCursor=false] Film mode: show the synthetic cursor in whichever
     * window currently owns the visible leg of the gesture.
     * @returns {Promise<Object>}
     */
    async executeCrossWindowDockStep(
        step,
        {attempts=240, dwellDelay=0, moveDelay=16, moveSteps=4, showCursor=false}={}
    ) {
        return this.runGesture(async run => {
            let me                                   = run.workspace, driver = this,
                {itemId, sourceNodeId, targetItemId} = step || {},
                targetWorkspaceId                    = me.constructor.vesselWorkspaceId(targetItemId),
                targetState                          = targetWorkspaceId && me.getPopupState(targetWorkspaceId),
                sourceDocument                       = me.dockModel,
                sourceNode                           = sourceDocument?.nodes?.[sourceNodeId],
                button                               = null,
                cursorDot                            = null,
                release                              = null,
                sortZone                             = null;

            if (
                !itemId || !targetItemId || itemId === targetItemId ||
                sourceNode?.type !== 'tabs' || !sourceNode.items.includes(itemId)
            ) {
                return {applied: false, errors: ['cross-window dock step must name distinct live source and target panes']}
            }
            if (
                !targetState || targetState.committed || targetState.closeRequested ||
                !me.nativeWindows?.getOwner(me.id, targetItemId)
            ) {
                return {applied: false, errors: ['target vessel is not an available first-dock workspace']}
            }

            let pane = me.paneCache[itemId];

            if (!pane || pane.isDestroyed || !sourceDocument.items?.[itemId]) {
                return {applied: false, errors: ['incoming pane is not live and owned by the main workspace']}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));
                targetState.participationPromise && await driver.trap(targetState.participationPromise);

                let host          = me.getDockHost(),
                    tabs          = host?.down({dockNodeId: sourceNodeId}),
                    itemIndex     = sourceNode.items.indexOf(itemId),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default;

                button   = tabs?.getTabAtIndex(itemIndex);
                sortZone = tabs?.getTabBar()?.sortZone;

                let [buttonRect] = button ? await driver.trap(button.getDomRect([button.id], button.windowId)) : [],
                    sourceWindow = WindowManager.get(button?.windowId),
                    targetWindow = WindowManager.get(targetState.windowId);

                if (
                    !button || !sortZone || !buttonRect || !sourceWindow?.innerRect ||
                    !targetWindow?.innerRect || !targetState.participation
                ) {
                    return {applied: false, errors: ['cross-window dock gesture surfaces are not ready']}
                }

                let startX  = buttonRect.x + buttonRect.width / 2,
                    startY  = buttonRect.y + buttonRect.height / 2,
                    startSX = sourceWindow.innerRect.x + startX,
                    startSY = sourceWindow.innerRect.y + startY,
                    opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                        bubbles: true, button: 0, buttons, cancelable: true,
                        clientX, clientY, screenX, screenY
                    }),
                    moveCursor = (clientX, clientY) => {
                        if (cursorDot) {
                            cursorDot.style = {
                                ...cursorDot.style,
                                left: `${clientX - 8}px`,
                                top : `${clientY - 8}px`
                            }
                        }
                    };

                me.nativeWindows.clearConnection(me.id, itemId);
                showCursor && (cursorDot = driver.createFilmCursorDot(startX, startY, button.windowId));

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mousedown', windowId: button.windowId,
                    options : opt(startX, startY, startSX, startSY, 1)
                }, {
                    delay  : 120, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
                }, {
                    delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
                }]}));

                if (!await driver.trap(driver.waitForTearOutDragArmed(sortZone))) {
                    release = {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY};

                    let cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone});

                    return {
                        applied: false,
                        errors : ['cross-window source drag did not arm'],
                        proof  : {cancellation}
                    }
                }

                let boundary = sortZone.boundaryContainerRect,
                    right    = boundary.right  ?? boundary.x + boundary.width,
                    bottom   = boundary.bottom ?? boundary.y + boundary.height,
                    outX     = Math.round(right + 120),
                    outY     = Math.round(bottom + 120);

                for (let index = 1; index <= moveSteps; index++) {
                    let t       = index / moveSteps,
                        clientX = Math.round(startX + (outX - startX) * t),
                        clientY = Math.round(startY + (outY - startY) * t);

                    moveCursor(clientX, clientY);

                    await driver.trap(driver.simulateEvent(run, {events: [{
                        delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                        options: opt(
                            clientX,
                            clientY,
                            sourceWindow.innerRect.x + clientX,
                            sourceWindow.innerRect.y + clientY,
                            1
                        )
                    }]}))
                }

                if (!await driver.trap(driver.waitForTearOutVessel(itemId, {attempts}))) {
                    release = {
                        clientX: outX,
                        clientY: outY,
                        screenX: sourceWindow.innerRect.x + outX,
                        screenY: sourceWindow.innerRect.y + outY
                    };

                    let cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone});

                    return {
                        applied: false,
                        errors : ['cross-window source vessel was not born while the gesture remained down'],
                        proof  : {cancellation}
                    }
                }

                let remoteSnapshot;

                if (showCursor) {
                    await driver.retireFilmCursorDot(cursorDot);
                    cursorDot = null
                }

                for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                    targetWindow = WindowManager.get(targetState.windowId);

                    if (!targetWindow?.innerRect) break;

                    let targetClientX = Math.round(targetWindow.innerRect.width  / 2) + attempt % 2,
                        targetClientY = Math.round(targetWindow.innerRect.height / 2),
                        targetScreenX = Math.round(targetWindow.innerRect.x + targetClientX),
                        targetScreenY = Math.round(targetWindow.innerRect.y + targetClientY);

                    showCursor && !cursorDot &&
                        (cursorDot = driver.createFilmCursorDot(targetClientX, targetClientY, targetState.windowId));
                    moveCursor(targetClientX, targetClientY);

                    release = {clientX: outX, clientY: outY, screenX: targetScreenX, screenY: targetScreenY};

                    await driver.trap(driver.simulateEvent(run, {events: [{
                        delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                        options: opt(outX + attempt % 2, outY, targetScreenX, targetScreenY, 1)
                    }]}));

                    let transition = sortZone.vesselConversionSensor?.transitionPromise;

                    transition && await driver.trap(transition);
                    remoteSnapshot = me.readCrossWindowGestureSnapshot({
                        parkedItemId: itemId,
                        sourceZone  : sortZone,
                        targetWorkspaceId
                    });

                    if (remoteSnapshot.ready) break
                }

                if (!remoteSnapshot?.ready) {
                    let cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone});

                    return {
                        applied: false,
                        errors : ['target vessel did not reach one parked semantic + rendered claim'],
                        proof  : {cancellation, remoteSnapshot}
                    }
                }

                dwellDelay > 0 && await driver.trap(driver.timeout(dwellDelay));

                me.lastCrossWindowTransfer = null;

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mouseup', windowId: button.windowId,
                    options : opt(release.clientX, release.clientY, release.screenX, release.screenY, 0)
                }]}));

                let transfer = await driver.trap(driver.waitForCrossWindowTransfer({
                        sourceWorkspaceId: me.constructor.MAIN_WORKSPACE_ID,
                        targetWorkspaceId
                    }, {attempts})),
                    sourceAfter = WorkspaceDocument.clone(me.dockModel),
                    targetAfter = WorkspaceDocument.clone(me.getPopupState(targetWorkspaceId)?.document),
                    retired     = await driver.trap(driver.waitForTearOutVesselRetired(itemId, {attempts})),
                    targetItems = targetAfter?.nodes?.[me.constructor.vesselTabsNodeId(targetItemId)]?.items || [],
                    sourceOwns  = WorkspaceDocument.findContainingTabsId(sourceAfter, itemId) != null
                        || WorkspaceDocument.findContainingTabsId(sourceAfter, targetItemId) != null,
                    applied     = transfer?.reconciled === true && retired && !sourceOwns
                        && targetItems.length === 2
                        && targetItems[0] === targetItemId
                        && targetItems[1] === itemId;

                return {
                    applied,
                    errors: applied ? [] : ['cross-window dock did not settle as one A+B target adoption'],
                    proof : {
                        remoteSnapshot,
                        sourceDocument     : sourceAfter,
                        sourceVesselRetired: retired,
                        targetDocument     : targetAfter,
                        transfer           : transfer ? WorkspaceDocument.clone(transfer) : null
                    }
                }
            } catch (error) {
                button && await driver.cancelTearOutGesture(run, button, release, {sortZone}).catch(() => {});

                return {applied: false, errors: [error?.message || String(error)]}
            } finally {
                await driver.retireFilmCursorDot(cursorDot)
            }

        })
    }

    /**
     * @summary Scene 4's real-pointer executor: drags a committed vessel's model-resolved stack
     * grip home and waits through atomic `transferNode`, main projection, native close request, and
     * physical topology exit.
     *
     * The pointer starts on the actual nested `.neo-dock-stack-handle`, so
     * {@link Neo.dashboard.dock.interaction.TabSortZone} authors the group payload. The executor never invokes
     * `transferNode` itself; it withholds mouseup until the main target's one semantic + rendered
     * claim settles, then observes the resulting receipt through window disconnect.
     * @param {Object} step
     * @param {String} step.ownerItemId The pane whose committed vessel owns the stack.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.moveDelay=16]
     * @param {Boolean} [options.showCursor=false] Film mode: move the synthetic cursor from the
     * committed vessel into the main window with the physical gesture.
     * @returns {Promise<Object>}
     */
    async executeStackReturnStep(step, {attempts=240, moveDelay=16, showCursor=false}={}) {
        return this.runGesture(async run => {
            let me            = run.workspace, driver = this,
                {ownerItemId} = step || {},
                workspaceId   = me.constructor.vesselWorkspaceId(ownerItemId),
                state         = workspaceId && me.getPopupState(workspaceId),
                button        = null,
                cursorDot     = null,
                handleId      = null,
                release       = null,
                sortZone      = null;

            if (!state?.committed || !state.document || !me.workspaceSet.has(workspaceId)) {
                return {applied: false, errors: ['stack return requires one committed vessel workspace']}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));
                await driver.trap(Promise.resolve(me.crossWindowParticipationPromise));

                let nodeId        = WorkspaceDocument.resolveStackRoot(state.document),
                    tabsNodeId    = me.constructor.vesselTabsNodeId(ownerItemId),
                    tabsNode      = state.document.nodes?.[tabsNodeId],
                    activeItemId  = tabsNode?.activeItemId ?? tabsNode?.items?.[0],
                    activeIndex   = tabsNode?.items?.indexOf(activeItemId) ?? -1,
                    tabs          = state.host?.down({dockNodeId: tabsNodeId}),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default;

                button   = tabs?.getTabAtIndex(activeIndex);
                sortZone = tabs?.getTabBar()?.sortZone;
                handleId = DockLayoutAdapter.stackHandleDomId(activeItemId);

                let [handleRect] = button && handleId
                        ? await driver.trap(button.getDomRect([handleId], button.windowId))
                        : [],
                    sourceWindow = WindowManager.get(state.windowId),
                    targetWindow = WindowManager.get(me.windowId);

                if (
                    !nodeId || !button || !sortZone || !handleRect || !sourceWindow?.innerRect ||
                    !targetWindow?.innerRect || !me.crossWindowParticipations.get(me.constructor.MAIN_WORKSPACE_ID)
                ) {
                    return {applied: false, errors: ['whole-stack gesture surfaces are not ready']}
                }

                let startX  = handleRect.x + handleRect.width / 2,
                    startY  = handleRect.y + handleRect.height / 2,
                    startSX = sourceWindow.innerRect.x + startX,
                    startSY = sourceWindow.innerRect.y + startY,
                    opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                        bubbles: true, button: 0, buttons, cancelable: true,
                        clientX, clientY, screenX, screenY
                    }),
                    moveCursor = (clientX, clientY) => {
                        if (cursorDot) {
                            cursorDot.style = {
                                ...cursorDot.style,
                                left: `${clientX - 8}px`,
                                top : `${clientY - 8}px`
                            }
                        }
                    };

                showCursor && (cursorDot = driver.createFilmCursorDot(startX, startY, state.windowId));

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: handleId, type: 'mousedown', windowId: button.windowId,
                    options : opt(startX, startY, startSX, startSY, 1)
                }, {
                    delay  : 120, targetId: handleId, type: 'mousemove', windowId: button.windowId,
                    options: opt(startX + 8, startY, startSX + 8, startSY, 1)
                }, {
                    delay  : moveDelay, targetId: handleId, type: 'mousemove', windowId: button.windowId,
                    options: opt(startX + 24, startY, startSX + 24, startSY, 1)
                }]}));

                let armed = false;

                for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                    armed = Boolean(sortZone.stackDragActive && sortZone.dragProxy && sortZone.dragCoordinator);

                    if (armed) break;

                    attempt < 120 && await driver.trap(driver.timeout(16))
                }

                if (!armed) {
                    release = {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY};

                    let cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone, targetId: handleId});

                    return {
                        applied: false,
                        errors : ['whole-stack source drag did not arm from the rendered grip'],
                        proof  : {
                            cancellation,
                            sourceArm: {
                                dockGroupNodeId: sortZone.dockGroupNodeId,
                                dragComponent  : sortZone.dragComponent?.id ?? null,
                                dragProxyReady : Boolean(sortZone.dragProxy),
                                stackDragActive: sortZone.stackDragActive === true,
                                startIndex     : sortZone.startIndex
                            }
                        }
                    }
                }

                let remoteSnapshot;

                if (showCursor) {
                    await driver.retireFilmCursorDot(cursorDot);
                    cursorDot = null
                }

                // The film gesture aims at the semantic return target itself: the indicator
                // menu's active candidate is selected geometrically, so the synthetic cursor
                // hovers the stored-home tabs node (window center can lie outside it).
                let storedHome   = me.tearOutHandlers?.peekPlacement?.(state.itemId)?.tabsNodeId,
                    returnNodeId = me.dockModel.nodes?.[storedHome]?.type === 'tabs'
                        ? storedHome
                        : Object.entries(me.dockModel.nodes || {}).find(([, node]) => node.type === 'tabs')?.[0],
                    returnHost   = me.dragAffordances?.host,
                    returnNode   = returnNodeId && returnHost?.down({dockNodeId: returnNodeId}),
                    [returnRect] = returnNode ? await driver.trap(returnHost.getDomRect([returnNode.id], me.windowId)) : [];

                for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                    targetWindow = WindowManager.get(me.windowId);

                    if (!targetWindow?.innerRect) break;

                    let targetClientX = returnRect
                            ? Math.round(returnRect.x + returnRect.width  / 2) + attempt % 2
                            : Math.round(targetWindow.innerRect.width  / 2) + attempt % 2,
                        targetClientY = returnRect
                            ? Math.round(returnRect.y + returnRect.height / 2)
                            : Math.round(targetWindow.innerRect.height / 2),
                        targetScreenX = Math.round(targetWindow.innerRect.x + targetClientX),
                        targetScreenY = Math.round(targetWindow.innerRect.y + targetClientY);

                    showCursor && !cursorDot &&
                        (cursorDot = driver.createFilmCursorDot(targetClientX, targetClientY, me.windowId));
                    moveCursor(targetClientX, targetClientY);

                    release = {
                        clientX: startX + 32,
                        clientY: startY,
                        screenX: targetScreenX,
                        screenY: targetScreenY
                    };

                    await driver.trap(driver.simulateEvent(run, {events: [{
                        delay  : moveDelay, targetId: handleId, type: 'mousemove', windowId: button.windowId,
                        options: opt(
                            release.clientX + attempt % 2,
                            release.clientY,
                            release.screenX,
                            release.screenY,
                            1
                        )
                    }]}));

                    remoteSnapshot = me.readCrossWindowGestureSnapshot({
                        sourceZone       : sortZone,
                        targetWorkspaceId: me.constructor.MAIN_WORKSPACE_ID
                    });

                    if (remoteSnapshot.ready) break
                }

                if (!remoteSnapshot?.ready) {
                    let cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone, targetId: handleId});

                    return {
                        applied: false,
                        errors : ['main workspace did not reach one semantic + rendered stack-return claim'],
                        proof  : {cancellation, remoteSnapshot}
                    }
                }

                let sourceWindowId = state.windowId,
                    sourceItemIds  = [
                        ...(state.document.nodes?.[nodeId]?.items || Object.keys(state.document.items || {}))
                    ];

                me.lastCrossWindowTransfer = null;

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: handleId, type: 'mouseup', windowId: button.windowId,
                    options : opt(release.clientX, release.clientY, release.screenX, release.screenY, 0)
                }]}));

                let transfer = await driver.trap(driver.waitForCrossWindowTransfer({
                    sourceWorkspaceId: workspaceId,
                    targetWorkspaceId: me.constructor.MAIN_WORKSPACE_ID
                }, {attempts}));

                for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                    if (transfer?.topologyExited === true && !WindowManager.get(sourceWindowId)) break;

                    attempt < attempts && await driver.trap(driver.timeout(16))
                }

                let mainAfter        = WorkspaceDocument.clone(me.dockModel),
                    targetNodeId     = remoteSnapshot.preview?.target?.nodeId,
                    returnedItems    = mainAfter.nodes?.[targetNodeId]?.items || [],
                    requiredPhases   = ['documents-adopted', 'main-projected', 'close-dispatched', 'topology-exited'],
                    phaseOrder       = (transfer?.phases || []).filter(phase => requiredPhases.includes(phase)),
                    sourceWindowGone = !WindowManager.get(sourceWindowId),
                    applied          = transfer?.descriptor?.operation === 'transferNode'
                        && transfer.closeRequested === true
                        && transfer.topologyExited === true
                        && JSON.stringify(phaseOrder) === JSON.stringify(requiredPhases)
                        && sourceWindowGone
                        && sourceItemIds.every(itemId => returnedItems.includes(itemId));

                return {
                    applied,
                    errors: applied ? [] : ['whole-stack return did not settle through model-before-close topology exit'],
                    proof : {
                        closeReceipt: me.lastTearOutClose ? WorkspaceDocument.clone(me.lastTearOutClose) : null,
                        mainDocument: mainAfter,
                        phaseOrder,
                        remoteSnapshot,
                        sourceItemIds,
                        sourceWindowGone,
                        sourceWindowId,
                        transfer    : transfer ? WorkspaceDocument.clone(transfer) : null
                    }
                }
            } catch (error) {
                button && await driver.cancelTearOutGesture(run, button, release, {sortZone, targetId: handleId}).catch(() => {});

                return {applied: false, errors: [error?.message || String(error)]}
            } finally {
                await driver.retireFilmCursorDot(cursorDot)
            }

        })
    }

    /**
     * @summary The app-owned tear-out journey executor — scene 2's real-pointer drive.
     *
     * Arms a tab drag, flings the proxy past the window boundary so
     * {@link Neo.dashboard.dock.interaction.TabSortZone} fires `dockTearOutExit`, the host opens a `?popout=`
     * vessel, then — gated on that vessel's ACTUAL birth (its slot binding through
     * {@link Neo.manager.transaction.NativeLifecycle#onBind}) — survives
     * deliberate post-birth moves and settles one of three terminals: release while detached
     * (`dockTearOutTerminal` → the `detachItem` commit + adoption), Escape-cancel (zero-mutation
     * vessel close), or RE-ENTRY (`reenter` — the drag walks back inside past the reattach
     * threshold, the vessel retires MID-GESTURE with zero mutation and the in-window proxy
     * resumes: the film's back-IN morph beat, then cancelled cleanly).
     *
     * The proof is OBSERVABLE-ONLY — committed document truth + vessel bookkeeping, never the
     * machine's internal drag state. Path and pace are tunable for the film takes (D-010):
     * `curve` bows the pointer path (0 = straight, deterministic either way), `moveSteps` and
     * `moveDelay` set the sampling density and rhythm.
     * @param {Object} step
     * @param {String} step.itemId The dock item to tear out.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {Object} [options={}]
     * @param {Number} [options.birthAttempts=180] Vessel-birth poll attempts (16ms each) — film
     *     pacing widens this: vsync-limited boot can push the popup's shared-heap join past the
     *     default three-second gate.
     * @param {Boolean} [options.cancel=false] Escape while detached — the zero-mutation witness.
     * @param {Number} [options.curve=0] Perpendicular path bow as a fraction of path length.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=4] Pointer samples per path leg.
     * @param {Number} [options.postBirthMoves=2] Outward moves after birth (survival probe; floored at 2).
     * @param {Boolean} [options.reenter=false] Walk back inside instead of releasing — the morph witness.
     * @param {Boolean} [options.showCursor=false] Film mode: ride a visible synthetic cursor dot on
     *     the logged pointer coordinates — CDP events move no OS cursor, and the camera needs one.
     * @returns {Promise<Object>}
     */
    async executeTearOutStep(step, {birthAttempts=180, cancel=false, curve=0, moveDelay=16, moveSteps=4, postBirthMoves=2, reenter=false, showCursor=false}={}) {
        return this.runGesture(async run => {
            let me                     = run.workspace, driver = this,
                {itemId, sourceNodeId} = step || {},
                document               = me.dockModel,
                node                   = document?.nodes?.[sourceNodeId],
                button                 = null,
                cursorDot              = null,
                release                = null;

            if (!itemId || node?.type !== 'tabs' || !node.items.includes(itemId)) {
                return {applied: false, errors: ['tear-out step must name a live item held by a tabs node']}
            }

            let pane = me.paneCache[itemId];

            if (!pane || pane.isDestroyed || !document.items?.[itemId]) {
                return {applied: false, errors: ['source pane is not live and owned by the workspace']}
            }

            try {
                // Drain the host-owned projection queue before reading tab chrome.
                await driver.trap(Promise.resolve(me.refreshPromise));

                let host          = me.getDockHost(),
                    tabs          = host?.down({dockNodeId: sourceNodeId}),
                    sortZone      = tabs?.getTabBar()?.sortZone,
                    itemIndex     = node.items.indexOf(itemId),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default;

                button = tabs?.getTabAtIndex(itemIndex);

                let window       = WindowManager.get(button?.windowId),
                    [buttonRect] = button ? await driver.trap(button.getDomRect([button.id], button.windowId)) : [];

                if (!button || !sortZone || !buttonRect || !window?.innerRect) {
                    return {applied: false, errors: ['tear-out gesture surfaces are not ready']}
                }

                // The committed document BEFORE the gesture — the zero-mutation (cancel/reenter) and
                // detach-commit (terminal) proofs both compare against this snapshot.
                let documentBefore = WorkspaceDocument.clone(document),
                    catalogBefore  = Object.keys(documentBefore.items);

                let startX  = buttonRect.x + buttonRect.width / 2,
                    startY  = buttonRect.y + buttonRect.height / 2,
                    startSX = window.innerRect.x + startX,
                    startSY = window.innerRect.y + startY,
                    opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                        bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                    }),
                    moveTo  = (x, y) => {
                        // The visible cursor rides the executor's own coordinate log — never a
                        // second derivation that could disagree with what the gesture actually did.
                        if (cursorDot) {
                            cursorDot.style = {...cursorDot.style, left: `${x - 8}px`, top: `${y - 8}px`}
                        }

                        return driver.simulateEvent(run, {events: [{
                            delay  : moveDelay, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                            options: opt(x, y, window.innerRect.x + x, window.innerRect.y + y, 1)
                        }]})
                    };

                // A stale record from a prior gesture would false-open the birth gate.
                me.nativeWindows.clearConnection(me.id, itemId);

                // Phase 1: own the native sensor + cross the LOCAL drag arming threshold (delay+distance).
                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mousedown', windowId: button.windowId,
                    options : opt(startX, startY, startSX, startSY, 1)
                }, {
                    delay  : 120, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
                }, {
                    delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
                }]}));

                // The drag arms ASYNC — gate on proxy + boundary + itemRects before any outward sample
                // or the exit never fires (arming precedes boundary moves).
                let armed = await driver.trap(driver.waitForTearOutDragArmed(sortZone));

                if (!armed) {
                    let cancellation = await driver.cancelTearOutGesture(run, button, {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY});

                    return {applied: false, errors: ['tear-out drag did not arm'], proof: {armed: false, cancellation, documentBefore}}
                }

                if (showCursor) {
                    cursorDot = driver.createFilmCursorDot(startX, startY)
                }

                // Pre-birth entry sentinels: a curved outward path can transiently re-cover the strip
                // AFTER the exit fired, retiring the newborn vessel before it ever connects — the
                // birth-failure diag must carry whether that happened, or the death reads as absence.
                let preBirthBoundaryEntries = 0,
                    preBirthEntries         = 0,
                    preBirthBoundaryProbe   = () => {preBirthBoundaryEntries++},
                    preBirthEntryProbe      = () => {preBirthEntries++};

                sortZone.on('dragBoundaryEntry', preBirthBoundaryProbe);
                tabs.on('dockTearOutEntry', preBirthEntryProbe);

                // The tear-out exit fires when the proxy LEAVES `boundaryContainerRect`. Target past
                // its bottom-right corner, fully outside, so intersectionRatio collapses below the
                // reattach threshold.
                let b       = sortZone.boundaryContainerRect,
                    bRight  = b.right  ?? (b.x + b.width),
                    bBottom = b.bottom ?? (b.y + b.height),
                    outX    = Math.round(bRight  + 120),
                    outY    = Math.round(bBottom + 120),
                    outSX   = window.innerRect.x + outX,
                    outSY   = window.innerRect.y + outY;

                release = {clientX: outX, clientY: outY, screenX: outSX, screenY: outSY};

                // The deterministic pointer path: a quadratic bow through a perpendicular control
                // point (curve=0 degenerates to the straight line). t runs 0→1 outward.
                let pathPoint = t => {
                    let mx = startX + (outX - startX) / 2 + (outY - startY) * curve,
                        my = startY + (outY - startY) / 2 - (outX - startX) * curve,
                        ax = startX + (mx - startX) * t, ay = startY + (my - startY) * t,
                        bx = mx + (outX - mx) * t,       by = my + (outY - my) * t;

                    return {x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t)}
                };

                // Phase 2: PROGRESSIVE outward moves — each further out so intersectionRatio steps
                // down: dragBoundaryExit → dockTearOutExit → the host acquires the vessel.
                for (let stepIndex = 1; stepIndex <= moveSteps; stepIndex++) {
                    let p = pathPoint(stepIndex / moveSteps);

                    await driver.trap(moveTo(p.x, p.y))
                }

                // Gate on the vessel's ACTUAL birth: a `?popout=` window binding its reserved slot.
                let born = await driver.trap(driver.waitForTearOutVessel(itemId, {attempts: birthAttempts}));

                sortZone.un('dragBoundaryEntry', preBirthBoundaryProbe);
                tabs.un('dockTearOutEntry', preBirthEntryProbe);

                if (!born) {
                    let diag         = `exitFired=${Boolean(sortZone.isWindowDragging)} vesselOpen=${JSON.stringify(me.lastVesselOpen ?? null)} preBirthBoundaryEntries=${preBirthBoundaryEntries} preBirthEntries=${preBirthEntries} lastRatio=${sortZone.lastIntersectionRatio} boundary=${JSON.stringify(b)} out=(${outX},${outY}) itemRects=${sortZone.itemRects?.length ?? 'null'}`,
                        cancellation = await driver.cancelTearOutGesture(run, button, release);

                    return {
                        applied: false,
                        errors : [`tear-out vessel was not born after the boundary exit — ${diag}`],
                        proof  : {armed: true, born: false, diag, cancellation, documentBefore}
                    }
                }

                // Post-birth survival probe: deliberate OUTWARD moves must NOT reap the newborn vessel.
                let probeMoves = Math.max(2, postBirthMoves);

                for (let i = 1; i <= probeMoves; i++) {
                    await driver.trap(moveTo(outX, outY + i * 12))
                }

                let survivedProbe = Boolean(me.nativeWindows?.getConnection(me.id, itemId));

                if (reenter) {
                    // The morph beat: walk back INSIDE until the PROXY re-enters past the reattach
                    // threshold — dockTearOutEntry retires the vessel MID-GESTURE with zero mutation
                    // and the zone resumes its in-window embodiment. Then end the resumed in-window
                    // drag with a clean cancel; the document stays byte-identical.
                    //
                    // The re-entry target is a point ~35% into the boundary rect, NOT the source
                    // button: the tear-out proxy is pane-sized and the grab corner is unknown, so a
                    // button near a window edge can never recover 60% overlap — the interior point
                    // guarantees the ratio for any grab corner.
                    let vesselWindowId    = me.nativeWindows?.getConnection(me.id, itemId)?.windowId ?? null,
                        inX               = Math.round(b.x + (b.width  ?? 0) * 0.35),
                        inY               = Math.round(b.y + (b.height ?? 0) * 0.35),
                        boundaryEntrySeen = false,
                        entrySeen         = false,
                        boundaryProbe     = () => {boundaryEntrySeen = true},
                        entryProbe        = () => {entrySeen = true};

                    sortZone.on('dragBoundaryEntry', boundaryProbe);
                    tabs.on('dockTearOutEntry', entryProbe);

                    for (let stepIndex = 1; stepIndex <= moveSteps; stepIndex++) {
                        let t = stepIndex / moveSteps;

                        await driver.trap(moveTo(
                            Math.round(outX + (inX - outX) * t),
                            Math.round(outY + (inY - outY) * t)
                        ))
                    }

                    let retired     = await driver.trap(driver.waitForTearOutVesselRetired(itemId)),
                        reentryDiag = `boundaryEntrySeen=${boundaryEntrySeen} entrySeen=${entrySeen} isWindowDragging=${Boolean(sortZone.isWindowDragging)} reattachArmed=${Boolean(sortZone.reattachArmed)} lastRatio=${sortZone.lastIntersectionRatio} placeholder=${Boolean(sortZone.dragPlaceholder)} indexMap=${JSON.stringify(sortZone.indexMap)} ownerItems=${sortZone.owner?.items?.length} itemRectsLen=${sortZone.itemRects?.length} activeVessel=${Boolean(me.tearOutHandlers.activeVessel)} connects=${Boolean(me.nativeWindows?.getConnection(me.id, itemId))} staged=${me.tearOutEmbodiment.isStaged(itemId)} boundary=${JSON.stringify(b)} in=(${inX},${inY}) vesselDims=${JSON.stringify(me.tearOutVesselDims)}`;

                    sortZone.un('dragBoundaryEntry', boundaryProbe);
                    tabs.un('dockTearOutEntry', entryProbe);

                    let
                        cancellation  = await driver.cancelTearOutGesture(run, button, {clientX: inX, clientY: inY, screenX: window.innerRect.x + inX, screenY: window.innerRect.y + inY}),
                        documentAfter = WorkspaceDocument.clone(me.dockModel),
                        windowGone    = !vesselWindowId || !WindowManager.get(vesselWindowId);

                    return {
                        applied  : false,
                        errors   : retired ? [] : [`vessel did not retire on re-entry — ${reentryDiag}`],
                        reentered: retired,
                        proof    : {
                            born              : true,
                            survivedProbe,
                            retired,
                            windowGone,
                            cancellation,
                            documentBefore,
                            documentAfter,
                            documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(documentAfter),
                            vesselWindowName  : `tearout-${itemId}`
                        }
                    }
                }

                if (cancel) {
                    // Escape while detached → dockTearOutCancel → the host closes its vessel. The
                    // committed document must be byte-identical — the zero-mutation invariant.
                    let cancellation  = await driver.cancelTearOutGesture(run, button, release),
                        documentAfter = WorkspaceDocument.clone(me.dockModel);

                    return {
                        applied  : false,
                        cancelled: true,
                        errors   : [],
                        proof    : {
                            born              : true,
                            survivedProbe,
                            cancellation,
                            documentBefore,
                            documentAfter,
                            documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(documentAfter),
                            vesselWindowName  : `tearout-${itemId}`
                        }
                    }
                }

                // Terminal release transfers the pane into its full vessel Workspace.
                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mouseup', windowId: button.windowId,
                    options : opt(outX, outY, outSX, outSY, 0)
                }]}));

                let committed = await driver.trap(driver.waitForTearOutCommit(itemId));

                committed && await driver.trap(Promise.resolve(me.refreshPromise));

                const {sourceDocument, targetDocument, ...ownership} = driver.getTearOutCommitState(itemId),
                      documentAfter                                  = WorkspaceDocument.clone(sourceDocument),
                      targetDocumentAfter                            = targetDocument && WorkspaceDocument.clone(targetDocument),
                      catalogPreserved                               = catalogBefore.every(id => Boolean(
                          (id === itemId ? targetDocumentAfter : documentAfter)?.items[id]
                      )),
                      applied = committed && ownership.transferCommitted && catalogPreserved;

                return {
                    applied,
                    errors: applied ? [] : ['tear-out ownership did not settle in the expected vessel'],
                    proof : {
                        ...ownership,
                        born              : true,
                        survivedProbe,
                        committed,
                        documentBefore,
                        documentAfter,
                        targetDocumentAfter,
                        catalogPreserved,
                        vesselWindowName  : `tearout-${itemId}`
                    }
                }
            } catch (error) {
                button && await driver.cancelTearOutGesture(run, button, release).catch(() => {});

                return {applied: false, errors: [error?.message || String(error)]}
            } finally {
                // The synthetic cursor is per-gesture presentation: it never outlives the take's
                // gesture, and it never enters worker truth (pointer-events:none, no dock document).
                await driver.retireFilmCursorDot(cursorDot)
            }

        })
    }

    /**
     * @summary Gates on the tear-out vessel's ACTUAL birth: the `?popout=<itemId>` window binding its
     * reserved slot ({@link Neo.manager.transaction.NativeLifecycle#onBind}). Polls that observable
     * rather than any internal drag flag.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVessel(itemId, {attempts=180, delay=16}={}) {
        let me = this.workspace, driver = this;

        return driver.waitFor(() => Boolean(
            me.nativeWindows?.getConnection(me.id, itemId) || me.nativeWindows?.getOwner(me.id, itemId)
        ), {attempts, delay})
    }

    /**
     * @summary Gates on a re-entry retirement fully settling: no connect entry, no pending admission,
     * no staged embodiment, and the tear-out machine's slot cleared.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVesselRetired(itemId, {attempts=180, delay=16}={}) {
        let me      = this.workspace, driver = this,
            retired = () => Boolean(
                !me.nativeWindows?.getConnection(me.id, itemId) && !Boolean(me.nativeWindows?.getAdmission(me.id, itemId)) &&
                !me.tearOutEmbodiment.isStaged(itemId) && !me.tearOutHandlers.activeVessel
            );

        return driver.waitFor(retired, {attempts, delay})
    }

    /**
     * @summary Reads the committed ownership of a pane transferred into its expected vessel.
     * Source release includes tree and catalog; target ownership includes catalog and placement.
     * @param {String} itemId
     * @returns {Object} Source/target documents, participant keys and transfer admission.
     * @protected
     */
    getTearOutCommitState(itemId) {
        const workspace         = this.workspace,
              sourceWorkspaceId = workspace.constructor.MAIN_WORKSPACE_ID,
              targetWorkspaceId = workspace.constructor.vesselWorkspaceId(itemId),
              sourceDocument    = workspace.dockModel,
              targetDocument    = workspace.getWorkspaceDocument(targetWorkspaceId),
              sourceReleased    = !sourceDocument.items[itemId] &&
                  !Object.values(sourceDocument.nodes).some(node => node.items?.includes(itemId)),
              vesselOwns        = Boolean(targetDocument?.items[itemId]) &&
                  Object.values(targetDocument.nodes).some(node => node.items?.includes(itemId));

        return {
            sourceDocument, sourceReleased, sourceWorkspaceId,
            targetDocument, targetWorkspaceId, vesselOwns,
            transferCommitted: sourceReleased && vesselOwns
        }
    }

    /**
     * @summary Waits for source release and committed ownership in the expected vessel Workspace.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutCommit(itemId, {attempts=180, delay=16}={}) {
        return this.waitFor(() => this.getTearOutCommitState(itemId).transferCommitted, {attempts, delay})
    }
}

export default Neo.setupClass(NativeGestureDriver);
