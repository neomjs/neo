import Base              from '../../../core/Base.mjs';
import WorkspaceDocument from './WorkspaceDocument.mjs';

/**
 * @class Neo.dashboard.dock.model.TopologyDiff
 * @extends Neo.core.Base
 *
 * @summary Semantic before/after compare for `neo.dock.zone.v1` documents.
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
 * - `edgeResizes`  — an edge-zone descriptor present in both documents changed its `extent`
 *                    beyond epsilon. The other half of `resizes`: `Operations` classes
 *                    `resizeSplit` and `resizeEdgeZone` identically as `geometry`, so reporting
 *                    one and not the other let a rail drag restore as a no-op
 * - `tabReorders`  — an item kept its container but changed its tab index. Index truth is
 *                    reported verbatim: a shift induced by a sibling's departure IS a reorder
 *                    here — assertion consumers filter by `itemId` when they need
 *                    action-attribution rather than positional truth
 * - `activeItemChanges` — a tabs node present in both documents changed its `activeItemId`
 * - `autoHideFlips`— an item's `autoHidden` flag toggled
 * - `unchanged`    — items present in both trees with none of the above
 *
 * This list is the complete return shape and is a maintenance obligation: it stood at seven while
 * the code returned eight for the whole life of `activeItemChanges`, and a reader who built a
 * category list from this prose under-reported exactly where it had drifted. Derive categories
 * from the returned object, never from a comment.
 *
 * The output is JSON-first and snapshot-stable: every category array is sorted by its primary
 * key and the walk order is deterministic, so identical inputs produce byte-identical results.
 * Malformed inputs never throw and never half-diff: both documents pass through the landed
 * fail-closed shape gate (`WorkspaceDocument.computeShapeFingerprint`, which also rejects cyclic
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
                Object.keys(node.zones || {}).sort().forEach(zone => walk(WorkspaceDocument.getZoneNodeId(node.zones[zone])))
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
     * @param {Number} [options.sizeEpsilon=TopologyDiff.SIZE_EPSILON] Tolerance on both size fractions
     * and edge-zone extents. One knob for both: they are the same quantity — a fraction in the open
     * interval `(0, 1)` validated by the same document contract — so a second tolerance would be a
     * surface consumers must reason about with no question behind it.
     * @returns {{moves: Object[], adds: Object[], removes: Object[], resizes: Object[], edgeResizes: Object[], tabReorders: Object[], autoHideFlips: Object[], activeItemChanges: Object[], unchanged: String[], errors: String[]}}
     * @static
     */
    static diffDockDocuments(before, after, {sizeEpsilon = TopologyDiff.SIZE_EPSILON} = {}) {
        const
            empty  = () => ({moves: [], adds: [], removes: [], resizes: [], edgeResizes: [], tabReorders: [], autoHideFlips: [], activeItemChanges: [], unchanged: [], errors: []}),
            result = empty(),
            errors = [];

        [['before', before], ['after', after]].forEach(([side, document]) => {
            const gate = WorkspaceDocument.computeShapeFingerprint(document || {});

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

            if (beforeNode?.type === 'tabs' && afterNode?.type === 'tabs') {
                const
                    fromActive = beforeNode.activeItemId ?? null,
                    toActive   = afterNode.activeItemId  ?? null;

                // Which tab you were on is document state and the capture keeps it, but nothing
                // reported it, so a restore returned the tabs and left you looking at whichever one
                // happened to be active. Only a target that actually LISTS the item is emitted: the
                // executor rejects an active item that is not a member, and a restore must not start
                // throwing over a tab it could not place.
                if (fromActive !== toActive && toActive != null && (afterNode.items || []).includes(toActive)) {
                    result.activeItemChanges.push({nodeId, from: fromActive, to: toActive})
                }

                return
            }

            // An edge zone's size lives on the DESCRIPTOR, not on the node it points at, which is
            // why the split branch below cannot reach it: `dockZoneDescriptorKeys` owns `extent`
            // and the node owns only `zones`. Walked in `dockZoneEdgeKeys` order rather than the
            // record's own key order, so the output stays snapshot-stable like every other
            // category. `center` is walked too: nothing in the operation vocabulary can resize it,
            // but a hand-authored document can carry the field, and this differ reports document
            // truth — the planner is what filters to executable steps.
            if (beforeNode?.type === 'edge-zone' && afterNode?.type === 'edge-zone') {
                const
                    beforeZones = WorkspaceDocument.isJsonRecord(beforeNode.zones) ? beforeNode.zones : {},
                    afterZones  = WorkspaceDocument.isJsonRecord(afterNode.zones)  ? afterNode.zones  : {};

                [...WorkspaceDocument.dockZoneEdgeKeys].forEach(edge => {
                    const
                        from = beforeZones[edge]?.extent,
                        to   = afterZones[edge]?.extent;

                    // Absence is not a change to zero. A slot that carries no extent on either side
                    // takes the projection's default on both, so it has not moved; a slot that has
                    // one on only one side has no comparable pair, and inventing the default here
                    // would report a resize the user never performed. `resizable` is deliberately
                    // NOT compared: it is a policy flag, and a geometry category that moved on it
                    // would make the planner emit a resize for a permission change.
                    if (!Number.isFinite(from) || !Number.isFinite(to)) return;

                    if (Math.abs(from - to) > sizeEpsilon) {
                        result.edgeResizes.push({nodeId, edge, from, to})
                    }
                });

                return
            }

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
