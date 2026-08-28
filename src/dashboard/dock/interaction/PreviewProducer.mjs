import Base from '../../../core/Base.mjs';

/**
 * @class Neo.dashboard.dock.interaction.PreviewProducer
 * @extends Neo.core.Base
 *
 * @summary Hit-test producer for the dock drag: maps a pointer plus the rendered dock-zone
 * rects to a runtime-only `neo.harness.dockPreview.v1` payload — the COMPUTE half of the preview →
 * operation pipeline (`learn/agentos/decisions/0029-docking-design.md` §2.3, schema in
 * `learn/agentos/DockZoneModel.md`). It is the object an owning dock workspace wires into
 * {@link Neo.dashboard.dock.window.DragTarget#previewFor} (and, for the boolean claim, `hitTest`);
 * the same compute path serves in-window drags.
 *
 * **Instance + config, not statics (by design).** The geometry thresholds are **non-reactive
 * configs** on the prototype rather than static class fields, so they are tunable per app via
 * `Neo.overwrites`, per instance at `Neo.create` time, and overridable by subclasses — the
 * customization surface `core.Base` exists to provide. The hit-test methods are instance methods
 * for the same reason: a workspace with a different drop grammar subclasses and overrides
 * `resolvePlacementKind` rather than forking the payload assembly. Owners hold one producer instance
 * (`Neo.create(DockPreviewProducer)`) and call `produce()` per hover frame.
 *
 * Boundaries (binding, per the §2.3 / dock-zone-model contracts):
 *
 * - **Pure + runtime-only.** Input is transient geometry (rects, pointer); output is a transient
 *   `dockPreview`. Nothing here is written into the persisted dock-zone model, and the methods have
 *   no side effects — safe to call on every hover frame and inside a `hitTest`.
 * - **Layer-blind.** This producer must not import the renderer (`Neo.dashboard.dock.interaction.Preview`)
 *   renderer/validator. So this producer re-derives the schema's placement vocabulary locally; the
 *   producer → consumer contract is PINNED in the unit test (which may import both layers) by
 *   asserting every produced payload satisfies `DockPreview.isValidPreview`.
 * - **Fail closed.** A malformed rect, a pointer outside every zone, or a missing item id yields
 *   `null` (no affordance) rather than a guess — mirroring the renderer's fail-closed clear.
 *
 * Placement grammar: `tab-into` (interior), `edge-*` (outer bands → split the node), and
 * `split-before`/`split-after` (an edge that runs ALONG the target's own parent-split axis → join
 * that existing split as a sibling, carrying its orientation). An optional split `ratio` is not
 * emitted yet — the consumer defaults an absent ratio to an even split.
 */
