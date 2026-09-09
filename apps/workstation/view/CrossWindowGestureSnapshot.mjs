import Base              from '../../../src/core/Base.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Workstation.view.CrossWindowGestureSnapshot
 * @extends Neo.core.Base
 *
 * @summary The Workstation's cross-window observation surface — the receipts-and-diagnostics
 * boundary, carried as a mixin because its readers address it by name on the instance.
 *
 * **Why a mixin and not a module function.** Every consumer of this surface is a reader, never the
 * engine: `apps/workstation/tour/NativeGestureDriver.mjs` calls it on the instance, and the
 * Workstation Neural-Link e2e specs invoke it by NAME —
 * `callMethod(workspaceId, 'readCrossWindowGestureSnapshot', […])` — while a unit spec reaches it as
 * `Workspace.prototype.readCrossWindowGestureSnapshot.call(workspace, …)`. Both shapes resolve
 * against the prototype, so the method has to live on the instance. Moving it to a plain module and
 * leaving a one-line delegate behind would satisfy the line count and reintroduce exactly the
 * forwarding façade this ticket forbids.
 *
 * {@link Neo.dashboard.dock.window.TopologySeams} is the same shape for the same reason, and says so
 * in its own summary: a seam its caller resolves by name has to be an instance method, so it ships
 * as a mixin rather than as a helper.
 *
 * **What stays behind.** The four vessel receipts themselves — `lastVesselOpen`, `lastTearOutClose`,
 * `lastVesselParkReceipt`, `lastVesselRestoreReceipt` — are NOT part of this surface and did not
 * move. They read like diagnostics and are not: each is a stage machine the owning method amends as
 * it advances (`identity-refused` → `route-refused` → `embodiment-refused` → `native-dispatched` →
 * `acknowledged`, with `threw` branches), and `closeTearOutVessel` holds its receipt in a local
 * `const` precisely so those amendments survive re-entrancy. That is the method's own progress
 * record, written across awaits; relocating it would be the "lost success or recovery claim after an
 * await" the Contract Ledger refuses. Only the READ projection moved.
 */
class CrossWindowGestureSnapshot extends Base {
    static config = {
        /**
         * @member {String} className='Workstation.view.CrossWindowGestureSnapshot'
         * @protected
         */
        className: 'Workstation.view.CrossWindowGestureSnapshot'
    }

    /**
     * @summary Reads the semantic, rendered, arbitration, and physical-park truth for one
     * cross-window pointer frame.
     *
     * The film executors use this as their pre-release gate: mouseup is withheld until the
     * coordinator has exactly one stable claim, its winning target is engaged, and the target's
     * semantic preview equals the preview rendered in that window. A converting tear-out can add
     * `parkedItemId`, which additionally requires the exact source vessel to be strictly parked.
     * Visuals are read from the current participant's supplied or already-created controller;
     * observing readiness never creates the popup's lazy preview tier.
     * @param {Object} context
     * @param {String|null} [context.parkedItemId=null]
     * @param {Neo.dashboard.dock.interaction.TabSortZone|null} [context.sourceZone=null]
     * @param {String|null} [context.sourceZoneId=null] Clone-safe Neural Link alternative.
     * @param {String} context.targetWorkspaceId
     * @returns {Object}
     * @protected
     */
    readCrossWindowGestureSnapshot({parkedItemId=null, sourceZone=null, sourceZoneId=null, targetWorkspaceId}={}) {
        sourceZone ??= sourceZoneId ? Neo.get(sourceZoneId) : null;

        let me = this,
            // `me.constructor`, not the class: a mixin has no lexical binding to its host, and
            // importing the host to read one static would make the pair circular.
            isMain        = targetWorkspaceId === me.constructor.MAIN_WORKSPACE_ID,
            state         = isMain ? null : me.getPopupState(targetWorkspaceId),
            participation = isMain ? me.crossWindowParticipations.get(targetWorkspaceId) : state?.host?.participation,
            affordances   = participation?.affordances ?? participation?.ownedAffordances,
            target        = participation?.target,
            coordinator   = sourceZone?.dragCoordinator,
            arbiter       = coordinator?.pointerClaimArbiter,
            winner        = arbiter?.resolve?.() ?? null,
            semantic      = target?.currentPreview ?? null,
            rendered      = affordances?.preview?.dockPreview ?? null,
            indicatorMenu = affordances?.indicators,
            indicatorSet  = indicatorMenu?.candidateSet ?? null,
            sensor        = sourceZone?.vesselConversionSensor,
            parkedVessel  = me.vesselParkHandlers?.parkedVessel ?? null,
            sourceVessel  = parkedItemId && me.resolveTearOutVessel(parkedItemId),
            targetProxy   = parkedItemId && me.vesselProxyEmbodiment.snapshot(parkedItemId),
            snapshot      = {
                claimCount: arbiter?.claimCount ?? 0,
                converted : sensor?.converted === true && sensor?.transitioning !== true,
                engaged   : coordinator?.activeTargetZone === target,
                indicators: indicatorSet ? {
                    activePreviewId: indicatorMenu.activeCandidate?.preview?.previewId ?? null,
                    candidateCount : (indicatorSet.cross?.length ?? 0) + (indicatorSet.root?.chips?.length ?? 0),
                    itemId         : indicatorSet.itemId ?? null,
                    visible        : !indicatorMenu.cls?.includes?.('neo-dashboard-dock-drop-indicators-hidden')
                } : null,
                parkedItemId: parkedVessel?.itemId ?? null,
                parkReceipt : me.lastVesselParkReceipt
                    ? WorkspaceDocument.clone(me.lastVesselParkReceipt)
                    : null,
                preview              : semantic ? WorkspaceDocument.clone(semantic) : null,
                rendered             : rendered ? WorkspaceDocument.clone(rendered) : null,
                sourceVesselConnected: Boolean(
                    sourceVessel?.windowId && Neo.manager?.Window?.get(sourceVessel.windowId)
                ),
                sourceVesselWindowId: sourceVessel?.windowId ?? null,
                restoreReceipt      : me.lastVesselRestoreReceipt
                    ? WorkspaceDocument.clone(me.lastVesselRestoreReceipt)
                    : null,
                targetProxy,
                targetWorkspaceId,
                winnerStableId      : winner?.stableId ?? null
            };

        snapshot.ready = snapshot.claimCount === 1
            && snapshot.engaged
            && snapshot.winnerStableId === targetWorkspaceId
            && Boolean(snapshot.preview?.previewId)
            && snapshot.rendered?.previewId === snapshot.preview.previewId
            && snapshot.indicators?.activePreviewId === snapshot.preview.previewId
            && (parkedItemId == null || (
                snapshot.converted && snapshot.parkedItemId === parkedItemId &&
                snapshot.sourceVesselConnected &&
                snapshot.indicators?.itemId === parkedItemId &&
                snapshot.indicators.candidateCount >= 5 &&
                snapshot.indicators.visible &&
                targetProxy?.itemId === parkedItemId &&
                targetProxy.ownsPane &&
                targetProxy.settled &&
                targetProxy.sourceWindowId === snapshot.sourceVesselWindowId &&
                targetProxy.targetWindowId === target?.windowId &&
                targetProxy.visible
            ));

        return snapshot
    }
}

export default Neo.setupClass(CrossWindowGestureSnapshot);
