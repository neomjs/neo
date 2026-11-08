import Base              from '../../../src/core/Base.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @summary Compares the observed source-drag chrome against the committed document, one term at a time.
 *
 * Compares caller-read values independently so receipts identify every mismatched term.
 * Verdicts use raw observations; undefined actuals then become null to survive JSON serialization.
 * @param {Object} data
 * @param {Number|undefined} data.observedBarItemCount Semantic tab-button count of the source bar —
 * `tab.header.Toolbar#getTabButtons()`, never `items.length` (which includes header actions).
 * @param {String|undefined} data.observedNodeId Live `dockNodeId` of the source tabs node.
 * @param {String[]} [data.observedProjectedItemIds=[]] Live projected dock item ids.
 * @param {String|undefined} data.observedWorkspaceId Live `dockWorkspaceId` of the source sort zone.
 * @param {String[]} data.sourceItemIds Committed item ids for the source node.
 * @param {String} data.sourceNodeId Committed source node id.
 * @param {String} data.sourceWorkspaceId Committed source workspace id.
 * @returns {{chromeMismatch:Object,error:(String|null),mismatchedTerms:String[]}}
 */
export const describeCrossWindowChromeMismatch = ({
    observedBarItemCount,
    observedNodeId,
    observedProjectedItemIds=[],
    observedWorkspaceId,
    sourceItemIds,
    sourceNodeId,
    sourceWorkspaceId
}={}) => {
    let chromeMismatch = {
        dockNodeId      : {expected: sourceNodeId,           actual: observedNodeId,                 mismatch: observedNodeId          !== sourceNodeId},
        dockWorkspaceId : {expected: sourceWorkspaceId,      actual: observedWorkspaceId,            mismatch: observedWorkspaceId     !== sourceWorkspaceId},
        barItemCount    : {expected: sourceItemIds.length,   actual: observedBarItemCount,           mismatch: observedBarItemCount    !== sourceItemIds.length},
        projectedCount  : {expected: sourceItemIds.length,   actual: observedProjectedItemIds.length, mismatch: observedProjectedItemIds.length !== sourceItemIds.length},
        projectedItemIds: {expected: [...sourceItemIds],     actual: [...observedProjectedItemIds],  mismatch: observedProjectedItemIds.some((projectedItemId, index) => projectedItemId !== sourceItemIds[index])}
    };

    Object.values(chromeMismatch).forEach(term => {
        term.actual = term.actual ?? null
    });

    let mismatchedTerms = Object.keys(chromeMismatch).filter(term => chromeMismatch[term].mismatch);

    return {
        chromeMismatch,
        error: mismatchedTerms.length > 0
            ? `source drag chrome does not match the current workspace document: ${mismatchedTerms.join(', ')}`
            : null,
        mismatchedTerms
    }
};

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBCrossWindowGesture
 * @extends Neo.core.Base
 * @summary Host-bound gesture choreography and observation methods for the cross-window demo.
 *
 * Mixed into the workspace without constructing another owner. Gesture stats, context,
 * settlement and lifetime remain on that host; internal calls resolve its current methods.
 * Prototype cleanup stays callable after Base.destroy removes the host’s instance fields.
 */
