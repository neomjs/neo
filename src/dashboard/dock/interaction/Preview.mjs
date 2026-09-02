import Component                from '../../../component/Base.mjs';
import * as dockPreviewContract from '../model/PreviewContract.mjs';

/**
 * @class Neo.dashboard.dock.interaction.Preview
 * @extends Neo.component.Base
 *
 * @summary Drag-time dock preview renderer — the app-neutral overlay every docking workspace composes.
 *
 * Consumes the runtime-only `dockPreview` contract object
 * (schema `neo.dock.preview.v1`, specified in `learn/agentos/DockZoneModel.md`)
 * and projects its candidate `placement` into a single transient visual affordance — an edge
 * band, a split guide, or a tab indicator — over the dock workspace while a pane is dragged.
 *
 * Boundaries (binding, per the dock-zone model contract):
 *
 * - **Visual only.** This overlay never owns pointer events and never adds a parallel drag
 *   system. The existing dashboard / sort-zone drag lifecycle is the single event source; the
 *   overlay is purely reactive to a `dockPreview` produced upstream and to drag-lifecycle
 *   terminals (drag end / boundary exit) wired via {@link Neo.dashboard.dock.interaction.Preview#bindDragSource}.
 * - **Runtime only.** `dockPreview` payloads, `DOMRect`s, screen coordinates and overlay nodes are
 *   never written into the persisted dock-zone model. This component has no write path to a
 *   persisted model — it reads a preview and emits transient VDOM plus operation descriptors.
 * - **Fail closed.** A missing, malformed, stale or `rejected`-placement preview clears the
 *   affordance and performs no model mutation ({@link Neo.dashboard.dock.interaction.Preview.isValidPreview}).
 * - **Semantic drop.** On an accepted drop the owning adapter converts the preview into a semantic
 *   operation (`moveItem` / `splitNode` / `addTab`); {@link Neo.dashboard.dock.interaction.Preview.previewToOperation}
 *   yields that operation DESCRIPTOR — this overlay never mutates the dock tree itself.
 *
 * The producer (raw drag geometry -> `dockPreview`) and the operation executor (descriptor ->
 * persisted-tree mutation) are deliberately out of scope: they are separate docking leaves.
 */