class PreviewProducer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.PreviewProducer'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.PreviewProducer',
        /**
         * @member {String} ntype='dock-preview-producer'
         * @protected
         */
        ntype: 'dock-preview-producer',
        /**
         * The dockPreview contract schema this producer emits. A non-reactive config (kept in sync
         * with the consumer via the unit-test pin, since the app-layer validator cannot be imported
         * here) so a future schema revision is a config bump, not a class edit.
         * @member {String} schema='neo.harness.dockPreview.v1'
         */
        schema: 'neo.harness.dockPreview.v1',
        /**
         * The candidate-set schema `produceCandidates()` emits — the full indicator-menu payload.
         * Same sync mechanism as `schema`: the unit-test pin asserts it against the contract module.
         * @member {String} candidatesSchema='neo.harness.dockCandidates.v1'
         */
        candidatesSchema: 'neo.harness.dockCandidates.v1',
        /**
         * Fraction of a zone rect's SMALLER dimension treated as an edge band. Inside a band the
         * nearest edge wins (`edge-*` / `split-*`); the interior maps to `tab-into`. A non-reactive
         * config — not a static field — so the edge-affordance thickness is tunable per app
         * (`Neo.overwrites`), per instance, or per subclass without forking the class. Echoes the
         * renderer's `edgeBandSize` config default at typical pane sizes while staying
         * resolution-independent.
         * @member {Number} edgeBandRatio=0.24
         */
        edgeBandRatio: 0.24,
        /**
         * Pixel height of the tab HEADER STRIP carve-out at a zone's top edge. A drop inside it
         * classifies `tab-into` even within the edge band: dock zones are tabs nodes by
         * construction, and dropping onto the header strip is the most intentional add-as-tab
         * gesture there is — without the carve-out it resolves to a top-edge split. Pixels, not a
         * ratio: header chrome is resolution-fixed UI height. The effective carve-out is capped
         * at HALF the zone height (`min(tabHeaderCarveOutPx, height / 2)`), never disabled: real
         * projected tabs-zone rects run strip-shallow (~44px), where the strip IS most of the
         * zone — the top half stays add-as-tab while the bottom half keeps its edge/interior
         * grammar. Non-reactive config for the same tunability rationale as `edgeBandRatio`.
         * @member {Number} tabHeaderCarveOutPx=36
         */
        tabHeaderCarveOutPx: 36
    }

    /**
     * @summary Pure geometry: which `placement.kind` does `pointer` fall into within one node rect?
     *
     * Five-zone hit-test — the interior maps to `tab-into`, the four outer edge bands to an edge
     * placement. When `orientation` is supplied (the node's PARENT-split axis), an edge that runs
     * along that axis resolves to a sibling insertion in the existing split — `split-before` (the
     * leading edge: left for horizontal, top for vertical) / `split-after` (trailing) — instead of a
     * node-splitting `edge-*`; perpendicular edges stay `edge-*`. Corner ties resolve
     * deterministically in top → bottom → left → right order (stable renderer diffing). Returns
     * `'rejected'` when the pointer is outside the rect or the rect is non-numeric — the fail-closed
     * "no candidate" verdict. Override in a subclass for a different drop grammar.
     * @param {Object|null} rect {x, y, width, height}
     * @param {Object|null} pointer {x, y}
     * @param {String} [orientation] the node's parent-split orientation: `'horizontal'` | `'vertical'`
     * @returns {String} a `split-*` / `edge-*` kind, `'tab-into'`, or `'rejected'`
     */
    resolvePlacementKind(rect, pointer, orientation) {
        if (!rect || !pointer) return 'rejected';

        let {height, width, x, y} = rect,
            {x: px, y: py}        = pointer;

        if ([height, width, x, y, px, py].some(v => typeof v !== 'number' || Number.isNaN(v))) return 'rejected';
        if (width <= 0 || height <= 0)                                                          return 'rejected';
        if (px < x || px > x + width || py < y || py > y + height)                              return 'rejected';

        let band    = this.edgeBandRatio * Math.min(width, height),
            dTop    = py - y,
            dBottom = (y + height) - py,
            dLeft   = px - x,
            dRight  = (x + width) - px,
            nearest = Math.min(dTop, dBottom, dLeft, dRight);

        // Header-strip carve-out: the tab header band at the zone's top IS the tab-into
        // affordance — it wins over EVERYTHING the top edge could otherwise mean (edge-top
        // split AND the along-axis split-before), because the strip row renders at the zone's
        // top at every projected scale: strip-shallow rects (~44px, band ≈ 10px — where a
        // fits-inside-the-band precondition classified the primary journey as a split) and
        // pane-tall rects alike. Capped at half the zone height, never disabled; the bottom
        // half always keeps the edge/interior grammar, so bottom-edge splits and split-after
        // sibling inserts stay reachable everywhere. A top-side sibling-insert affordance, if
        // ever wanted, belongs to an explicit indicator idiom — not to pointer inference over
        // the strip row.
        if (dTop <= Math.min(this.tabHeaderCarveOutPx, height / 2)) return 'tab-into';

        if (nearest > band) return 'tab-into';

        let edge = nearest === dTop ? 'top' : nearest === dBottom ? 'bottom' : nearest === dLeft ? 'left' : 'right';

        // A node already inside a split becomes a before/after sibling along that split's OWN axis
        // (join the existing split); the perpendicular edges split the node itself (`edge-*`).
        if (orientation === 'horizontal' && (edge === 'left' || edge === 'right')) return edge === 'left' ? 'split-before' : 'split-after';
        if (orientation === 'vertical'   && (edge === 'top'  || edge === 'bottom')) return edge === 'top'  ? 'split-before' : 'split-after';

        return `edge-${edge}`
    }

    /**
     * @summary Finds the innermost dock zone whose rect contains `pointer`, or null.
     *
     * Zones are expected already ordered outermost → innermost (the adapter projects them in tree
     * order); the LAST containing rect wins so a nested tabs/split node beats its ancestor. Skips
     * malformed entries rather than throwing. Containment is orientation-independent, so the parent
     * axis is not needed here — only `produce()` needs it to label the placement.
     * @param {Object[]|null} zones [{nodeId, rect, orientation?, type?}]
     * @param {Object|null} pointer {x, y}
     * @returns {Object|null} the winning zone, or null when the pointer is over none
     */
    hitTestZone(zones, pointer) {
        if (!Array.isArray(zones) || !pointer) return null;

        let hit = null;

        for (let zone of zones) {
            if (zone && typeof zone.nodeId === 'string' && this.resolvePlacementKind(zone.rect, pointer) !== 'rejected') {
                hit = zone
            }
        }

        return hit
    }

    /**
     * @summary Produces a schema-valid `dockPreview.v1` for a hover, or null outside all affordances.
     *
     * Hit-tests the pointer against `zones`, resolves the `placement.kind` (using the winning zone's
     * `orientation` for split-vs-edge), and assembles the runtime-only payload. Split placements
     * carry `placement.orientation` (contract-required). `previewId` is deterministic
     * (`preview:<item>:<node>:<kind>`) so repeat frames over the same candidate are stable for
     * renderer diffing — no time/random source. Returns null (not a `rejected` payload) when there
     * is no zone under the pointer or the item id is missing: no candidate, no affordance.
     * @param {Object} params
     * @param {Object} params.pointer {x, y} window-local pointer
     * @param {Object[]} params.zones [{nodeId, rect, orientation?}] rendered dock-zone rects, outer → inner
     * @param {String} params.itemId the representative dragged dock item id
     * @param {String} [params.groupNodeId] runtime-only whole-stack source node id
     * @param {String} [params.containerId] the hovered workspace/container id
     * @param {Object} [params.source] producer surface, e.g. {surface, sortZoneId}
     * @param {String} [params.sourceNodeId] the drag's origin dock node (used as sortZoneId fallback)
     * @returns {Object|null} a `neo.harness.dockPreview.v1` payload, or null
     */
    produce({pointer, zones, itemId, groupNodeId=null, containerId=null, source=null, sourceNodeId=null}={}) {
        if (typeof itemId !== 'string' || !itemId ||
            (groupNodeId != null && (typeof groupNodeId !== 'string' || !groupNodeId))) return null;

        let zone = this.hitTestZone(zones, pointer);

        if (!zone) return null;

        let kind = this.resolvePlacementKind(zone.rect, pointer, zone.orientation);

        if (kind === 'rejected') return null;

        return this.buildPreview({containerId, groupNodeId, itemId, source, sourceNodeId}, zone.nodeId, kind, zone.orientation)
    }

    /**
     * @summary Assembles one schema-valid dockPreview payload for a resolved placement.
     *
     * The single payload-assembly path shared by the pointer-inference `produce()` and the
     * indicator-menu `produceCandidates()`, so an indicator candidate and the pointer-inferred
     * preview for the same placement are IDENTICAL objects field-for-field — including the
     * deterministic `previewId` (`preview:<item>:<node>:<kind>` or
     * `preview:group:<groupNodeId>:<node>:<kind>`) the renderer diffs on.
     * @param {Object} params {itemId, groupNodeId, containerId, source, sourceNodeId} as passed to the producer entry points
     * @param {String} nodeId the target dock node
     * @param {String} kind a non-`rejected` placement kind
     * @param {String} [orientation] the target's parent-split orientation (required for `split-*` kinds)
     * @returns {Object} a `neo.harness.dockPreview.v1` payload
     * @protected
     */
    buildPreview({containerId=null, groupNodeId=null, itemId, source=null, sourceNodeId=null}, nodeId, kind, orientation) {
        let placement = {kind},
            subjectId = groupNodeId ? `group:${groupNodeId}` : itemId;

        if (kind === 'split-before' || kind === 'split-after') {
            placement.orientation = orientation
        }

        return {
            schema   : this.schema,
            previewId: `preview:${subjectId}:${nodeId}:${kind}`,
            itemId,
            ...(groupNodeId ? {groupNodeId} : {}),
            source  : source ?? {surface: 'dashboard-sort-zone', sortZoneId: sourceNodeId},
            target  : {containerId, nodeId},
            placement,
            feedback: {state: 'accepted'}
        }
    }

    /**
     * @summary Maps one indicator-cross direction to its placement kind — the same grammar rule
     * `resolvePlacementKind()` applies to edge bands.
     *
     * `center` is the tab-merge. A direction that runs ALONG the zone's parent-split axis joins
     * that existing split as a sibling (`split-before`/`split-after`); a perpendicular (or
     * orientation-less) direction splits the node itself (`edge-*`). Keeping the mapping identical
     * to the pointer grammar means the indicator menu can never offer an operation the fallback
     * tier would have resolved differently.
     * @param {String} direction `'center'` | `'top'` | `'right'` | `'bottom'` | `'left'`
     * @param {String} [orientation] the zone's parent-split orientation: `'horizontal'` | `'vertical'`
     * @returns {String} a placement kind, or `'rejected'` for an unknown direction
     * @protected
     */
    directionKind(direction, orientation) {
        if (direction === 'center') return 'tab-into';

        if (!['top', 'right', 'bottom', 'left'].includes(direction)) return 'rejected';

        if (orientation === 'horizontal' && (direction === 'left' || direction === 'right')) {
            return direction === 'left' ? 'split-before' : 'split-after'
        }

        if (orientation === 'vertical' && (direction === 'top' || direction === 'bottom')) {
            return direction === 'top' ? 'split-before' : 'split-after'
        }

        return `edge-${direction}`
    }

    /**
     * @summary Produces the full drop-candidate set for the zone under the pointer — the
     * indicator-menu payload (`neo.harness.dockCandidates.v1`) — or null outside every zone.
     *
     * The menu grammar (design authority: the dock-choreography artifact §06): a 5-position CROSS
     * on the hovered zone — center = tab-merge, the four directions = directional splits, each
     * resolved through the SAME orientation rule as pointer inference — plus container edge CHIPS
     * targeting the document root (always `edge-*`: the root is nobody's split child). Every
     * candidate wraps a complete `dockPreview.v1` payload, so hovering an indicator feeds the
     * existing renderer and dropping commits through `previewToOperation` unchanged.
     *
     * `root` is caller-supplied ({nodeId, rect}): existing zone arrays measure tabs nodes only, and
     * only the owning workspace knows its document root + host geometry. Chips are omitted
     * (`root: null`) when no root is supplied OR the hovered zone IS the root node — the cross
     * already offers that node's placements; duplicate affordances would only add noise.
     *
     * Pure + runtime-only + fail-closed, like every other producer path: no zone under the pointer,
     * or a missing item id, yields null (no menu) rather than a guess.
     * @param {Object} params
     * @param {Object} params.pointer {x, y} window-local pointer
     * @param {Object[]} params.zones [{nodeId, rect, orientation?}] rendered dock-zone rects, outer → inner
     * @param {String} params.itemId the representative dragged dock item id
     * @param {String} [params.groupNodeId] runtime-only whole-stack source node id
     * @param {String} [params.containerId] the hovered workspace/container id
     * @param {Object} [params.source] producer surface, e.g. {surface, sortZoneId}
     * @param {String} [params.sourceNodeId] the drag's origin dock node
     * @param {Object} [params.root] {nodeId, rect} the document root + its measured rect (enables the edge chips)
     * @returns {Object|null} a `neo.harness.dockCandidates.v1` payload, or null
     */
    produceCandidates({pointer, zones, itemId, groupNodeId=null, containerId=null, source=null, sourceNodeId=null, root=null}={}) {
        if (typeof itemId !== 'string' || !itemId ||
            (groupNodeId != null && (typeof groupNodeId !== 'string' || !groupNodeId))) return null;

        let me   = this,
            zone = me.hitTestZone(zones, pointer);

        if (!zone) return null;

        let params = {containerId, groupNodeId, itemId, source, sourceNodeId},
            cross  = ['center', 'top', 'right', 'bottom', 'left'].map(position => ({
                position,
                preview: me.buildPreview(params, zone.nodeId, me.directionKind(position, zone.orientation), zone.orientation)
            })),
            rootOut = null;

        if (root && typeof root.nodeId === 'string' && root.nodeId && root.rect && root.nodeId !== zone.nodeId) {
            rootOut = {
                nodeId: root.nodeId,
                rect  : root.rect,
                chips : ['top', 'right', 'bottom', 'left'].map(edge => ({
                    edge,
                    preview: me.buildPreview(params, root.nodeId, `edge-${edge}`)
                }))
            }
        }

        return {
            schema: me.candidatesSchema,
            itemId,
            ...(groupNodeId ? {groupNodeId} : {}),
            zone: {nodeId: zone.nodeId, rect: zone.rect, orientation: zone.orientation ?? null},
            cross,
            root: rootOut
        }
    }
}

export default Neo.setupClass(PreviewProducer);
