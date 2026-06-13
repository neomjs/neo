import Component from '../../../src/component/Base.mjs';

/**
 * @class AgentOS.view.DockPreview
 * @extends Neo.component.Base
 *
 * @summary Drag-time dock preview renderer for the Agent Harness.
 *
 * Consumes the runtime-only `dockPreview` contract object
 * (schema `neo.harness.dockPreview.v1`, specified in `learn/agentos/HarnessDockZoneModel.md`)
 * and projects its candidate `placement` into a single transient visual affordance — an edge
 * band, a split guide, or a tab indicator — over the harness workspace while a pane is dragged.
 *
 * Boundaries (binding, per the dock-zone model contract):
 *
 * - **Visual only.** This overlay never owns pointer events and never adds a parallel drag
 *   system. The existing dashboard / sort-zone drag lifecycle is the single event source; the
 *   overlay is purely reactive to a `dockPreview` produced upstream and to drag-lifecycle
 *   terminals (drag end / boundary exit) wired via {@link AgentOS.view.DockPreview#bindDragSource}.
 * - **Runtime only.** `dockPreview` payloads, `DOMRect`s, screen coordinates and overlay nodes are
 *   never written into the persisted dock-zone model. This component has no write path to a
 *   persisted model — it reads a preview and emits transient VDOM plus operation descriptors.
 * - **Fail closed.** A missing, malformed, stale or `rejected`-placement preview clears the
 *   affordance and performs no model mutation ({@link AgentOS.view.DockPreview.isValidPreview}).
 * - **Semantic drop.** On an accepted drop the owning adapter converts the preview into a semantic
 *   operation (`moveItem` / `splitNode` / `addTab`); {@link AgentOS.view.DockPreview.previewToOperation}
 *   yields that operation DESCRIPTOR — this overlay never mutates the dock tree itself.
 *
 * The producer (raw drag geometry -> `dockPreview`) and the operation executor (descriptor ->
 * persisted-tree mutation) are deliberately out of scope: they are separate docking leaves.
 */
class DockPreview extends Component {
    /**
     * The dockPreview contract schema this renderer accepts.
     * @member {String} PREVIEW_SCHEMA='neo.harness.dockPreview.v1'
     * @static
     */
    static PREVIEW_SCHEMA = 'neo.harness.dockPreview.v1'
    /**
     * Every candidate `placement.kind` the contract defines.
     * @member {Set<String>} VALID_PLACEMENT_KINDS
     * @static
     */
    static VALID_PLACEMENT_KINDS = new Set([
        'edge-top', 'edge-right', 'edge-bottom', 'edge-left',
        'split-before', 'split-after',
        'tab-before', 'tab-after', 'tab-into',
        'rejected'
    ])
    /**
     * @member {Set<String>} EDGE_KINDS
     * @static
     */
    static EDGE_KINDS = new Set(['edge-top', 'edge-right', 'edge-bottom', 'edge-left'])
    /**
     * @member {Set<String>} SPLIT_KINDS
     * @static
     */
    static SPLIT_KINDS = new Set(['split-before', 'split-after'])
    /**
     * @member {Set<String>} TAB_KINDS
     * @static
     */
    static TAB_KINDS = new Set(['tab-before', 'tab-after', 'tab-into'])
    /**
     * Thickness in px of an edge-zone affordance band.
     * @member {Number} edgeBandSize=24
     * @static
     */
    static edgeBandSize = 24
    /**
     * Thickness in px of a split / tab guide line.
     * @member {Number} splitLineSize=6
     * @static
     */
    static splitLineSize = 6

    static config = {
        /**
         * @member {String} className='AgentOS.view.DockPreview'
         * @protected
         */
        className: 'AgentOS.view.DockPreview',
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
        dockPreview_: null
    }

    /**
     * The drag surface this overlay listens to for lifecycle-terminal cleanup. Wired via
     * {@link AgentOS.view.DockPreview#bindDragSource}; never a pointer-owning surface of our own.
     * @member {Object|null} dragSource=null
     * @protected
     */
    dragSource = null

