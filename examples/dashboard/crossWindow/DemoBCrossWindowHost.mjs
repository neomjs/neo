import Base              from '../../../src/core/Base.mjs';
import PreviewContract   from '../../../src/dashboard/dock/model/PreviewContract.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBCrossWindowHost
 * @extends Neo.core.Base
 * @summary Connects local drag feedback and remote transfer receipts to the live demo workspace.
 *
 * Participation uses these preview, terminal and transfer callbacks together. Geometry maps,
 * counters, gesture context, completion resolver, producer and projection queue remain host-owned.
 * Local drops stay synchronous; Group admission precedes the deferred rendered receipt.
 * The host supplies semantic IDs through a distinctly named transfer implementation.
 */
class DemoBCrossWindowHost extends Base {
    static config = {
        /** @member {String} className='Neo.examples.dashboard.crossWindow.DemoBCrossWindowHost' */
        className: 'Neo.examples.dashboard.crossWindow.DemoBCrossWindowHost'
    }

    /**
     * @summary Acknowledges Group transfer admission before the deferred rendered gesture receipt.
     * @param {Object} data
     * @param {Object} workspaceIds Host-owned semantic identities.
     * @param {String} workspaceIds.mainWorkspaceId
     * @param {String} workspaceIds.popupWorkspaceId
     * @returns {Promise}
     * @protected
     */
    async publishCrossWindowTransfer(data, {mainWorkspaceId, popupWorkspaceId}) {
        let me = this,
            {
                descriptor,
                sourceDocument,
                sourceWorkspaceId,
                targetDocument,
                targetWorkspaceId
            } = data;

        if (descriptor?.operation === 'transferNode') {
            const result = await me.commitWholeStackReturn(data);
            return result?.applied === true
        }

        const
            context       = me.crossWindowGestureContext,
            generation    = me.crossWindowStageGeneration,
            itemId        = descriptor.itemId,
            isPopupDetach = sourceWorkspaceId === mainWorkspaceId
                && targetWorkspaceId === popupWorkspaceId,
            targetWindowId   = me.crossWindowTargetWindowId,
            ownsTransfer     = () => !me.isDestroyed
                && me.crossWindowStageGeneration === generation
                && me.crossWindowTargetWindowId === targetWindowId
                && (!isPopupDetach || me.detachedPanes[itemId]?.windowId === targetWindowId);

        // Both-or-neither adoption through the shared core — a refused pair ends the commit here,
        // so the gesture bookkeeping below never diverges from document truth.
        if (!await me.adoptCommittedTransferPair(data)) {
            return false
        }
        ({sourceDocument, targetDocument} = data);

        // The document pair and vessel ownership are one worker-side commit. A physical close can
        // arrive before either projection settles; publishing this entry synchronously lets the
        // disconnect path reattach the item instead of misclassifying committed truth as a cold
        // cancellation. The generation predicate below suppresses a superseded gesture receipt
        // after the recovery transaction has taken ownership.
        if (isPopupDetach) {
            me.detachedPanes[itemId] = {
                tabsNodeId: context?.sourceNodeId,
                windowId  : targetWindowId,
                windowName: 'demo-b-cross-window'
            }
        }

        me.refreshPromise = me.refreshPromise
            .then(() => me.timeout(0))
            .then(async () => {
                if (!ownsTransfer()) return;

                // The admitted result lets source retirement finish before deferred projection.
                // Read host-owned counters: projection can destroy the emptied source tabs zone.
                let sourceDecision = {
                    localDropFires    : me.crossWindowStats.localDropFires,
                    remoteDropOutFires: me.crossWindowStats.remoteDropOutFires
                };

                if (!ownsTransfer()) return;

                // A vessel is born only on a desktop leg. One that rode the hand into the claim retired
                // there and the pane came home (one mount); on the direct path the header proxy adds none.
                let pane         = me.paneCache[itemId],
                    framesAfter  = pane?.frames ?? -1,
                    targetTabsId = WorkspaceDocument.findContainingTabsId(targetDocument, itemId),
                    vesselBorn   = Number.isInteger(context?.vesselMountCount),
                    proof        = {
                        framesAfter,
                        framesBefore  : context?.frames ?? null,
                        framesNotReset: framesAfter >= (context?.frames ?? Infinity),
                        homeMountDelta: Number.isInteger(context?.proxyMountCount)
                            ? context.proxyMountCount - (vesselBorn ? context.vesselMountCount : (context?.mountCount ?? 0))
                            : null,
                        localDropFires    : sourceDecision.localDropFires,
                        mountDelta        : (pane?.mountCount ?? 0) - (context?.mountCount ?? 0),
                        remoteDropOutFires: sourceDecision.remoteDropOutFires,
                        remoteSnapshot    : context?.remoteSnapshot ?? null,
                        sameInstance      : pane === context?.pane,
                        sourceItemRemoved : !sourceDocument.items?.[itemId]
                            && WorkspaceDocument.findContainingTabsId(sourceDocument, itemId) === null,
                        sourceSuppressionConsumed: sourceDecision.remoteDropOutFires === 1
                            && sourceDecision.localDropFires === 0,
                        targetItemPlaced        : !!targetDocument.items?.[itemId]
                            && targetTabsId === descriptor.target?.tabsNodeId,
                        targetMountDelta: Number.isInteger(context?.proxyMountCount)
                            ? (pane?.mountCount ?? 0) - context.proxyMountCount
                            : null,
                        targetTabsId,
                        transferCommits : me.crossWindowStats.transferCommits,
                        vesselBorn,
                        vesselMountDelta: vesselBorn ? context.vesselMountCount - (context?.mountCount ?? 0) : 0,
                        vesselRetired   : !me.resolveTearOutVessel(itemId)
                    },
                    checks         = [
                        ['transfer committed exactly once', proof.transferCommits === 1],
                        ['source remote-drop-out fired exactly once', proof.remoteDropOutFires === 1],
                        ['source local drop stayed suppressed', proof.localDropFires === 0],
                        ['remote semantic and rendered preview settled', proof.remoteSnapshot?.ready === true],
                        ['source document relinquished the item', proof.sourceItemRemoved],
                        ['target document placed the item', proof.targetItemPlaced],
                        ['worker component instance stayed identical', proof.sameInstance],
                        ['instance heartbeat did not reset', proof.framesNotReset],
                        ['a vessel born on the desktop mounted the pane once and retired on the claim',
                            !vesselBorn || (proof.vesselMountDelta === 1 && proof.vesselRetired)],
                        ['target header proxy settled without taking the pane', proof.remoteSnapshot?.embodiment?.header === true
                            && proof.remoteSnapshot.embodiment.itemId === itemId
                            && proof.remoteSnapshot.embodiment.targetWindowId === targetWindowId
                            && proof.remoteSnapshot.embodiment.ownsPane === false
                            && proof.remoteSnapshot.embodiment.settled === true
                            && proof.remoteSnapshot.embodiment.visible === true],
                        ['the claim brought the pane home before the target took it', proof.homeMountDelta === (vesselBorn ? 1 : 0)],
                        ['target document added exactly one mount', proof.targetMountDelta === 1],
                        ['the pane mounted once per window it entered', proof.mountDelta === (vesselBorn ? 3 : 1)],
                        ['continuity witness is complete', typeof pane?.id === 'string'
                            && Number.isInteger(pane?.mountCount)]
                    ],
                    errors         = checks.filter(([, passed]) => !passed).map(([message]) => message),
                    receipt        = {
                        applied       : errors.length === 0,
                        errors,
                        sourceDocument: WorkspaceDocument.clone(sourceDocument),
                        targetDocument: WorkspaceDocument.clone(targetDocument),
                        witness       : {
                            instanceId: pane?.id ?? null,
                            mountCount: pane?.mountCount ?? null
                        },
                        proof
                    };

                me.crossWindowGestureResolve?.(receipt);
                me.crossWindowGestureResolve = null
            });

        return true
    }

