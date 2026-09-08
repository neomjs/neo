import Base            from '../../../core/Base.mjs';
import PreviewProducer from './PreviewProducer.mjs';
import PreviewContract from '../model/PreviewContract.mjs';

/**
 * @class Neo.dashboard.dock.interaction.DragAffordances
 * @extends Neo.core.Base
 *
 * @summary The app-neutral drag-affordance gesture controller every docking workspace composes.
 *
 * Owns the whole in-window affordance session — the once-per-gesture memoized geometry, the
 * per-frame candidate/preview consumer (§06 tier order: indicator selection first, pointer
 * inference as the fallback), the release-truth drop seam committing through
 * `previewToOperation`, and cancel hygiene — so consumer workspaces (Demo-A, the workstation,
 * every future dock demo) compose ONE owner instead of copying ~190 lines of orchestration.
 *
 * **Ownership contract (the falsified async seams of the superseded per-app copies, built in):**
 *
 * - **The producer is created AND destroyed here** — create/destroy pairing is this class's
 *   own lifecycle, never the consumer's memory burden.
 * - **Promise-identity re-checks after EVERY await** — the move handler AND the drop handler
 *   both re-verify `this.dragGeometry` against the awaited promise: a gesture cancelled,
 *   re-projected, or destroyed mid-await can never resurrect overlays NOR commit a document
 *   mutation (the drop-after-cancel defect the supersede review proved on the prototype).
 * - **Teardown symmetry:** `destroy()` retires the session and the producer.
 *
 * **The consumer duck-type (`owner`):** a workspace container providing `dockModel` (the
 * committed document), `applyDockZoneOperation(descriptor)` (the reducer), and
 * `onDockZoneDocumentChange(document)` (the view-sync) — the normative reducer-container
 * ownership pattern every docking workspace implements. The composition owner supplies the
 * `preview`, `indicators` and `host` instances: an app can compose them, while
 * {@link Neo.dashboard.dock.window.Participation} owns the complete default remote-target tier.
 * This controller borrows those views; their composer destroys them. No app imports in this tier.
 */
