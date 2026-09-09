import Base               from '../../../src/core/Base.mjs';
import InteractionService from '../../../src/ai/client/InteractionService.mjs';
import Operations         from '../../../src/dashboard/dock/model/Operations.mjs';
import PreviewContract    from '../../../src/dashboard/dock/model/PreviewContract.mjs';
import WorkspaceDocument  from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @summary Owns optional scripted input, cursor cleanup and in-window Workstation choreography.
 * The workspace and its docking/native owners are borrowed. A dispatched input settles before
 * cancellation releases the pointer; only then may a destroyed driver retire its service.
 * @class Workstation.tour.GestureDriver
 * @extends Neo.core.Base
 */
class GestureDriver extends Base {
    static config = {
        /** @member {String} className='Workstation.tour.GestureDriver' */
        className: 'Workstation.tour.GestureDriver',
        /** @member {Workstation.view.Workspace|null} workspace=null */
        workspace: null
    }

    /** @member {Set<Object>} activeRuns */
    activeRuns = new Set()

    /** @member {Neo.ai.client.InteractionService|null} interactionService=null */
    interactionService = null

    /** @member {Promise|null} #settledPromise=null Retained cleanup boundary after destruction. */
    #settledPromise = null

    /** @summary Resolves after all started gestures finish their input and cursor cleanup. @returns {Promise} */
    get settledPromise() {
        return this.#settledPromise ?? Promise.all([...this.activeRuns].map(run => run.settled))
    }

    /** @summary Creates the optional input service with its driver. @param {Object} config */
    construct(config) {
        super.construct(config);
        this.interactionService = Neo.create(InteractionService)
    }

    /**
     * @summary Keeps dispatched input and its cleanup alive across driver destruction.
     * @param {Function} execute Scripted gesture body.
     * @returns {Promise<Object>}
     */
    async runGesture(execute) {
        if (this.isDestroyed || this.workspace.isDestroyed) throw Neo.isDestroyed;
        const runs = this.activeRuns,
              run  = {workspace: this.workspace, service: this.interactionService, pending: null, pointer: null};
        run.settled = new Promise(resolve => {run.resolveSettlement = resolve});
        runs.add(run);
        try {
            return await execute(run)
        } finally {
            try {
                await run.pending?.catch(() => {});
                if (run.pointer) {
                    const {windowId, options} = run.pointer;
                    try {
                        await run.service.dispatch({id: 'document.body', windowId, type: 'keydown',
                            options: {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}})
                    } finally {
                        await run.service.dispatch({id: 'document.body', windowId, type: 'mouseup',
                            options: {...options, bubbles: true, cancelable: true, button: 0, buttons: 0}})
                    }
                }
            } finally {
                runs.delete(run);
                try {
                    this.isDestroyed && !runs.size && run.service.destroy()
                } finally {
                    run.resolveSettlement()
                }
            }
        }
    }

    /**
     * @summary Dispatches through InteractionService while retaining the outstanding pointer receipt.
     * @param {Object} run Current gesture's cleanup context.
     * @param {Object} data Event sequence.
     * @returns {Promise<Boolean>}
     */
    async simulateEvent(run, {events}) {
        let success = true;
        for (const event of events) {
            if (event.delay) await this.timeout(event.delay);
            if (this.isDestroyed) throw Neo.isDestroyed;
            if (event.type === 'mousedown' || (run.pointer && event.type === 'mousemove')) {
                run.pointer = {windowId: event.windowId, options: event.options}
            }
            run.pending = run.service.simulateEvent({events: [{...event, delay: 0}]});
            const dispatched = await this.trap(run.pending);
            success = dispatched && success;
            if (event.type === 'mouseup' && dispatched) run.pointer = null
        }
        return success
    }

    /** @summary Cancels local waits while dispatched input retains its cleanup lease. */
    destroy() {
        if (this.isDestroyed) return;
        const runs = this.activeRuns, service = this.interactionService;
        this.#settledPromise = this.settledPromise;
        super.destroy();
        !runs.size && service.destroy()
    }

