/**
 * @summary The pure, layer-neutral `neo.harness.dockPreview.v1` contract — the schema constant, the
 * placement-kind vocabulary, structural validation, the preview→operation conversion, and the
 * split-ratio normalizer.
 *
 * Extracted from `AgentOS.view.DockPreview` so the three sides of the docking line share ONE source
 * of truth without a layer inversion: the producer (`Neo.dashboard.DockPreviewProducer`, src), the
 * renderer (that app-layer view), AND the src-layer drop owners (`examples/dashboard/dock`, the FM
 * cockpit) — the src/example layers cannot import `apps/`, so the model-semantic half of the
 * contract had to move down here. Rendering + geometry stay in the view; only the pure half lives
 * here (no Neo class, no DOM, no persisted-model write).
 *
 * @see learn/agentos/HarnessDockZoneModel.md
 */

/**
 * The dockPreview contract schema every side of the line accepts / emits.
 * @type {String}
 */
export const PREVIEW_SCHEMA = 'neo.harness.dockPreview.v1';

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
 * split placements) a valid `placement.orientation`. Anything malformed, partial or unknown returns
 * false so consumers clear/fail rather than guess.
 * @param {Object|null} preview
 * @returns {Boolean}
 */
export function isValidPreview(preview) {
    if (!preview || typeof preview !== 'object')               return false;
    if (preview.schema !== PREVIEW_SCHEMA)                     return false;
    if (typeof preview.itemId !== 'string' || !preview.itemId) return false;

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
 * The one authored path from a hover preview to a `DockZoneModel` operation. Invalid previews,
 * `rejected` placements, and non-accepted feedback all yield null (no commit). Tab placements emit
 * `addTab` (the adapter downgrades to `moveItem` when the item already lives in the tree); split and
 * edge placements route to `splitNode`.
 * @param {Object|null} preview
 * @returns {Object|null}
 */
export function previewToOperation(preview) {
    if (!isValidPreview(preview)) return null;

    let {feedback, itemId, placement, target} = preview,
        {kind}                                = placement;

    if (kind === 'rejected' || feedback.state !== 'accepted') return null;

    let nodeId = target.nodeId;

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
