/**
 * @summary The pure, layer-neutral `neo.harness.dockPreview.v1` contract — the schema constant, the
 * placement-kind vocabulary, structural validation, the preview→operation conversion, and the
 * split-ratio normalizer.
 *
 * Extracted from the preview renderer (now `Neo.dashboard.dock.interaction.Preview`) so the three sides of the docking line share ONE source
 * of truth without a layer inversion: the producer (`Neo.dashboard.dock.interaction.PreviewProducer`, src), the
 * renderer (that app-layer view), AND the src-layer drop owners (`examples/dashboard/dock`, the FM
 * cockpit) — the src/example layers cannot import `apps/`, so the model-semantic half of the
 * contract had to move down here. Rendering + geometry stay in the view; only the pure half lives
 * here (no Neo class, no DOM, no persisted-model write).
 *
 * @see learn/agentos/DockZoneModel.md
 */

/**
 * The dockPreview contract schema every side of the line accepts / emits.
 * @type {String}
 */
export const PREVIEW_SCHEMA = 'neo.harness.dockPreview.v1';

/**
 * The drop-candidate-set schema: the runtime-only payload the producer emits for the
 * indicator-overlay menu (the full valid-placement menu for one hovered zone plus the
 * container edge chips), consumed by `Neo.dashboard.dock.interaction.DropIndicators`. Every candidate
 * wraps a complete, individually valid `neo.harness.dockPreview.v1` payload — a drop on an
 * indicator commits through `previewToOperation` exactly like a pointer-inferred preview.
 * @type {String}
 */
export const CANDIDATES_SCHEMA = 'neo.harness.dockCandidates.v1';

/**
 * The five cross positions of the indicator menu, in render order. `center` maps to the
 * tab-merge candidate; the four directions map to directional split candidates (which kind —
 * `edge-*` node split vs `split-before/after` sibling insert — the producer resolves from the
 * hovered zone's parent-split orientation, identical to the pointer-inference grammar).
 * @type {String[]}
 */
export const CROSS_POSITIONS = ['center', 'top', 'right', 'bottom', 'left'];

/** The four container-edge chip positions, in render order. @type {String[]} */
export const CHIP_EDGES = ['top', 'right', 'bottom', 'left'];

/** @type {Set<String>} */
export const EDGE_KINDS = new Set(['edge-top', 'edge-right', 'edge-bottom', 'edge-left']);

/** @type {Set<String>} */
export const SPLIT_KINDS = new Set(['split-before', 'split-after']);

/** @type {Set<String>} */
export const TAB_KINDS = new Set(['tab-before', 'tab-after', 'tab-into']);

/** Every candidate `placement.kind` the contract defines (+ the terminal `rejected`). @type {Set<String>} */
export const VALID_PLACEMENT_KINDS = new Set([...EDGE_KINDS, ...SPLIT_KINDS, ...TAB_KINDS, 'rejected']);

/**
 * @summary Structural validity gate for a dockPreview object (fail-closed).
 *
 * Returns true only for a well-formed `neo.harness.dockPreview.v1` payload that carries a stable
 * `itemId`, a `target.nodeId`, a known `placement.kind`, an accept/reject `feedback.state`, and (for
 * split placements) a valid `placement.orientation`. A whole-stack gesture may additionally carry
 * a runtime-only `groupNodeId`; when present it must be a non-empty string. Anything malformed,
 * partial or unknown returns false so consumers clear/fail rather than guess.
 * @param {Object|null} preview
 * @returns {Boolean}
 */