    /**
     * @summary Creates the film-only cursor that rides one gesture executor's own coordinates.
     *
     * CDP-dispatched pointer events move no OS cursor, so an unassisted take reads as
     * UI-moving-itself. The create shape carries the required `className`, floating-component
     * mount pair, stable `document.body` parent, and owning `windowId` for every subsequent
     * style delta.
     * @param {Number} clientX
     * @param {Number} clientY
     * @param {String|Number} [windowId=this.workspace.windowId]
     * @returns {Neo.component.Base}
     * @protected
     */
    createFilmCursorDot(clientX, clientY, windowId=this.workspace.windowId) {
        let me        = this.workspace,
            cursorDot = Neo.create({
                className    : 'Neo.component.Base',
                appName      : me.appName,
                autoInitVnode: true,
                autoMount    : true,
                parentId     : 'document.body',
                windowId,
                cls          : ['film-cursor', 'workstation-film-cursor'],
                style        : {
                    left: `${clientX - 8}px`,
                    top : `${clientY - 8}px`
                }
            });

        cursorDot.mountedPromise.then(() => {
            console.log(`[film-cursor] dot mounted in ${windowId} at client (${clientX}, ${clientY})`)
        });

        return cursorDot
    }

    /**
     * @summary Retires one film cursor from component, VDOM, and physical body-node truth.
     * @param {Neo.component.Base|null} cursorDot
     * @returns {Promise<Boolean>} True after a live cursor's physical removal is acknowledged.
     * @protected
     */
    async retireFilmCursorDot(cursorDot) {
        if (!cursorDot || cursorDot.isDestroyed) {
            return false
        }

        const removalReceipt = Neo.applyDeltas(cursorDot.windowId, {
            action: 'removeNode',
            id    : cursorDot.vdom.id
        });

        // Retire component truth without dispatching a second physical delta. Awaiting the
        // explicit receipt keeps cross-window replacement creation behind source-node removal.
        cursorDot.destroy();
        await removalReceipt;

        return true
    }