    /**
     * @summary Converts a viewport-space rect into a dock host's local overlay coordinates.
     * @param {Object} rect
     * @param {Object} hostRect
     * @returns {Object}
     * @protected
     */
    localDockRect(rect, hostRect) {
        return {x: rect.x - hostRect.x, y: rect.y - hostRect.y, width: rect.width, height: rect.height}
    }

    /**
     * @summary Clears transient preview state for one workspace.
     * @param {String} workspaceId
     * @protected
     */
    clearWorkspaceAffordances(workspaceId) {
        let host = this.crossWindowHosts.get(workspaceId);

        host?.down({ntype: 'dashboard-dock-drop-indicators'})?.clear();

        let preview = host?.down({ntype: 'dock-preview'});

        preview && (preview.dockPreview = null)
    }

    /**
     * @summary Synchronous remote-target hit test over pre-measured window-local tabs geometry.
     * @param {String} workspaceId
     * @param {Number} localX
     * @param {Number} localY
     * @returns {Boolean}
     * @protected
     */
    hitTestWorkspace(workspaceId, localX, localY) {
        return !!this.dockPreviewProducer.hitTestZone(
            this.crossWindowGeometry.get(workspaceId)?.zones,
            {x: localX, y: localY}
        )
    }

    /**
     * @summary Computes and renders one preview through the same producer/indicator/converter pipeline
     * used by an in-window drag. This method stays synchronous for coordinator callbacks.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    renderWorkspacePreview(workspaceId, data) {
        let me                = this,
            host              = me.crossWindowHosts.get(workspaceId),
            geometry          = me.crossWindowGeometry.get(workspaceId),
            draggedItem       = data.draggedItem,
            groupNodeId       = draggedItem?.dockGroupNodeId ?? null,
            itemId            = data.itemId ?? draggedItem?.dockItemId,
            sourceWorkspaceId = draggedItem?.dockSourceWorkspaceId ?? workspaceId,
            sourceNodeId      = data.sourceNodeId
                ?? WorkspaceDocument.findContainingTabsId(me.getWorkspaceDocument(sourceWorkspaceId), itemId),
            pointer    = {x: data.localX ?? data.clientX, y: data.localY ?? data.clientY};

        if (!host || !geometry || !itemId || !Neo.isNumber(pointer.x) || !Neo.isNumber(pointer.y)) {
            return null
        }

        let producer   = me.dockPreviewProducer,
            indicators = host.down({ntype: 'dashboard-dock-drop-indicators'}),
            renderer   = host.down({ntype: 'dock-preview'}),
            zone       = producer.hitTestZone(geometry.zones, pointer);

        if (indicators && (zone?.nodeId ?? null) !== (indicators.candidateSet?.zone?.nodeId ?? null)) {
            indicators.candidateSet = zone
                ? producer.produceCandidates({
                    pointer, zones: geometry.zones, groupNodeId, itemId, sourceNodeId, root: geometry.root
                })
                : null
        }

        let candidate = indicators?.updatePointer(pointer) ?? null,
            preview   = candidate?.preview
                ?? producer.produce({pointer, zones: geometry.zones, groupNodeId, itemId, sourceNodeId});

        if (renderer) {
            renderer.dockPreview = preview;

            if (preview) {
                let targetRect = preview.target.nodeId === geometry.root.nodeId
                    ? geometry.root.rect
                    : geometry.zones.find(entry => entry.nodeId === preview.target.nodeId)?.rect;

                targetRect && renderer.applyTargetGeometry(me.localDockRect(targetRect, geometry.hostRect))
            }
        }

        return preview
    }

    /**
     * @summary Local drag-move adapter for either active workspace.
     * @param {String} workspaceId
     * @param {Object} data
     * @protected
     */
    async onDockCrossZoneDragMove(workspaceId, data) {
        this.crossWindowGeometry.has(workspaceId) || await this.measureWorkspaceGeometry(workspaceId);
        this.renderWorkspacePreview(workspaceId, data)
    }