    /**
     * @summary Structural validity gate for a dockPreview object (fail-closed).
     *
     * Returns true only for a well-formed `neo.harness.dockPreview.v1` payload that carries a
     * stable `itemId`, a `target.nodeId`, a known `placement.kind`, an accept/reject
     * `feedback.state`, and (for split placements) a valid `placement.orientation`. Anything
     * malformed, partial or unknown returns false so the renderer clears rather than guesses.
     * @param {Object|null} preview
     * @returns {Boolean}
     * @static
     */
    static isValidPreview(preview) {
        if (!preview || typeof preview !== 'object')                  return false;
        if (preview.schema !== this.PREVIEW_SCHEMA)                   return false;
        if (typeof preview.itemId !== 'string' || !preview.itemId)    return false;

        let {feedback, placement, target} = preview;

        if (!target || typeof target.nodeId !== 'string' || !target.nodeId) return false;
        if (!placement || !this.VALID_PLACEMENT_KINDS.has(placement.kind))  return false;
        if (!feedback || (feedback.state !== 'accepted' && feedback.state !== 'rejected')) return false;

        // Split placements MUST carry an orientation (contract: required for split previews).
        if (this.SPLIT_KINDS.has(placement.kind) &&
            placement.orientation !== 'horizontal' && placement.orientation !== 'vertical') {
            return false
        }

        return true
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
            return {...base, group: 'edge', edge: kind.slice('edge-'.length)}
        }

        if (this.SPLIT_KINDS.has(kind)) {
            return {...base, group: 'split', orientation: placement.orientation, position: kind.slice('split-'.length)}
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
        if (!this.isValidPreview(preview)) return null;

        let {feedback, itemId, placement, target} = preview,
            {kind}                                = placement;

        if (kind === 'rejected' || feedback.state !== 'accepted') return null;

        let nodeId = target.nodeId;

        if (this.TAB_KINDS.has(kind)) {
            return {operation: 'addTab', itemId, tabsNodeId: nodeId, index: Number.isInteger(placement.index) ? placement.index : null}
        }

        if (this.SPLIT_KINDS.has(kind)) {
            let position = kind.slice('split-'.length);
            return {operation: 'splitNode', itemId, targetNodeId: nodeId, orientation: placement.orientation, position, sizes: this.ratioToSizes(placement.ratio, position)}
        }

        let edge = kind.slice('edge-'.length);
        return {
            operation   : 'splitNode',
            itemId,
            targetNodeId: nodeId,
            edge,
            orientation : (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical',
            sizes       : this.ratioToSizes(placement.ratio, edge === 'bottom' || edge === 'right' ? 'after' : 'before')
        }
    }

    /**
     * @summary Normalizes an optional split ratio into a two-child, sum-to-one size pair.
     * @param {Number} [ratio] the new node's fraction; defaults to an even split when absent/invalid
     * @param {String} position 'before' | 'after' — which child the new node becomes
     * @returns {Number[]} normalized [first, second] sizes summing to 1
     * @static
     */
    static ratioToSizes(ratio, position) {
        let r = (typeof ratio === 'number' && ratio > 0 && ratio < 1) ? ratio : 0.5;
        return position === 'after' ? [1 - r, r] : [r, 1 - r]
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
     * @returns {Object|null}
     * @static
     */
    static affordanceGeometry(affordance, targetRect) {
        if (!affordance || !targetRect) return null;

        let {height, width, x, y} = targetRect;

        if ([height, width, x, y].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;

        let band = Math.min(this.edgeBandSize, width, height),
            line = this.splitLineSize;

        if (affordance.group === 'edge') {
            switch (affordance.edge) {
                case 'top'   : return {x, y, width, height: band};
                case 'bottom': return {x, y: y + height - band, width, height: band};
                case 'left'  : return {x, y, width: band, height};
                case 'right' : return {x: x + width - band, y, width: band, height}
            }
        }

        if (affordance.group === 'split') {
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
     * @summary Re-renders the overlay whenever the dockPreview changes (or clears it when null).
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetDockPreview(value, oldValue) {
        let me         = this,
            affordance = DockPreview.mapPreviewToAffordance(value);

        me.vdom.cn = affordance ? [me.getAffordanceVdom(affordance)] : [];
        me.update()
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
            affordance = DockPreview.mapPreviewToAffordance(me.dockPreview),
            node       = me.vdom.cn?.[0];

        if (!affordance || !node) return;

        let geo = DockPreview.affordanceGeometry(affordance, targetRect);

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
     * @returns {AgentOS.view.DockPreview} this, for chaining
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
     * {@link AgentOS.view.DockPreview#applyTargetGeometry}. The overlay is pointer-transparent so
     * it never intercepts the live drag.
     * @param {Object} affordance
     * @returns {Object} VDOM node
     */
    getAffordanceVdom(affordance) {
        return {
            cls: [
                'neo-dock-preview-affordance',
                `neo-dock-preview-${affordance.group}`,
                `neo-dock-preview-${affordance.kind}`,
                affordance.accepted ? 'neo-dock-preview-accepted' : 'neo-dock-preview-rejected'
            ],
            'data-dock-target': affordance.targetNodeId,
            style             : {pointerEvents: 'none'}
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

export default Neo.setupClass(DockPreview);