export function isValidPreview(preview) {
    if (!preview || typeof preview !== 'object')               return false;
    if (preview.schema !== PREVIEW_SCHEMA)                     return false;
    if (typeof preview.itemId !== 'string' || !preview.itemId) return false;
    if (preview.groupNodeId != null &&
        (typeof preview.groupNodeId !== 'string' || !preview.groupNodeId)) return false;

    let {feedback, placement, target} = preview;

    if (!target || typeof target.nodeId !== 'string' || !target.nodeId) return false;
    if (!placement || !VALID_PLACEMENT_KINDS.has(placement.kind))       return false;
    if (!feedback || (feedback.state !== 'accepted' && feedback.state !== 'rejected')) return false;

    // Split placements MUST carry an orientation (contract: required for split previews).
    if (SPLIT_KINDS.has(placement.kind) &&
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
function isValidRect(rect) {
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
function crossPlacementMatchesPosition(position, placement) {
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
 * Returns true only for a COMPLETE, internally coherent `neo.harness.dockCandidates.v1` payload:
 *
 * - a stable `itemId`, and a hovered `zone` with a node id and a numeric rect;
 * - a `cross` of EXACTLY the five unique positions (`CROSS_POSITIONS`), every candidate wrapping
 *   an individually valid preview that carries the SET's `itemId`, targets the hovered zone's
 *   node, and whose placement kind matches its position per the §06 grammar
 *   ({@link crossPlacementMatchesPosition});
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
export function isValidCandidateSet(set) {
    if (!set || typeof set !== 'object')               return false;
    if (set.schema !== CANDIDATES_SCHEMA)              return false;
    if (typeof set.itemId !== 'string' || !set.itemId) return false;

    let {cross, root, zone} = set;

    if (!zone || typeof zone.nodeId !== 'string' || !zone.nodeId || !isValidRect(zone.rect)) return false;

    if (!Array.isArray(cross) || cross.length !== CROSS_POSITIONS.length) return false;

    let positions = new Set(cross.map(candidate => candidate?.position));

    if (positions.size !== CROSS_POSITIONS.length || !CROSS_POSITIONS.every(position => positions.has(position))) {
        return false
    }

    if (!cross.every(candidate =>
        candidate &&
        isValidPreview(candidate.preview) &&
        candidate.preview.itemId === set.itemId &&
        candidate.preview.groupNodeId === set.groupNodeId &&
        candidate.preview.target.nodeId === zone.nodeId &&
        crossPlacementMatchesPosition(candidate.position, candidate.preview.placement)
    )) {
        return false
    }

    if (root != null) {
        if (typeof root.nodeId !== 'string' || !root.nodeId || !isValidRect(root.rect)) return false;

        if (!Array.isArray(root.chips) || root.chips.length !== CHIP_EDGES.length) return false;

        let edges = new Set(root.chips.map(chip => chip?.edge));

        if (edges.size !== CHIP_EDGES.length || !CHIP_EDGES.every(edge => edges.has(edge))) {
            return false
        }

        if (!root.chips.every(chip =>
            chip &&
            isValidPreview(chip.preview) &&
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
 * @summary Normalizes an optional split ratio into a two-child, sum-to-one size pair.
 * @param {Number} [ratio] the new node's fraction; defaults to an even split when absent/invalid
 * @param {String} position 'before' | 'after' — which child the new node becomes
 * @returns {Number[]} normalized [first, second] sizes summing to 1
 */
export function ratioToSizes(ratio, position) {
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
export function previewToOperation(preview) {
    if (!isValidPreview(preview)) return null;

    let {feedback, groupNodeId, itemId, placement, target} = preview,
        {kind}                                             = placement;

    if (kind === 'rejected' || feedback.state !== 'accepted') return null;

    let nodeId = target.nodeId;

    if (groupNodeId) {
        let nodePlacement;

        if (TAB_KINDS.has(kind)) {
            nodePlacement = {kind: 'tab-into'}
        } else if (SPLIT_KINDS.has(kind)) {
            let position = kind.slice('split-'.length);

            nodePlacement = {
                orientation: placement.orientation,
                position,
                sizes      : ratioToSizes(placement.ratio, position)
            }
        } else {
            let edge = kind.slice('edge-'.length);

            nodePlacement = {
                edge,
                orientation: (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical',
                sizes      : ratioToSizes(placement.ratio, edge === 'bottom' || edge === 'right' ? 'after' : 'before')
            }
        }

        return {
            operation: 'transferNode',
            nodeId   : groupNodeId,
            target   : {targetNodeId: nodeId, placement: nodePlacement}
        }
    }

    if (TAB_KINDS.has(kind)) {
        return {operation: 'addTab', itemId, tabsNodeId: nodeId, index: Number.isInteger(placement.index) ? placement.index : null}
    }

    if (SPLIT_KINDS.has(kind)) {
        let position = kind.slice('split-'.length);
        return {operation: 'splitNode', itemId, targetNodeId: nodeId, orientation: placement.orientation, position, sizes: ratioToSizes(placement.ratio, position)}
    }

    let edge = kind.slice('edge-'.length);
    return {
        operation   : 'splitNode',
        itemId,
        targetNodeId: nodeId,
        edge,
        orientation : (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical',
        sizes       : ratioToSizes(placement.ratio, edge === 'bottom' || edge === 'right' ? 'after' : 'before')
    }
}
