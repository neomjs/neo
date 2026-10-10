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
     * @summary Reads a fresh transfer from Workstation's Group history, then awaits both projections.
     * A popup uses the engine commit path, so the root's optional native-close receipt is not
     * transfer authority. It is retained only when it names this same transaction.
     * @param {Object} expected
     * @param {String} expected.sourceWorkspaceId
     * @param {String} expected.targetWorkspaceId
     * @param {Object} [options={}]
     * @param {String|null} [options.previousTransactionId=null] The row before this gesture's release.
     * @param {Number} [options.attempts=240]
     * @param {Number} [options.delay=16]
     * @param {Workstation.view.Workspace} [options.workspace=this.workspace] Retained owner during script teardown.
     * @param {Boolean} [options.settle=false] Cleanup waits on the borrowed owner after driver destruction.
     * @returns {Promise<Object|null>}
     * @protected
     */
    async waitForCrossWindowTransfer(expected, {attempts=240, delay=16, previousTransactionId=null, workspace=this.workspace, settle=false}={}) {
        let me = workspace, driver = this,
            receipt;
        const wait = promise => settle ? promise : driver.trap(promise);

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            const row = me.workspaceSet.manager.get(me.topologyGroupId)?.history?.current;

            if (
                row?.transactionId && row.transactionId !== previousTransactionId &&
                row.cause === 'dock-transfer' &&
                row.sourceWorkspaceId === expected?.sourceWorkspaceId &&
                row.targetWorkspaceId === expected?.targetWorkspaceId
            ) {
                await wait(Promise.all([me.refreshPromise,
                    me.getPopupState(row.sourceWorkspaceId)?.host?.refreshPromise,
                    me.getPopupState(row.targetWorkspaceId)?.host?.refreshPromise]));
                receipt = me.lastCrossWindowTransfer;
                if (receipt?.transactionId === row.transactionId) return receipt;
                const {operation, itemId, nodeId, sourceWorkspaceId, targetWorkspaceId, target} = row;
                receipt = {applied: true, reconciled: true, transactionId: row.transactionId,
                    sourceWorkspaceId, targetWorkspaceId,
                    descriptor: {operation, itemId, nodeId, sourceWorkspaceId, targetWorkspaceId, target}};
                return receipt
            }

            attempt < attempts && await (settle ? me : driver).timeout(delay)
        }

        return receipt ?? null
    }

    /**
     * @summary Moves a committed vessel's native frame through live targets and lets native dwell return its whole stack.
     * The existing Group transaction owns adoption and empty-vessel close. Physical movement is untagged so it rides
     * the normal native drag path; a pre-commit recovery uses a cue-owned effect marker, never a fabricated Group receipt.
     * @param {Object} step
     * @param {String} step.ownerItemId The native lifecycle's owner item, not whichever tab happens to be active.
     * @param {String} [step.previewNodeId='heavy-tabs'] Foreign tabs zone visited before the stored home.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240] Bounded transfer/close observation attempts.
     * @param {Number} [options.moveDelay=33] Delay between physical movement samples.
     * @param {Number} [options.moveSteps=8] Samples per leg through the live target rectangles.
     * @returns {Promise<Object>} Observed movement, preview, transfer and recovery outcome.
     */
    async executeNativeReturnStep({ownerItemId, previewNodeId='heavy-tabs'}={}, {attempts=240, moveDelay=33, moveSteps=8}={}) {
        return this.runGesture(async run => {
            const me                = run.workspace, driver = this,
                  WindowManager     = (await driver.trap(import('../../../src/manager/Window.mjs'))).default,
                  coordinator       = (await driver.trap(import('../../../src/manager/DragCoordinator.mjs'))).default,
                  workspaceId       = me.constructor.vesselWorkspaceId(ownerItemId),
                  state             = workspaceId && me.getPopupState(workspaceId),
                  sourceWindowId    = state?.windowId,
                  targetWorkspaceId = me.constructor.MAIN_WORKSPACE_ID,
                  previews          = [],
                  positions         = [];

            if (!state?.committed || state.closeRequested || !state.document || !me.workspaceSet.has(workspaceId)) {
                return {applied: false, errors: ['native return requires one committed vessel workspace']}
            }
            if (coordinator.nativeWindowDropCandidates.has(sourceWindowId)) {
                return {applied: false, errors: ['native return cannot replace an existing native gesture']}
            }

            let route, originalGeometry, sourceItemIds, sourceIdentities, previousTransactionId, returnNodeId,
                movementStarted = false;
            const liveRoute       = () => route && WindowManager.get(sourceWindowId)?.nativeRoute === route;
            const transferStarted = () => {
                const row = me.workspaceSet.manager.get(me.topologyGroupId)?.history?.current;
                return Boolean(liveRoute() && coordinator.nativeWindowDropCandidates.get(sourceWindowId)?.phase) ||
                    (row?.transactionId !== previousTransactionId && row?.cause === 'dock-transfer' &&
                        row.sourceWorkspaceId === workspaceId);
            };
            const finish = async settle => {
                const transfer = await driver.waitForCrossWindowTransfer({sourceWorkspaceId: workspaceId, targetWorkspaceId},
                    {attempts, previousTransactionId, workspace: me, settle});
                for (let i = 0; i < attempts && !me.isDestroyed && WindowManager.get(sourceWindowId); i++) {
                    await (settle ? me : driver).timeout(16)
                }
                const phaseOrder = (transfer?.phases || []).filter(phase =>
                          ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged'].includes(phase)),
                      sourceWindowGone = !WindowManager.get(sourceWindowId),
                      identityPreserved = sourceItemIds.every(itemId => sourceIdentities[itemId] &&
                          me.getPaneIdentity(itemId) === sourceIdentities[itemId]),
                      applied = transfer?.descriptor?.operation === 'transferNode' && transfer.closeRequested === true &&
                          transfer.topologyExited === true && sourceWindowGone && identityPreserved &&
                          sourceItemIds.every(itemId => me.dockModel.nodes[returnNodeId]?.items?.includes(itemId)) &&
                          phaseOrder.join(',') === 'documents-adopted,projections-settled,close-dispatched,close-acknowledged';

                return {applied, errors: applied ? [] : ['native return did not settle through whole-stack adoption and close'],
                    proof: {identityPreserved, phaseOrder, positions, previews, sourceItemIds, sourceWindowGone, sourceWindowId,
                        transfer    : transfer ? WorkspaceDocument.clone(transfer) : null,
                        mainDocument: WorkspaceDocument.clone(me.dockModel)}}
            };

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));
                await driver.trap(Promise.resolve(me.participationPromise));
                const source = coordinator.getNativeWindowDragSource(sourceWindowId),
                      nodeId = WorkspaceDocument.resolveStackRoot(state.document);
                if (!nodeId || source?.draggedItem?.dockGroupNodeId !== nodeId || source.widgetName !== ownerItemId) {
                    throw new Error('native window does not expose its complete committed stack')
                }
                route = WindowManager.resolveNativeRoute({capability: 'position', ownerWindowId: me.windowId,
                    windowId: sourceWindowId}).route;
                if (!route) throw new Error('native return has no current owner-granted position route');
                run.pending = Neo.Main.windowNativeGetGeometry({...route, windowId: route.ownerWindowId});
                originalGeometry = await driver.trap(run.pending);
                if (!originalGeometry || !liveRoute()) throw new Error('native return could not capture its source frame');

                sourceItemIds = Object.keys(state.document.items);
                sourceIdentities = Object.fromEntries(sourceItemIds.map(itemId => [itemId, me.getPaneIdentity(itemId)]));
                previousTransactionId = me.workspaceSet.manager.get(me.topologyGroupId)?.history?.current?.transactionId;

                const host                    = me.dragAffordances?.host,
                      homeId                  = me.tearOutHandlers?.peekPlacement?.(ownerItemId)?.tabsNodeId,
                      home                    = homeId && host?.down({dockNodeId: homeId}),
                      previewTarget           = host?.down({dockNodeId: previewNodeId}),
                      rects                   = previewTarget && home && await driver.trap(host.getDomRect([previewTarget.id, home.id], me.windowId)),
                      [previewRect, homeRect] = rects || [];
                if (previewNodeId === homeId || ![previewRect, homeRect].every(rect => rect?.width > 0 && rect?.height > 0)) {
                    throw new Error('native return requires measured foreign and stored-home targets')
                }
                returnNodeId = homeId;

                const points = [
                    {x: previewRect.x + 10, y: previewRect.y + previewRect.height * 0.6},
                    {x: previewRect.x + previewRect.width / 2, y: previewRect.y + previewRect.height / 2},
                    {x: homeRect.x + homeRect.width / 2, y: homeRect.y + homeRect.height / 2}
                ];
                let from = {x: originalGeometry.x, y: originalGeometry.y};
                for (const point of points) {
                    const main = WindowManager.get(me.windowId)?.innerRect;
                    if (!main) throw new Error('native return lost its main window');
                    const to = {x: Math.round(main.x + point.x - coordinator.nativeWindowDropAnchorInset),
                        y: Math.round(main.y + point.y - coordinator.nativeWindowDropAnchorInset)};
                    for (let i = 1; i <= moveSteps; i++) {
                        if (!liveRoute() || driver.isDestroyed) throw Neo.isDestroyed;
                        if (transferStarted()) throw new Error('native return settled before its final target');
                        const position = {x: Math.round(from.x + (to.x - from.x) * i / moveSteps),
                            y: Math.round(from.y + (to.y - from.y) * i / moveSteps)};
                        movementStarted = true;
                        run.pending = Neo.Main.windowNativeMoveTo({...route, ...position, windowId: route.ownerWindowId});
                        if (await driver.trap(run.pending) !== true) throw new Error('native frame movement was refused');
                        positions.push(position);
                        await driver.trap(driver.timeout(moveDelay));
                        const snapshot = me.readCrossWindowGestureSnapshot({nativeWindowId: sourceWindowId, targetWorkspaceId});
                        if (snapshot.ready && !previews.some(preview => preview.previewId === snapshot.preview.previewId)) {
                            previews.push(WorkspaceDocument.clone(snapshot.preview))
                        }
                    }
                    from = to;
                }

                const result = await finish(false);
                if (result.applied || transferStarted()) return result;
                throw new Error(result.errors[0])
            } catch (error) {
                await run.pending?.catch(() => {});
                if (!movementStarted) return {applied: false, errors: [error?.message || String(error)]};
                // Once parking/commit starts, the engine owns settlement. Destruction cannot turn an adopted stack
                // into a rollback; wait on the retained workspace, whose lifetime is independent of this driver.
                if (sourceItemIds && transferStarted()) return finish(true);
                if (!liveRoute()) return {applied: false, errors: ['native return lost its original window route']};

                coordinator.clearNativeWindowDropCandidate(sourceWindowId);
                coordinator.endNativeGesture(sourceWindowId);
                let   restored       = false, recoveryError = null;
                const sourceDocument = me.getPopupState(workspaceId)?.document;
                if (originalGeometry && liveRoute() && sourceItemIds?.every(itemId => sourceDocument?.items?.[itemId])) {
                    run.pending = Neo.Main.windowNativeMoveTo({...route, x: originalGeometry.x, y: originalGeometry.y,
                        windowId    : route.ownerWindowId,
                        nativeEffect: {transactionId: Neo.getId('native-return'), effectId: Neo.getId('frame-recovery')}});
                    restored = await run.pending.catch(error => {
                        recoveryError = error?.message || String(error);
                        return false
                    }) === true
                }
                return {applied: false, errors: [error?.message || String(error)],
                    proof: {positions, previews, recovery: {restored, error: recoveryError}, sourceWindowId}}
            }
        })
    }

    /**
     * @summary Scene 3's real-pointer executor: drags a second pane out of the main window onto a
     * committed sibling Workspace, which takes the drag as the pane's tab-header proxy, and releases
     * only after one semantic + rendered target claim has settled with no vessel left.
     *
     * The source stays on the ordinary tab-drag path. It crosses the source workspace boundary, where
     * free desktop under the pointer gives the pane a vessel riding the hand, then moves in global
     * screen space over the target vessel, whose claim retires that vessel. The coordinator owns the
     * preview, arbitration, and atomic transfer. This method drives and reports those seams; it never
     * calls a reducer or target commit directly.
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
                !targetState?.committed || targetState.closeRequested ||
                !me.nativeWindows?.getOwner(me.id, targetItemId)
            ) {
                return {applied: false, errors: ['target vessel is not an available committed workspace']}
            }

            let pane = me.paneCache[itemId];

            if (!pane || pane.isDestroyed || !sourceDocument.items?.[itemId]) {
                return {applied: false, errors: ['incoming pane is not live and owned by the main workspace']}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));
                await driver.trap(Promise.resolve(targetState.host?.refreshPromise));

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
                    !targetWindow?.innerRect || !targetState.host?.participation
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

                    remoteSnapshot = me.readCrossWindowGestureSnapshot({
                        draggedItemId: itemId,
                        sourceZone   : sortZone,
                        targetWorkspaceId
                    });

                    if (remoteSnapshot.ready) break
                }

                if (!remoteSnapshot?.ready) {
                    let cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone});

                    return {
                        applied: false,
                        errors : ['target vessel did not take the drag as one semantic + rendered claim'],
                        proof  : {cancellation, remoteSnapshot}
                    }
                }

                dwellDelay > 0 && await driver.trap(driver.timeout(dwellDelay));

                const previousTransactionId = me.workspaceSet.manager.get(me.topologyGroupId)?.history?.current?.transactionId;

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mouseup', windowId: button.windowId,
                    options : opt(release.clientX, release.clientY, release.screenX, release.screenY, 0)
                }]}));

                let transfer = await driver.trap(driver.waitForCrossWindowTransfer({
                        sourceWorkspaceId: me.constructor.MAIN_WORKSPACE_ID,
                        targetWorkspaceId
                    }, {attempts, previousTransactionId})),
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
                await driver.trap(Promise.resolve(me.participationPromise));

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
                    !targetWindow?.innerRect || !me.participation
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

                    let sourceArm = {
                        buttonId       : button.id,
                        dockGroupNodeId: sortZone.dockGroupNodeId,
                        dragComponent  : sortZone.dragComponent?.id ?? null,
                        dragEndActive  : sortZone.dragEndActive,
                        dragProxyReady : Boolean(sortZone.dragProxy),
                        handleId,
                        handleRect,
                        stackDragActive: sortZone.stackDragActive === true,
                        startIndex     : sortZone.startIndex
                    }, cancellation = await driver.cancelTearOutGesture(run, button, release, {sortZone, targetId: handleId});

                    return {
                        applied: false,
                        errors : ['whole-stack source drag did not arm from the rendered grip'],
                        proof  : {
                            cancellation,
                            sourceArm
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

                const previousTransactionId = me.workspaceSet.manager.get(me.topologyGroupId)?.history?.current?.transactionId;

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: handleId, type: 'mouseup', windowId: button.windowId,
                    options : opt(release.clientX, release.clientY, release.screenX, release.screenY, 0)
                }]}));

                let transfer = await driver.trap(driver.waitForCrossWindowTransfer({
                    sourceWorkspaceId: workspaceId,
                    targetWorkspaceId: me.constructor.MAIN_WORKSPACE_ID
                }, {attempts, previousTransactionId}));

                for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                    if (transfer?.topologyExited === true && !WindowManager.get(sourceWindowId)) break;

                    attempt < attempts && await driver.trap(driver.timeout(16))
                }

                let mainAfter        = WorkspaceDocument.clone(me.dockModel),
                    targetNodeId     = remoteSnapshot.preview?.target?.nodeId,
                    returnedItems    = mainAfter.nodes?.[targetNodeId]?.items || [],
                    requiredPhases   = ['documents-adopted', 'projections-settled', 'close-dispatched', 'close-acknowledged'],
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
     * @param {Number} [options.birthDwellMs=0] Film pacing after confirmed birth, with the pointer
     *     still down; zero keeps the ordinary gesture timing.
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
    async executeTearOutStep(step, {birthAttempts=180, birthDwellMs=0, cancel=false, curve=0, moveDelay=16, moveSteps=4, postBirthMoves=2, reenter=false, showCursor=false}={}) {
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

                let survivedProbe = await driver.trap(driver.waitForTearOutVessel(itemId, {attempts: 0})),
                    birthHold     = null;

                if (survivedProbe && birthDwellMs > 0) {
                    await driver.trap(driver.timeout(birthDwellMs));

                    const coordinator = sortZone.dragCoordinator,
                          target      = coordinator?.activeTargetZone;

                    birthHold = {
                        durationMs: birthDwellMs,
                        survived  : await driver.trap(driver.waitForTearOutVessel(itemId, {attempts: 0})),
                        claimCount: coordinator?.pointerClaimArbiter?.claimCount ?? 0,
                        hasTarget : Boolean(target),
                        hasPreview: Boolean(target?.currentPreview)
                    };

                    if (!birthHold.survived || birthHold.claimCount || birthHold.hasTarget || birthHold.hasPreview) {
                        const cancellation = await driver.cancelTearOutGesture(run, button, release);

                        return {
                            applied: false,
                            errors : ['birth hold did not retain an unclaimed tear-out vessel'],
                            proof  : {born: true, survivedProbe, birthHold, cancellation}
                        }
                    }
                }

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
                        reentered   = entrySeen && retired,
                        reentryDiag = `boundaryEntrySeen=${boundaryEntrySeen} entrySeen=${entrySeen} isWindowDragging=${Boolean(sortZone.isWindowDragging)} reattachArmed=${Boolean(sortZone.reattachArmed)} lastRatio=${sortZone.lastIntersectionRatio} placeholder=${Boolean(sortZone.dragPlaceholder)} indexMap=${JSON.stringify(sortZone.indexMap)} ownerItems=${sortZone.owner?.items?.length} itemRectsLen=${sortZone.itemRects?.length} activeVessel=${Boolean(me.tearOutHandlers.activeVessel)} connects=${Boolean(me.nativeWindows?.getConnection(me.id, itemId))} staged=${me.tearOutEmbodiment.isStaged(itemId)} boundary=${JSON.stringify(b)} in=(${inX},${inY}) vesselDims=${JSON.stringify(me.tearOutVesselDims)}`;

                    sortZone.un('dragBoundaryEntry', boundaryProbe);
                    tabs.un('dockTearOutEntry', entryProbe);

                    let
                        cancellation  = await driver.cancelTearOutGesture(run, button, {clientX: inX, clientY: inY, screenX: window.innerRect.x + inX, screenY: window.innerRect.y + inY}),
                        documentAfter = WorkspaceDocument.clone(me.dockModel),
                        windowGone    = !vesselWindowId || !WindowManager.get(vesselWindowId);

                    return {
                        applied  : false,
                        errors   : reentered ? [] : [`vessel did not retire on observed re-entry — ${reentryDiag}`],
                        reentered,
                        proof    : {
                            born              : true,
                            survivedProbe,
                            birthHold,
                            entrySeen,
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
                            birthHold,
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
                        born            : true,
                        survivedProbe,
                        birthHold,
                        committed,
                        documentBefore,
                        documentAfter,
                        targetDocumentAfter,
                        catalogPreserved,
                        vesselWindowName: `tearout-${itemId}`
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
     * @summary Holds one `dockTearOutEntry` probe on the source tabs for the span of `run`, and lets
     * it go on EVERY exit — a settled result, a rejection, a driver destroyed mid-wait. A journey
     * registers a probe per hop; a probe outliving a cancelled hop would read the next gesture's
     * entry as this one's.
     * @param {Neo.component.Base} tabs The source tabs container the entry fires on.
     * @param {Function} run Async body; its resolved object is returned with `entrySeen` merged in.
     * @returns {Promise<Object>} `{...result, entrySeen}`
     * @protected
     */
    static async withEntryProbe(tabs, run) {
        let entrySeen = false,
            probe     = () => {entrySeen = true};

        tabs.on('dockTearOutEntry', probe);

        try {
            return {...await run(), entrySeen}
        } finally {
            tabs.un('dockTearOutEntry', probe)
        }
    }

    /**
     * @summary Derives the journey's every-hop continuity claim from its ledger, never from the
     * endpoints: the claim holds only when every expected hop recorded the one borrowed pane, live
     * and the same instance. A replacement that returns to the original before the drop leaves equal
     * endpoints and a broken middle; the ledger sees the middle.
     * @param {Object[]} ledger One `{hop, paneId, destroyed, same}` entry per settled hop plus the drop.
     * @param {Number} expectedEntries The hop count plus one for the drop.
     * @returns {Boolean}
     */
    static continuityPreserved(ledger, expectedEntries) {
        return ledger.length === expectedEntries
            && ledger.every(entry => entry.same === true && entry.destroyed === false && entry.paneId != null)
    }

    /**
     * @summary The film's journey executor: under one pointer-down the pane crosses every boundary the
     * hand likes, and the engine keeps one rule for every window of the group (docking design record
     * §2.8.6) — inside a window the drag is that window's tab-header proxy, outside every window it is
     * a vessel; a claim retires the vessel riding the hand, and leaving a window opens a fresh one.
     *
     * Hops are data, walked in order from the armed tab drag:
     * - `desktop` — the pointer leaves every window of the group for a free screen point (chosen
     *   against the live window rects: beside the target first, then beside main) and a vessel must be
     *   born there, under a window id the previous generation did not carry. The born hold
     *   (`birthDwellMs`) then keeps the pointer still with the window under it.
     * - `main` — the proxy walks back inside the source boundary (the interior point the morph used)
     *   and the vessel must retire mid-gesture (`dockTearOutEntry` seen, the bookkeeping cleared); the
     *   committed document is compared byte for byte against the one before the gesture.
     * - `target` — the pointer moves in screen space over the target vessel's centre, the client point
     *   staying outside the boundary so the source sampler reads no re-entry, until the gesture
     *   snapshot is ready: exactly one claim, the vessel gone, the proxy settled and visible in that
     *   window. The hold (`dwellDelay`) lets the zones read. A target hop follows a desktop hop, and
     *   the LAST hop is a target: the release there is the A+B adoption the cross-window dock step
     *   settles.
     *
     * A hop that does not settle cancels the gesture and names itself. The proof is observable-only:
     * vessel bookkeeping, the gesture snapshot, committed documents and the pane identity.
     * @param {Object} step
     * @param {String} step.itemId The pane that travels.
     * @param {String} step.sourceNodeId The main-workspace tabs node holding it.
     * @param {String} step.targetItemId The detached pane whose committed vessel is the target window.
     * @param {String[]} step.hops The hop kinds in order (`desktop` | `main` | `target`).
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=240] Readiness poll attempts per target hop, and for the transfer.
     * @param {Number} [options.birthAttempts=240] Vessel-birth poll attempts (16 ms each) per desktop hop.
     * @param {Number} [options.birthDwellMs=0] The born hold after each desktop hop, pointer still down.
     * @param {Number} [options.dwellDelay=0] The hold over the target after each claim settles.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=4] Pointer samples per leg.
     * @param {Boolean} [options.showCursor=false] Film mode: the synthetic cursor rides the executor's
     *     coordinates inside whichever window shows the leg; off every window a vessel, not a dot, rides the hand.
     * @returns {Promise<Object>}
     */
    async executeJourneyStep(step, {attempts=240, birthAttempts=240, birthDwellMs=0, dwellDelay=0, moveDelay=16, moveSteps=4, showCursor=false}={}) {
        return this.runGesture(async run => {
            let me = run.workspace, driver = this,
                {hops=[], itemId, sourceNodeId, targetItemId} = step || {},
                kinds                                         = ['desktop', 'main', 'target'],
                targetWorkspaceId                             = targetItemId && me.constructor.vesselWorkspaceId(targetItemId),
                targetState                                   = targetWorkspaceId && me.getPopupState(targetWorkspaceId),
                document                                      = me.dockModel,
                node                                          = document?.nodes?.[sourceNodeId],
                button                                        = null,
                cursorDot                                     = null,
                pointer                                       = null,
                sortZone                                      = null,
                targetDot                                     = null,
                walked                                        = [];

            if (!itemId || node?.type !== 'tabs' || !node.items.includes(itemId)) {
                return {applied: false, errors: ['journey step must name a live item held by a tabs node']}
            }

            if (
                !hops.length || hops.at(-1) !== 'target' ||
                hops.some((kind, index) => !kinds.includes(kind) || kind === hops[index - 1] || (kind === 'target' && hops[index - 1] !== 'desktop'))
            ) {
                return {applied: false, errors: ['journey hops are desktop | main | target, never two alike in a row, a target after a desktop, ending on a target']}
            }

            if (
                !targetItemId || itemId === targetItemId || !targetState?.committed || targetState.closeRequested ||
                !me.nativeWindows?.getOwner(me.id, targetItemId)
            ) {
                return {applied: false, errors: ['target vessel is not an available committed workspace']}
            }

            let pane = me.paneCache[itemId];

            if (!pane || pane.isDestroyed || !document.items?.[itemId]) {
                return {applied: false, errors: ['travelling pane is not live and owned by the main workspace']}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));
                await driver.trap(Promise.resolve(targetState.host?.refreshPromise));

                let host          = me.getDockHost(),
                    tabs          = host?.down({dockNodeId: sourceNodeId}),
                    itemIndex     = node.items.indexOf(itemId),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default;

                button   = tabs?.getTabAtIndex(itemIndex);
                sortZone = tabs?.getTabBar()?.sortZone;

                let window       = WindowManager.get(button?.windowId),
                    [buttonRect] = button ? await driver.trap(button.getDomRect([button.id], button.windowId)) : [];

                if (!button || !sortZone || !buttonRect || !window?.innerRect || !targetState.host?.participation) {
                    return {applied: false, errors: ['journey gesture surfaces are not ready']}
                }

                let documentBefore = WorkspaceDocument.clone(document),
                    paneIdBefore   = me.getPaneIdentity(itemId),
                    inner          = window.innerRect,
                    startX         = buttonRect.x + buttonRect.width / 2,
                    startY         = buttonRect.y + buttonRect.height / 2,
                    at             = (clientX, clientY) => ({clientX, clientY, screenX: inner.x + clientX, screenY: inner.y + clientY}),
                    opt            = ({clientX, clientY, screenX, screenY}, buttons=1) => ({
                        bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                    }),
                    // One sample: the executor's own coordinate log drives the visible cursor, never a
                    // second derivation. Off the viewport the main-window dot is out of sight, which is
                    // the picture — a vessel rides the hand there.
                    sample = async (to, delay=moveDelay) => {
                        pointer = {clientX: to.clientX, clientY: to.clientY, screenX: to.screenX, screenY: to.screenY};
                        cursorDot && (cursorDot.style = {...cursorDot.style, left: `${to.clientX - 8}px`, top: `${to.clientY - 8}px`});

                        await driver.trap(driver.simulateEvent(run, {events: [{
                            delay, targetId: button.id, type: 'mousemove', windowId: button.windowId, options: opt(to)
                        }]}))
                    },
                    // A straight leg: all four coordinates interpolated from the current pointer.
                    leg = async to => {
                        let from = {...pointer};

                        for (let index = 1; index <= moveSteps; index++) {
                            let t = index / moveSteps;

                            await sample({
                                clientX: Math.round(from.clientX + (to.clientX - from.clientX) * t),
                                clientY: Math.round(from.clientY + (to.clientY - from.clientY) * t),
                                screenX: Math.round(from.screenX + (to.screenX - from.screenX) * t),
                                screenY: Math.round(from.screenY + (to.screenY - from.screenY) * t)
                            })
                        }
                    },
                    vesselWindowId = () => me.nativeWindows?.getConnection(me.id, itemId)?.windowId ?? null,
                    // The borrowed pane, read without constructing: the root cache is the one every
                    // window of the group borrows from. One ledger entry per settled hop and the drop.
                    continuity = [],
                    ledgerHop  = hopIndex => {
                        let live = me.paneCache[itemId] ?? null;

                        continuity.push({destroyed: live?.isDestroyed === true, hop: hopIndex, paneId: live?.id ?? null, same: live != null && live === pane})
                    },
                    diag = () => `isWindowDragging=${Boolean(sortZone.isWindowDragging)} reattachArmed=${Boolean(sortZone.reattachArmed)} lastRatio=${sortZone.lastIntersectionRatio} vesselOpen=${JSON.stringify(me.lastVesselOpen ?? null)} connects=${Boolean(me.nativeWindows?.getConnection(me.id, itemId))} staged=${me.tearOutEmbodiment.isStaged(itemId)} activeVessel=${Boolean(me.tearOutHandlers.activeVessel)} pointer=${JSON.stringify(pointer)}`,
                    fail = async (error, extra={}) => {
                        let cancellation = await driver.cancelTearOutGesture(run, button, pointer, {sortZone});

                        return {applied: false, errors: [error], hops: walked, proof: {cancellation, continuity, documentBefore, ...extra}}
                    };

                pointer = at(startX, startY);

                // A stale record from a prior gesture would false-open the first birth gate.
                me.nativeWindows.clearConnection(me.id, itemId);
                showCursor && (cursorDot = driver.createFilmCursorDot(startX, startY, button.windowId));

                // Own the native sensor and cross the local arming threshold (delay + distance).
                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mousedown', windowId: button.windowId, options: opt(pointer)
                }]}));
                await sample(at(startX + 8, startY + 2), 120);
                await sample(at(startX + 16, startY + 24));

                if (!await driver.trap(driver.waitForTearOutDragArmed(sortZone))) {
                    return fail('journey drag did not arm')
                }

                let b       = sortZone.boundaryContainerRect,
                    bRight  = b.right  ?? b.x + b.width,
                    bBottom = b.bottom ?? b.y + b.height,
                    margin  = 140,
                    // The frozen client point every screen-space leg keeps: fully outside the boundary,
                    // so the source sampler reads no re-entry while the hand is over another window.
                    out     = {x: Math.round(bRight + 120), y: Math.round(bBottom + 120)},
                    inside  = at(Math.round(b.x + (b.width ?? 0) * 0.35), Math.round(b.y + (b.height ?? 0) * 0.35)),
                    // Every window of the group by its live inner rect: the coordinator's zone map plus
                    // the target vessel itself.
                    groupRects = () => {
                        let rects = new Map();

                        sortZone.dragCoordinator?.sortZones?.get(sortZone.sortGroup)?.forEach((zone, windowId) => {
                            let rect = WindowManager.get(windowId)?.innerRect;

                            rect && rects.set(windowId, rect)
                        });

                        let targetRect = WindowManager.get(targetState.windowId)?.innerRect;

                        targetRect && rects.set(targetState.windowId, targetRect);

                        return [...rects.values()]
                    },
                    clear = (point, rects) => rects.every(rect =>
                        point.screenX < rect.x - margin / 2 || point.screenX > rect.x + rect.width  + margin / 2 ||
                        point.screenY < rect.y - margin / 2 || point.screenY > rect.y + rect.height + margin / 2
                    ),
                    // A free screen point beside the target first (the next leg back over it stays
                    // short), then beside main. The client point mirrors the screen point when that
                    // lands outside the boundary; otherwise it stays at the frozen out point.
                    desktopPoint = () => {
                        let rects      = groupRects(),
                            target     = WindowManager.get(targetState.windowId)?.innerRect,
                            candidates = [
                                target && {screenX: target.x + target.width + margin, screenY: target.y + target.height / 2},
                                target && {screenX: target.x + target.width / 2,      screenY: target.y + target.height + margin},
                                {screenX: inner.x + inner.width + margin, screenY: inner.y + startY},
                                {screenX: inner.x + startX,               screenY: inner.y + inner.height + margin},
                                target && {screenX: target.x - margin,    screenY: target.y + target.height / 2}
                            ].filter(Boolean).map(point => ({screenX: Math.round(point.screenX), screenY: Math.round(point.screenY)})),
                            point    = candidates.find(candidate => clear(candidate, rects)) ?? candidates[2],
                            clientX  = point.screenX - inner.x,
                            clientY  = point.screenY - inner.y,
                            mirrored = clientX > bRight + 40 || clientY > bBottom + 40 || clientX < b.x - 40 || clientY < b.y - 40;

                        return {
                            clientX: mirrored ? clientX : out.x,
                            clientY: mirrored ? clientY : out.y,
                            mirrored,
                            screenX: point.screenX,
                            screenY: point.screenY
                        }
                    },
                    targetCentre = () => {
                        let rect = WindowManager.get(targetState.windowId)?.innerRect;

                        return rect && {
                            clientX: Math.round(rect.width / 2),
                            clientY: Math.round(rect.height / 2),
                            screenX: Math.round(rect.x + rect.width / 2),
                            screenY: Math.round(rect.y + rect.height / 2)
                        }
                    };

                let birthHold                     = null,
                    documentsUnchangedAfterReturn = null,
                    previousVesselId              = null,
                    remoteSnapshot                = null,
                    vesselWindowIds               = [];

                let rectOf = rect => rect && {height: rect.height, width: rect.width, x: rect.x, y: rect.y},
                    // The sampler's own reading after a leg: the boundary ratio and the drag mode are
                    // the two facts a wrong hop leaves behind.
                    sampled  = hop => Object.assign(hop, {
                        ratio         : sortZone.lastIntersectionRatio,
                        windowDragging: sortZone.isWindowDragging === true
                    });

                for (let index = 0; index < hops.length; index++) {
                    let kind = hops[index],
                        hop  = {index, kind, rects: groupRects().map(rectOf)};

                    walked.push(hop);

                    if (kind === 'desktop') {
                        let point = desktopPoint();

                        hop.pointer = point;
                        await leg(point);

                        hop.born = await driver.trap(driver.waitFor(() => {
                            let id = vesselWindowId();

                            return id != null && id !== previousVesselId
                        }, {attempts: birthAttempts, delay: 16}));
                        hop.windowId   = vesselWindowId();
                        hop.vesselRect = rectOf(WindowManager.get(hop.windowId)?.innerRect);
                        sampled(hop);

                        if (!hop.born) {
                            return fail(`journey hop ${index + 1} (desktop): no fresh vessel was born — ${diag()}`)
                        }

                        // Two deliberate moves on: a newborn vessel must survive the hand moving.
                        for (let probe = 1; probe <= 2; probe++) {
                            await sample({
                                ...pointer,
                                clientY: point.mirrored ? pointer.clientY + 12 : pointer.clientY,
                                screenY: pointer.screenY + 12
                            })
                        }

                        hop.survivedProbe = await driver.trap(driver.waitForTearOutVessel(itemId, {attempts: 0}));

                        if (hop.survivedProbe && birthDwellMs > 0) {
                            await driver.trap(driver.timeout(birthDwellMs));
                            hop.birthHold = birthHold = {
                                durationMs: birthDwellMs,
                                survived  : await driver.trap(driver.waitForTearOutVessel(itemId, {attempts: 0}))
                            }
                        }

                        if (!hop.survivedProbe || hop.birthHold?.survived === false) {
                            return fail(`journey hop ${index + 1} (desktop): the vessel did not survive the hand moving on — ${diag()}`)
                        }

                        previousVesselId = hop.windowId;
                        vesselWindowIds.push(hop.windowId);
                        ledgerHop(index)
                    } else if (kind === 'main') {
                        let {entrySeen, retired} = await NativeGestureDriver.withEntryProbe(tabs, async () => {
                            await leg(inside);

                            return {retired: await driver.trap(driver.waitForTearOutVesselRetired(itemId))}
                        });

                        Object.assign(sampled(hop), {
                            documentsUnchanged: JSON.stringify(documentBefore) === JSON.stringify(WorkspaceDocument.clone(me.dockModel)),
                            entrySeen,
                            retired,
                            retiredWindowId   : previousVesselId,
                            windowGone        : !previousVesselId || !WindowManager.get(previousVesselId)
                        });
                        documentsUnchangedAfterReturn = hop.documentsUnchanged;

                        if (!entrySeen || !retired || !hop.documentsUnchanged) {
                            return fail(`journey hop ${index + 1} (main): the vessel did not retire on re-entry with the document unchanged — ${diag()}`)
                        }

                        ledgerHop(index)
                    } else {
                        let frozen = {clientX: pointer.clientX, clientY: pointer.clientY},
                            over   = targetCentre();

                        if (!over) {
                            return fail(`journey hop ${index + 1} (target): the target window has no live rect`)
                        }

                        hop.over = over;

                        // The foreign claim retires the vessel through the source's own entry seam, so
                        // an entry here is the claim itself, recorded, never a wrong turn by itself.
                        let {claimed, entrySeen} = await NativeGestureDriver.withEntryProbe(tabs, async () => {
                            await leg({...frozen, screenX: over.screenX, screenY: over.screenY});
                            showCursor && (targetDot = driver.createFilmCursorDot(over.clientX, over.clientY, targetState.windowId));

                            for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
                                over = targetCentre() ?? over;

                                await sample({
                                    clientX: frozen.clientX + attempt % 2,
                                    clientY: frozen.clientY,
                                    screenX: over.screenX + attempt % 2,
                                    screenY: over.screenY
                                });

                                remoteSnapshot = me.readCrossWindowGestureSnapshot({draggedItemId: itemId, sourceZone: sortZone, targetWorkspaceId});

                                if (remoteSnapshot.ready) {
                                    return {claimed: true}
                                }
                            }

                            return {claimed: false}
                        });

                        Object.assign(sampled(hop), {
                            claimed,
                            entrySeen,
                            retiredWindowId: previousVesselId,
                            snapshot       : remoteSnapshot && {
                                claimCount: remoteSnapshot.claimCount,
                                engaged   : remoteSnapshot.engaged,
                                indicators: remoteSnapshot.indicators,
                                previewId : remoteSnapshot.preview?.previewId ?? null,
                                proxy     : remoteSnapshot.targetProxy && {
                                    header        : remoteSnapshot.targetProxy.header,
                                    itemId        : remoteSnapshot.targetProxy.itemId,
                                    settled       : remoteSnapshot.targetProxy.settled,
                                    targetWindowId: remoteSnapshot.targetProxy.targetWindowId,
                                    visible       : remoteSnapshot.targetProxy.visible
                                },
                                ready               : remoteSnapshot.ready,
                                renderedPreviewId   : remoteSnapshot.rendered?.previewId ?? null,
                                sourceVesselWindowId: remoteSnapshot.sourceVesselWindowId,
                                winnerStableId      : remoteSnapshot.winnerStableId
                            },
                            vesselGone: !me.nativeWindows?.getConnection(me.id, itemId)
                        });

                        if (!claimed) {
                            return fail(`journey hop ${index + 1} (target): the target did not take the drag as one semantic + rendered claim — ${diag()}`, {remoteSnapshot})
                        }

                        dwellDelay > 0 && await driver.trap(driver.timeout(dwellDelay));
                        ledgerHop(index);

                        if (index < hops.length - 1) {
                            await driver.retireFilmCursorDot(targetDot);
                            targetDot = null
                        }
                    }
                }

                // The release over the target: the A+B adoption, settled as the cross-window dock step settles it.
                let previousTransactionId = me.workspaceSet.manager.get(me.topologyGroupId)?.history?.current?.transactionId;

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id, type: 'mouseup', windowId: button.windowId, options: opt(pointer, 0)
                }]}));

                let transfer = await driver.trap(driver.waitForCrossWindowTransfer({
                        sourceWorkspaceId: me.constructor.MAIN_WORKSPACE_ID,
                        targetWorkspaceId
                    }, {attempts, previousTransactionId})),
                    sourceAfter       = WorkspaceDocument.clone(me.dockModel),
                    targetAfter       = WorkspaceDocument.clone(me.getPopupState(targetWorkspaceId)?.document),
                    retired           = await driver.trap(driver.waitForTearOutVesselRetired(itemId, {attempts})),
                    targetItems       = targetAfter?.nodes?.[me.constructor.vesselTabsNodeId(targetItemId)]?.items || [],
                    sourceOwns        = WorkspaceDocument.findContainingTabsId(sourceAfter, itemId) != null,
                    paneIdAfter       = me.getPaneIdentity(itemId),
                    identityPreserved = (ledgerHop('drop'), NativeGestureDriver.continuityPreserved(continuity, hops.length + 1))
                        && paneIdBefore != null && paneIdAfter === paneIdBefore,
                    freshGenerations  = new Set(vesselWindowIds).size === vesselWindowIds.length,
                    applied           = transfer?.reconciled === true && retired && !sourceOwns
                        && targetItems.length === 2 && targetItems[0] === targetItemId && targetItems[1] === itemId
                        && identityPreserved && freshGenerations;

                walked.at(-1).transferred = transfer?.reconciled === true;

                return {
                    applied,
                    errors: applied ? [] : ['journey did not settle as one A+B target adoption with fresh vessels and the same pane'],
                    hops  : walked,
                    proof : {
                        birthHold,
                        continuity,
                        documentBefore,
                        documentsUnchangedAfterReturn,
                        freshGenerations,
                        identityPreserved,
                        mainInner          : rectOf(inner),
                        paneId             : paneIdBefore,
                        remoteSnapshot,
                        sourceDocument     : sourceAfter,
                        sourceVesselRetired: retired,
                        targetDocument     : targetAfter,
                        transfer           : transfer ? WorkspaceDocument.clone(transfer) : null,
                        vesselWindowIds
                    }
                }
            } catch (error) {
                button && await driver.cancelTearOutGesture(run, button, pointer, {sortZone}).catch(() => {});

                return {applied: false, errors: [error?.message || String(error)], hops: walked}
            } finally {
                await driver.retireFilmCursorDot(targetDot);
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
            me.nativeWindows?.getConnection(me.id, itemId)?.windowId != null || me.nativeWindows?.getOwner(me.id, itemId)?.windowId != null
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
