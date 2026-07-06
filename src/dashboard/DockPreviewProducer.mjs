import Base from '../core/Base.mjs';

/**
 * @class Neo.dashboard.DockPreviewProducer
 * @extends Neo.core.Base
 *
 * @summary Hit-test producer for the harness dock drag: maps a pointer plus the rendered dock-zone
 * rects to a runtime-only `neo.harness.dockPreview.v1` payload — the COMPUTE half of the preview →
 * operation pipeline (`learn/agentos/decisions/0029-harness-docking-design.md` §2.3, schema in
 * `learn/agentos/HarnessDockZoneModel.md`). It is the object an owning dock workspace wires into
 * {@link Neo.dashboard.CrossWindowDragTarget#previewFor} (and, for the boolean claim, `hitTest`);
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
 * - **Layer-blind.** `src/dashboard/` must not import the app-layer `AgentOS.view.DockPreview`
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
class DockPreviewProducer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockPreviewProducer'
         * @protected
         */
        className: 'Neo.dashboard.DockPreviewProducer',
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
         * Fraction of a zone rect's SMALLER dimension treated as an edge band. Inside a band the
         * nearest edge wins (`edge-*` / `split-*`); the interior maps to `tab-into`. A non-reactive
         * config — not a static field — so the edge-affordance thickness is tunable per app
         * (`Neo.overwrites`), per instance, or per subclass without forking the class. Echoes the
         * renderer's fixed `edgeBandSize` at typical pane sizes while staying resolution-independent.
         * @member {Number} edgeBandRatio=0.24
         */
        edgeBandRatio: 0.24
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
     * @param {String} params.itemId the dragged dock item id
     * @param {String} [params.containerId] the hovered workspace/container id
     * @param {Object} [params.source] producer surface, e.g. {surface, sortZoneId}
     * @param {String} [params.sourceNodeId] the drag's origin dock node (used as sortZoneId fallback)
     * @returns {Object|null} a `neo.harness.dockPreview.v1` payload, or null
     */
    produce({pointer, zones, itemId, containerId=null, source=null, sourceNodeId=null}={}) {
        if (typeof itemId !== 'string' || !itemId) return null;

        let zone = this.hitTestZone(zones, pointer);

        if (!zone) return null;

        let kind = this.resolvePlacementKind(zone.rect, pointer, zone.orientation);

        if (kind === 'rejected') return null;

        let placement = {kind};

        if (kind === 'split-before' || kind === 'split-after') {
            placement.orientation = zone.orientation
        }

        return {
            schema   : this.schema,
            previewId: `preview:${itemId}:${zone.nodeId}:${kind}`,
            itemId,
            source   : source ?? {surface: 'dashboard-sort-zone', sortZoneId: sourceNodeId},
            target   : {containerId, nodeId: zone.nodeId},
            placement,
            feedback : {state: 'accepted'}
        }
    }
}

export default Neo.setupClass(DockPreviewProducer);
