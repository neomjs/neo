import Container          from '../../../src/container/Base.mjs';
import DockDropIndicators from '../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockPreview        from '../../../src/dashboard/dock/interaction/Preview.mjs';
import WorkspaceDocument  from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import PreviewContract    from '../../../src/dashboard/dock/model/PreviewContract.mjs';

/**
 * @module Neo.examples.dashboard.crossWindow.DemoBCrossWindowStage
 * @summary The Demo-B cross-window STAGE choreography the workspace composes — staging a second
 * render target, mounting its participation, measuring its geometry, and retiring it after a
 * whole-stack return. Extracted from `DemoBWorkspace` (decomposition Phase 1) with zero behavior
 * change.
 *
 * Following the `createDockTearOutHandlers` precedent: a pure decision machine with every seam
 * injected. Unlike that sibling, the stage's STATE deliberately stays host-owned — the unit
 * spec's stage doubles write `workspace.crossWindowTargetWindowId` and call
 * `workspace.crossWindowStageResolve` directly, making those fields the host's public stage
 * contract. This module owns the CODE that manipulates them; the workspace owns the fields.
 *
 * **Facade-routing rule:** only spec-witnessed seams route back through the host's wrappable
 * facades (currently `commitWholeStackReturn` → `adoptCommittedTransferPair` /
 * `retireReturnedPopupWorkspace`, whose order-witness wraps the workspace methods). Every other
 * internal call (`mountTarget` → `waitForGeometry` → `measureGeometry`, etc.) uses this
 * module's own functions directly. A future witness wrapping a workspace facade the module
 * does NOT route through will silently not fire — extend the routing set WITH the witness.
 *
 * The stage is parameterized by workspace id: `demo-b-main` plus any number of registered
 * popup claim targets (`demo-b-popup`, `demo-b-popup-2`), each with its own host-owned stage
 * continuation and target window id, staged through the same registration semantics.
 */