class DemoBCrossWindowGesture extends Base {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.crossWindow.DemoBCrossWindowGesture'
         * @protected
         */
        className: 'Neo.examples.dashboard.crossWindow.DemoBCrossWindowGesture'
    }

    /**
     * @summary Installs a gesture-local witness around the source's remote-drop-out hook.
     * The hook itself stays authoritative and runs unchanged; this wrapper only counts how
     * often the coordinator selected that exact completion path before projection teardown.
     * @param {Neo.dashboard.dock.interaction.TabSortZone} sourceZone
     * @returns {Object}
     * @protected
     */
    installCrossWindowSourceProbe(sourceZone) {
        let me       = this,
            stats    = me.crossWindowStats,
            hadOwn   = Object.hasOwn(sourceZone, 'onRemoteDropOut'),
            original = sourceZone.onRemoteDropOut,
            probe    = function(draggedItem) {
                stats.remoteDropOutFires++;
                return original.call(sourceZone, draggedItem)
            };

        sourceZone.onRemoteDropOut = probe;

        return {hadOwn, original, probe, sourceZone}
    }

    /**
     * @summary Removes a gesture-local source witness when the source zone survived the probe.
     * A successful singleton transfer destroys that empty source zone, in which case teardown
     * has already removed the own wrapper and there is nothing to restore.
     * @param {Object|null} sourceProbe
     * @protected
     */
    restoreCrossWindowSourceProbe(sourceProbe) {
        let {hadOwn, original, probe, sourceZone} = sourceProbe || {};

        if (!sourceZone || sourceZone.onRemoteDropOut !== probe) return;

        if (hadOwn) {
            sourceZone.onRemoteDropOut = original
        } else {
            delete sourceZone.onRemoteDropOut
        }
    }

    /**
     * @summary Reads the live source SortZone's drag-session readiness contract.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowDragReadiness(context) {
        let {itemId, sourceWorkspaceId, sourceZone} = context || {},
            draggedItem                             = sourceZone?.dragComponent,
            snapshot                                = {
                coordinatorReady: !!sourceZone?.dragCoordinator,
                dragProxyReady  : !!sourceZone?.dragProxy,
                dragging        : sourceZone?.owner?.cls?.includes?.('neo-is-dragging') === true,
                itemId          : draggedItem?.dockItemId ?? null,
                workspaceId     : draggedItem?.dockSourceWorkspaceId ?? null
            };

        snapshot.ready = snapshot.coordinatorReady
            && snapshot.dragProxyReady
            && snapshot.dragging
            && snapshot.itemId === itemId
            && snapshot.workspaceId === sourceWorkspaceId;

        return snapshot
    }

    /**
     * @summary Polls source gesture state, never elapsed time, before any remote screen move.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowDragReadiness(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowDragReadiness(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Captures the remote target while the pointer is still down. This JSON-safe
     * snapshot is the Whitebox/NL observation seam: coordinator engagement, semantic preview,
     * rendered preview, and menu selection all become inspectable before mouseup commits.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowRemoteSnapshot(context) {
        let me                                            = this,
            {sourceZone, targetNodeId, targetWorkspaceId} = context || {},
            coordinator                                   = sourceZone?.dragCoordinator,
            participation                                 = me.crossWindowParticipations.get(targetWorkspaceId),
            target                                        = participation?.target,
            host                                          = me.crossWindowHosts.get(targetWorkspaceId),
            renderer                                      = host?.down({ntype: 'dock-preview'}),
            indicators                                    = host?.down({ntype: 'dashboard-dock-drop-indicators'}),
            preview                                       = target?.currentPreview ?? null,
            rendered                                      = renderer?.dockPreview ?? null,
            candidateSet                                  = indicators?.candidateSet ?? null,
            snapshot                                      = {
                coordinator: coordinator?.toJSON?.() ?? null,
                embodiment : me.vesselProxyEmbodiment.snapshot(context?.itemId),
                engaged    : coordinator?.activeTargetZone === target,
                indicators : {
                    activePreviewId: indicators?.activeCandidate?.preview?.previewId ?? null,
                    candidateCount : (candidateSet?.cross?.length ?? 0)
                        + (candidateSet?.root?.chips?.length ?? 0),
                    schema         : candidateSet?.schema ?? null
                },
                preview : preview ? WorkspaceDocument.clone(preview) : null,
                rendered: rendered ? WorkspaceDocument.clone(rendered) : null,
                targetNodeId
            };

        snapshot.ready = snapshot.engaged
            && snapshot.preview?.target?.nodeId === targetNodeId
            && snapshot.rendered?.previewId === snapshot.preview?.previewId;

        return snapshot
    }

    /**
     * @summary Polls the target's semantic + rendered hover state before allowing mouseup.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowRemotePreview(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowRemoteSnapshot(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Reads every terminal state the Escape journey must clear after remote hover.
     * @param {Object} context
     * @returns {Object}
     * @protected
     */
    readCrossWindowCancellationSnapshot(context) {
        let me                              = this,
            {sourceZone, targetWorkspaceId} = context || {},
            coordinator                     = sourceZone?.dragCoordinator,
            participation                   = me.crossWindowParticipations.get(targetWorkspaceId),
            host                            = me.crossWindowHosts.get(targetWorkspaceId),
            renderer                        = host?.down({ntype: 'dock-preview'}),
            indicators                      = host?.down({ntype: 'dashboard-dock-drop-indicators'}),
            snapshot                        = {
                activeTargetZone       : coordinator?.toJSON?.().activeTargetZone ?? null,
                activeCandidateId      : indicators?.activeCandidate?.preview?.previewId ?? null,
                candidateSetSchema     : indicators?.candidateSet?.schema ?? null,
                dragDataPresent        : sourceZone?.data != null,
                dragEndActive          : sourceZone?.dragEndActive === true,
                dragPlaceholderPresent : !!sourceZone?.dragPlaceholder,
                dragProxyPresent       : !!sourceZone?.dragProxy,
                proxyEmbodimentPresent : me.vesselProxyEmbodiment.snapshot(context?.itemId) !== null,
                vesselEmbodimentPresent: me.tearOutEmbodiment.isStaged(context?.itemId),
                sourcePaneRestored     : !!context?.pane && context.pane.windowId === context.sourceWindowId,
                draggingClass          : sourceZone?.owner?.cls?.includes?.('neo-is-dragging') === true,
                nativeCandidateCount   : coordinator?.nativeWindowDropCandidates?.size ?? 0,
                semanticPreviewId      : participation?.target?.currentPreview?.previewId ?? null,
                renderedPreviewId      : renderer?.dockPreview?.previewId ?? null
            };

        snapshot.ready = snapshot.activeTargetZone === null
            && snapshot.activeCandidateId === null
            && snapshot.candidateSetSchema === null
            && snapshot.dragDataPresent === false
            && snapshot.dragEndActive === false
            && snapshot.dragPlaceholderPresent === false
            && snapshot.dragProxyPresent === false
            && snapshot.proxyEmbodimentPresent === false
            && snapshot.vesselEmbodimentPresent === false
            && snapshot.sourcePaneRestored === true
            && snapshot.draggingClass === false
            && snapshot.nativeCandidateCount === 0
            && snapshot.semanticPreviewId === null
            && snapshot.renderedPreviewId === null;

        return snapshot
    }

    /**
     * @summary Polls the full cancellation contract rather than treating one cleared CSS class
     * as proof that coordinator, target, proxy and render affordances all settled.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     * @protected
     */
    async waitForCrossWindowCancellation(context, {attempts=120, delay=16}={}) {
        let me = this,
            snapshot;

        for (let attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            snapshot = me.readCrossWindowCancellationSnapshot(context);

            if (snapshot.ready || attempt === attempts) break;

            await me.timeout(delay)
        }

        return snapshot || {ready: false}
    }

    /**
     * @summary Cancels a failed probe through the real main-thread Escape route, then releases
     * the native pointer sensor so the next cold gesture starts from a clean owner state.
     * @param {Object|null} context
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelCrossWindowGesture(context) {
        let me = this,
            {
                sourceButtonId,
                sourceWindowId,
                sourceX,
                sourceY,
                sourceScreenX,
                sourceScreenY,
                sourceZone
            } = context || {};

        if (!sourceButtonId || sourceWindowId == null || !sourceZone) {
            sourceZone?.dragCoordinator?.onDragCancel({sourceSortZone: sourceZone});
            return {escapeDispatched: false, releaseDispatched: false, settled: false}
        }

        let escapeDispatched = await me.interactionService.dispatch({
                id      : sourceButtonId,
                type    : 'keydown',
                windowId: sourceWindowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : sourceButtonId,
                type    : 'mouseup',
                windowId: sourceWindowId,
                options : {
                    bubbles: true, button: 0, buttons: 0, cancelable: true,
                    clientX: sourceX, clientY: sourceY, screenX: sourceScreenX, screenY: sourceScreenY
                }
            });

        for (let attempt = 0; attempt <= 60 && !me.isDestroyed; attempt++) {
            let settled = sourceZone.owner?.cls?.includes?.('neo-is-dragging') !== true
                && sourceZone.dragEndActive !== true
                && sourceZone.data == null
                && !sourceZone.dragPlaceholder
                && !sourceZone.dragProxy;

            if (settled) return {escapeDispatched, releaseDispatched, settled: true};

            attempt < 60 && await me.timeout(16)
        }

        return {escapeDispatched, releaseDispatched, settled: false}
    }

    /**
     * @summary Reads the one connected tear-out generation's identity; every field is null when none
     * is connected.
     * @param {String} itemId
     * @returns {{nativeHandleKey: String|null, windowId: String|null, windowName: String|null}}
     * @protected
     */
    readCrossWindowVesselIdentity(itemId) {
        let vessel = this.resolveTearOutVessel(itemId),
            route  = vessel?.nativeRoute;

        return {
            nativeHandleKey: route?.nativeHandleKey ?? null,
            windowId       : vessel?.windowId ?? null,
            windowName     : vessel?.windowName ?? null
        }
    }

    /**
     * @summary Reads whether a window's claim has settled the vessel that rode the hand into it: the
     * vessel retired, the tear-out slot clear, and the pane back in the source window.
     * @param {Object} context
     * @returns {{activeSlot: Boolean, paneHome: Boolean, settled: Boolean, vessel: Object, vesselRetired: Boolean}}
     * @protected
     */
    readCrossWindowClaimSettlement(context) {
        let me                             = this,
            {itemId, pane, sourceWindowId} = context || {},
            vessel                         = me.readCrossWindowVesselIdentity(itemId),
            snapshot                       = {
                activeSlot   : Boolean(me.tearOutHandlers?.activeVessel),
                paneHome     : Boolean(pane) && !pane.isDestroyed && pane.windowId === sourceWindowId,
                vessel,
                vesselRetired: vessel.windowId === null
            };

        snapshot.settled = snapshot.vesselRetired && snapshot.paneHome && !snapshot.activeSlot;

        return snapshot
    }

    /**
     * @summary Drives the pointer off every window of the group — below the source viewport — until
     * the source's boundary exit has acquired a connected vessel.
     *
     * The boundary sampler measures the proxy against the source's boundary container in client
     * space, so a pointer below the viewport is unambiguously outside, whatever the screen holds
     * there. After a claim retired the previous generation, only a fresh one counts.
     * @param {Object} context
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=200]
     * @param {Number} [options.delay=25]
     * @param {String} [options.label='first'] Which leg this is, for the receipt.
     * @param {Object|null} [options.previousVessel=null] The retired generation a fresh one must differ from.
     * @returns {Promise<{attempts: Number, label: String, pointer: Object, vessel: Object|null, windowDragging: Boolean}>}
     * @protected
     */
    async driveCrossWindowDesktopLeg(context, {attempts=200, delay=25, label='first', previousVessel=null}={}) {
        let me                                                                  = this,
            {itemId, pane, sourceButtonId, sourceWindowId, sourceX, sourceZone} = context,
            WindowManager                                                       = (await import('../../../src/manager/Window.mjs')).default,
            inner                                                               = WindowManager.get(sourceWindowId)?.innerRect,
            voidX                                                               = sourceX,
            voidY                                                               = (inner?.height ?? 720) + 120,
            voidScreenX                                                         = (inner?.x ?? 0) + voidX,
            voidScreenY                                                         = (inner?.y ?? 0) + voidY,
            vessel                                                              = null,
            attempt;

        for (attempt = 0; attempt <= attempts && !me.isDestroyed; attempt++) {
            await me.interactionService.simulateEvent({events: [{
                delay   : 16,
                targetId: sourceButtonId,
                type    : 'mousemove',
                windowId: sourceWindowId,
                options : {
                    bubbles: true, button: 0, buttons: 1, cancelable: true,
                    clientX: voidX + attempt % 2, clientY: voidY,
                    screenX: voidScreenX + attempt % 2, screenY: voidScreenY
                }
            }]});

            let identity = me.readCrossWindowVesselIdentity(itemId);

            if (identity.windowId && identity.windowId !== previousVessel?.windowId && sourceZone.isWindowDragging) {
                vessel = {...identity, mountCount: pane?.mountCount ?? null};
                break
            }

            await me.timeout(delay)
        }

        return {
            attempts,
            label,
            pointer       : {voidScreenX, voidScreenY, voidX, voidY},
            vessel,
            windowDragging: sourceZone.isWindowDragging === true
        }
    }

    /**
     * @summary Drives the demo gesture through the live host and its InteractionService.
     * The step carries semantic ids only; this host resolves live windows, component ids, and
     * coordinates immediately before dispatch.
     * The drag keeps one rule for every window of the group (the docking design record §2.8.6):
     * inside a window it is that window's tab-header proxy, outside every window it is a vessel. A
     * window that claims the pointer retires a vessel riding the hand and the pane comes home; leaving
     * that window for the desktop is a boundary exit again and acquires a fresh vessel.
     * @param {Object} step
     * @param {Object} [options={}]
     * @param {Boolean} [options.cancelAtTarget=false] Whitebox-only branch: Escape after
     * remote preview settles, before mouseup. This option never enters tour-script data.
     * @param {Boolean} [options.roundTrip=false] Whitebox-only branch: leave the source for the desktop
     * (a vessel is born), cross into the target (the claim retires it, the target carries the header
     * proxy), leave again (a fresh vessel is born), then release detached. Implies `viaDesktop`.
     * @param {Boolean} [options.viaDesktop=roundTrip] Whitebox-only branch: reach the target through the
     * desktop, so the gesture carries a vessel into the claim. The direct path never births one — a
     * claimed frame is no boundary crossing.
     * @param {{main:String, popup:String}} workspaceIds Semantic IDs supplied by the workspace.
     * @returns {Promise<Object>}
     */
    async runCrossWindowGesture(step, {cancelAtTarget = false, roundTrip = false, viaDesktop = roundTrip} = {}, workspaceIds) {
        let me                        = this,
            acquisitionAttemptsBefore = me.tearOutAcquisitionAttempts,
            sourceProbe               = null,
            {
                itemId,
                sourceWorkspaceId,
                targetWorkspaceId,
                targetNodeId
            } = step || {};

        if (itemId !== 'workbench'
            || sourceWorkspaceId !== workspaceIds.main
            || targetWorkspaceId !== workspaceIds.popup
            || targetNodeId !== 'popup-tabs') {
            return {applied: false, errors: ['unsupported Demo-B cross-window step']}
        }

        let pane = me.paneCache[itemId];

        if (!me.getWorkspaceDocument(sourceWorkspaceId)?.items?.[itemId]
            || !pane
            || pane.isDestroyed) {
            return {applied: false, errors: ['source Workbench pane is not live and owned by the source workspace']}
        }

        try {
            // Surface cues are deliberately data-only and fire synchronously from TourRunner. A
            // perspective load can therefore enqueue a projection immediately before this step,
            // especially in spec mode where viewer pauses are skipped. Drain the host-owned queue
            // before opening the second vessel so gesture geometry never reads stale tab chrome.
            await me.awaitProjectionIdle();
            await me.openCrossWindowStage();
            await me.waitForWorkspaceGeometry(sourceWorkspaceId);
            await me.waitForWorkspaceGeometry(targetWorkspaceId);

            let stagePlacement = await me.positionCrossWindowStage();

            if (!stagePlacement.ready) {
                return {
                    applied: false,
                    errors : ['cross-window stage could not establish two non-overlapping active windows'],
                    debug  : {stagePlacement}
                }
            }

            let sourceDocument = me.getWorkspaceDocument(sourceWorkspaceId),
                sourceNodeId   = WorkspaceDocument.findContainingTabsId(sourceDocument, itemId),
                sourceItems    = sourceDocument.nodes[sourceNodeId]?.items || [],
                sourceHost     = me.crossWindowHosts.get(sourceWorkspaceId),
                sourceTabs     = sourceHost?.down({dockNodeId: sourceNodeId}),
                itemIndex      = sourceDocument.nodes[sourceNodeId]?.items.indexOf(itemId) ?? -1,
                sourceButton   = sourceTabs?.getTabAtIndex(itemIndex),
                sourceBar      = sourceTabs?.getTabBar(),
                sourceZone     = sourceBar?.sortZone,
                projectedItems = sourceZone?.dockItemIds || [],
                [buttonRect]   = sourceButton
                    ? await sourceButton.getDomRect([sourceButton.id], sourceButton.windowId)
                    : [],
                targetGeometry = me.crossWindowGeometry.get(targetWorkspaceId),
                targetRect     = targetGeometry?.zones.find(zone => zone.nodeId === targetNodeId)?.rect,
                WindowManager  = (await import('../../../src/manager/Window.mjs')).default,
                sourceWindow   = WindowManager.get(sourceButton?.windowId),
                targetWindow   = WindowManager.get(me.crossWindowTargetWindowId);

            if (sourceItems.length !== 1 || sourceItems[0] !== itemId) {
                return {
                    applied: false,
                    errors : ['Demo-B cross-window projection currently supports only its singleton Workbench source tab']
                }
            }

            let {chromeMismatch, error: chromeError} = describeCrossWindowChromeMismatch({
                observedBarItemCount    : sourceBar?.getTabButtons()?.length,
                observedNodeId          : sourceTabs?.dockNodeId,
                observedProjectedItemIds: projectedItems,
                observedWorkspaceId     : sourceZone?.dockWorkspaceId,
                sourceItemIds           : sourceItems,
                sourceNodeId,
                sourceWorkspaceId
            });

            if (chromeError) {
                return {applied: false, errors: [chromeError], debug: {chromeMismatch}}
            }

            if (!sourceButton || !sourceZone || !buttonRect || !targetRect
                || !sourceWindow?.innerRect || !targetWindow?.innerRect) {
                return {applied: false, errors: ['cross-window gesture surfaces are not ready']}
            }

            if (!sourceZone.dragCoordinator) {
                return {applied: false, errors: ['source cross-window coordinator is not ready']}
            }

            let sourceX       = buttonRect.x + buttonRect.width / 2,
                sourceY       = buttonRect.y + buttonRect.height / 2,
                sourceScreenX = sourceWindow.innerRect.x + sourceX,
                sourceScreenY = sourceWindow.innerRect.y + sourceY,
                targetX       = targetRect.x + targetRect.width / 2,
                targetY       = targetRect.y + targetRect.height / 2,
                targetScreenX = targetWindow.innerRect.x + targetX,
                targetScreenY = targetWindow.innerRect.y + targetY;

            me.crossWindowStats          = {localDropFires: 0, remoteDropOutFires: 0, transferCommits: 0};
            sourceProbe                  = me.installCrossWindowSourceProbe(sourceZone);
            me.crossWindowGestureContext = {
                frames        : pane?.frames ?? 0,
                itemId,
                mountCount    : pane?.mountCount ?? 0,
                pane,
                sourceButtonId: sourceButton.id,
                sourceNodeId,
                sourceScreenX,
                sourceScreenY,
                sourceWorkspaceId,
                sourceWindowId: sourceButton.windowId,
                sourceX,
                sourceY,
                sourceZone,
                targetNodeId,
                targetWorkspaceId
            };

            let settled = new Promise(resolve => me.crossWindowGestureResolve = resolve),
                options = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true,
                    clientX, clientY, screenX, screenY
                });

            // Phase 1: own the native sensor and cross the local drag threshold. The next phase
            // cannot begin until the worker-side SortZone exposes its readiness state.
            await me.interactionService.simulateEvent({events: [{
                targetId: sourceButton.id,
                type    : 'mousedown',
                windowId: sourceButton.windowId,
                options : options(sourceX, sourceY, sourceScreenX, sourceScreenY, 1)
            }, {
                delay   : 120,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 8, sourceY, sourceScreenX + 8, sourceScreenY, 1)
            }, {
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 24, sourceY, sourceScreenX + 24, sourceScreenY, 1)
            }]});

            let readiness = await me.waitForCrossWindowDragReadiness(me.crossWindowGestureContext);

            if (!readiness.ready) {
                let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return {
                    applied: false,
                    errors : ['source drag did not reach the landed readiness contract'],
                    debug  : {cancellation, readiness}
                }
            }

            let firstVessel = null;

            // The desktop leg: the pointer leaves every window, so the source's boundary exit
            // acquires a vessel that then rides the hand into the target's claim.
            if (viaDesktop) {
                let leg = await me.driveCrossWindowDesktopLeg(me.crossWindowGestureContext, {label: 'first'});

                if (!leg.vessel) {
                    let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                    me.restoreCrossWindowSourceProbe(sourceProbe);
                    me.crossWindowGestureResolve = null;
                    me.crossWindowGestureContext = null;

                    return {
                        applied: false,
                        errors : ['the desktop leg did not acquire a vessel'],
                        debug  : {cancellation, leg}
                    }
                }

                firstVessel = leg.vessel;
                me.crossWindowGestureContext.firstVessel = firstVessel
            }

            // Phase 2: move in screen space while the source document still owns the pointer.
            // Mouseup remains withheld until the target's semantic AND rendered preview agree.
            await me.interactionService.simulateEvent({events: [{
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 32, sourceY, targetScreenX, targetScreenY, 1)
            }, {
                delay   : 16,
                targetId: sourceButton.id,
                type    : 'mousemove',
                windowId: sourceButton.windowId,
                options : options(sourceX + 34, sourceY, targetScreenX + 2, targetScreenY, 1)
            }]});

            let remoteSnapshot;

            for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                remoteSnapshot = me.readCrossWindowRemoteSnapshot(me.crossWindowGestureContext);

                if (remoteSnapshot.ready) {
                    const target = me.crossWindowParticipations.get(targetWorkspaceId)?.target;
                    remoteSnapshot.ready = await target?.awaitRemoteDragEmbodiment(sourceZone.dragComponent) === true;
                    remoteSnapshot.embodiment = me.vesselProxyEmbodiment.snapshot(itemId)
                }

                // A vessel that rode the hand into the claim retires there, and the pane comes home.
                if (remoteSnapshot.ready && firstVessel) {
                    remoteSnapshot.claim = me.readCrossWindowClaimSettlement(me.crossWindowGestureContext);
                    remoteSnapshot.ready = remoteSnapshot.claim.settled
                }

                if (remoteSnapshot.ready || attempt === 120) break;

                await me.interactionService.simulateEvent({events: [{
                    delay   : 16,
                    targetId: sourceButton.id,
                    type    : 'mousemove',
                    windowId: sourceButton.windowId,
                    options : options(
                        sourceX + 36 + attempt % 2,
                        sourceY,
                        targetScreenX + 4 + attempt % 2,
                        targetScreenY,
                        1
                    )
                }]})
            }

            if (!remoteSnapshot.ready) {
                let candidateDiagnostics = [],
                    group                = sourceZone.dragCoordinator.sortZones.get(sourceZone.sortGroup);

                group?.forEach((zone, windowId) => {
                    let inner  = WindowManager.get(windowId)?.innerRect,
                        localX = inner ? targetScreenX - inner.x : null,
                        localY = inner ? targetScreenY - inner.y : null;

                    candidateDiagnostics.push({
                        accepts        : inner && typeof zone.acceptsRemoteDrag === 'function'
                            ? zone.acceptsRemoteDrag(localX, localY)
                            : null,
                        innerRect      : inner && {
                            height: inner.height,
                            width : inner.width,
                            x     : inner.x,
                            y     : inner.y
                        },
                        localX,
                        localY,
                        sameAsSource  : zone === sourceZone,
                        stableTargetId: zone.stableTargetId ?? null,
                        windowId
                    })
                });

                let claim = {
                        dragComponent : sourceZone.dragComponent?.id ?? null,
                        dragProxy     : sourceZone.dragProxy?.id ?? null,
                        enabled       : sourceZone.enableVesselConversion,
                        firstVessel,
                        vessel        : me.readCrossWindowVesselIdentity(itemId),
                        windowDragging: sourceZone.isWindowDragging
                    },
                    cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return {
                    applied: false,
                    errors : ['remote target did not expose a settled semantic preview'],
                    debug  : {
                        candidateDiagnostics,
                        cancellation,
                        claim,
                        readiness,
                        remoteSnapshot,
                        stagePlacement,
                        targetGeometry,
                        targetPointer: {screenX: targetScreenX, screenY: targetScreenY},
                        windows      : WindowManager.toJSON()
                    }
                }
            }

            me.crossWindowGestureContext.remoteSnapshot = remoteSnapshot;
            me.crossWindowGestureContext.proxyMountCount = pane.mountCount;

            if (roundTrip) {
                // The claim retired the vessel that rode the hand in; the pane is home and the target
                // carries the header proxy. Leaving the target for the desktop is a boundary exit
                // again, which acquires a fresh vessel through the ordinary fail-closed admission.
                let claimSnapshot       = remoteSnapshot,
                    acquisitionsAtClaim = me.tearOutAcquisitionAttempts,
                    mountAtClaim        = pane.mountCount,
                    leg                 = await me.driveCrossWindowDesktopLeg(me.crossWindowGestureContext, {
                        label         : 'second',
                        previousVessel: firstVessel
                    });

                if (!leg.vessel) {
                    let cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext);

                    me.restoreCrossWindowSourceProbe(sourceProbe);
                    me.crossWindowGestureResolve = null;
                    me.crossWindowGestureContext = null;

                    return {
                        applied: false,
                        errors : ['leaving the target did not acquire a fresh vessel'],
                        debug  : {cancellation, claimSnapshot, firstVessel, leg}
                    }
                }

                let secondVessel                             = leg.vessel,
                    acquisitionsAfterExit                    = me.tearOutAcquisitionAttempts,
                    mountAtSecondVessel                      = pane.mountCount,
                    {voidX, voidY, voidScreenX, voidScreenY} = leg.pointer;

                await me.interactionService.simulateEvent({events: [{
                    targetId: sourceButton.id,
                    type    : 'mouseup',
                    windowId: sourceButton.windowId,
                    options : options(voidX, voidY, voidScreenX, voidScreenY, 0)
                }]});

                let detached;

                for (let attempt = 0; attempt <= 120 && !me.isDestroyed; attempt++) {
                    let sourceDocument = me.getWorkspaceDocument(sourceWorkspaceId),
                        entry          = me.nativeWindows?.getOwner(me.vesselSourceId, me.resolveVesselKey(itemId));

                    detached = {
                        catalogRetained: !!sourceDocument?.items?.[itemId],
                        entry          : entry ? {...entry} : null,
                        itemAbsent     : WorkspaceDocument.findContainingTabsId(sourceDocument, itemId) === null
                    };

                    if (
                        detached.entry?.windowId === secondVessel.windowId &&
                        detached.catalogRetained && detached.itemAbsent
                    ) break;

                    await me.timeout(16)
                }

                await me.awaitProjectionIdle();

                let terminalVessel = me.readCrossWindowVesselIdentity(itemId),
                    sourceAfter    = WorkspaceDocument.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetAfter    = WorkspaceDocument.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    proof          = {
                        acquisitionAttempts: {
                            afterExit           : acquisitionsAfterExit,
                            atClaim             : acquisitionsAtClaim,
                            beforeGesture       : acquisitionAttemptsBefore,
                            totalGestureAttempts: acquisitionsAfterExit - acquisitionAttemptsBefore
                        },
                        claim : claimSnapshot.claim ?? null,
                        claimSnapshot,
                        detached,
                        firstVessel,
                        mounts: {
                            atClaim       : mountAtClaim,
                            atFirstVessel : firstVessel.mountCount,
                            atSecondVessel: mountAtSecondVessel,
                            beforeGesture : me.crossWindowGestureContext.mountCount,
                            terminal      : pane.mountCount
                        },
                        secondVessel,
                        stats: {...me.crossWindowStats},
                        terminalVessel
                    },
                    checks = [
                        ['the desktop leg acquired exactly one vessel', acquisitionsAtClaim - acquisitionAttemptsBefore === 1],
                        ['the claim retired that vessel', proof.claim?.vesselRetired === true],
                        ['the pane came home on the claim', proof.claim?.paneHome === true],
                        ['the target carried the header proxy without the pane', claimSnapshot.embodiment?.header === true
                            && claimSnapshot.embodiment.ownsPane === false
                            && claimSnapshot.embodiment.settled === true
                            && claimSnapshot.embodiment.visible === true],
                        ['leaving the target acquired exactly one fresh vessel', acquisitionsAfterExit - acquisitionsAtClaim === 1],
                        ['the fresh vessel is a new generation', Boolean(secondVessel.windowId) && secondVessel.windowId !== firstVessel.windowId],
                        ['detached terminal retained the catalog item', detached?.catalogRetained === true],
                        ['detached terminal removed the item from the dock tree', detached?.itemAbsent === true],
                        ['detached terminal adopted the fresh vessel', detached?.entry?.windowId === secondVessel.windowId],
                        ['the terminal owner is the fresh vessel', terminalVessel.windowId === secondVessel.windowId],
                        ['remote transfer did not commit', me.crossWindowStats.transferCommits === 0],
                        ['source remote-drop-out did not fire', me.crossWindowStats.remoteDropOutFires === 0],
                        ['source local drop stayed suppressed', me.crossWindowStats.localDropFires === 0]
                    ],
                    errors = checks.filter(([, passed]) => !passed).map(([message]) => message),
                    result = {
                        applied       : errors.length === 0,
                        errors,
                        proof,
                        sourceDocument: sourceAfter,
                        targetDocument: targetAfter,
                        witness       : {
                            instanceId: pane?.id ?? null,
                            mountCount: pane?.mountCount ?? null
                        }
                    };

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return result
            }

            if (cancelAtTarget) {
                let sourceBefore = WorkspaceDocument.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetBefore = WorkspaceDocument.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    cancellation = await me.cancelCrossWindowGesture(me.crossWindowGestureContext),
                    cleanup      = await me.waitForCrossWindowCancellation(me.crossWindowGestureContext),
                    sourceAfter  = WorkspaceDocument.clone(me.getWorkspaceDocument(sourceWorkspaceId)),
                    targetAfter  = WorkspaceDocument.clone(me.getWorkspaceDocument(targetWorkspaceId)),
                    result       = {
                        applied       : false,
                        cancelled     : true,
                        errors        : ['cross-window gesture cancelled before commit'],
                        sourceDocument: sourceAfter,
                        targetDocument: targetAfter,
                        proof         : {
                            acquisitionAttempts: me.tearOutAcquisitionAttempts - acquisitionAttemptsBefore,
                            cancellation,
                            claim              : remoteSnapshot.claim ?? null,
                            cleanup,
                            documentsUnchanged : JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
                                && JSON.stringify(targetBefore) === JSON.stringify(targetAfter),
                            firstVessel,
                            remoteSnapshot,
                            stats            : {...me.crossWindowStats},
                            vesselAfterCancel: me.readCrossWindowVesselIdentity(itemId)
                        }
                    };

                me.restoreCrossWindowSourceProbe(sourceProbe);
                me.crossWindowGestureResolve = null;
                me.crossWindowGestureContext = null;

                return result
            }

            // Phase 3: release only after the mid-gesture receipt is captured. The coordinator
            // now has one unambiguous target and can commit through its ordinary onDragEnd path.
            await me.interactionService.simulateEvent({events: [{
                targetId: sourceButton.id,
                type    : 'mouseup',
                windowId: sourceButton.windowId,
                options : options(sourceX + 34, sourceY, targetScreenX + 2, targetScreenY, 0)
            }]});

            let timeout = me.timeout(5000).then(() => ({
                applied: false,
                errors : ['real cross-window gesture did not settle through the target commit path'],
                debug  : {
                    coordinator: sourceZone.dragCoordinator?.toJSON?.() ?? null,
                    source     : {
                        buttonRect,
                        sortGroup          : sourceZone.sortGroup,
                        windowId           : sourceZone.windowId,
                        remoteDropCommitted: sourceZone.remoteDropCommitted
                    },
                    sourceWindow: sourceWindow.innerRect,
                    stagePlacement,
                    stats       : {...me.crossWindowStats},
                    target      : {nodeId: targetNodeId, rect: targetRect},
                    targetWindow: targetWindow.innerRect
                }
            }));

            let result = await Promise.race([settled, timeout]);

            if (!result.applied) {
                await me.cancelCrossWindowGesture(me.crossWindowGestureContext)
            }

            me.restoreCrossWindowSourceProbe(sourceProbe);
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            return result
        } catch (error) {
            await me.cancelCrossWindowGesture(me.crossWindowGestureContext).catch(() => {});
            me.restoreCrossWindowSourceProbe(sourceProbe);
            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            return {applied: false, errors: [error?.message || String(error)]}
        }
    }
}

export default Neo.setupClass(DemoBCrossWindowGesture);