    /**
     * @summary Local release path. A committed remote drop must suppress this callback entirely; the
     * counter is the product witness for that one-shot source decision.
     * @param {String} workspaceId
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    onDockCrossZoneDrop(workspaceId, data) {
        let me         = this,
            preview    = me.renderWorkspacePreview(workspaceId, data),
            descriptor = PreviewContract.previewToOperation(preview),
            result     = null;

        me.crossWindowStats.localDropFires++;
        me.clearWorkspaceAffordances(workspaceId);

        if (descriptor) {
            result = me.applyWorkspaceOperation(workspaceId, descriptor);

            if (result && !result.errors?.length && result.document) {
                me.onWorkspaceDocumentChange(workspaceId, result.document)
            }
        }

        return result
    }

    /**
     * @summary Cancels every window-local affordance and resolves the cancellation readiness signal.
     * @param {String} workspaceId
     * @param {Object} data
     * @protected
     */
    onDockCrossZoneDragCancel(workspaceId, data) {
        this.crossWindowHosts.forEach((host, id) => this.clearWorkspaceAffordances(id));
        this.crossWindowGestureResolve?.({
            applied: false,
            errors : ['cross-window gesture cancelled before commit'],
            itemId : data?.itemId,
            workspaceId
        });
        this.crossWindowGestureResolve = null
    }
}

export default Neo.setupClass(DemoBCrossWindowHost);