/**
 * Creates the cross-window stage handlers for one Demo-B workspace composition.
 * @param {Object} seams
 * @param {Object} seams.registries Stable host-owned collections, captured once:
 *     `{hosts: Map, participations: Map, geometry: Map, projectionRequests: Map, detachedPanes: Object}`.
 * @param {Neo.dashboard.dock.window.WorkspaceSet} seams.workspaceSet The host's workspace-set registry.
 * @param {Object} seams.workspaceIds `{main, popup, popup2}` semantic workspace ids (`popup2`
 *     optional — the stage parameterizes over every popup id the host registers).
 * @param {String} seams.sortGroup The shared cross-window coordinator sort group.
 * @param {Object} seams.dragEmbodiment The host-owned proxy embodiment shared by its targets.
 * @param {Function} seams.applyWorkspaceOperation `(workspaceId, descriptor) => {document, errors}|null`
 * @param {Function} seams.adoptCommittedTransferPair `(pair) => Promise<Boolean>` — the HOST's wrappable
 *     adoption facade; `commitWholeStackReturn` routes through it (never its own internal twin)
 *     so witness wrappers observe the Group admission.
 * @param {Function} seams.retireReturnedPopupWorkspace `() => Boolean` — the HOST's wrappable
 *     retirement facade, routed through for the same witness contract.
 * @param {Function} seams.attachKeydown `(host)` — attaches the host-owned keyboard routing to a mounted target host.
 * @param {Function} seams.bumpStageGeneration `()` — advances the host-owned target-ownership generation.
 * @param {Function} seams.chainProjection `(asyncBody) => Promise` — serializes a body onto the host's projection queue (one deferred tick first).
 * @param {Function} seams.clearWorkspaceAffordances `(workspaceId)`
 * @param {Function} seams.commitCrossWindowTransfer `(data)` — the host's gesture transfer commit (Phase 2 surface).
 * @param {Function} seams.createPopupDocument `() => Object` — a valid empty popup workspace document.
 * @param {Function} seams.ensurePopupRegistered `(workspaceId) => Boolean` — re-registers the popup workspace's live accessors.
 * @param {Function} seams.getPopupDocument `(workspaceId) => Object|null`
 * @param {Function} seams.getStagePromise `(workspaceId) => Promise|null`
 * @param {Function} seams.getStageReject `(workspaceId) => Function|null`
 * @param {Function} seams.getStageResolve `(workspaceId) => Function|null`
 * @param {Function} seams.getStageGeneration `() => Number`
 * @param {Function} seams.getStageWindowName `(workspaceId) => String` — the popup's native window name.
 * @param {Function} seams.getTargetWindowId `(workspaceId) => String|null`
 * @param {Function} seams.getWindowId `() => String` — the host's own window id.
 * @param {Function} seams.getWorkspaceDocument `(workspaceId) => Object|null`
 * @param {Function} seams.hitTestWorkspace `(workspaceId, localX, localY) => Boolean`
 * @param {Function} seams.hostTimeout `(ms) => Promise` — rides the host's `core.Base#timeout` so destroy cancels pending waits.
 * @param {Function} seams.incrementTransferCommits `()` — bumps the host's gesture proof counter.
 * @param {Function} seams.isHostDestroyed `() => Boolean`
 * @param {Function} seams.onKbdLiveMounted `(liveComponent, workspaceId)` — publishes the mounted target's announcement region to the host.
 * @param {Function} seams.onWorkspaceDocumentChange `(workspaceId, document, options?) => Promise`
 * @param {Function} seams.projectDockModel `(resolveComponentRef|null, workspaceId) => Object`
 * @param {Function} seams.refreshWorkspace `(workspaceId, document) => Promise`
 * @param {Function} seams.renderWorkspacePreview `(workspaceId, data) => Object|null`
 * @param {Function} seams.reserveVessel `(workspaceKey, flow, windowName) => identity|null` — reserves the
 *     target's slot in the host's Group; the identity rides `windowOpen` into the popup's carrier.
 * @param {Function} seams.resolveGesture `(receipt)` — consumes the host's gesture settlement resolver.
 * @param {Function} seams.resolveOwnershipId `() => String|null` — the host's topology Group id, the commit
 *     authority every popup participation declares (docking design record §2.3); `null` while unresolved.
 * @param {Function} seams.revokeVessel `(workspaceKey)` — gives an unbound reservation back.
 * @param {Function} seams.setPopupDocument `(workspaceId, document)`
 * @param {Function} seams.setStagePromise `(workspaceId, promise|null)`
 * @param {Function} seams.setStageReject `(workspaceId, fn|null)`
 * @param {Function} seams.setStageResolve `(workspaceId, fn|null)`
 * @param {Function} seams.setTargetWindowId `(workspaceId, windowId|null)`
 * @returns {Object} `{adoptPair, commitWholeStackReturn, createParticipation, isTargetCurrent,
 *     measureGeometry, mountTarget, openStage, positionStage,
 *     retireReturnedWorkspace, waitForGeometry}`
 */
