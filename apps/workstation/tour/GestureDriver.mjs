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

            // Three refusals, three messages. One shared string could not say whether the step named nothing,
            // named a node that is not a tabs node, or named an item that node no longer holds — and the third
            // is the one a caller cannot predict, because a prior gesture may have moved the item away.
            if (!itemId) {
                return {applied: false, errors: ['cross-zone showcase needs an itemId']}
            }

            if (sourceNode?.type !== 'tabs') {
                return {applied: false, errors: [`cross-zone showcase source '${sourceNodeId}' is ${sourceNode ? `a '${sourceNode.type}' node` : 'not in the document'}, not a tabs node`]}
            }

            if (!sourceNode.items.includes(itemId)) {
                return {applied: false, errors: [`cross-zone showcase source '${sourceNodeId}' holds [${sourceNode.items.join(', ')}], not '${itemId}'`]}
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
     * @summary Drives the rail beat through real simulated pointer input: the pane's tab takes
     * focus, the header's pin action folds the pane into its edge rail, the rail tab reveals it as
     * an elevated pane, and the reveal's pin brings it home. Every wait reads committed document
     * truth or the overlay's own state, never a DOM inference; the receipt carries the three
     * phases and the document before and after the round trip. A fold that commits and then
     * fails — a rail that never grows the tab, a reveal without its pin, a driver destroyed
     * mid-beat — is settled by {@link #settleRailFold}, so the cue leaves no residue.
     * @param {Object} step
     * @param {String} step.itemId The live dock item to fold away and bring back.
     * @param {String} step.sourceNodeId The edge-zone tabs node currently holding it.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180] Poll attempts (16 ms each) for each phase to settle.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=12] Samples per path leg.
     * @param {Number} [options.revealDelay=600] Milliseconds the reveal stays open before the pin.
     * @param {Boolean} [options.showCursor=false] Film mode: show the shared synthetic cursor.
     * @returns {Promise<Object>}
     */
    async executeRailStep(step, {attempts=180, moveDelay=16, moveSteps=12, revealDelay=600, showCursor=false}={}) {
        return this.runGesture(async run => {
            let me                     = run.workspace, driver = this,
                {itemId, sourceNodeId} = step || {},
                document               = me.dockModel,
                sourceNode             = document?.nodes?.[sourceNodeId],
                cursorDot              = null,
                lastPoint              = null,
                // the fold's aftermath, read by the settle on every failed exit — including the one a
                // destroyed driver takes through `catch`, where nothing trapped may be awaited again
                collapsed              = false,
                overlay                = null,
                rail                   = null,
                railed                 = false,
                fail                   = async (errors, proof={}) => {
                    let settled = await driver.settleRailFold({collapsed, itemId, overlay, pending: run.pending, rail, railed, sourceNodeId, workspace: me});

                    return {applied: false, errors: [...errors, ...settled.errors], proof: {...proof, settled}}
                };

            if (!itemId || sourceNode?.type !== 'tabs' || !sourceNode.items.includes(itemId)) {
                return {applied: false, errors: ['rail step must name a live item held by a tabs node']}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));

                let host          = me.getDockHost(),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default,
                    tabs          = host?.down({dockNodeId: sourceNodeId}),
                    button        = tabs?.getTabAtIndex(sourceNode.items.indexOf(itemId)),
                    window        = WindowManager.get(button?.windowId),
                    windowId      = button?.windowId;

                if (!button || !tabs?.getTabBar || !window?.innerRect) {
                    return {applied: false, errors: ['rail gesture surfaces are not ready']}
                }

                let opt = (clientX, clientY, buttons) => ({
                        bubbles   : true,
                        button    : 0,
                        buttons,
                        cancelable: true,
                        clientX,
                        clientY,
                        screenX   : window.innerRect.x + clientX,
                        screenY   : window.innerRect.y + clientY
                    }),
                    waitUntil = predicate => driver.waitFor(predicate, {attempts, delay: 16}),
                    // A focus-gated action or a freshly grown rail tab exists as a component before
                    // its node is painted, so the geometry read polls instead of judging the first frame.
                    centerOf  = async component => {
                        let rect = null;

                        for (let attempt = 0; attempt < attempts && !rect?.width; attempt++) {
                            attempt && await driver.trap(driver.timeout(16));
                            [rect] = await driver.trap(component.getDomRect([component.id], component.windowId))
                        }

                        if (!rect?.width) {
                            throw new Error(`'${component.id}' has no rendered geometry`)
                        }

                        return {x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2)}
                    },
                    moveTo    = (x, y) => {
                        if (cursorDot) {
                            cursorDot.style = {...cursorDot.style, left: `${x - 8}px`, top: `${y - 8}px`}
                        }

                        return driver.simulateEvent(run, {events: [{
                            delay   : moveDelay,
                            targetId: 'document.body',
                            type    : 'mousemove',
                            windowId,
                            options : opt(x, y, 0)
                        }]})
                    },
                    walkTo    = async point => {
                        let from  = lastPoint,
                            steps = from ? Math.max(2, Math.floor(moveSteps)) : 1;

                        for (let index = 1; index <= steps; index++) {
                            let ratio = index / steps;

                            await driver.trap(moveTo(
                                Math.round(from ? from.x + (point.x - from.x) * ratio : point.x),
                                Math.round(from ? from.y + (point.y - from.y) * ratio : point.y)
                            ))
                        }

                        lastPoint = point
                    },
                    // A click is the pressed pair plus the click a browser derives from it: synthetic
                    // events derive nothing, so the button's handler needs the third event dispatched.
                    click     = async component => {
                        let point = await centerOf(component);

                        await walkTo(point);

                        return driver.simulateEvent(run, {events: [{
                            targetId: component.id,
                            type    : 'mousedown',
                            windowId,
                            options : opt(point.x, point.y, 1)
                        }, {
                            delay   : 60,
                            targetId: component.id,
                            type    : 'mouseup',
                            windowId,
                            options : opt(point.x, point.y, 0)
                        }, {
                            targetId: component.id,
                            type    : 'click',
                            windowId,
                            options : opt(point.x, point.y, 0)
                        }]})
                    },
                    start     = await centerOf(button);

                showCursor && (cursorDot = driver.createFilmCursorDot(start.x, start.y, windowId));

                // 1. focus: the header's contextual actions follow real focus (`containsFocus`, kept by
                // manager.Focus), which no synthetic mouse event moves — so the tab takes the pointer
                // for the camera and then the focus by name, and the pin action is awaited on glass.
                await driver.trap(click(button));
                button.focus?.();

                let pinAction     = null,
                    focused       = await driver.trap(waitUntil(() => {
                        pinAction = tabs.getTabBar()?.getAction?.('pin') ?? null;

                        return tabs.containsFocus === true && Boolean(pinAction) && pinAction.hidden !== true && pinAction.mounted === true
                    }));

                if (!focused) {
                    return {applied: false, errors: [`the pin action never became visible for '${itemId}'`]}
                }

                // The round trip's baseline is the focused state: the click above may have moved the
                // node's active item, and that is not what the beat claims to leave unchanged.
                await driver.trap(Promise.resolve(me.refreshPromise));

                let documentBefore = WorkspaceDocument.clone(me.dockModel);

                // 2. fold: the header's pin folds the pane into its edge rail
                await driver.trap(click(pinAction));

                collapsed = await driver.trap(waitUntil(() => me.dockModel?.items?.[itemId]?.autoHidden === true));

                if (!collapsed) {
                    return fail([`'${itemId}' never reached auto-hidden truth`], {collapsed})
                }

                await driver.trap(Promise.resolve(me.refreshPromise));

                // 3. reveal: the rail tab that now carries the item, on whichever edge rail grew it
                let railTab = null;

                railed = await driver.trap(waitUntil(() => {
                        let rails = host.down({ntype: 'dashboard-dock-rail'}, false);

                        rails   = Array.isArray(rails) ? rails : rails ? [rails] : [];
                        railTab = null;
                        rail    = rails.find(candidate => {
                            let tabsForItem = candidate.down?.({dockItemId: itemId}, false);

                            tabsForItem = Array.isArray(tabsForItem) ? tabsForItem : tabsForItem ? [tabsForItem] : [];
                            railTab     = tabsForItem.find(entry => entry.cls?.includes?.('neo-dashboard-dock-rail-tab')) ?? null;

                            return Boolean(railTab)
                        }) ?? null;

                        return Boolean(railTab && rail?.revealOverlay)
                    }));

                if (!railed) {
                    return fail([`the rail never showed a tab for '${itemId}'`], {collapsed})
                }

                await driver.trap(click(railTab));

                overlay = rail.revealOverlay;

                let revealed = await driver.trap(waitUntil(() => overlay.visible === true && overlay.revealPaneItemId === itemId));

                if (!revealed) {
                    return fail([`the rail tab did not reveal '${itemId}'`], {collapsed, revealed})
                }

                revealDelay > 0 && await driver.trap(driver.timeout(revealDelay));

                // 4. home: the reveal's own pin, a real tab-header toolbar action
                let pinBack = overlay.down({action: 'pin'});

                if (!pinBack) {
                    return fail(['the reveal offers no pin action'], {collapsed, revealed})
                }

                await driver.trap(click(pinBack));

                let restored = await driver.trap(waitUntil(() =>
                    me.dockModel?.items?.[itemId]?.autoHidden === false
                    && me.dockModel?.nodes?.[sourceNodeId]?.items?.includes(itemId)));

                if (!restored) {
                    return fail([`'${itemId}' did not come home to '${sourceNodeId}'`], {collapsed, revealed})
                }

                await driver.trap(Promise.resolve(me.refreshPromise));

                let documentAfter      = WorkspaceDocument.clone(me.dockModel),
                    documentsUnchanged = JSON.stringify(documentAfter) === JSON.stringify(documentBefore);

                return {
                    applied: true,
                    errors : [],
                    proof  : {collapsed, documentAfter, documentBefore, documentsUnchanged, edge: rail.edge ?? null, restored, revealed}
                }
            } catch (error) {
                return fail([error?.message || String(error)], {collapsed})
            } finally {
                await driver.retireFilmCursorDot(cursorDot)
            }
        })
    }

    /**
     * @summary Settles a rail beat that failed after its fold committed, so the cue never leaves
     * residue. An open reveal is runtime intent and is dismissed through the rail's own state
     * machine, never by a late pointer. A fold whose rail never grew a tab would leave the pane
     * unreachable, so the pane comes home through the workspace's document operation; a fold
     * whose rail tab exists is kept, because the pane is one click away. The settle also runs
     * after a destroyed driver's cancellation, so it borrows nothing the destruction retires: the
     * workspace comes from the run, not from this driver's config, and the poll is a plain timer,
     * not {@link Neo.core.Base#timeout}. The input in flight when the cue failed settles first —
     * a destroyed driver's trap rejects while that input's receipt can still commit the fold — and
     * the fold is then read from the live document, never from a flag the cancellation outran.
     * @param {Object} state
     * @param {Boolean} state.collapsed Whether the executor saw the fold commit before it failed.
     * @param {String} state.itemId
     * @param {Object|null} state.overlay The rail's reveal overlay, once the rail was found.
     * @param {Promise|null} [state.pending] The input dispatch in flight when the cue failed.
     * @param {Object|null} state.rail The edge rail carrying the item, once found.
     * @param {Boolean} state.railed Whether the rail grew a tab for the item.
     * @param {String} state.sourceNodeId The tabs node the pane came from.
     * @param {Workstation.view.Workspace} state.workspace The run's workspace, alive after the driver.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=60] Poll attempts (16 ms each) for each settle step.
     * @returns {Promise<Object>} `{committed, errors, foldKept, restoredHome, revealDismissed}`
     * @protected
     */
    async settleRailFold({collapsed, itemId, overlay, pending, rail, railed, sourceNodeId, workspace}, {attempts=60}={}) {
        let receipt = {committed: false, errors: [], foldKept: false, restoredHome: false, revealDismissed: false},
            poll    = async predicate => {
                for (let attempt = 0; attempt <= attempts; attempt++) {
                    if (predicate()) {
                        return true
                    }

                    attempt < attempts && await new Promise(resolve => setTimeout(resolve, 16))
                }

                return false
            },
            home      = () => workspace.dockModel?.items?.[itemId]?.autoHidden === false
                && workspace.dockModel?.nodes?.[sourceNodeId]?.items?.includes(itemId) === true;

        if (!workspace || workspace.isDestroyed) {
            return receipt
        }

        await pending?.catch(() => {});

        receipt.committed = collapsed === true || workspace.dockModel?.items?.[itemId]?.autoHidden === true;

        if (!receipt.committed) {
            return receipt
        }

        if (overlay?.visible === true && overlay.revealPaneItemId === itemId) {
            rail?.revealMachine?.escape?.();

            receipt.revealDismissed = await poll(() => overlay.visible !== true);
            receipt.revealDismissed || receipt.errors.push(`the reveal for '${itemId}' stayed open after its dismissal`)
        }

        if (railed) {
            receipt.foldKept = !home();
            return receipt
        }

        let descriptor = {autoHidden: false, itemId, operation: 'setItemAutoHidden'},
            result     = workspace.applyDockZoneOperation(descriptor);

        if (!result?.document || result.errors?.length) {
            receipt.errors.push(...(result?.errors?.length ? result.errors : [`'${itemId}' could not be brought home after the failed fold`]));
            return receipt
        }

        await workspace.onDockZoneDocumentChange(result.document, descriptor);

        receipt.restoredHome = await poll(home);
        receipt.restoredHome || receipt.errors.push(`'${itemId}' did not come home to '${sourceNodeId}' after the failed fold`);

        return receipt
    }

    /**
     * @summary Drives the resize beat through the Mouse sensor's own arming: the named split
     * boundary follows a real pointer drag, both panes re-flow live on the main thread while the
     * committed document waits, and the release commits exactly one `resizeSplit` equal to the
     * last previewed frame. The drive is the product's own path —
     * {@link Neo.ai.client.InteractionService#driveDrag}, the method the Neural Link's `drive_drag`
     * tool consumes — so the simulator crosses the sensor's delay and distance thresholds and
     * correlates `drag:start/move/end` itself; this executor adds the dock semantics only: the
     * boundary to move, the travel that reaches the requested proportion, the preview proof read
     * mid-drive and the committed vector. Every failed exit, including a destroyed driver's, is
     * settled by {@link #settleResizeDrive}.
     * @param {Object} step
     * @param {String} step.splitNodeId The split node whose boundary moves.
     * @param {Number[]} step.sizes The proportion to reach, one entry per child of the split.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=180] Poll attempts (16 ms each) for the release's terminal.
     * @param {Number} [options.boundaryIndex=0] Which boundary of the split moves.
     * @param {Number} [options.moveDelay=16] Milliseconds between pointer samples.
     * @param {Number} [options.moveSteps=12] Samples along the travel.
     * @param {Number} [options.sensorDelayMs=100] The Mouse sensor's own arming delay
     *     (`src/main/draggable/sensor/Mouse.mjs`), which the drive waits before its first move; the
     *     film cursor waits the same, and the receipt records the sensor's actual thresholds.
     * @param {Boolean} [options.showCursor=false] Film mode: show the shared synthetic cursor.
     * @param {Number} [options.tolerance=0.01] Largest accepted distance between the committed and
     *     the requested proportion; a boundary stopped short of it fails by name.
     * @returns {Promise<Object>}
     */
    async executeResizeStep(step, {attempts=180, boundaryIndex=0, moveDelay=16, moveSteps=12, sensorDelayMs=100, showCursor=false, tolerance=0.01}={}) {
        return this.runGesture(async run => {
            let me                   = run.workspace, driver = this,
                {sizes, splitNodeId} = step || {},
                split                = me.dockModel?.nodes?.[splitNodeId],
                children             = split?.type === 'split' ? split.children || [] : [],
                normalized           = split ? WorkspaceDocument.normalizeSplitSizes(sizes, children.length, splitNodeId) : {errors: [], sizes: []},
                sizesBefore          = split?.sizes?.slice() ?? null,
                cursorDot            = null,
                splitter             = null,
                terminals            = [],
                onTerminal           = data => terminals.push(data),
                fail                 = async (errors, proof={}) => {
                    let settled = await driver.settleResizeDrive({pending: run.pending, sizesBefore, splitNodeId, workspace: me});

                    return {applied: false, errors: [...errors, ...settled.errors], proof: {...proof, settled, sizesBefore}}
                };

            if (!split || split.type !== 'split') {
                return {applied: false, errors: [`resize step must name a split node; '${splitNodeId}' is not one`]}
            }

            if (normalized.errors.length) {
                return {applied: false, errors: normalized.errors}
            }

            if (!Number.isInteger(boundaryIndex) || boundaryIndex < 0 || boundaryIndex + 1 >= children.length) {
                return {applied: false, errors: [`'${splitNodeId}' has no boundary ${boundaryIndex}`]}
            }

            try {
                await driver.trap(Promise.resolve(me.refreshPromise));

                let host          = me.getDockHost(),
                    WindowManager = (await driver.trap(import('../../../src/manager/Window.mjs'))).default;

                splitter = host?.down({boundaryIndex, dockNodeType: 'splitter', splitNodeId});

                let container = splitter?.parent,
                    window    = WindowManager.get(splitter?.windowId),
                    windowId  = splitter?.windowId,
                    panes     = splitter?.getSplitChildItems?.() ?? [];

                if (!splitter || !container?.getLayoutRect || !window?.innerRect || panes.length !== children.length) {
                    return {applied: false, errors: ['resize gesture surfaces are not ready']}
                }

                // The panes' layout boxes through the splitter's own seam: the transform-immune read
                // the splitter itself captures on drag start, so the travel and the proof share one truth.
                let axis      = splitter.getSizeAxis(),
                    layoutIds = panes.map(pane => splitter.getLayoutElementId(pane)),
                    readPanes = async () => {
                        let rects = await driver.trap(container.getLayoutRect(layoutIds, windowId));

                        return rects.map(rect => Number(rect?.[axis]) || 0)
                    },
                    before    = await readPanes(),
                    total     = before.reduce((sum, value) => sum + value, 0),
                    current   = before[boundaryIndex];

                if (!(total > 0)) {
                    return {applied: false, errors: [`'${splitNodeId}' has no rendered geometry`]}
                }

                // The committed vector is the panes' pixels over their total, so the boundary's travel
                // is the requested share of that total minus the pane's current extent.
                let travelPx   = Math.round(normalized.sizes[boundaryIndex] * total - current),
                    [rect]     = await driver.trap(splitter.getDomRect([splitter.id], windowId)),
                    start      = {x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2)},
                    delta      = axis === 'width' ? {deltaX: travelPx, deltaY: 0} : {deltaX: 0, deltaY: travelPx},
                    durationMs = Math.max(moveSteps * 16, Math.round(moveDelay * moveSteps)),
                    mid        = null,
                    midSizes   = null;

                showCursor && (cursorDot = driver.createFilmCursorDot(start.x, start.y, windowId));
                splitter.on({dockSplitterResize: onTerminal, dockSplitterResizeRejected: onTerminal});

                // The drive owns the mousedown → mouseup bracket on the main thread; `run.pending` is
                // the lease every exit awaits, so no late input is ever dispatched behind it.
                run.pending = run.service.driveDrag({
                    destination: delta,
                    durationMs,
                    source     : {targetId: splitter.id, windowId},
                    steps      : moveSteps
                });

                // The cursor rides the drive's clock; the preview proof does not. It is an observed
                // condition: a pane box that moved while the committed document stood on both sides
                // of the read and no terminal had landed — so a drive whose prelude starts late is
                // waited out, and a box read that lands after the release cannot pass as a preview.
                let readSizes      = () => JSON.stringify(me.dockModel?.nodes?.[splitNodeId]?.sizes ?? null),
                    standing       = readSizes(),
                    minTravel      = Math.min(8, Math.abs(travelPx) / 4),
                    previewTracked = false,
                    driveDone      = false,
                    samples        = 0,
                    sample         = async () => {
                        let before = readSizes() === standing && terminals.length === 0,
                            box    = await readPanes(),
                            after  = readSizes() === standing && terminals.length === 0;

                        samples++;

                        if (before && after && Math.abs(box[boundaryIndex] - current) >= minTravel) {
                            mid            = box;
                            midSizes       = sizesBefore.slice();
                            previewTracked = true
                        }
                    },
                    escort         = async () => {
                        await driver.trap(driver.timeout(sensorDelayMs));

                        for (let index = 1; index <= moveSteps; index++) {
                            let ratio = index / moveSteps;

                            if (cursorDot) {
                                cursorDot.style = {
                                    ...cursorDot.style,
                                    left: `${Math.round(start.x + delta.deltaX * ratio) - 8}px`,
                                    top : `${Math.round(start.y + delta.deltaY * ratio) - 8}px`
                                }
                            }

                            await driver.trap(driver.timeout(moveDelay));
                            previewTracked || await sample()
                        }

                        // the drive may still be in its prelude or its moves: keep watching for the
                        // preview until the release, bounded by `attempts`
                        for (let poll = 0; poll < attempts && !driveDone && !previewTracked; poll++) {
                            await driver.trap(driver.timeout(16));
                            await sample()
                        }
                    };

                run.pending.then(() => {driveDone = true}, () => {driveDone = true});

                let [drive] = await Promise.all([driver.trap(run.pending), escort()]);

                if (!drive?.success) {
                    return fail([`the drive failed in phase '${drive?.phase}': ${drive?.error?.code} — ${drive?.error?.message}`], {drive})
                }

                if (!await driver.trap(driver.waitFor(() => terminals.length > 0, {attempts, delay: 16}))) {
                    return fail(['the release reached no terminal on the splitter'], {drive})
                }

                // The terminal carries the reducer's output: that document IS the commit. The
                // workspace adopts it through its view-sync, which the beat waits for by value —
                // a read of `dockModel` right after the terminal can still see the old vector.
                let rejected   = terminals.flatMap(data => data?.result?.errors ?? []),
                    sizesAfter = terminals[0]?.result?.document?.nodes?.[splitNodeId]?.sizes?.slice() ?? null,
                    synced     = Boolean(sizesAfter) && await driver.trap(driver.waitFor(
                        () => JSON.stringify(me.dockModel?.nodes?.[splitNodeId]?.sizes) === JSON.stringify(sizesAfter),
                        {attempts, delay: 16}
                    )),
                    // `documentUnchangedDuringPreview` is the accepted sample's bracket: the committed
                    // vector stood before and after the moved box was read, with no terminal landed
                    proof          = {
                        axis,
                        committedOnce                 : terminals.length === 1 && rejected.length === 0,
                        documentUnchangedDuringPreview: previewTracked && midSizes !== null && JSON.stringify(midSizes) === JSON.stringify(sizesBefore),
                        drive                         : {observed: drive.observed, phase: drive.phase, sensor: drive.sensor},
                        previewTracked,
                        samples,
                        sizesAfter,
                        sizesBefore,
                        synced,
                        travelPx
                    };

                if (rejected.length) {
                    return fail([`the release was refused: ${rejected.join('; ')}`], proof)
                }

                if (!sizesAfter) {
                    return fail([`the release committed no sizes for '${splitNodeId}'`], proof)
                }

                if (!synced) {
                    return fail([`the workspace did not adopt the committed vector [${sizesAfter.map(value => value.toFixed(3)).join(', ')}]`], proof)
                }

                if (!previewTracked) {
                    return fail([`no live preview was observed: ${samples} pane samples, none moved ${minTravel}px or more while the committed document stood`], proof)
                }

                if (terminals.length !== 1) {
                    return fail([`the release reached ${terminals.length} terminals on the splitter; exactly one commit is the contract`], proof)
                }

                let distance = Math.max(...normalized.sizes.map((value, index) => Math.abs(value - sizesAfter[index])));

                if (distance > tolerance) {
                    return fail([
                        `the boundary stopped at [${sizesAfter.map(value => value.toFixed(3)).join(', ')}] (bounded), `
                        + `${distance.toFixed(3)} from the requested [${normalized.sizes.map(value => value.toFixed(3)).join(', ')}]`
                    ], proof)
                }

                return {applied: true, errors: [], proof}
            } catch (error) {
                return fail([error?.message || String(error)])
            } finally {
                splitter?.un?.({dockSplitterResize: onTerminal, dockSplitterResizeRejected: onTerminal});
                await driver.retireFilmCursorDot(cursorDot)
            }
        })
    }

    /**
     * @summary Settles a resize beat that failed after its drive was handed to the main thread, so
     * the cue never leaves residue. The simulator owns the mousedown → mouseup bracket and releases
     * it itself — a failed drive attempts its own mouseup, a refused terminal restores the panes'
     * styles on the main thread — so nothing here dispatches input: the settle waits for that
     * physical transaction to end, then reads what the document says. It also runs after a
     * destroyed driver's cancellation, so it borrows nothing the destruction retires: the
     * workspace comes from the run and the poll is a plain timer, not {@link Neo.core.Base#timeout}.
     * @param {Object} state
     * @param {Promise|null} [state.pending] The drive in flight when the cue failed.
     * @param {Number[]|null} state.sizesBefore The split's committed vector before the drive.
     * @param {String} state.splitNodeId
     * @param {Workstation.view.Workspace} state.workspace The run's workspace, alive after the driver.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=60] Poll attempts (16 ms each) for a commit to land after the drive.
     * @returns {Promise<Object>} `{committed, driveSettled, errors, sizes}`
     * @protected
     */
    async settleResizeDrive({pending, sizesBefore, splitNodeId, workspace}, {attempts=60}={}) {
        let receipt = {committed: false, driveSettled: !pending, errors: [], sizes: null},
            read    = () => workspace?.dockModel?.nodes?.[splitNodeId]?.sizes?.slice() ?? null,
            changed = () => {
                let sizes = read();

                return Boolean(sizes && sizesBefore && JSON.stringify(sizes) !== JSON.stringify(sizesBefore))
            };

        if (!workspace || workspace.isDestroyed) {
            return receipt
        }

        if (pending) {
            try {
                await pending;
                receipt.driveSettled = true
            } catch (error) {
                receipt.errors.push(`the physical drive did not settle: ${error?.message || error}`)
            }
        }

        for (let attempt = 0; attempt < attempts && !changed(); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 16))
        }

        receipt.sizes     = read();
        receipt.committed = changed();

        return receipt
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
