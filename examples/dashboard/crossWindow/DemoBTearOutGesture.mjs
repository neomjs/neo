import Base              from '../../../src/core/Base.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBTearOutGesture
 * @extends Neo.core.Base
 * @summary Drives and observes the demo's single-window boundary tear-out sequence.
 *
 * Mixed into the workspace without another instance or lifecycle. The host retains the
 * interaction service, projection queue, pane cache and Group-owned native records. Each
 * step resolves current host methods; the public facades supply semantic workspace identity.
 */
class DemoBTearOutGesture extends Base {
    static config = {
        /** @member {String} className='Neo.examples.dashboard.crossWindow.DemoBTearOutGesture' */
        className: 'Neo.examples.dashboard.crossWindow.DemoBTearOutGesture'
    }

    /**
     * @summary Drives the REAL G1 dock tear-out gesture end-to-end for the e2e witness leg. Unlike
     * {@link Neo.examples.dashboard.crossWindow.DemoBWorkspace#executeCrossWindowStep}
     * (a two-window transfer over the coordinator), this is the
     * single-window boundary grammar: it arms a tab drag, flings the proxy past the window
     * boundary so {@link Neo.dashboard.dock.interaction.TabSortZone} re-fires `dockTearOutExit`, the host opens
     * a `?popout=` vessel, then — gated on that vessel's ACTUAL birth
     * (the Group publishing the vessel's connection) — survives deliberate post-birth moves
     * (the reap-regression survival probe) and either releases while detached (`dockTearOutTerminal`
     * → the host's `detachItem` commit + the choreography's `adoptPane`) or cancels via Escape
     * (`dockTearOutCancel` → zero-mutation vessel close).
     *
     * The proof is OBSERVABLE-ONLY — committed document truth + vessel bookkeeping. It never reads
     * the machine's internal drag state, because the gesture guards ARE the contract: a cancelled
     * tear-out leaves the committed document byte-identical by construction (nothing writes it until
     * the terminal), and a committed detach is the item ABSENT from every node yet PRESENT in the
     * catalog (the vessel owns it; nothing leaked).
     * @param {Object} step
     * @param {String} step.itemId The dock item to tear out.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {Object} [options={}]
     * @param {Boolean} [options.cancel=false] Escape while detached instead of releasing — the zero-mutation witness.
     * @param {Number} [options.postBirthMoves=2] Deliberate outward moves after birth (the survival probe; floored at 2).
     * @param {String} workspaceId Host-owned main workspace identity.
     * @returns {Promise<Object>}
     */
    async runTearOutStep(step, {cancel = false, postBirthMoves = 2} = {}, workspaceId) {
        let me                     = this,
            {itemId, sourceNodeId} = step || {},
            document               = me.getWorkspaceDocument(workspaceId),
            node                   = document?.nodes?.[sourceNodeId],
            button                 = null,
            release                = null;

        if (!itemId || node?.type !== 'tabs' || !node.items.includes(itemId)) {
            return {applied: false, errors: ['tear-out step must name a live item held by a tabs node']}
        }

        let pane = me.paneCache[itemId];

        if (!pane || pane.isDestroyed || !document.items?.[itemId]) {
            return {applied: false, errors: ['source pane is not live and owned by the main workspace']}
        }

        try {
            // Drain the host-owned projection queue + confirm painted geometry before reading tab
            // chrome — a perspective load can enqueue a projection immediately before this step.
            await me.awaitProjectionIdle();
            await me.waitForWorkspaceGeometry(workspaceId);

            let host          = me.crossWindowHosts.get(workspaceId),
                tabs          = host?.down({dockNodeId: sourceNodeId}),
                sortZone      = tabs?.getTabBar()?.sortZone,
                itemIndex     = node.items.indexOf(itemId),
                WindowManager = (await import('../../../src/manager/Window.mjs')).default;

            button = tabs?.getTabAtIndex(itemIndex);

            let window       = WindowManager.get(button?.windowId),
                [buttonRect] = button ? await button.getDomRect([button.id], button.windowId) : [];

            if (!button || !sortZone || !buttonRect || !window?.innerRect) {
                return {applied: false, errors: ['tear-out gesture surfaces are not ready']}
            }

            // The committed document BEFORE the gesture — both the zero-mutation (cancel) and the
            // detach-commit (terminal) proofs compare against this snapshot.
            let documentBefore = WorkspaceDocument.clone(document),
                catalogBefore  = Object.keys(documentBefore.items);

            let startX  = buttonRect.x + buttonRect.width / 2,
                startY  = buttonRect.y + buttonRect.height / 2,
                startSX = window.innerRect.x + startX,
                startSY = window.innerRect.y + startY,
                opt     = (clientX, clientY, screenX, screenY, buttons) => ({
                    bubbles: true, button: 0, buttons, cancelable: true, clientX, clientY, screenX, screenY
                });

            // A stale record from a prior gesture would false-open the birth gate.
            me.nativeWindows?.clearConnection(me.vesselSourceId, me.resolveVesselKey(itemId));

            // Phase 1: own the native sensor + cross the LOCAL drag arming threshold (delay+distance).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mousedown', windowId: button.windowId,
                options : opt(startX, startY, startSX, startSY, 1)
            }, {
                delay  : 120, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 8, startY + 2, startSX + 8, startSY + 2, 1)
            }, {
                delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                options: opt(startX + 16, startY + 24, startSX + 16, startSY + 24, 1)
            }]});

            // The drag arms ASYNC — {@link Neo.draggable.DragZone#onDragStart} round-trips main for
            // `boundaryContainerRect`, creates the proxy, and measures `itemRects`;
            // {@link Neo.draggable.container.SortZone#onDragMove} early-returns (before
            // checkWindowBoundary) until all three exist. Gate on them before any outward sample or
            // the exit never fires (mechanic 1: arming precedes boundary moves).
            let armed = await me.waitForTearOutDragArmed(sortZone);

            if (!armed) {
                let cancellation = await me.cancelTearOutGesture(button, {clientX: startX, clientY: startY, screenX: startSX, screenY: startSY});

                return {applied: false, errors: ['tear-out drag did not arm'], proof: {armed: false, cancellation, documentBefore}}
            }

            // The tear-out exit fires when the proxy LEAVES `boundaryContainerRect` — the window-drag
            // boundary (its `enableProxyToPopup` semantics: leaving the window IS the gesture), not the
            // viewport interior. A straight in-viewport move keeps the ratio at 1 (the first diagnostic).
            // Read the LIVE boundary and target past its bottom-right corner, fully outside it, so
            // intersectionRatio collapses below reattachThreshold (pre-armed, no false re-entry).
            let b       = sortZone.boundaryContainerRect,
                bRight  = b.right  ?? (b.x + b.width),
                bBottom = b.bottom ?? (b.y + b.height),
                outX    = Math.round(bRight  + 120),
                outY    = Math.round(bBottom + 120),
                outSX   = window.innerRect.x + outX,
                outSY   = window.innerRect.y + outY;

            release = {clientX: outX, clientY: outY, screenX: outSX, screenY: outSY};

            // Phase 2: PROGRESSIVE outward moves toward the past-the-edge target — each further out so
            // intersectionRatio steps down (isMovingOut): dragBoundaryExit → dockTearOutExit → the host
            // acquires the vessel. Progressive is robust to the initial lastIntersectionRatio.
            for (let stepIndex = 1; stepIndex <= 4; stepIndex++) {
                let px = Math.round(startX + (outX - startX) * stepIndex / 4),
                    py = Math.round(startY + (outY - startY) * stepIndex / 4);

                await me.interactionService.simulateEvent({events: [{
                    delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(px, py, window.innerRect.x + px, window.innerRect.y + py, 1)
                }]})
            }

            // Gate on the vessel's ACTUAL birth: a `?popout=` window connecting through onWindowConnect.
            let born = await me.waitForTearOutVessel(itemId);

            if (!born) {
                // Capture the decisive state BEFORE the cancel resets it: exitFired (isWindowDragging)
                // distinguishes a geometry miss (false → boundary never crossed) from an admission miss
                // (true → the host's openVessel/windowOpen failed); the boundary + out target expose the
                // geometry; itemRects confirms the onDragMove gate cleared.
                let diag         = `exitFired=${Boolean(sortZone.isWindowDragging)} enableProxyToPopup=${Boolean(sortZone.enableProxyToPopup)} lastRatio=${sortZone.lastIntersectionRatio} boundary=${JSON.stringify(b)} out=(${outX},${outY}) itemRects=${sortZone.itemRects?.length ?? 'null'}`,
                    cancellation = await me.cancelTearOutGesture(button, release);

                return {
                    applied: false,
                    errors : [`tear-out vessel was not born after the boundary exit — ${diag}`],
                    proof  : {armed: true, born: false, diag, cancellation, documentBefore}
                }
            }

            // Post-birth survival probe: deliberate OUTWARD moves must NOT reap the newborn
            // vessel — each stays further out (below reattachThreshold), so no false re-entry fires.
            let probeMoves = Math.max(2, postBirthMoves);

            for (let i = 1; i <= probeMoves; i++) {
                await me.interactionService.simulateEvent({events: [{
                    delay  : 16, targetId: button.id, type: 'mousemove', windowId: button.windowId,
                    options: opt(outX, outY + i * 12, outSX, outSY + i * 12, 1)
                }]})
            }

            let survivedProbe = Boolean(me.nativeWindows?.getConnection(me.vesselSourceId, me.resolveVesselKey(itemId)));

            if (cancel) {
                // Escape while detached (post-exit, pre-up) → processDragEnd(cancelled) →
                // dockTearOutCancel → the host closes its vessel. Assert the committed document is
                // byte-identical — the zero-mutation invariant, proven from the third party (the doc).
                let cancellation  = await me.cancelTearOutGesture(button, release),
                    documentAfter = WorkspaceDocument.clone(me.getWorkspaceDocument(workspaceId));

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

            // Terminal: release while detached → dockTearOutTerminal → the host's detachItem commit
            // + the choreography's adoptPane (the vessel owns the pane now).
            await me.interactionService.simulateEvent({events: [{
                targetId: button.id, type: 'mouseup', windowId: button.windowId,
                options : opt(outX, outY, outSX, outSY, 0)
            }]});

            let committed      = await me.waitForTearOutCommit(itemId, sourceNodeId),
                documentAfter  = WorkspaceDocument.clone(me.getWorkspaceDocument(workspaceId)),
                absentFromTree = !Object.values(documentAfter.nodes).some(zoneNode => zoneNode.items?.includes(itemId)),
                keptInCatalog  = Boolean(documentAfter.items?.[itemId]);

            return {
                applied: committed && absentFromTree && keptInCatalog,
                errors : committed && absentFromTree && keptInCatalog ? [] : ['detachItem commit did not reach committed document truth'],
                proof  : {
                    born              : true,
                    survivedProbe,
                    committed,
                    documentBefore,
                    documentAfter,
                    detachCommitted   : absentFromTree && keptInCatalog,
                    itemAbsentFromTree: absentFromTree,
                    itemKeptInCatalog : keptInCatalog,
                    catalogPreserved  : catalogBefore.every(id => Boolean(documentAfter.items?.[id])),
                    vesselWindowName  : `tearout-${itemId}`
                }
            }
        } catch (error) {
            button && await me.cancelTearOutGesture(button, release).catch(() => {});

            return {applied: false, errors: [error?.message || String(error)]}
        }
    }

    /**
     * @summary Polls until the base drag has ARMED — a live proxy AND the async main-thread
     * `boundaryContainerRect` are both present, the two facts
     * {@link Neo.draggable.container.SortZone#checkWindowBoundary} needs before it will sample a
     * boundary exit. {@link Neo.draggable.DragZone#onDragStart} sets the boundary through a main
     * round-trip, so the outward fling must wait for it or the exit silently never fires.
     * @param {Neo.draggable.container.SortZone} sortZone
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutDragArmed(sortZone, {attempts = 120, delay = 16} = {}) {
        let me = this,
            // dragProxy + boundaryContainerRect + itemRects are exactly the three facts
            // container/SortZone.onDragMove needs before it reaches checkWindowBoundary.
            armed = () => Boolean(sortZone?.dragProxy && sortZone?.boundaryContainerRect && sortZone?.itemRects);

        return me.waitFor(armed, {attempts, delay})
    }

    /**
     * @summary Whether a tear-out vessel exists for this item in EITHER lifecycle phase.
     * @description Adoption runs at whichever of terminal and connect lands second, so a live vessel
     * is a provisional connection before that race resolves and committed ownership after it. Both
     * are the Group's, and a witness asking "is there a vessel" must not have to know which phase
     * won — that is the question this answers, and the reason it is not two lookups at every caller.
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    hasTearOutVessel(itemId) {
        let me  = this,
            key = me.resolveVesselKey(itemId);

        return Boolean(me.nativeWindows?.getConnection(me.vesselSourceId, key)
            || me.nativeWindows?.getOwner(me.vesselSourceId, key))
    }

    /**
     * @summary Gates on the tear-out vessel's ACTUAL birth: the `?popout=<itemId>` window connecting through
     * the Group's native lifecycle publishes the vessel's connection. Polls that observable rather
     * than any internal drag flag — the connect is the fact a witness can trust.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutVessel(itemId, {attempts = 180, delay = 16} = {}) {
        let me = this;

        return me.waitFor(() => me.hasTearOutVessel(itemId), {attempts, delay})
    }

    /**
     * @summary Gates on the committed detach reaching document truth: the item leaves every node's `items`
     * (the vessel owns it) while the catalog entry stays. Polls the committed document only.
     * @param {String} itemId
     * @param {String} sourceNodeId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180]
     * @param {Number} [options.delay=16]
     * @param {String} workspaceId Host-owned main workspace identity.
     * @returns {Promise<Boolean>}
     * @protected
     */
    async pollTearOutCommit(itemId, sourceNodeId, {attempts = 180, delay = 16} = {}, workspaceId) {
        let me       = this,
            detached = () => {
                let document = me.getWorkspaceDocument(workspaceId);

                return !Object.values(document.nodes).some(zoneNode => zoneNode.items?.includes(itemId))
                    && Boolean(document.items?.[itemId])
            };

        return me.waitFor(detached, {attempts, delay})
    }

    /**
     * @summary Cancels a live tear-out gesture: an Escape keydown (the drag-cancel signal
     * {@link Neo.draggable.container.SortZone#onDragCancel} consumes) followed by a settling
     * mouseup, awaiting both dispatches in order for the single-window boundary grammar.
     * @param {Neo.component.Base} button The dragged tab button.
     * @param {Object} release `{clientX, clientY, screenX, screenY}` the release point.
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelTearOutGesture(button, release) {
        let me = this;

        if (!button) return {escapeDispatched: false, releaseDispatched: false, settled: false};

        let {clientX = 0, clientY = 0, screenX = 0, screenY = 0} = release || {},
            escapeDispatched = await me.interactionService.dispatch({
                id      : button.id,
                type    : 'keydown',
                windowId: button.windowId,
                options : {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await me.interactionService.dispatch({
                id      : button.id,
                type    : 'mouseup',
                windowId: button.windowId,
                options : {bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, screenX, screenY}
            });

        return {escapeDispatched, releaseDispatched, settled: true}
    }
}

export default Neo.setupClass(DemoBTearOutGesture);