export function createCrossWindowStage(seams) {
    const {
        registries,
        workspaceSet,
        workspaceIds,
        sortGroup,
        dragEmbodiment,
        applyWorkspaceOperation,
        attachKeydown,
        bumpStageGeneration,
        chainProjection,
        clearWorkspaceAffordances,
        commitCrossWindowTransfer,
        createPopupDocument,
        ensurePopupRegistered,
        getPopupDocument,
        getStagePromise,
        getStageReject,
        getStageResolve,
        getStageGeneration,
        getStageWindowName,
        getTargetWindowId,
        getWindowId,
        getWorkspaceDocument,
        hitTestWorkspace,
        hostTimeout,
        incrementTransferCommits,
        isHostDestroyed,
        onKbdLiveMounted,
        onWorkspaceDocumentChange,
        projectDockModel,
        refreshWorkspace,
        renderWorkspacePreview,
        reserveVessel,
        resolveGesture,
        resolveOwnershipId,
        revokeVessel,
        setPopupDocument,
        setStagePromise,
        setStageReject,
        setStageResolve,
        setTargetWindowId
    } = seams;

    /**
     * @summary Checks that an async popup continuation still belongs to the live target generation.
     * @param {String} workspaceId
     * @param {String} windowId
     * @param {Neo.container.Base} host
     * @param {Number} generation
     * @returns {Boolean}
     */
    function isTargetCurrent(workspaceId, windowId, host, generation) {
        let expectedWindowId = workspaceId === workspaceIds.main
            ? getWindowId()
            : getTargetWindowId(workspaceId);

        return !isHostDestroyed()
            && getStageGeneration() === generation
            && expectedWindowId === windowId
            && registries.hosts.get(workspaceId) === host
            && !host.isDestroyed
    }

    /**
     * @summary Creates the target-side participation adapter lazily after the popup window has
     * joined. The dynamic import keeps the DragCoordinator/Window chain out of headless holder
     * tests until a real cross-window stage exists.
     * @param {String} workspaceId
     * @param {String} windowId
     * @param {Neo.container.Base} host
     * @param {Number} generation
     * @returns {Promise<Neo.dashboard.dock.window.Participation|null>}
     */
    async function createParticipation(workspaceId, windowId, host, generation) {
        let Participation = (await import('../../../src/dashboard/dock/window/Participation.mjs')).default;

        if (!isTargetCurrent(workspaceId, windowId, host, generation)) {
            return null
        }

        registries.participations.get(workspaceId)?.destroy();

        let participation = Neo.create(Participation, {
            dragEmbodiment,
            /**
             * @summary Settles the existing custom preview and exact target-local live pane.
             * @param {Object} payload
             * @returns {Promise<Boolean>}
             */
            awaitDragEmbodiment: async payload => {
                const preview = host.down({ntype: 'dock-preview'});
                if (!dragEmbodiment || !preview?.dockPreview) return false;

                const [settled] = await Promise.all([
                    dragEmbodiment.whenSettled({
                        itemId        : payload.draggedItem?.dockItemId,
                        sourceWindowId: payload.sourceWindowId,
                        targetWindowId: windowId
                    }),
                    preview.promiseUpdate()
                ]);
                return settled === true && Boolean(preview.dockPreview)
                    && isTargetCurrent(workspaceId, windowId, host, generation)
            },
            clearPreview: () => clearWorkspaceAffordances(workspaceId),
            commitLocal : operation => {
                let result = applyWorkspaceOperation(workspaceId, operation);

                if (result && !result.errors?.length && result.document) {
                    return onWorkspaceDocumentChange(workspaceId, result.document, {descriptor: operation}).then(() => result)
                }

                return result
            },
            commitTransfer    : data => commitCrossWindowTransfer(data),
            getDocument       : () => getWorkspaceDocument(workspaceId),
            getForeignDocument: sourceWorkspaceId => getWorkspaceDocument(sourceWorkspaceId),
            hitTest           : (localX, localY) => hitTestWorkspace(workspaceId, localX, localY),
            previewFor        : data => renderWorkspacePreview(workspaceId, data),
            previewToOperation: preview => PreviewContract.previewToOperation(preview),
            resolveOwnershipId,
            sortGroup,
            windowId,
            workspaceId
        });

        registries.participations.set(workspaceId, participation);

        return participation
    }

    /**
     * @summary Mounts the popup workspace projection into a newly connected render target,
     * registers its target participation, and resolves only after real DOM geometry is
     * measurable. The keyboard surface composes here too: the popup window gets its own
     * aria-live announcement region and the same chorded key routing on its host, published
     * back to the host through the `onKbdLiveMounted` / `attachKeydown` seams.
     * @param {Neo.app.Base} app
     * @param {String} windowId
     * @param {String} [workspaceId=workspaceIds.popup] the popup workspace to mount.
     * @returns {Promise<Object|null>}
     */
    async function mountTarget(app, windowId, workspaceId = workspaceIds.popup) {
        let generation   = getStageGeneration(),
            [live, host] = app.mainView.add([{
                cls   : ['agentos-dockdemo-kbd-live'],
                height: 14,
                ntype : 'component',
                role  : 'status',
                vdom  : {'aria-live': 'polite', cn: []}
            }, {
                module: Container,
                cls   : ['agentos-dockdemo-dock-host', 'neo-dashboard'],
                flex  : 1,
                items : [projectDockModel(null, workspaceId), {
                    module: DockPreview
                }, {
                    module: DockDropIndicators
                }],
                layout: {ntype: 'fit'}
            }]);

        setTargetWindowId(workspaceId, windowId);
        registries.hosts.set(workspaceId, host);
        onKbdLiveMounted(live, workspaceId);
        attachKeydown(host);

        try {
            await app.mainView.promiseUpdate();

            if (!isTargetCurrent(workspaceId, windowId, host, generation)) {
                return null
            }

            let participation     = await createParticipation(workspaceId, windowId, host, generation),
                mainWorkspaceId   = workspaceIds.main,
                mainHost          = registries.hosts.get(mainWorkspaceId),
                mainParticipation = mainHost && await createParticipation(
                    mainWorkspaceId,
                    getWindowId(),
                    mainHost,
                    generation
                );

            if (!participation || !mainParticipation
                || !isTargetCurrent(workspaceId, windowId, host, generation)
                || !isTargetCurrent(mainWorkspaceId, getWindowId(), mainHost, generation)) {
                participation?.destroy();
                mainParticipation?.destroy();
                return null
            }

            let [geometry, mainGeometry] = await Promise.all([
                waitForGeometry(workspaceId),
                waitForGeometry(mainWorkspaceId)
            ]);

            if (!geometry || !mainGeometry
                || !isTargetCurrent(workspaceId, windowId, host, generation)
                || !isTargetCurrent(mainWorkspaceId, getWindowId(), mainHost, generation)) {
                throw new Error('both cross-window workspace geometries must be measurable')
            }

            let receipt = {windowId, workspaceId, hostId: host.id};

            getStageResolve(workspaceId)?.(receipt);
            setStageResolve(workspaceId, null);
            setStageReject(workspaceId, null);

            return receipt
        } catch (error) {
            if (getStageGeneration() === generation) {
                getStageReject(workspaceId)?.(error);
                setStageResolve(workspaceId, null);
                setStageReject(workspaceId, null)
            }

            if (isTargetCurrent(workspaceId, windowId, host, generation)) {
                throw error
            }

            return null
        }
    }

    /**
     * @summary Opens a non-overlapping popup workspace render target and resolves from the
     * worker connect + measured geometry contract, never from a blind sleep. Parameterized by
     * popup workspace id — each registered popup stages through the same seams, with its own
     * host-owned continuation, target window id, and native window name.
     * @param {String} [workspaceId=workspaceIds.popup] the popup workspace to stage.
     * @returns {Promise<Object>}
     */
    async function openStage(workspaceId = workspaceIds.popup) {
        let host     = registries.hosts.get(workspaceId),
            windowId = getTargetWindowId(workspaceId);

        // A physical popup close can precede the worker disconnect callback. Reuse only a
        // complete, live owner bundle; a partial/destroyed cache must enter the ordinary cold
        // open path instead of handing the gesture a stale target id.
        if (windowId && host && !host.isDestroyed
            && registries.participations.has(workspaceId)
            && registries.geometry.has(workspaceId)) {
            return {
                hostId: host.id,
                windowId,
                workspaceId
            }
        }

        if (getStagePromise(workspaceId)) return getStagePromise(workspaceId);

        if (Object.keys(getPopupDocument(workspaceId)?.items || {}).length) {
            return Promise.reject(new Error('popup workspace is not empty; cross-window stage refuses split ownership'))
        }

        ensurePopupRegistered(workspaceId);
        bumpStageGeneration();
        setPopupDocument(workspaceId, createPopupDocument());

        let stageResolve, stageReject,
            stagePromise = new Promise((resolve, reject) => {
                stageResolve = resolve;
                stageReject  = reject
            });

        setStagePromise(workspaceId, stagePromise);
        setStageResolve(workspaceId, stageResolve);
        setStageReject(workspaceId, stageReject);

        // The target's slot in the host's Group: the popup presents this identity when it binds, and
        // the host mounts the workspace into it from that binding — the URL names the workspace only.
        const reservation = reserveVessel(workspaceId, 'workspace-target', getStageWindowName(workspaceId));

        try {
            if (!reservation) {
                throw new Error('cross-window stage could not reserve its Group slot')
            }

            let winData = await Neo.Main.getWindowData({windowId: getWindowId()}),
                left    = winData.screenLeft > 660
                    ? winData.screenLeft - 640
                    : winData.screenLeft + (winData.innerWidth || 1280) + 40,
                top     = winData.screenTop,
                opened  = await Neo.Main.windowOpen({
                    topologyIdentity: reservation,
                    url             : `./index.html?workspaceId=${workspaceId}`,
                    windowFeatures  : `height=520,width=600,left=${left},top=${top}`,
                    windowId        : getWindowId(),
                    windowName      : getStageWindowName(workspaceId)
                });

            if (opened === false) {
                throw new Error('cross-window popup blocked')
            }
        } catch (error) {
            revokeVessel(workspaceId);
            getStageReject(workspaceId)?.(error);
            setStagePromise(workspaceId, null);
            setStageResolve(workspaceId, null);
            setStageReject(workspaceId, null);
            throw error
        }

        let timeout = hostTimeout(10000).then(() => {
            throw new Error('cross-window target did not connect and become measurable within 10s')
        });

        try {
            return await Promise.race([stagePromise, timeout])
        } catch (error) {
            revokeVessel(workspaceId);
            setStagePromise(workspaceId, null);
            throw error
        }
    }

    /**
     * @summary Commits the transfer against both queue-head documents through the Group writer.
     * @param {Object} pair
     * @returns {Promise<Boolean>} False leaves both documents and the cursor untouched.
     */
    async function adoptPair(pair) {
        try {
            const result = await workspaceSet.transfer(pair.descriptor, {provenance: {origin: 'human'}});
            pair.sourceDocument = result.snapshot.participants[pair.sourceWorkspaceId];
            pair.targetDocument = result.snapshot.participants[pair.targetWorkspaceId];
            pair.sourceBefore = result.participants.find(participant => participant.workspaceKey === pair.sourceWorkspaceId).before;
            incrementTransferCommits();
            return true
        } catch (error) {
            pair.errors = [error.message];
            return false
        }
    }

    /**
     * @summary Retires the returned popup render target while retaining its Group participant.
     * Interaction and geometry registrations leave; undo still reaches the semantic document.
     * @returns {Boolean} true when the popup registry entry existed and was removed.
     */
    function retireReturnedWorkspace() {
        bumpStageGeneration();

        for (const workspaceId of [workspaceIds.main, workspaceIds.popup]) {
            registries.participations.get(workspaceId)?.destroy();
            registries.participations.delete(workspaceId);
            registries.geometry.delete(workspaceId)
        }

        registries.hosts.delete(workspaceIds.popup);
        registries.projectionRequests.delete(workspaceIds.popup);
        setTargetWindowId(workspaceIds.popup, null);
        setStagePromise(workspaceIds.popup, null);
        setStageResolve(workspaceIds.popup, null);
        setStageReject(workspaceIds.popup, null);

        return workspaceSet.has(workspaceIds.popup)
    }

    /**
     * @summary Commits the popup's model-resolved stack back into the main workspace as one
     * atomic `transferNode`, then retires the emptied popup
     * render target. Group admission is awaited; its participant projections precede native cleanup.
     * @param {Object} data
     * @returns {Promise} The committed receipt, or false before adoption.
     */
    async function commitWholeStackReturn(data) {
        let {
                descriptor,
                sourceDocument,
                sourceWorkspaceId,
                targetDocument,
                targetWorkspaceId
            } = data,
            sourceBefore = getWorkspaceDocument(sourceWorkspaceId);

        if (descriptor?.operation !== 'transferNode'
            || sourceWorkspaceId !== workspaceIds.popup
            || targetWorkspaceId !== workspaceIds.main
            || WorkspaceDocument.resolveStackRoot(sourceBefore) !== descriptor.nodeId) {
            return false
        }

        let nodeIds = WorkspaceDocument.reachableNodeIds({nodes: sourceBefore.nodes, root: descriptor.nodeId}),
            itemIds = [...new Set([...nodeIds].flatMap(nodeId =>
                sourceBefore.nodes[nodeId]?.type === 'tabs' ? sourceBefore.nodes[nodeId].items || [] : []
            ))];

        if (!itemIds.length || !await seams.adoptCommittedTransferPair(data)) {
            return false
        }
        ({sourceDocument, targetDocument, sourceBefore} = data);
        nodeIds = WorkspaceDocument.reachableNodeIds({nodes: sourceBefore.nodes, root: descriptor.nodeId});
        itemIds = [...new Set([...nodeIds].flatMap(nodeId => sourceBefore.nodes[nodeId]?.type === 'tabs'
            ? sourceBefore.nodes[nodeId].items || [] : []))];

        // The pair is committed NOW. Clear every click-detach entry synchronously so a physical
        // disconnect racing the deferred projections cannot route any member through transferItem
        // again. The Group's participant callbacks already own the pane projection.
        itemIds.forEach(itemId => delete registries.detachedPanes[itemId]);

        return chainProjection(async () => {
            let errors = [];

            let retired = isHostDestroyed() ? false : seams.retireReturnedPopupWorkspace();

            if (!isHostDestroyed()) {
                // Direct return never creates a park slot: its committed terminal is therefore
                // intentionally a no-op for the vessel-park machine. This owner closes the now
                // empty popup after adoption + retirement, without making platform-close
                // success part of model truth.
                try {
                    let closing = Neo.Main.windowClose({
                        names   : ['demo-b-cross-window'],
                        windowId: getWindowId()
                    });

                    closing?.catch?.(() => {})
                } catch {
                    // best-effort vessel retirement; committed ownership never rolls back
                }
            }

            let receipt = {
                applied         : true,
                errors,
                itemIds,
                sourceWorkspaceId,
                targetWorkspaceId,
                workspaceRetired: retired
            };

            resolveGesture(receipt);

            return receipt
        })
    }

    /**
     * @summary Places the popup outside the source viewport and proves the Window manager sees
     * two non-overlapping rectangles. Browsers may ignore `window.open(left=...)`; the live
     * Window manager projection is the readiness authority used by global drag hit-testing.
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object>}
     */
    async function positionStage({attempts=120, delay=16}={}) {
        let WindowManager = (await import('../../../src/manager/Window.mjs')).default,
            sourceWindow  = WindowManager.get(getWindowId()),
            targetWindow  = WindowManager.get(getTargetWindowId(workspaceIds.popup)),
            sourceData    = await Neo.Main.getWindowData({windowId: getWindowId()}),
            screen        = sourceData?.screen,
            sourceRect    = sourceWindow?.innerRect,
            targetRect    = targetWindow?.innerRect,
            gap           = 40,
            candidates, desired, overlaps, snapshot;

        if (!sourceRect || !targetRect || !screen) {
            return {ready: false, reason: 'window geometry or screen bounds are unavailable'}
        }

        overlaps = sourceRect.x < targetRect.right
            && sourceRect.right > targetRect.x
            && sourceRect.y < targetRect.bottom
            && sourceRect.bottom > targetRect.y;

        // A headed harness or the platform itself may already have established a valid stage.
        // The observed manager rectangles are the authority; moving again can be denied or
        // clamped and must never turn a ready physical arrangement back into an overlap.
        if (!overlaps) {
            return {
                desired: {x: targetRect.x, y: targetRect.y},
                ready  : true,
                reused : true,
                source : sourceRect,
                target : targetRect
            }
        }

        candidates = [{x: sourceRect.right + gap, y: sourceRect.y}, {
            x: sourceRect.x - targetRect.width - gap,
            y: sourceRect.y
        }, {
            x: sourceRect.x,
            y: sourceRect.bottom + gap
        }, {
            x: sourceRect.x,
            y: sourceRect.y - targetRect.height - gap
        }];

        desired = candidates.find(point => point.x >= screen.availLeft
            && point.y >= screen.availTop
            && point.x + targetRect.width <= screen.availLeft + screen.availWidth
            && point.y + targetRect.height <= screen.availTop + screen.availHeight);

        if (!desired) {
            return {
                ready : false,
                reason: 'the available screen cannot hold both configured viewports without overlap',
                screen,
                source: sourceRect,
                target: targetRect
            }
        }

        await Neo.Main.windowMoveTo({
            windowId  : getWindowId(),
            windowName: getStageWindowName(workspaceIds.popup),
            x         : desired.x,
            y         : desired.y
        });

        for (let attempt = 0; attempt <= attempts && !isHostDestroyed(); attempt++) {
            sourceWindow = WindowManager.get(getWindowId());
            targetWindow = WindowManager.get(getTargetWindowId(workspaceIds.popup));
            sourceRect   = sourceWindow?.innerRect;
            targetRect   = targetWindow?.innerRect;

            overlaps = sourceRect && targetRect
                && sourceRect.x < targetRect.right
                && sourceRect.right > targetRect.x
                && sourceRect.y < targetRect.bottom
                && sourceRect.bottom > targetRect.y;

            snapshot = {
                desired,
                ready : !!sourceRect && !!targetRect && !overlaps,
                source: sourceRect,
                target: targetRect
            };

            if (snapshot.ready || attempt === attempts) break;

            await hostTimeout(delay)
        }

        return snapshot || {desired, ready: false}
    }

    /**
     * @summary Measures one active workspace's host and tabs geometry. The result is
     * window-local and runtime-only; it is invalidated by every projection refresh and never
     * enters a document.
     * @param {String} workspaceId
     * @returns {Promise<Object|null>}
     */
    async function measureGeometry(workspaceId) {
        let host     = registries.hosts.get(workspaceId),
            document = getWorkspaceDocument(workspaceId),
            nodes    = document?.nodes || {};

        if (!host || host.isDestroyed) return null;

        let zoneEntries = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs')
                .map(nodeId => ({nodeId, container: host.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container),
            // A zone entry is an OBJECT DESCRIPTOR ({nodeId, …}; the v13.2 contract retired the
            // string shorthand), so reading `zones.center` directly yields an object where an id
            // belongs. `PreviewProducer.resolveRootEdge` then fails its `typeof nodeId === 'string'`
            // guard and returns null, dropping every root edge chip with no error. The canonical
            // unwrap is the one the module already imports.
            rootId      = nodes[document.root]?.type === 'edge-zone'
                ? (WorkspaceDocument.getZoneNodeId(nodes[document.root].zones?.center) ?? document.root)
                : document.root,
            [hostRect, ...zoneRects] = await host.getDomRect(
                [host.id, ...zoneEntries.map(zone => zone.container.id)],
                host.windowId
            ),
            geometry;

        geometry = hostRect && {
            hostRect,
            root : {nodeId: rootId, rect: hostRect},
            zones: zoneEntries
                .map((zone, index) => ({
                    nodeId: zone.nodeId,
                    // An empty root tabs surface is the whole workspace admission area. Browser
                    // layout still gives its tab chrome a non-zero strip, but using that strip as
                    // the remote claim rect makes otherwise reachable vessel overlap impossible.
                    rect  : zone.nodeId === rootId
                        && nodes[zone.nodeId].items?.length === 0
                            ? hostRect
                            : zoneRects[index],
                    orientation: Object.values(nodes).find(node =>
                        node.type === 'split' && node.children?.includes(zone.nodeId)
                    )?.orientation ?? null
                }))
                .filter(zone => zone.rect)
        };

        if (!geometry
            || geometry.hostRect.width < 1
            || geometry.hostRect.height < 1
            || geometry.zones.length < 1
            || geometry.zones.some(zone => zone.rect.width < 1 || zone.rect.height < 1)) {
            registries.geometry.delete(workspaceId);
            return null
        }

        registries.geometry.set(workspaceId, geometry);

        let indicators = host.down({ntype: 'dashboard-dock-drop-indicators'});

        indicators && (indicators.hostRect = geometry.hostRect);

        return geometry
    }

    /**
     * @summary Waits for main-thread paint evidence instead of assuming a worker update
     * acknowledgement implies measurable geometry. Every retry is routed through the host's own
     * render target; the bounded delay is cadence only.
     * @param {String} workspaceId
     * @param {Object} [options={}]
     * @param {Number} [options.attempts=120]
     * @param {Number} [options.delay=16]
     * @returns {Promise<Object|null>}
     */
    async function waitForGeometry(workspaceId, {attempts=120, delay=16}={}) {
        let geometry = await measureGeometry(workspaceId);

        if (!geometry && attempts > 0 && !isHostDestroyed()) {
            await hostTimeout(delay);
            return waitForGeometry(workspaceId, {attempts: attempts - 1, delay})
        }

        return geometry
    }

    return {
        adoptPair,
        commitWholeStackReturn,
        createParticipation,
        isTargetCurrent,
        measureGeometry,
        mountTarget,
        openStage,
        positionStage,
        retireReturnedWorkspace,
        waitForGeometry
    }
}