class DragAffordances extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.DragAffordances'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.DragAffordances'
    }

    /**
     * The memoized once-per-gesture geometry promise. Doubles as the drag-active flag; its
     * IDENTITY is the generation token every await re-checks.
     * @member {Promise<Object>|null} dragGeometry=null
     */
    dragGeometry = null

    /**
     * The settled geometry of the live gesture — the synchronous mirror of {@link #dragGeometry},
     * null until that promise resolves and again after {@link #invalidateGeometry}. Remote frames
     * use this mirror to select and publish feedback synchronously.
     * @member {Object|null} geometry=null
     */
    geometry = null

    /**
     * Window generation and viewport size associated with the current measurement.
     * @member {String|null} geometrySignature=null
     * @protected
     */
    geometrySignature = null

    /**
     * The dock host container (the overlays' coordinate origin and the zone-measure root).
     * Assigned by the consumer after composition.
     * @member {Neo.container.Base|null} host=null
     */
    host = null

    /**
     * The indicator-menu overlay instance (Neo.dashboard.dock.interaction.DropIndicators).
     * @member {Neo.dashboard.dock.interaction.DropIndicators|null} indicators=null
     */
    indicators = null

    /**
     * The consumer workspace (the reducer-container duck-type documented on the class).
     * @member {Object|null} owner=null
     */
    owner = null

    /**
     * The preview renderer overlay instance (Neo.dashboard.dock.interaction.Preview).
     * @member {Neo.dashboard.dock.interaction.Preview|null} preview=null
     */
    preview = null

    /**
     * The candidate producer — created here, destroyed here.
     * @member {Neo.dashboard.dock.interaction.PreviewProducer|null} producer=null
     */
    producer = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.producer = Neo.create(PreviewProducer)
    }

    /**
     * @summary Ends a drag affordance session: geometry cache dropped (invalidating every in-flight
     * await's generation token), indicator menu and preview cleared. Called on drop, cancel,
     * teardown, and by every consumer re-projection.
     */
    clear() {
        let me = this;

        me.invalidateGeometry();
        me.indicators?.clear();
        me.renderPreview(null)
    }

    /**
     * @summary Measures once per gesture and window size (memoized as a promise so the
     * ~60hz move stream never stacks measurements): the host rect (the overlays' coordinate
     * origin), every projected tabs-zone rect with its parent-split orientation, and the
     * chips' root target — the boundary its owner declares through
     * {@link Neo.dashboard.dock.Workspace#resolveDockableRoot}, measured on that boundary's
     * own component so the chip's nodeId and its rect describe the same node.
     * @returns {Promise<Object|null>} {hostRect, zones, root} or null when nothing is measurable
     * @protected
     */
    ensureGeometry() {
        let me        = this,
            signature = me.getGeometrySignature();

        if (signature !== me.geometrySignature) {
            me.clear();
            me.geometrySignature = signature
        }

        if (me.dragGeometry) return me.dragGeometry;

        let {host} = me,
            nodes  = me.owner?.dockModel?.nodes || {};

        if (!host) return Promise.resolve(null);

        let zoneEntries = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs')
                .map(nodeId => ({nodeId, container: host.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container),
            // The boundary its owner declares — `Workspace#resolveDockableRoot` carries why the
            // nodeId and its rect must name ONE node. Resolved live every gesture: wrapping
            // rewrites `document.root`, so a captured id is stale one drop later.
            dockable    = me.owner.resolveDockableRoot(),
            measureIds  = [host.id, ...zoneEntries.map(zone => zone.container.id)],
            // measured in the SAME batch, and reusing the host's rect when the boundary IS the
            // host — the ordinary whole-arrangement root, which is most documents
            rootIndex   = dockable && dockable.component !== host ? measureIds.push(dockable.component.id) - 1 : 0;

        const promise = host.getDomRect(measureIds).then(rects => {
            let hostRect  = rects[0],
                zoneRects = rects.slice(1, zoneEntries.length + 1);

            if (me.dragGeometry === promise && me.geometrySignature !== me.getGeometrySignature()) {
                me.clear();
                return null
            }

            let geometry = hostRect?.width > 0 && hostRect?.height > 0 && {
                hostRect,
                root : {nodeId: dockable?.nodeId ?? null, rect: rects[rootIndex]},
                zones: zoneEntries
                    .map((zone, index) => ({
                        nodeId     : zone.nodeId,
                        rect       : zoneRects[index],
                        orientation: Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(zone.nodeId))?.orientation ?? null
                    }))
                    // A zero-AREA rect is truthy but unmeasurable — a node measured before its
                    // layout settles reports 0×0 and can never contain a pointer. Treat it like
                    // a missing rect so the degeneracy check below sees the truth.
                    .filter(zone => zone.rect?.width > 0 && zone.rect?.height > 0)
            };

            // A gesture's FIRST move can outrace measurability (fresh mount, mid-layout —
            // missing OR zero-area rects): a degenerate result must not latch for the whole
            // gesture — uncache so the next move frame re-measures and the session self-heals.
            // A superseded generation (cleared or invalidated while in flight) touches nothing.
            if (!geometry || geometry.zones.length < 1) {
                me.dragGeometry === promise && (me.dragGeometry = null);
                return null
            }

            if (me.dragGeometry === promise) {
                me.geometry = geometry;
                me.indicators && (me.indicators.hostRect = geometry.hostRect)
            }

            return geometry
        });

        return me.dragGeometry = promise
    }

    /**
     * @summary Keys client-space measurements by their window generation and observed viewport size.
     * Moving a native window changes screen coordinates, not the client-space rectangles cached here.
     * @returns {String|null} Null for a host without a registered native window.
     * @protected
     */
    getGeometrySignature() {
        const windowId = this.host?.windowId,
              rect     = windowId != null ? Neo.manager?.Window?.get(windowId)?.innerRect : null;

        return rect ? JSON.stringify([windowId, rect.width, rect.height]) : null
    }

    /**
     * Drops the memoized geometry without ending the session: the next frame re-measures while the
     * indicator menu and renderer keep their current paint until it lands. Window-size changes are
     * detected by {@link #ensureGeometry} and clear obsolete feedback before re-measurement.
     */
    invalidateGeometry() {
        this.dragGeometry = this.geometry = null
    }

    /**
     * Converts a measured viewport rect into the dock-host's local space — the coordinate
     * system both overlay children position in.
     * @param {Object} rect viewport-space {x, y, width, height}
     * @param {Object} hostRect the measured host rect
     * @returns {Object}
     * @protected
     */
    localRect(rect, hostRect) {
        return {x: rect.x - hostRect.x, y: rect.y - hostRect.y, width: rect.width, height: rect.height}
    }

    /**
     * The measured rect a preview paints against: the host rect for a root-edge placement, the
     * target zone's rect otherwise; null before the geometry settles or for an unmeasured target.
     * @param {Object|null} preview a dockPreview
     * @returns {Object|null} viewport-space {x, y, width, height}
     */
    previewTargetRect(preview) {
        let {geometry} = this,
            nodeId     = preview?.target?.nodeId;

        if (!geometry || !nodeId) return null;

        return nodeId === geometry.root.nodeId
            ? geometry.root.rect
            : geometry.zones.find(zone => zone.nodeId === nodeId)?.rect ?? null
    }

    /**
     * @summary Updates the candidate menu and resolves its selection from settled geometry.
     * Indicator selection precedes pointer inference. Both local moves and remote frames use this
     * decision, then publish through {@link #renderPreview} or a caller-owned renderer.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} data.pointer {x, y} in the host window's client space
     * @param {String|null} [data.groupNodeId=null]
     * @param {String} [data.sourceNodeId]
     * @returns {Object|null} the dockPreview, or null before the geometry settles or when nothing is under the pointer
     */
    resolvePreview({groupNodeId = null, itemId, pointer, sourceNodeId}) {
        let me                               = this,
            {geometry, indicators, producer} = me;

        if (!geometry) return null;

        const zone = producer.hitTestZone(geometry.zones, pointer),
              set  = indicators?.candidateSet;

        if (indicators && ((zone?.nodeId ?? null) !== (set?.zone?.nodeId ?? null) || zone?.rect !== set?.zone?.rect ||
            set?.itemId !== itemId || (set?.groupNodeId ?? null) !== groupNodeId)) {
            indicators.candidateSet = zone
                ? producer.produceCandidates({pointer, zones: geometry.zones, itemId, groupNodeId, sourceNodeId, root: geometry.root})
                : null
        }

        const candidate = indicators?.updatePointer(pointer);

        // Both tiers pass the same guard: a root chip selected from the MENU would otherwise
        // promise a wrap the release refuses, which is the mismatch this whole seam exists to end.
        if (candidate?.preview?.itemId === itemId) return me.guardEmptyWrap(candidate.preview, itemId);

        return me.guardEmptyWrap(producer.produce({groupNodeId, itemId, pointer, root: geometry.root, sourceNodeId, zones: geometry.zones}), itemId)
    }

    /**
     * @summary Refuses a root placement that would dock the arrangement's only pane beside nothing.
     *
     * A root-edge drop wraps the whole arrangement, so when the dragged item IS the whole
     * arrangement the wrap pairs the new pane with an empty half. Tabs and splits vanish in that
     * state — `normalizeTree` deletes them — but an `edge-zone` survives losing every zone on
     * purpose: it stays a resolvable re-attachment anchor
     * ({@link Neo.dashboard.dock.model.WorkspaceDocument#captureNodeHome}). So an edge-zone root is
     * the one target whose empty half would persist in the committed tree, and it is the only case
     * this refuses — a tabs or split root still commits exactly as before.
     *
     * Refused at preview time, not only at commit, so the affordance never promises a drop the
     * document would keep as a stranded half.
     * @param {Object|null} preview
     * @param {String} itemId
     * @returns {Object|null} the preview, or null when it must not be offered
     * @protected
     */
    guardEmptyWrap(preview, itemId) {
        const document = this.owner?.dockModel,
              target   = document?.nodes?.[preview?.target?.nodeId],
              items    = document?.items;

        if (target?.type !== 'edge-zone' || !items) return preview;

        return Object.keys(items).length === 1 && items[itemId] ? null : preview
    }

    /**
     * @summary Publishes the semantic preview and native dwell using the same host-local geometry.
     * @param {Object|null} dockPreview The exact preview the drop path consumes.
     * @param {Object|null} [dwell=null] The native coordinator's hold clock.
     * @returns {Object|null} The published preview.
     */
    renderPreview(dockPreview, dwell=null) {
        const me = this, {preview} = me;

        if (preview) {
            preview.dwell = dwell;
            preview.dockPreview = dockPreview;

            const targetRect = me.previewTargetRect(dockPreview);
            targetRect && preview.applyTargetGeometry(me.localRect(targetRect, me.geometry.hostRect))
        }

        return dockPreview
    }

    /**
     * Consumes the projection's generic `drag:cancel` seam: the main-thread drag owner
     * already suppressed the native release; this retires transient geometry, menu, and
     * preview state.
     */
    onDragCancel() {
        this.clear()
    }

    /**
     * @summary The per-frame drag consumer: the indicator menu follows the hovered
     * zone. {@link #resolvePreview} refreshes candidates when the zone, geometry or dragged subject
     * changes, preserving the menu's child instances. The selected candidate's
     * preview — or the pointer-inference FALLBACK tier when no indicator is hovered — feeds
     * the renderer with its exact target region.
     * @param {Object} data {clientX, clientY, itemId, groupNodeId, sourceNodeId, writeRenderer} —
     *     `groupNodeId` is optional; remote grouped (whole-stack) gestures pass it so the
     *     indicator and fallback previews carry the SAME grouped previewId the cross-window
     *     semantic path produces — the gesture-ready contract reads the trio's agreement.
     *     `writeRenderer` defaults to true; pass false when the caller owns the preview
     *     renderer (the cross-window participation path, whose semantic preview writes the
     *     same renderer synchronously) — the indicator menu + candidate selection still
     *     update, but this async pipeline never clears or replaces a renderer it does not own.
     */
    async onDragMove({clientX, clientY, itemId, groupNodeId = null, sourceNodeId, writeRenderer = true}) {
        let me              = this,
            geometryPromise = me.ensureGeometry(),
            geometry        = await geometryPromise;

        // Generation guard: cancel, re-projection, or teardown invalidates this gesture's
        // geometry mid-await — a late measurement can never resurrect its overlays.
        if (!geometry || me.dragGeometry !== geometryPromise || me.isDestroyed) return;

        const dockPreview = me.resolvePreview({
            groupNodeId, itemId, pointer: {x: clientX, y: clientY}, sourceNodeId
        });

        writeRenderer && me.renderPreview(dockPreview)
    }

    /**
     * @summary Selects the release-point preview only while its measured window geometry is current.
     * A candidate must belong to this gesture's item. An indicator hit wins over pointer inference
     * (the §06 tier order); both commit through `previewToOperation` unchanged. Same-zone
     * pointer drops stay excluded from the fallback (the within-toolbar reorder already
     * handled them); indicator drops keep self-targets (splitting your own zone is real).
     *
     * Generation guard (the supersede review's falsified defect, closed): the geometry
     * await is re-checked against the live session — a gesture cancelled or re-projected
     * mid-await commits nothing, as does a release whose window changed without another hover.
     * @param {Object} data {clientX, clientY, itemId, sourceNodeId}
     */
    async onDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me              = this,
            geometryPromise = me.dragGeometry,
            geometry        = geometryPromise ? await geometryPromise : null;

        if (me.isDestroyed || (geometryPromise && me.dragGeometry !== geometryPromise)) return;

        if (geometryPromise && me.geometrySignature !== me.getGeometrySignature()) {
            me.clear();
            return
        }

        let pointer   = {x: clientX, y: clientY},
            preview   = null,
            candidate = me.indicators?.hitTest(pointer);

        if (candidate?.preview?.itemId === itemId) {
            preview = candidate.preview
        } else if (geometry) {
            preview = me.producer.produce({
                pointer,
                zones: geometry.zones.filter(zone => zone.nodeId !== sourceNodeId),
                itemId,
                root : geometry.root,
                sourceNodeId
            })
        }

        me.clear();

        let descriptor = PreviewContract.previewToOperation(me.guardEmptyWrap(preview, itemId));

        if (descriptor) {
            let result = me.owner.applyDockZoneOperation(descriptor);

            if (result && !result.errors?.length && result.document) {
                me.owner.onDockZoneDocumentChange(result.document)
            }
        }
    }

    /**
     * Retires the session and the producer with the controller — teardown symmetry with
     * {@link #construct}.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.clear();
        me.producer?.destroy();
        me.producer = me.owner = me.host = me.preview = me.indicators = null;

        super.destroy(...args)
    }
}

export default Neo.setupClass(DragAffordances);
