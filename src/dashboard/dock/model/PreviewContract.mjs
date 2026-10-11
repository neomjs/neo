import Base from '../../../core/Base.mjs';

/**
 * @summary Owns validation and conversion of runtime dock previews through one Neo policy.
 * @description Renderer and drop callers share this registered owner. Internal decisions dispatch
 * through its methods so Neo.overwrites reaches normalization, validation and conversion together.
 * The methods return plain data and never mutate a document or acquire rendering resources.
 * @class Neo.dashboard.dock.model.PreviewContract
 * @extends Neo.core.Base
 * @singleton
 */
class PreviewContract extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.PreviewContract'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.PreviewContract',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The dockPreview contract schema every side of the line accepts / emits.
     * @member {String} PREVIEW_SCHEMA
     */
    PREVIEW_SCHEMA = 'neo.dock.preview.v1';

    /**
     * The drop-candidate-set schema: the runtime-only payload the producer emits for the
     * indicator-overlay menu (the full valid-placement menu for one hovered zone plus the
     * container edge chips), consumed by `Neo.dashboard.dock.interaction.DropIndicators`. Every candidate
     * wraps a complete, individually valid `neo.dock.preview.v1` payload — a drop on an
     * indicator commits through `previewToOperation` exactly like a pointer-inferred preview.
     * @member {String} CANDIDATES_SCHEMA
     */
    CANDIDATES_SCHEMA = 'neo.dock.candidates.v1';

    /**
     * The five cross positions of the indicator menu, in render order. `center` maps to the
     * tab-merge candidate; the four directions map to directional split candidates (which kind —
     * `edge-*` node split vs `split-before/after` sibling insert — the producer resolves from the
     * hovered zone's parent-split orientation, identical to the pointer-inference grammar).
     * @member {String[]} CROSS_POSITIONS
     */
    CROSS_POSITIONS = ['center', 'top', 'right', 'bottom', 'left'];

    /** The four container-edge chip positions, in render order. @member {String[]} CHIP_EDGES */
    CHIP_EDGES = ['top', 'right', 'bottom', 'left'];

    /** @member {Set<String>} EDGE_KINDS */
    EDGE_KINDS = new Set(['edge-top', 'edge-right', 'edge-bottom', 'edge-left']);

    /** @member {Set<String>} SPLIT_KINDS */
    SPLIT_KINDS = new Set(['split-before', 'split-after']);

    /** @member {Set<String>} TAB_KINDS */
    TAB_KINDS = new Set(['tab-before', 'tab-after', 'tab-into']);

    /** Every candidate `placement.kind`, including `rejected`. @member {Set<String>} VALID_PLACEMENT_KINDS */
    VALID_PLACEMENT_KINDS = new Set([...this.EDGE_KINDS, ...this.SPLIT_KINDS, ...this.TAB_KINDS, 'rejected']);

    /**
     * @summary Structural validity gate for a dockPreview object (fail-closed).
     *
     * Returns true only for a well-formed `neo.dock.preview.v1` payload that carries a stable
     * `itemId`, a `target.nodeId`, a known `placement.kind`, an accept/reject `feedback.state`, and (for
     * split placements) a valid `placement.orientation`. A whole-stack gesture may additionally carry
     * a runtime-only `groupNodeId`; when present it must be a non-empty string. Anything malformed,
     * partial or unknown returns false so consumers clear/fail rather than guess.
     * @param {Object|null} preview
     * @returns {Boolean}
     */
    isValidPreview(preview) {
        if (!preview || typeof preview !== 'object')               return false;
        if (preview.schema !== this.PREVIEW_SCHEMA)               return false;
        if (typeof preview.itemId !== 'string' || !preview.itemId) return false;
        if (preview.groupNodeId != null &&
            (typeof preview.groupNodeId !== 'string' || !preview.groupNodeId)) return false;

        let {feedback, placement, target} = preview;

        if (!target || typeof target.nodeId !== 'string' || !target.nodeId) return false;
        if (!placement || !this.VALID_PLACEMENT_KINDS.has(placement.kind)) return false;
        if (!feedback || (feedback.state !== 'accepted' && feedback.state !== 'rejected')) return false;

        // Split placements MUST carry an orientation (contract: required for split previews).
        if (this.SPLIT_KINDS.has(placement.kind) &&
            placement.orientation !== 'horizontal' && placement.orientation !== 'vertical') {
            return false
        }

        return true
    }

    /**
     * @summary Numeric-rect gate shared by the candidate-set validator (fail-closed).
     * @param {Object|null} rect
     * @returns {Boolean}
     */
    isValidRect(rect) {
        return !!rect &&
            [rect.x, rect.y, rect.width, rect.height].every(v => typeof v === 'number' && !Number.isNaN(v)) &&
            rect.width > 0 && rect.height > 0
    }

    /**
     * @summary One cross direction's legal placement tuple — the §06 grammar as a checkable rule.
     *
     * `center` is exactly the tab-merge. A directional indicator is either the node split for its
     * own side (`edge-<direction>`) or the along-axis sibling insert the producer's orientation
     * grammar resolves — `split-before` only from a LEADING direction (top/left), `split-after`
     * only from a TRAILING one (bottom/right), with `vertical` for top/bottom and `horizontal` for
     * left/right. Anything else is a menu lying about its operation.
     * @param {String} position a `CROSS_POSITIONS` entry
     * @param {Object} placement the candidate preview's placement descriptor
     * @returns {Boolean}
     */
    crossPlacementMatchesPosition(position, placement) {
        let {kind, orientation} = placement;

        if (position === 'center') return kind === 'tab-into';

        return kind === `edge-${position}` ||
            (kind === 'split-before' && (
                (position === 'top'  && orientation === 'vertical') ||
                (position === 'left' && orientation === 'horizontal')
            )) ||
            (kind === 'split-after' && (
                (position === 'bottom' && orientation === 'vertical') ||
                (position === 'right'  && orientation === 'horizontal')
            ))
    }

    /**
     * @summary Structural validity gate for a dockCandidates set (fail-closed).
     *
     * Returns true only for a COMPLETE, internally coherent `neo.dock.candidates.v1` payload:
     *
     * - a stable `itemId`, and a hovered `zone` with a node id and a numeric rect;
     * - a `cross` of EXACTLY the five unique positions (`CROSS_POSITIONS`), every candidate wrapping
     *   an individually valid preview that carries the SET's `itemId`, targets the hovered zone's
     *   node, and whose placement kind matches its position per the §06 grammar
     *   ({@link Neo.dashboard.dock.model.PreviewContract#crossPlacementMatchesPosition});
     * - a `root` that is either null (no distinct container target) or a node id + rect + EXACTLY
     *   the four unique edges (`CHIP_EDGES`), each chip's preview carrying the set's `itemId`,
     *   targeting the root node, with kind `edge-<edge>` exactly.
     *
     * A partial menu, a duplicated position, a candidate built for another item, or a candidate
     * whose visual position lies about its operation all return false — the indicator layer clears
     * rather than renders a menu that misrepresents the drop. Same fail-closed posture as
     * `isValidPreview`.
     * @param {Object|null} set
     * @returns {Boolean}
     */
    isValidCandidateSet(set) {
        if (!set || typeof set !== 'object')               return false;
        if (set.schema !== this.CANDIDATES_SCHEMA)         return false;
        if (typeof set.itemId !== 'string' || !set.itemId) return false;

        let {cross, root, zone} = set;

        if (!zone || typeof zone.nodeId !== 'string' || !zone.nodeId || !this.isValidRect(zone.rect)) return false;

        if (!Array.isArray(cross) || cross.length !== this.CROSS_POSITIONS.length) return false;

        let positions = new Set(cross.map(candidate => candidate?.position));

        if (positions.size !== this.CROSS_POSITIONS.length || !this.CROSS_POSITIONS.every(position => positions.has(position))) {
            return false
        }

        if (!cross.every(candidate =>
            candidate &&
            this.isValidPreview(candidate.preview) &&
            candidate.preview.itemId === set.itemId &&
            candidate.preview.groupNodeId === set.groupNodeId &&
            candidate.preview.target.nodeId === zone.nodeId &&
            this.crossPlacementMatchesPosition(candidate.position, candidate.preview.placement)
        )) {
            return false
        }

        if (root != null) {
            if (typeof root.nodeId !== 'string' || !root.nodeId || !this.isValidRect(root.rect)) return false;

            if (!Array.isArray(root.chips) || root.chips.length !== this.CHIP_EDGES.length) return false;

            let edges = new Set(root.chips.map(chip => chip?.edge));

            if (edges.size !== this.CHIP_EDGES.length || !this.CHIP_EDGES.every(edge => edges.has(edge))) {
                return false
            }

            if (!root.chips.every(chip =>
                chip &&
                this.isValidPreview(chip.preview) &&
                chip.preview.itemId === set.itemId &&
                chip.preview.groupNodeId === set.groupNodeId &&
                chip.preview.target.nodeId === root.nodeId &&
                chip.preview.placement.kind === `edge-${chip.edge}`
            )) {
                return false
            }
        }

        return true
    }

    /**
     * @summary Which side of a two-child split an edge drop lands the NEW node on.
     *
     * `bottom` and `right` append; `top` and `left` prepend. Shared so the operation descriptor and the
     * rendered region cannot disagree about which half the drop will occupy.
     * @param {String} edge
     * @returns {String} `'before'` or `'after'`
     */
    edgeSplitPosition(edge) {
        return (edge === 'bottom' || edge === 'right') ? 'after' : 'before'
    }

    /**
     * @summary Normalizes an optional split ratio into a two-child, sum-to-one size pair.
     * @param {Number} [ratio] The new node's fraction; absent or invalid defaults to an even split.
     * @param {String} position 'before' or 'after'.
     * @returns {Number[]} Normalized sizes in child order.
     */
    ratioToSizes(ratio, position) {
        let r = (typeof ratio === 'number' && ratio > 0 && ratio < 1) ? ratio : 0.5;
        return position === 'after' ? [1 - r, r] : [r, 1 - r]
    }

    /**
     * @summary Converts an ACCEPTED drop preview into a semantic dock-zone operation descriptor, or null.
     *
     * The one authored path from a hover preview to a `model.Operations` operation. Invalid previews,
     * `rejected` placements, and non-accepted feedback all yield null (no commit). Item previews emit
     * `addTab` / `splitNode` as before. A preview carrying `groupNodeId` instead emits one
     * `transferNode` descriptor whose nested target uses the same tab/split placement grammar — the
     * preview remains the single placement authority for both item and whole-stack drops.
     * @param {Object|null} preview
     * @returns {Object|null}
     */
    previewToOperation(preview) {
        if (!this.isValidPreview(preview)) return null;

        let {feedback, groupNodeId, itemId, placement, target} = preview,
            {kind}                                             = placement;

        if (kind === 'rejected' || feedback.state !== 'accepted') return null;

        let nodeId = target.nodeId;

        if (groupNodeId) {
            let nodePlacement;

            if (this.TAB_KINDS.has(kind)) {
                nodePlacement = {kind: 'tab-into'}
            } else if (this.SPLIT_KINDS.has(kind)) {
                let position = kind.slice('split-'.length);

                nodePlacement = {
                    orientation: placement.orientation,
                    position,
                    sizes      : this.ratioToSizes(placement.ratio, position)
                }
            } else {
                let edge = kind.slice('edge-'.length);

                nodePlacement = {
                    edge,
                    orientation: (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical',
                    sizes      : this.ratioToSizes(placement.ratio, this.edgeSplitPosition(edge))
                }
            }

            return {
                operation: 'transferNode',
                nodeId   : groupNodeId,
                target   : {targetNodeId: nodeId, placement: nodePlacement}
            }
        }

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
            sizes       : this.ratioToSizes(placement.ratio, this.edgeSplitPosition(edge))
        }
    }

    /**
     * @summary Resolves the rendered new-node fraction from the same normalized pair as the drop.
     * @param {Number} [ratio]
     * @param {String} position 'before' or 'after'.
     * @returns {Number}
     */
    newNodeFraction(ratio, position) {
        const sizes = this.ratioToSizes(ratio, position);
        return position === 'after' ? sizes[1] : sizes[0]
    }
}

export default Neo.setupClass(PreviewContract);