class Preview extends Component {
    /**
     * The dockPreview contract schema this renderer accepts.
     * @member {String} PREVIEW_SCHEMA='neo.dock.preview.v1'
     * @static
     */
    static PREVIEW_SCHEMA = dockPreviewContract.PREVIEW_SCHEMA
    /**
     * Every candidate `placement.kind` the contract defines.
     * @member {Set<String>} VALID_PLACEMENT_KINDS
     * @static
     */
    static VALID_PLACEMENT_KINDS = dockPreviewContract.VALID_PLACEMENT_KINDS
    /**
     * @member {Set<String>} EDGE_KINDS
     * @static
     */
    static EDGE_KINDS = dockPreviewContract.EDGE_KINDS
    /**
     * @member {Set<String>} SPLIT_KINDS
     * @static
     */
    static SPLIT_KINDS = dockPreviewContract.SPLIT_KINDS
    /**
     * @member {Set<String>} TAB_KINDS
     * @static
     */
    static TAB_KINDS = dockPreviewContract.TAB_KINDS

    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.Preview'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.Preview',
        /**
         * @member {String} ntype='dock-preview'
         * @protected
         */
        ntype: 'dock-preview',
        /**
         * @member {String[]} baseCls=['neo-dock-preview']
         * @protected
         */
        baseCls: ['neo-dock-preview'],
        /**
         * The transient dockPreview contract object to render, or null to clear the overlay.
         * Runtime-only state — never serialized into the persisted dock-zone model.
         * @member {Object|null} dockPreview_=null
         * @reactive
         */
        dockPreview_: null,
        /**
         * The hold clock of a native-titlebar hover — `{armedAt, durationMs}` — or null. While set,
         * the affordance paints the hold running out (a rising fill over `durationMs`, starting from
         * `armedAt`), so a user resting a popup on a zone sees that waiting is the gesture. The
         * coordinator publishes it with every native hover frame and the writer sets it before the
         * preview; the fill and the commit therefore read one clock. Runtime-only.
         * @member {Object|null} dwell_=null
         * @reactive
         */
        dwell_: null,
        /**
         * Thickness in px of an edge-zone affordance band. The overlay clamps it to the target
         * rect, so an oversized value degrades gracefully; consumers tune it per instance for
         * their hardware / UI density (touch surfaces want wider bands).
         * @member {Number} edgeBandSize=24
         */
        edgeBandSize: 24,
        /**
         * True paints split and edge placements as the RESULT REGION — the half of the target
         * the new pane would occupy, drawn with a uniform border. The exact cut survives as the
         * stamped `neo-dock-preview-cut-<side>` class only: the region's inner edge IS
         * the future splitter position. False restores the thin insertion-line presentation. The pane
         * center (tab-into) always paints the full-zone region; this config only widens the
         * directional placements to match, so the whole preview language shows outcomes
         * instead of cuts. Read per frame — a runtime flip applies on the next hover move.
         * @member {Boolean} resultRegionPreviews_=true
         * @reactive
         */
        resultRegionPreviews_: true,
        /**
         * Thickness in px of a split / tab guide line. Per-instance policy, same rationale as
         * {@link Neo.dashboard.dock.interaction.Preview#edgeBandSize}.
         * @member {Number} splitLineSize=6
         */
        splitLineSize: 6
    }

    /**
     * The drag surface this overlay listens to for lifecycle-terminal cleanup. Wired via
     * {@link Neo.dashboard.dock.interaction.Preview#bindDragSource}; never a pointer-owning surface of our own.
     * @member {Object|null} dragSource=null
     * @protected
     */
    dragSource = null

    /**
     * @summary Structural validity gate for a dockPreview object (fail-closed).
     *
     * Returns true only for a well-formed `neo.dock.preview.v1` payload that carries a
     * stable `itemId`, a `target.nodeId`, a known `placement.kind`, an accept/reject
     * `feedback.state`, and (for split placements) a valid `placement.orientation`. Anything
     * malformed, partial or unknown returns false so the renderer clears rather than guesses.
     * @param {Object|null} preview
     * @returns {Boolean}
     * @static
     */
    static isValidPreview(preview) {
        return dockPreviewContract.isValidPreview(preview)
    }

    /**
     * @summary Maps a dockPreview into a renderable affordance descriptor, or null.
     *
     * Returns null for an invalid preview or a `rejected` placement (no candidate to draw).
     * Otherwise returns a descriptor naming the affordance `group` (edge / split / tab), the
     * concrete `kind`, the target ids, and whether the hover is `accepted` (a `feedback.state`
     * of `rejected` still renders the candidate, flagged so the UI can show a denied state).
     * @param {Object|null} preview
     * @returns {Object|null}
     * @static
     */
    static mapPreviewToAffordance(preview) {
        if (!this.isValidPreview(preview)) return null;

        let {feedback, itemId, placement, target} = preview,
            {kind}                                = placement;

        if (kind === 'rejected') return null;

        let base = {
            accepted    : feedback.state === 'accepted',
            containerId : target.containerId ?? null,
            itemId,
            kind,
            targetNodeId: target.nodeId
        };

        if (this.EDGE_KINDS.has(kind)) {
            let edge     = kind.slice('edge-'.length),
                position = dockPreviewContract.edgeSplitPosition(edge);

            // The fraction the NEW pane commits to, resolved through the same authority
            // `previewToOperation` uses, so the region cannot paint a size the drop will not produce.
            return {...base, group: 'edge', edge, ratio: this.newNodeFraction(placement.ratio, position)}
        }

        if (this.SPLIT_KINDS.has(kind)) {
            let position = kind.slice('split-'.length);

            return {
                ...base,
                group      : 'split',
                orientation: placement.orientation,
                position,
                ratio      : this.newNodeFraction(placement.ratio, position)
            }
        }

        return {...base, group: 'tab', index: Number.isInteger(placement.index) ? placement.index : null, position: kind.slice('tab-'.length)}
    }

    /**
     * @summary Converts an ACCEPTED drop into a semantic dock-zone operation descriptor, or null.
     *
     * The renderer never mutates the dock tree; it routes an accepted preview into one of the
     * contract's semantic operations (`addTab` / `splitNode`) so the owning adapter can commit it.
     * Invalid previews, `rejected` placements, and non-accepted feedback all yield null (no commit).
     * Tab placements emit `addTab`; the adapter downgrades to `moveItem` when the item already
     * lives in the tree. Edge placements route to `splitNode` (the adapter may instead realise an
     * edge-zone insertion, then `normalizeTree`).
     * @param {Object|null} preview
     * @returns {Object|null}
     * @static
     */
    static previewToOperation(preview) {
        return dockPreviewContract.previewToOperation(preview)
    }

    /**
     * @summary Normalizes an optional split ratio into a two-child, sum-to-one size pair.
     * @param {Number} [ratio] the new node's fraction; defaults to an even split when absent/invalid
     * @param {String} position 'before' | 'after' — which child the new node becomes
     * @returns {Number[]} normalized [first, second] sizes summing to 1
     * @static
     */
    static ratioToSizes(ratio, position) {
        return dockPreviewContract.ratioToSizes(ratio, position)
    }

    /**
     * @summary The fraction of the target axis the NEW pane will occupy.
     *
     * Reads the committed size pair rather than the raw ratio, so an absent or out-of-domain ratio
     * lands on whatever `ratioToSizes` normalizes it to. `before` places the new node first, `after`
     * second — the pair is indexed accordingly rather than re-deriving the ratio.
     * @param {Number} [ratio] the new node's fraction; normalized by `ratioToSizes`
     * @param {String} position `'before'` or `'after'`
     * @returns {Number}
     * @static
     */
    /**
     * @summary The already-resolved region fraction on an affordance, or the even split.
     *
     * An affordance built before this field existed, or one whose fraction fell out of domain, paints
     * halves — the previous behaviour — rather than collapsing the region to nothing.
     * @param {Object|null} affordance
     * @returns {Number}
     * @static
     */
    static regionFraction(affordance) {
        let ratio = affordance?.ratio;

        return (typeof ratio === 'number' && ratio > 0 && ratio < 1) ? ratio : 0.5
    }

    /**
     * @summary The fraction of the target axis the NEW pane will occupy.
     *
     * Reads the committed size pair rather than the raw ratio, so an absent or out-of-domain ratio
     * lands on whatever `ratioToSizes` normalizes it to. `before` places the new node first, `after`
     * second — the pair is indexed accordingly rather than re-deriving the ratio.
     * @param {Number} [ratio] the new node's fraction; normalized by `ratioToSizes`
     * @param {String} position `'before'` or `'after'`
     * @returns {Number}
     * @static
     */
    static newNodeFraction(ratio, position) {
        let sizes = this.ratioToSizes(ratio, position);

        return position === 'after' ? sizes[1] : sizes[0]
    }

    /**
     * @summary Pure geometry: projects an affordance onto a target node rect.
     *
     * Given an affordance descriptor and the target node's runtime rect, returns the overlay box
     * ({x, y, width, height}) for the edge band, split guide line, or tab indicator. Returns null
     * when the rect is absent or non-numeric — the renderer simply skips positioning, never throws.
     * The rect is runtime-only input; it is never persisted.
     * @param {Object|null} affordance
     * @param {Object|null} targetRect {x, y, width, height}
     * @param {Object} [options] sizing policy — instances pass their configs; the defaults are
     *     this pure helper's own contract for bare static calls
     * @param {Number} [options.edgeBandSize=24]
     * @param {Number} [options.splitLineSize=6]
     * @returns {Object|null}
     * @static
     */
    static affordanceGeometry(affordance, targetRect, {edgeBandSize = 24, resultRegionPreviews = true, splitLineSize = 6} = {}) {
        if (!affordance || !targetRect) return null;

        let {height, width, x, y} = targetRect;

        if ([height, width, x, y].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;

        let band = Math.min(edgeBandSize, width, height),
            line = splitLineSize;

        if (affordance.group === 'edge') {
            // region mode paints the fraction the new pane would occupy toward that edge — the
            // outcome, not the strip; line mode keeps the classic band affordance
            if (resultRegionPreviews) {
                let fraction = Preview.regionFraction(affordance),
                    regionW  = width  * fraction,
                    regionH  = height * fraction;

                switch (affordance.edge) {
                    case 'top'   : return {x, y, width, height: regionH};
                    case 'bottom': return {x, y: y + height - regionH, width, height: regionH};
                    case 'left'  : return {x, y, width: regionW, height};
                    case 'right' : return {x: x + width - regionW, y, width: regionW, height}
                }
            }

            switch (affordance.edge) {
                case 'top'   : return {x, y, width, height: band};
                case 'bottom': return {x, y: y + height - band, width, height: band};
                case 'left'  : return {x, y, width: band, height};
                case 'right' : return {x: x + width - band, y, width: band, height}
            }
        }

        if (affordance.group === 'split') {
            if (resultRegionPreviews) {
                // the new sibling's share along the split axis: before = first child, after = second
                let fraction = Preview.regionFraction(affordance);

                if (affordance.orientation === 'horizontal') {
                    let regionW = width * fraction;

                    return {x: affordance.position === 'after' ? x + width - regionW : x, y, width: regionW, height}
                }

                let regionH = height * fraction;

                return {x, y: affordance.position === 'after' ? y + height - regionH : y, width, height: regionH}
            }

            if (affordance.orientation === 'horizontal') {
                // children side-by-side -> a vertical guide on the left (before) / right (after)
                return {x: affordance.position === 'after' ? x + width - line : x, y, width: line, height}
            }
            // stacked -> a horizontal guide on the top (before) / bottom (after)
            return {x, y: affordance.position === 'after' ? y + height - line : y, width, height: line}
        }

        // tab: 'into' highlights the whole tabs node; before/after is a marker at the node edge
        if (affordance.position === 'into') {
            return {x, y, width, height}
        }

        return {x: affordance.position === 'after' ? x + width - line : x, y, width: line, height}
    }

    /**
     * @summary The region's INNER edge — where the actual cut (the future splitter) sits.
     *
     * A result region occupies one half of its target; the boundary facing the remaining half
     * carries the exact-cut information the old insertion line encoded. Returns the side name
     * for the accent class, or null for non-directional affordances (tab placements).
     * @param {Object|null} affordance
     * @returns {String|null} 'top' | 'right' | 'bottom' | 'left' | null
     * @static
     */
    static cutSide(affordance) {
        if (!affordance) return null;

        if (affordance.group === 'edge') {
            return {top: 'bottom', bottom: 'top', left: 'right', right: 'left'}[affordance.edge] ?? null
        }

        if (affordance.group === 'split') {
            return affordance.orientation === 'horizontal'
                ? (affordance.position === 'after' ? 'left' : 'right')
                : (affordance.position === 'after' ? 'top'  : 'bottom')
        }

        return null
    }

    /**
     * @summary Re-renders the overlay whenever the dockPreview changes (or clears it when null).
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetDockPreview(value, oldValue) {
        let me         = this,
            affordance = Preview.mapPreviewToAffordance(value);

        me.vdom.cn = affordance ? [me.getAffordanceVdom(affordance)] : [];
        me.update()
    }

    /**
     * @summary Re-renders the current affordance when the hold clock arrives, changes, or clears.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetDwell(value, oldValue) {
        let me = this;

        // The writer sets the clock before the preview, so the common case renders once through
        // afterSetDockPreview; this covers a clock that arrives or leaves while a preview stands.
        if (me.dockPreview && (value?.armedAt !== oldValue?.armedAt || value?.durationMs !== oldValue?.durationMs)) {
            me.afterSetDockPreview(me.dockPreview, me.dockPreview)
        }
    }

    /**
     * @summary Positions the current affordance over a supplied target rect (runtime-only).
     *
     * The producer / live-drag integration calls this with the target node's measured rect so the
     * overlay aligns to the real dock zone. No-op when there is no active affordance or the rect
     * cannot be mapped — geometry never throws and the rect is never persisted.
     * @param {Object|null} targetRect {x, y, width, height}
     */
    applyTargetGeometry(targetRect) {
        let me         = this,
            affordance = Preview.mapPreviewToAffordance(me.dockPreview),
            node       = me.vdom.cn?.[0];

        if (!affordance || !node) return;

        let geo = Preview.affordanceGeometry(affordance, targetRect, {
            edgeBandSize        : me.edgeBandSize,
            resultRegionPreviews: me.resultRegionPreviews,
            splitLineSize       : me.splitLineSize
        });

        if (!geo) return;

        node.style = {
            ...node.style,
            height  : `${geo.height}px`,
            left    : `${geo.x}px`,
            position: 'absolute',
            top     : `${geo.y}px`,
            width   : `${geo.width}px`
        };

        me.update()
    }

    /**
     * @summary Wires the overlay's cleanup to an existing drag surface's lifecycle terminals.
     *
     * Listens to `dragEnd` (release or cancel) and `dragBoundaryExit` (leave) on the supplied drag
     * surface and clears the transient overlay on either. This is the ONLY coupling to the drag
     * lifecycle: the overlay consumes existing signals and owns no pointer events of its own.
     * @param {Object|null} dragSource a Neo.draggable sort/drag zone (or any Observable)
     * @returns {Neo.dashboard.dock.interaction.Preview} this, for chaining
     */
    bindDragSource(dragSource) {
        let me = this;

        me.unbindDragSource();
        me.dragSource = dragSource || null;

        if (me.dragSource?.on) {
            me.dragSource.on('dragEnd',          me.clearPreview, me);
            me.dragSource.on('dragBoundaryExit', me.clearPreview, me)
        }

        return me
    }

    /**
     * @summary Clears the transient overlay. Performs no model mutation.
     */
    clearPreview() {
        this.dockPreview = null
    }

    /**
     * @summary Unbinds the drag-source lifecycle listeners before delegating to the base destroy,
     * so the overlay never leaves dangling `dragEnd` / `dragBoundaryExit` handlers on the drag
     * surface it was bound to.
     * @param {...*} args forwarded to {@link Neo.component.Base#destroy}
     */
    destroy(...args) {
        this.unbindDragSource();
        super.destroy(...args)
    }

    /**
     * @summary Builds the transient affordance VDOM node from a descriptor.
     *
     * The node carries semantic classes (group + concrete kind + accept/reject) and the target
     * node id as a data attribute; positioning is applied separately via
     * {@link Neo.dashboard.dock.interaction.Preview#applyTargetGeometry}. The overlay is pointer-transparent so
     * it never intercepts the live drag.
     * @param {Object} affordance
     * @returns {Object} VDOM node
     */
    getAffordanceVdom(affordance) {
        let me      = this,
            region  = me.resultRegionPreviews && (affordance.group === 'split' || affordance.group === 'edge'),
            cutSide = region ? Preview.cutSide(affordance) : null,
            // the hold clock paints only on an accepted zone: a rejected region is not a place the
            // hold could land, so it must not look like a timer running towards a drop
            dwell   = affordance.accepted && me.dwell?.durationMs > 0 ? me.dwell : null,
            elapsed = dwell ? Math.max(0, Math.min(dwell.durationMs, Date.now() - (dwell.armedAt ?? Date.now()))) : 0;

        return {
            cls: [
                'neo-dock-preview-affordance',
                `neo-dock-preview-${affordance.group}`,
                `neo-dock-preview-${affordance.kind}`,
                affordance.accepted ? 'neo-dock-preview-accepted' : 'neo-dock-preview-rejected',
                // region mode routes directional placements into the filled-region visual
                // family; the cut-side class thickens the border on the region's inner edge,
                // preserving the exact-cut information the insertion line used to carry
                ...(region  ? ['neo-dock-preview-region'] : []),
                ...(cutSide ? [`neo-dock-preview-cut-${cutSide}`] : []),
                ...(dwell   ? ['neo-dock-preview-dwelling'] : [])
            ],
            'data-dock-target': affordance.targetNodeId,
            style             : {
                pointerEvents: 'none',
                // the fill's duration and the time already spent, so a node rebuilt mid-hold resumes
                // at the right height (the stylesheet applies the elapsed time as a negative delay)
                ...(dwell ? {
                    '--dock-native-dwell-ms'     : `${dwell.durationMs}ms`,
                    '--dock-native-dwell-elapsed': `${elapsed}ms`
                } : {})
            }
        }
    }

    /**
     * @summary Removes any previously bound drag-surface listeners.
     */
    unbindDragSource() {
        let me = this;

        if (me.dragSource?.un) {
            me.dragSource.un('dragEnd',          me.clearPreview, me);
            me.dragSource.un('dragBoundaryExit', me.clearPreview, me)
        }

        me.dragSource = null
    }
}

export default Neo.setupClass(Preview);
