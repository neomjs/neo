import Base     from '../../../core/Base.mjs';
import Document from './Document.mjs';

/**
 * @class Neo.dashboard.dock.model.TopologyDiff
 * @extends Neo.core.Base
 *
 * @summary Semantic before/after compare for `neo.harness.dockZone.v1` documents.
 *
 * Raw document equality is the wrong assertion tool twice over: too strict (irrelevant field
 * churn fails a comparison that should pass) and too loose (a moved item can leave two trees
 * of equal size). This differ answers the question consumers actually ask — WHAT changed, as
 * semantic mutation categories over the committed document model:
 *
 * - `moves`        — an item now lives in a different tabs container
 * - `adds`         — an item entered the tree (catalog-only items are NOT topology adds)
 * - `removes`      — an item left the tree
 * - `resizes`      — a split present in both documents changed its size fractions beyond epsilon
 * - `tabReorders`  — an item kept its container but changed its tab index. Index truth is
 *                    reported verbatim: a shift induced by a sibling's departure IS a reorder
 *                    here — assertion consumers filter by `itemId` when they need
 *                    action-attribution rather than positional truth
 * - `autoHideFlips`— an item's `autoHidden` flag toggled
 * - `unchanged`    — items present in both trees with none of the above
 *
 * The output is JSON-first and snapshot-stable: every category array is sorted by its primary
 * key and the walk order is deterministic, so identical inputs produce byte-identical results.
 * Malformed inputs never throw and never half-diff: both documents pass through the landed
 * fail-closed shape gate (`Document.computeShapeFingerprint`, which also rejects cyclic
 * trees) and any failure returns empty categories plus a non-empty `errors` array naming the
 * offending side.
 */
class TopologyDiff extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.TopologyDiff'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.TopologyDiff',
        /**
         * @member {String} ntype='dock-topology-diff'
         * @protected
         */
        ntype: 'dock-topology-diff'
    }

    /**
     * Default resize tolerance: size-fraction deltas at or below this are reported as
     * `unchanged`, not `resizes`. Split sizes are fractions summing to 1, so 0.001 absorbs
     * float noise and sub-visual drag jitter while catching any deliberate resize.
     * @member {Number} SIZE_EPSILON=0.001
     * @static
     */
    static SIZE_EPSILON = 0.001

    /**
     * Walks a document tree and indexes every item's location: `itemId → {nodeId, index}` of
     * its containing tabs node. Zone keys iterate sorted, so the index order is deterministic
     * regardless of object insertion order.
     * @param {Object} document A structurally valid dockZone.v1 document
     * @returns {Map<String, {nodeId: String, index: Number}>}
     * @protected
     * @static
     */
    static indexItemLocations(document) {
        const locations = new Map();

        const walk = nodeId => {
            const node = document.nodes?.[nodeId];

            if (!node) return;

            if (node.type === 'tabs') {
                (node.items || []).forEach((itemId, index) => {
                    locations.set(itemId, {nodeId, index})
                })
            } else if (node.type === 'split') {
                (node.children || []).forEach(walk)
            } else if (node.type === 'edge-zone') {
                Object.keys(node.zones || {}).sort().forEach(zone => walk(node.zones[zone]))
            }
        };

        walk(document.root);

        return locations
    }

    /**
     * Computes the semantic diff between two dockZone.v1 documents.
     *
     * Fail-closed contract: each input is gated through the landed shape walk first; a
     * malformed or cyclic document yields `{…empty categories, errors: […]}` — no partial
     * categories, no throw. `unchanged` counts tree-resident items only; catalog entries that
     * never enter a tabs node are invisible to topology assertions by design.
     * @param {Object} before The earlier committed document
     * @param {Object} after The later committed document
     * @param {Object} [options]
     * @param {Number} [options.sizeEpsilon=TopologyDiff.SIZE_EPSILON] Resize tolerance on size fractions
     * @returns {{moves: Object[], adds: Object[], removes: Object[], resizes: Object[], tabReorders: Object[], autoHideFlips: Object[], unchanged: String[], errors: String[]}}
     * @static
     */
    static diffDockDocuments(before, after, {sizeEpsilon = TopologyDiff.SIZE_EPSILON} = {}) {
        const
            empty  = () => ({moves: [], adds: [], removes: [], resizes: [], tabReorders: [], autoHideFlips: [], unchanged: [], errors: []}),
            result = empty(),
            errors = [];

        [['before', before], ['after', after]].forEach(([side, document]) => {
            const gate = Document.computeShapeFingerprint(document || {});

            gate.errors.forEach(error => {
                errors.push(`${side} document failed the shape gate: ${error}`)
            })
        });

        if (errors.length) {
            return {...empty(), errors}
        }

        const
            beforeLocations = this.indexItemLocations(before),
            afterLocations  = this.indexItemLocations(after),
            allItemIds      = [...new Set([...beforeLocations.keys(), ...afterLocations.keys()])].sort();

        allItemIds.forEach(itemId => {
            const
                from = beforeLocations.get(itemId),
                to   = afterLocations.get(itemId);

            if (from && !to) {
                result.removes.push({itemId, from});
                return
            }

            if (!from && to) {
                result.adds.push({itemId, to});
                return
            }

            const flipped = this.hasAutoHideFlip(before, after, itemId);

            if (flipped) {
                result.autoHideFlips.push({
                    itemId,
                    from: before.items?.[itemId]?.autoHidden === true,
                    to  : after.items?.[itemId]?.autoHidden === true
                })
            }

            if (from.nodeId !== to.nodeId) {
                result.moves.push({itemId, from, to})
            } else if (from.index !== to.index) {
                result.tabReorders.push({itemId, nodeId: from.nodeId, fromIndex: from.index, toIndex: to.index})
            } else if (!flipped) {
                result.unchanged.push(itemId)
            }
        });

        Object.keys(before.nodes || {}).sort().forEach(nodeId => {
            const
                beforeNode = before.nodes[nodeId],
                afterNode  = after.nodes?.[nodeId];

            if (beforeNode?.type !== 'split' || afterNode?.type !== 'split') return;

            const
                fromSizes = beforeNode.sizes || [],
                toSizes   = afterNode.sizes  || [],
                changed   = fromSizes.length !== toSizes.length ||
                    fromSizes.some((size, index) => Math.abs(size - toSizes[index]) > sizeEpsilon);

            if (changed) {
                result.resizes.push({nodeId, fromSizes: [...fromSizes], toSizes: [...toSizes]})
            }
        });

        return result
    }

    /**
     * Whether an item's `autoHidden` flag differs between the two catalogs. Absent flags
     * compare as `false`, matching the executor's boolean-optional item contract.
     * @param {Object} before
     * @param {Object} after
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     * @static
     */
    static hasAutoHideFlip(before, after, itemId) {
        return (before.items?.[itemId]?.autoHidden === true) !== (after.items?.[itemId]?.autoHidden === true)
    }
}

export default Neo.setupClass(TopologyDiff);
