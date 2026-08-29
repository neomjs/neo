import Base                 from '../../../core/Base.mjs';
import Document             from '../model/Document.mjs';
import PreviewProducer      from './PreviewProducer.mjs';
import {previewToOperation} from '../model/PreviewContract.mjs';

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
 * ownership pattern every docking workspace implements. The overlay instances (`preview`,
 * `indicators`) and the dock `host` container are direct instance refs the consumer assigns
 * after composing them — no reference-name coupling, no app imports in this tier.
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
     * Ends a drag affordance session: geometry cache dropped (invalidating every in-flight
     * await's generation token), indicator menu and preview cleared. Called on drop, cancel,
     * teardown, and by every consumer re-projection.
     */
    clear() {
        let me = this;

        me.dragGeometry = null;
        me.indicators?.clear();
        me.preview && (me.preview.dockPreview = null)
    }

    /**
     * Measures the drag-session geometry once per gesture (memoized as a promise so the
     * ~60hz move stream never stacks measurements): the host rect (the overlays' coordinate
     * origin), every projected tabs-zone rect with its parent-split orientation, and the
     * chips' root target — the edge-zone's CENTER node when the document root is an
     * edge-zone, the root itself otherwise.
     * @returns {Promise<Object|null>} {hostRect, zones, root} or null when nothing is measurable
     * @protected
     */
    ensureGeometry() {
        let me = this;

        if (me.dragGeometry) return me.dragGeometry;

        let {host} = me,
            nodes  = me.owner?.dockModel?.nodes || {};

        if (!host) return Promise.resolve(null);

        let zoneEntries = Object.keys(nodes)
                .filter(nodeId => nodes[nodeId].type === 'tabs')
                .map(nodeId => ({nodeId, container: host.down({dockNodeId: nodeId})}))
                .filter(zone => zone.container),
            // a zone entry is a DESCRIPTOR (string | {nodeId}) — the canonical unwrap keeps the
            // producer's fail-closed id guard from silently dropping every root edge chip
            rootId      = nodes[me.owner.dockModel.root]?.type === 'edge-zone'
                ? (Document.getZoneNodeId(nodes[me.owner.dockModel.root].zones?.center) ?? me.owner.dockModel.root)
                : me.owner.dockModel.root;

        me.dragGeometry = host.getDomRect([host.id, ...zoneEntries.map(zone => zone.container.id)]).then(([hostRect, ...zoneRects]) => {
            let geometry = hostRect?.width > 0 && hostRect?.height > 0 && {
                hostRect,
                root : {nodeId: rootId, rect: hostRect},
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
            if (!geometry || geometry.zones.length < 1) {
                me.dragGeometry = null;
                return null
            }

            me.indicators && (me.indicators.hostRect = geometry.hostRect);

            return geometry
        });

        return me.dragGeometry
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
     * Consumes the projection's generic `drag:cancel` seam: the main-thread drag owner
     * already suppressed the native release; this retires transient geometry, menu, and
     * preview state.
     */
    onDragCancel() {
        this.clear()
    }

    /**
     * The per-frame drag consumer (§06 primary tier): the indicator menu follows the hovered
     * zone (candidate set swaps on zone change only — object permanence lets the cross
     * GLIDE); the pointer selects an indicator geometrically; the selected candidate's
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

        let pointer                         = {x: clientX, y: clientY},
            {indicators, preview, producer} = me,
            zone                            = producer.hitTestZone(geometry.zones, pointer);

        if (indicators) {
            if ((zone?.nodeId ?? null) !== (indicators.candidateSet?.zone?.nodeId ?? null)) {
                indicators.candidateSet = zone
                    ? producer.produceCandidates({pointer, zones: geometry.zones, itemId, groupNodeId, sourceNodeId, root: geometry.root})
                    : null
            }
        }

        let candidate   = indicators?.updatePointer(pointer) ?? null,
            dockPreview = candidate?.preview
                ?? producer.produce({pointer, zones: geometry.zones, itemId, groupNodeId, sourceNodeId});

        if (preview && writeRenderer) {
            preview.dockPreview = dockPreview;

            if (dockPreview) {
                let targetRect = dockPreview.target.nodeId === geometry.root.nodeId
                    ? geometry.root.rect
                    : geometry.zones.find(entry => entry.nodeId === dockPreview.target.nodeId)?.rect;

                targetRect && preview.applyTargetGeometry(me.localRect(targetRect, geometry.hostRect))
            }
        }
    }

    /**
     * The drop half: the indicator is re-hit-tested at the RELEASE coordinates — release
     * truth, never cached hover truth — and a candidate only counts when it was built for
     * the item THIS gesture drags. A release-point indicator wins over pointer inference
     * (the §06 tier order); both commit through `previewToOperation` unchanged. Same-zone
     * pointer drops stay excluded from the fallback (the within-toolbar reorder already
     * handled them); indicator drops keep self-targets (splitting your own zone is real).
     *
     * Generation guard (the supersede review's falsified defect, closed): the geometry
     * await is re-checked against the live session — a gesture cancelled or re-projected
     * mid-await commits NOTHING.
     * @param {Object} data {clientX, clientY, itemId, sourceNodeId}
     */
    async onDrop({clientX, clientY, itemId, sourceNodeId}) {
        let me              = this,
            geometryPromise = me.dragGeometry,
            geometry        = geometryPromise ? await geometryPromise : null;

        if (me.isDestroyed || (geometryPromise && me.dragGeometry !== geometryPromise)) return;

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
                sourceNodeId
            })
        }

        me.clear();

        let descriptor = previewToOperation(preview);

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