    /**
     * @summary Drives the in-window showcase beat through real simulated pointer input.
     *
     * One live tab crosses at least two foreign zones and two placement kinds. Each dwell first
     * seeds the target zone's indicator menu, then aims at the indicator component's OWN computed
     * geometry; the receipt comes from `DockDragAffordances`' live `activeCandidate.preview`, never
     * a parallel DOM or pointer inference. Commit compares the resulting document with the exact
     * preview operation applied to the pre-gesture document. Cancel proves byte-identical document
     * truth and fully retired overlay/session state.
     * @param {Object} step
     * @param {Object[]} step.dwells Ordered `{targetNodeId, placementKind}` dwell requests.
     * @param {String} step.itemId The live dock item to drag.
     * @param {String} step.sourceNodeId The tabs node currently holding it.
     * @param {'commit'|'cancel'} [step.terminal='commit']
     * @param {Object} [options={}]
     * @param {Number} [options.dwellDelay=120] Milliseconds each accepted preview stays visible.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=12] Samples per path leg.
     * @param {Number} [options.safetyMargin=48] Required inset from every window edge.
     * @param {Boolean} [options.showCursor=false] Film mode: show the shared synthetic cursor.
     * @returns {Promise<Object>}
     */
    async executeCrossZoneShowcaseStep(step, {dwellDelay=120, moveDelay=16, moveSteps=12, safetyMargin=48, showCursor=false}={}) {
        return this.runGesture(async run => {
            let me = run.workspace, driver = this,
                {dwells=[], itemId, sourceNodeId, terminal='commit'} = step || {},
                document                                 = me.dockModel,
                sourceNode                               = document?.nodes?.[sourceNodeId],
                button                                   = null,
                cursorDot                                = null,
                lastPoint                                = null,
                proxyPopupEnabled                        = null,
                restoreProxyPopupConfig                  = () => {
                    if (!sortZone || sortZone.isDestroyed || proxyPopupEnabled === null) {
                        return {after: null, before: proxyPopupEnabled, restored: false}
                    }

                    sortZone.enableProxyToPopup = proxyPopupEnabled;

                    return {
                        after   : sortZone.enableProxyToPopup,
                        before  : proxyPopupEnabled,
                        restored: sortZone.enableProxyToPopup === proxyPopupEnabled
                    }
                },
                sortZone                                 = null,
                tabs                                     = null,
                windowRect                               = null;

            if (!itemId || sourceNode?.type !== 'tabs' || !sourceNode.items.includes(itemId)) {
                return {applied: false, errors: ['cross-zone showcase must name a live item held by its source tabs node']}
            }

            if (!Array.isArray(dwells) || dwells.length < 2
                || new Set(dwells.map(dwell => dwell?.targetNodeId)).size < 2
                || new Set(dwells.map(dwell => dwell?.placementKind)).size < 2
                || dwells.some(dwell => !dwell?.targetNodeId || !dwell?.placementKind || dwell.targetNodeId === sourceNodeId)) {
                return {applied: false, errors: ['cross-zone showcase requires two distinct foreign zones and two distinct placement kinds']}
            }

            if (!['commit', 'cancel'].includes(terminal)) {
                return {applied: false, errors: [`unsupported cross-zone terminal '${terminal}'`]}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));

                let host          = me.getDockHost(),
                    itemIndex     = sourceNode.items.indexOf(itemId),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default;

                tabs     = host?.down({dockNodeId: sourceNodeId});
                sortZone = tabs?.getTabBar()?.sortZone;
                button   = tabs?.getTabAtIndex(itemIndex);

                let window       = WindowManager.get(button?.windowId),
                    [buttonRect] = button ? await driver.trap(button.getDomRect([button.id], button.windowId)) : [];

                if (!button || !sortZone || !buttonRect || !window?.innerRect) {
                    return {applied: false, errors: ['cross-zone gesture surfaces are not ready']}
                }

                windowRect        = window.innerRect;
                proxyPopupEnabled = sortZone.enableProxyToPopup;
                // Tear-out hysteresis is measured against the SOURCE TOOLBAR, not the browser edge:
                // an ordinary cross-zone path necessarily leaves that strip. Disarm only the popup
                // conversion branch for this gesture; `finally` restores the live config on every
                // terminal. The window inset below remains a visual-stage safety rule.
                sortZone.enableProxyToPopup = false;

                let documentBefore = WorkspaceDocument.clone(document),
                    startX         = buttonRect.x + buttonRect.width / 2,
                    startY         = buttonRect.y + buttonRect.height / 2,
                    directionX     = startX > window.innerRect.width  / 2 ? -1 : 1,
                    directionY     = startY > window.innerRect.height / 2 ? -1 : 1,
                    opt            = (clientX, clientY, buttons) => ({
                        bubbles   : true,
                        button    : 0,
                        buttons,
                        cancelable: true,
                        clientX,
                        clientY,
                        screenX   : window.innerRect.x + clientX,
                        screenY   : window.innerRect.y + clientY
                    }),
                    safe           = ({x, y}) => Number.isFinite(x) && Number.isFinite(y)
                        && x >= safetyMargin && y >= safetyMargin
                        && x <= window.innerRect.width  - safetyMargin
                        && y <= window.innerRect.height - safetyMargin,
                    releaseAt      = point => ({
                        clientX: point?.x ?? startX,
                        clientY: point?.y ?? startY,
                        screenX: window.innerRect.x + (point?.x ?? startX),
                        screenY: window.innerRect.y + (point?.y ?? startY)
                    }),
                    waitUntil      = (predicate, attempts=120) => driver.waitFor(predicate, {attempts, delay: 16}),
                    moveTo         = (x, y) => {
                        if (cursorDot) {
                            cursorDot.style = {...cursorDot.style, left: `${x - 8}px`, top: `${y - 8}px`}
                        }

                        return driver.simulateEvent(run, {events: [{
                            delay  : moveDelay,
                            // Once the sort starts, its render can replace the source button DOM identity.
                            // Native drag sensors are document-global after arming, so keep the synthetic
                            // stream on the same stable owner instead of addressing a stale source node.
                            targetId: 'document.body',
                            type    : 'mousemove',
                            windowId: button.windowId,
                            options : opt(x, y, 1)
                        }]})
                    },
                    walkTo         = async point => {
                        if (!safe(point)) {
                            throw new Error(`cross-zone path point violates the ${safetyMargin}px window-edge margin`)
                        }

                        let from     = lastPoint,
                            distance = from ? Math.hypot(point.x - from.x, point.y - from.y) : 0,
                            steps    = distance < 1 ? 1 : Math.max(2, Math.floor(moveSteps));

                        for (let index = 1; index <= steps; index++) {
                            let ratio = index / steps;

                            await driver.trap(moveTo(
                                Math.round(from.x + (point.x - from.x) * ratio),
                                Math.round(from.y + (point.y - from.y) * ratio)
                            ))
                        }

                        lastPoint = point
                    },
                    overlaysRetired = () => !me.dragAffordances.dragGeometry
                        && !me.dragAffordances.indicators?.candidateSet
                        && !me.dragAffordances.indicators?.activeCandidate
                        && !me.dragAffordances.preview?.dockPreview;

                if (!safe({x: startX, y: startY})) {
                    return {applied: false, errors: [`source tab violates the ${safetyMargin}px window-edge margin`]}
                }

                let armOne = {x: startX + directionX * 8,  y: startY + directionY * 2},
                    armTwo = {x: startX + directionX * 16, y: startY + directionY * 24};

                if (![armOne, armTwo].every(safe)) {
                    return {applied: false, errors: [`drag-arming path violates the ${safetyMargin}px window-edge margin`]}
                }

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: button.id,
                    type    : 'mousedown',
                    windowId: button.windowId,
                    options : opt(startX, startY, 1)
                }, {
                    delay   : 120,
                    targetId: button.id,
                    type    : 'mousemove',
                    windowId: button.windowId,
                    options : opt(armOne.x, armOne.y, 1)
                }]}));

                lastPoint = armOne;

                if (!await driver.trap(driver.waitForTearOutDragArmed(sortZone))) {
                    let cancellation = await driver.cancelTearOutGesture(run,
                        button,
                        releaseAt(lastPoint),
                        {sortZone, targetId: 'document.body'}
                    );

                    return {applied: false, errors: ['cross-zone drag did not arm'], proof: {cancellation}}
                }

                // The first threshold-crossing move can replace the source tab DOM. Only after the
                // sensor reports its document-global ownership do we advance on the stable carrier.
                await driver.trap(moveTo(armTwo.x, armTwo.y));
                lastPoint = armTwo;

                showCursor && (cursorDot = driver.createFilmCursorDot(lastPoint.x, lastPoint.y));

                let geometry = await driver.trap(me.dragAffordances.ensureGeometry());

                if (!geometry) {
                    throw new Error('cross-zone geometry did not become measurable')
                }

                let beats        = [],
                    finalPreview = null;

                for (let [index, dwell] of dwells.entries()) {
                    let zone = geometry.zones.find(entry => entry.nodeId === dwell.targetNodeId);

                    if (!zone) {
                        throw new Error(`cross-zone target '${dwell.targetNodeId}' is not measurable`)
                    }

                    let seedPoint = {
                        x: Math.round(zone.rect.x + zone.rect.width  / 2),
                        y: Math.round(zone.rect.y + zone.rect.height / 2)
                    };

                    await driver.trap(walkTo(seedPoint));

                    let candidateSetReady = await driver.trap(waitUntil(() =>
                        me.dragAffordances.indicators?.candidateSet?.zone?.nodeId === dwell.targetNodeId));

                    if (!candidateSetReady) {
                        throw new Error(
                            `indicator set did not settle on '${dwell.targetNodeId}' — ` +
                            `current=${me.dragAffordances.indicators?.candidateSet?.zone?.nodeId ?? 'null'} ` +
                            `seed=(${seedPoint.x},${seedPoint.y}) zones=${geometry.zones.map(entry => entry.nodeId).join(',')} ` +
                            `dragProxy=${Boolean(sortZone.dragProxy)} startIndex=${sortZone.startIndex} currentIndex=${sortZone.currentIndex}`
                        )
                    }

                    let indicators = me.dragAffordances.indicators,
                        candidate  = indicators.candidateSet.cross
                            .find(entry => entry.preview?.placement?.kind === dwell.placementKind),
                        indicatorPoint = candidate && indicators.getCandidateHitPoint(candidate.preview?.previewId);

                    if (!candidate || !indicatorPoint) {
                        throw new Error(`indicator hit geometry is unavailable for '${dwell.placementKind}'`)
                    }

                    await driver.trap(walkTo(indicatorPoint));

                    let candidateActive = await driver.trap(waitUntil(() =>
                        indicators.activeCandidate?.preview?.previewId === candidate.preview.previewId));

                    if (!candidateActive) {
                        throw new Error(`indicator '${candidate.preview.previewId}' never became active`)
                    }

                    dwellDelay > 0 && await driver.trap(driver.timeout(dwellDelay));

                    // The dwell is a TOCTOU window: the candidate verified active above can be lost
                    // while it elapses — a human-pause dwell can outlive the gesture claim's
                    // arbitration TTL, retiring the candidate mid-gesture — or be preempted by a
                    // competing candidate. Re-verify identity before the read: a loss or swap fails
                    // the step through the receipts channel naming the gate, instead of an
                    // unattributed null-read or a silently adopted wrong preview here.
                    let preview = indicators.activeCandidate?.preview;

                    if (preview?.previewId !== candidate.preview.previewId) {
                        throw new Error(
                            `active candidate '${candidate.preview.previewId}' lost during the ${dwellDelay}ms dwell — ` +
                            `gate=dwell-reverify active=${preview?.previewId ?? 'null'} ` +
                            `dwell=${index + 1}/${dwells.length} target='${dwell.targetNodeId}' placement='${dwell.placementKind}'`
                        )
                    }

                    finalPreview = JSON.parse(JSON.stringify(preview));
                    beats.push({
                        dwell        : index + 1,
                        placementKind: preview.placement.kind,
                        previewId    : preview.previewId,
                        targetNodeId : preview.target.nodeId
                    })
                }

                if (terminal === 'cancel') {
                    let cancellation = await driver.cancelTearOutGesture(run,
                            button,
                            releaseAt(lastPoint),
                            {sortZone, targetId: 'document.body'}
                        ),
                        retired      = await driver.trap(waitUntil(overlaysRetired)),
                        documentAfter = WorkspaceDocument.clone(me.dockModel),
                        unchanged     = JSON.stringify(documentAfter) === JSON.stringify(documentBefore),
                        popupConfig   = restoreProxyPopupConfig();

                    return {
                        applied  : false,
                        beatLog  : beats,
                        cancelled: true,
                        errors   : cancellation.settled && retired && unchanged
                            ? []
                            : ['cross-zone cancel left drag, document, or overlay residue'],
                        proof : {
                            cancellation,
                            documentAfter,
                            documentBefore,
                            documentsUnchanged: unchanged,
                            overlaysRetired   : retired,
                            popupConfig
                        }
                    }
                }

                let descriptor     = PreviewContract.previewToOperation(finalPreview),
                    expectedResult = descriptor && Operations.applyOperation(
                        WorkspaceDocument.clone(documentBefore),
                        descriptor
                    );

                if (!descriptor || !expectedResult || expectedResult.errors?.length || !expectedResult.document) {
                    throw new Error('final active preview did not resolve to one valid document operation')
                }

                let expectedDocument   = WorkspaceDocument.clone(expectedResult.document),
                    expectedSerialized = JSON.stringify(expectedDocument);

                await driver.trap(driver.simulateEvent(run, {events: [{
                    targetId: 'document.body',
                    type    : 'mouseup',
                    windowId: button.windowId,
                    options : opt(lastPoint.x, lastPoint.y, 0)
                }]}));

                let settled = await driver.trap(waitUntil(() => JSON.stringify(me.dockModel) === expectedSerialized));

                settled && await driver.trap(Promise.resolve(me.refreshPromise));

                let documentAfter          = WorkspaceDocument.clone(me.dockModel),
                    documentMatchesPreview = JSON.stringify(documentAfter) === expectedSerialized,
                    retired                = await driver.trap(waitUntil(overlaysRetired)),
                    popupConfig            = restoreProxyPopupConfig(),
                    applied                = settled && documentMatchesPreview && retired && popupConfig.restored;

                return {
                    applied,
                    beatLog: beats,
                    errors : applied ? [] : ['cross-zone commit did not equal the previewed operation or retire its overlays'],
                    proof  : {
                        descriptor,
                        documentAfter,
                        documentBefore,
                        documentMatchesPreview,
                        expectedDocument,
                        finalPreview,
                        overlaysRetired: retired,
                        popupConfig
                    }
                }
            } catch (error) {
                let clientX = lastPoint?.x ?? 0,
                    clientY = lastPoint?.y ?? 0;

                button && await driver.cancelTearOutGesture(run,
                    button,
                    {
                        clientX,
                        clientY,
                        screenX: (windowRect?.x ?? 0) + clientX,
                        screenY: (windowRect?.y ?? 0) + clientY
                    },
                    {sortZone, targetId: 'document.body'}
                ).catch(() => {});

                return {applied: false, errors: [error?.message || String(error)]}
            } finally {
                restoreProxyPopupConfig();
                await driver.retireFilmCursorDot(cursorDot)
            }

        })
    }

    /**
     * @summary Polls until the base drag has ARMED — a live proxy AND the async main-thread
     * `boundaryContainerRect` AND measured `itemRects` are all present: exactly the facts
     * the sort zone needs before it will sample a boundary exit.
     * @param {Neo.draggable.container.SortZone} sortZone
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Boolean>}
     * @protected
     */
    async waitForTearOutDragArmed(sortZone, {attempts=120, delay=16}={}) {
        let armed = () => Boolean(sortZone?.dragProxy && sortZone?.boundaryContainerRect && sortZone?.itemRects);

        return this.waitFor(armed, {attempts, delay})
    }

    /**
     * @summary Cancels a live tear-out gesture: an Escape keydown (the drag-cancel signal the sort zone
     * consumes) followed by a settling mouseup.
     * @param {Object} run Current gesture's cleanup context.
     * @param {Neo.component.Base} button The dragged tab button.
     * @param {Object} release `{clientX, clientY, screenX, screenY}` the release point.
     * @param {Object} [options={}]
     * @param {Neo.draggable.container.SortZone|null} [options.sortZone=null] Zone whose idle facts gate settlement.
     * @param {String} [options.targetId=button.id] Stable DOM owner for both terminal events.
     * @returns {Promise<Object>}
     * @protected
     */
    async cancelTearOutGesture(run, button, release, {sortZone=null, targetId=button?.id}={}) {
        let me = run.workspace, driver = this;

        await run.pending?.catch(() => {});

        if (!button || !targetId) return {escapeDispatched: false, releaseDispatched: false, settled: false};

        let {clientX=0, clientY=0, screenX=0, screenY=0} = release || {},
            windowId = run.pointer?.windowId ?? button.windowId,
            escapeDispatched = await run.service.dispatch({
                id     : targetId,
                type   : 'keydown',
                windowId,
                options: {bubbles: true, cancelable: true, code: 'Escape', key: 'Escape'}
            }),
            releaseDispatched = await run.service.dispatch({
                id     : targetId,
                type   : 'mouseup',
                windowId,
                options: {bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, screenX, screenY}
            });

        releaseDispatched && (run.pointer = null);

        if (!sortZone) {
            return {escapeDispatched, releaseDispatched, settled: true}
        }

        for (let attempt = 0; attempt <= 60 && !me.isDestroyed && !driver.isDestroyed; attempt++) {
            let settled = sortZone.owner?.cls?.includes?.('neo-is-dragging') !== true
                && sortZone.dragEndActive !== true
                && sortZone.data == null
                && !sortZone.dragPlaceholder
                && !sortZone.dragProxy;

            if (settled) return {escapeDispatched, releaseDispatched, settled: true};

            attempt < 60 && await driver.timeout(16)
        }

        return {escapeDispatched, releaseDispatched, settled: false}
    }
}

export default Neo.setupClass(GestureDriver);
