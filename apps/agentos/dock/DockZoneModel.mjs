import Base from '../../../src/core/Base.mjs';

/**
 * @class AgentOS.dock.DockZoneModel
 * @extends Neo.core.Base
 *
 * @summary Executor for the harness dock-zone semantic operations (`neo.harness.dockZone.v1`).
 *
 * The "missing middle" of the harness docking line: `AgentOS.view.DockPreview.previewToOperation()`
 * produces an operation descriptor on drop, this executor applies it to mutate the persisted
 * dock-zone tree, and `Neo.dashboard.DockLayoutAdapter` renders the committed result. The contract
 * and data model are defined in `learn/agentos/HarnessDockZoneModel.md` (§Data Model + §Operations);
 * this class is the code realization of §Operations.
 *
 * All operations are **pure static functions** over a `dockZone.v1` document: each deep-clones the
 * input, applies the mutation, normalizes, then validates. They are **fail-closed** — an operation
 * with an invalid reference or one that would violate an invariant returns the ORIGINAL document
 * unchanged plus a non-empty `errors` array, never a partially-mutated tree. The model persists
 * semantic splits/tabs/order only; runtime pixels, DOMRects and preview state never enter it.
 *
 * Return shape for every operation: `{document, errors}` — `errors` empty means the operation
 * committed; non-empty means it was rejected and `document` is the untouched input.
 */
class DockZoneModel extends Base {
    /**
     * The persisted dock-zone document schema this executor operates on.
     * @member {String} SCHEMA='neo.harness.dockZone.v1'
     * @static
     */
    static SCHEMA = 'neo.harness.dockZone.v1'

    static config = {
        /**
         * @member {String} className='AgentOS.dock.DockZoneModel'
         * @protected
         */
        className: 'AgentOS.dock.DockZoneModel'
    }

    /**
     * @summary Deep-clones a JSON-only dock-zone document.
     * @param {Object} document
     * @returns {Object}
     * @static
     */
    static clone(document) {
        return JSON.parse(JSON.stringify(document))
    }

    /**
     * @summary Mints a node id not yet present in the document.
     * @param {Object} document
     * @param {String} prefix
     * @returns {String}
     * @static
     */
    static genId(document, prefix) {
        let n = 0,
            id;

        do {
            id = `${prefix}-${n++}`
        } while (document.nodes[id]);

        return id
    }

    /**
     * @summary Returns the id of the tabs node currently holding `itemId`, or null.
     * @param {Object} document
     * @param {String} itemId
     * @returns {String|null}
     * @static
     */
    static findContainingTabsId(document, itemId) {
        for (const [nodeId, node] of Object.entries(document.nodes)) {
            if (node.type === 'tabs' && Array.isArray(node.items) && node.items.includes(itemId)) {
                return nodeId
            }
        }

        return null
    }

    /**
     * @summary Finds the parent node id + the slot key pointing at `nodeId`.
     *
     * For a `split` parent the slot is the child index (Number); for an `edge-zone` parent it is the
     * zone key (String). Returns null when `nodeId` is the root or unreferenced.
     * @param {Object} document
     * @param {String} nodeId
     * @returns {{parentId:String, slot:(Number|String)}|null}
     * @static
     */
    static findParentSlot(document, nodeId) {
        for (const [parentId, node] of Object.entries(document.nodes)) {
            if (node.type === 'split' && Array.isArray(node.children)) {
                const index = node.children.indexOf(nodeId);
                if (index > -1) return {parentId, slot: index}
            } else if (node.type === 'edge-zone' && node.zones) {
                for (const [zone, target] of Object.entries(node.zones)) {
                    if (target === nodeId) return {parentId, slot: zone}
                }
            }
        }

        return null
    }

    /**
     * @summary Mutating helper: removes `itemId` from whatever tabs node holds it, fixing activeItemId.
     * @param {Object} document the working (already-cloned) document
     * @param {String} itemId
     * @protected
     * @static
     */
    static detachFromTabs(document, itemId) {
        let tabsId = DockZoneModel.findContainingTabsId(document, itemId);

        if (!tabsId) return;

        let node = document.nodes[tabsId];

        node.items = node.items.filter(id => id !== itemId);

        if (node.activeItemId === itemId) {
            node.activeItemId = node.items[0] ?? null
        }
    }

    /**
     * @summary Set of node ids reachable from the document root.
     * @param {Object} document
     * @returns {Set<String>}
     * @static
     */
    static reachableNodeIds(document) {
        let seen = new Set(),
            walk = nodeId => {
                if (!nodeId || seen.has(nodeId)) return;

                let node = document.nodes[nodeId];

                if (!node) return;

                seen.add(nodeId);

                if (node.type === 'split') {
                    (node.children || []).forEach(walk)
                } else if (node.type === 'edge-zone') {
                    Object.values(node.zones || {}).forEach(walk)
                }
            };

        walk(document.root);

        return seen
    }

    /**
     * @summary Validates a dock-zone document against the contract invariants.
     *
     * Checks: schema, root presence, reference integrity (split children / edge-zone zones / tabs
     * items all resolve), each item appears at most once across the tree, split sizes match child
     * count and sum to 1, and `tabs.activeItemId` is null or one of `tabs.items`.
     * @param {Object} document
     * @returns {String[]} the (possibly empty) list of invariant violations
     * @static
     */
    static validate(document) {
        let errors = [];

        if (!document || typeof document !== 'object') return ['document is not an object'];
        if (document.schema !== DockZoneModel.SCHEMA)   errors.push(`schema must be ${DockZoneModel.SCHEMA}`);
        if (!document.nodes || !document.nodes[document.root]) errors.push(`root node "${document.root}" is missing`);

        let items   = document.items || {},
            nodes   = document.nodes || {},
            itemUse = {};

        for (const [nodeId, node] of Object.entries(nodes)) {
            if (node.type === 'split') {
                (node.children || []).forEach(childId => {
                    if (!nodes[childId]) errors.push(`split "${nodeId}" references missing node "${childId}"`)
                });

                let sizes = node.sizes || [];

                if (sizes.length !== (node.children || []).length) {
                    errors.push(`split "${nodeId}" sizes length ${sizes.length} != children length ${(node.children || []).length}`)
                } else if (sizes.length && Math.abs(sizes.reduce((a, b) => a + b, 0) - 1) > 1e-6) {
                    errors.push(`split "${nodeId}" sizes do not sum to 1`)
                }
            } else if (node.type === 'edge-zone') {
                Object.values(node.zones || {}).forEach(targetId => {
                    if (!nodes[targetId]) errors.push(`edge-zone "${nodeId}" references missing node "${targetId}"`)
                })
            } else if (node.type === 'tabs') {
                (node.items || []).forEach(itemId => {
                    if (!items[itemId]) errors.push(`tabs "${nodeId}" references missing item "${itemId}"`);
                    itemUse[itemId] = (itemUse[itemId] || 0) + 1
                });

                if (node.activeItemId !== null && node.activeItemId !== undefined && !(node.items || []).includes(node.activeItemId)) {
                    errors.push(`tabs "${nodeId}" activeItemId "${node.activeItemId}" is not one of its items`)
                }
            }
        }

        Object.entries(itemUse).forEach(([itemId, count]) => {
            if (count > 1) errors.push(`item "${itemId}" appears ${count} times in the tree (must be at most once)`)
        });

        return errors
    }

    /**
     * @summary Normalizes a document: collapses empty/redundant structural nodes, repairs split
     * sizes, prunes orphaned nodes, and repairs each `tabs.activeItemId`.
     *
     * An empty tabs or split node is removed from its parent; a split with a single child is replaced
     * by that child; split sizes are evened when their count/sum is invalid; nodes unreachable from
     * the root are dropped.
     * @param {Object} document
     * @returns {Object} a normalized clone
     * @static
     */
    static normalizeTree(document) {
        let doc = DockZoneModel.clone(document);

        const collapse = nodeId => {
            let node = doc.nodes[nodeId];

            if (!node) return nodeId;

            if (node.type === 'split') {
                node.children = (node.children || []).map(collapse).filter(id => doc.nodes[id]);

                if (node.children.length === 0) { delete doc.nodes[nodeId]; return null }
                if (node.children.length === 1) {
                    let only = node.children[0];
                    delete doc.nodes[nodeId];
                    return only
                }

                let count = node.children.length;
                if (!Array.isArray(node.sizes) || node.sizes.length !== count || Math.abs(node.sizes.reduce((a, b) => a + b, 0) - 1) > 1e-6) {
                    node.sizes = node.children.map(() => 1 / count)
                }
            } else if (node.type === 'edge-zone') {
                for (const [zone, target] of Object.entries(node.zones || {})) {
                    let resolved = collapse(target);
                    if (resolved && doc.nodes[resolved]) { node.zones[zone] = resolved } else { delete node.zones[zone] }
                }
            } else if (node.type === 'tabs') {
                if (!node.items || node.items.length === 0) { delete doc.nodes[nodeId]; return null }
                if (node.activeItemId === undefined || (node.activeItemId !== null && !node.items.includes(node.activeItemId))) {
                    node.activeItemId = node.items[0]
                }
            }

            return nodeId
        };

        let newRoot = collapse(doc.root);
        doc.root = newRoot ?? doc.root;

        // prune nodes unreachable from the (possibly new) root
        let reachable = DockZoneModel.reachableNodeIds(doc);
        Object.keys(doc.nodes).forEach(nodeId => {
            if (!reachable.has(nodeId)) delete doc.nodes[nodeId]
        });

        return doc
    }

    /**
     * @summary Normalizes + validates a mutated document; returns it only if valid (fail-closed).
     * @param {Object} original the untouched input document
     * @param {Object} mutated the working document after a mutation
     * @returns {{document:Object, errors:String[]}}
     * @protected
     * @static
     */
    static commit(original, mutated) {
        let normalized = DockZoneModel.normalizeTree(mutated),
            errors     = DockZoneModel.validate(normalized);

        return errors.length ? {document: original, errors} : {document: normalized, errors: []}
    }

    /**
     * @summary Inserts `itemId` into the target tabs node at `index` (relocating it if already in
     * the tree) and makes it the active tab.
     * @param {Object} document
     * @param {Object} args {itemId, tabsNodeId, index}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static addTab(document, {itemId, tabsNodeId, index} = {}) {
        if (!document.items?.[itemId])           return {document, errors: [`unknown item "${itemId}"`]};
        if (document.nodes?.[tabsNodeId]?.type !== 'tabs') return {document, errors: [`"${tabsNodeId}" is not a tabs node`]};

        let doc = DockZoneModel.clone(document);

        DockZoneModel.detachFromTabs(doc, itemId);

        let node = doc.nodes[tabsNodeId],
            at   = Number.isInteger(index) ? Math.max(0, Math.min(index, node.items.length)) : node.items.length;

        node.items.splice(at, 0, itemId);
        node.activeItemId = itemId;

        return DockZoneModel.commit(document, doc)
    }

    /**
     * @summary Relocates an in-tree `itemId` into the target tabs node at `index`.
     * @param {Object} document
     * @param {Object} args {itemId, targetNodeId, index}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static moveItem(document, {itemId, targetNodeId, index} = {}) {
        if (!DockZoneModel.findContainingTabsId(document, itemId)) {
            return {document, errors: [`item "${itemId}" is not in the tree`]}
        }

        return DockZoneModel.addTab(document, {itemId, tabsNodeId: targetNodeId, index})
    }

    /**
     * @summary Splits `targetNodeId` against a new pane holding `itemId`.
     *
     * Wraps `itemId` in a fresh single-tab node and replaces `targetNodeId` in its parent with a new
     * `split` whose children are `[new, target]` (position `before`) or `[target, new]` (position
     * `after`). When `targetNodeId` is the root, the new split becomes the root.
     * @param {Object} document
     * @param {Object} args {itemId, targetNodeId, orientation, position, sizes}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static splitNode(document, {itemId, targetNodeId, orientation, position = 'after', sizes} = {}) {
        if (!document.items?.[itemId])     return {document, errors: [`unknown item "${itemId}"`]};
        if (!document.nodes?.[targetNodeId]) return {document, errors: [`unknown target node "${targetNodeId}"`]};
        if (orientation !== 'horizontal' && orientation !== 'vertical') {
            return {document, errors: [`invalid split orientation "${orientation}"`]}
        }

        let doc = DockZoneModel.clone(document);

        DockZoneModel.detachFromTabs(doc, itemId);

        let newTabsId  = DockZoneModel.genId(doc, `tabs-${itemId}`),
            newSplitId = DockZoneModel.genId(doc, `split-${targetNodeId}`),
            ratio      = (Array.isArray(sizes) && sizes.length === 2) ? sizes : [0.5, 0.5];

        // Resolve the target's parent BEFORE inserting the new split — otherwise the new split
        // (which references the target) would be found as the target's own parent.
        let parentSlot = DockZoneModel.findParentSlot(doc, targetNodeId);

        doc.nodes[newTabsId] = {type: 'tabs', items: [itemId], activeItemId: itemId};
        doc.nodes[newSplitId] = {
            type    : 'split',
            orientation,
            children: position === 'before' ? [newTabsId, targetNodeId] : [targetNodeId, newTabsId],
            // `sizes` maps positionally to `children` in their final order; the caller
            // (DockPreview.previewToOperation) supplies them already in that order.
            sizes   : ratio
        };

        if (!parentSlot) {
            doc.root = newSplitId
        } else if (typeof parentSlot.slot === 'number') {
            doc.nodes[parentSlot.parentId].children[parentSlot.slot] = newSplitId
        } else {
            doc.nodes[parentSlot.parentId].zones[parentSlot.slot] = newSplitId
        }

        return DockZoneModel.commit(document, doc)
    }

    /**
     * @summary Removes `itemId` from the tree but preserves its catalog record (for popup/window
     * ownership), per the contract's `detachItem`.
     * @param {Object} document
     * @param {Object} args {itemId}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static detachItem(document, {itemId} = {}) {
        if (!DockZoneModel.findContainingTabsId(document, itemId)) {
            return {document, errors: [`item "${itemId}" is not in the tree`]}
        }

        let doc = DockZoneModel.clone(document);

        DockZoneModel.detachFromTabs(doc, itemId);

        return DockZoneModel.commit(document, doc)
    }

    /**
     * @summary Removes `itemId` from both the tree and the `items` catalog, per the contract's
     * `closeItem`.
     * @param {Object} document
     * @param {Object} args {itemId}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static closeItem(document, {itemId} = {}) {
        if (!document.items?.[itemId]) return {document, errors: [`unknown item "${itemId}"`]};

        let doc = DockZoneModel.clone(document);

        DockZoneModel.detachFromTabs(doc, itemId);
        delete doc.items[itemId];

        return DockZoneModel.commit(document, doc)
    }

    /**
     * @summary Applies an operation descriptor (the shape `DockPreview.previewToOperation()` emits)
     * to the document, dispatching to the matching semantic operation.
     *
     * A `tab-*` descriptor (`operation: 'addTab'`) is dispatched as a move when its item already
     * lives in the tree — the contract's "addTab or moveItem" downgrade, decided here.
     * @param {Object} document
     * @param {Object} descriptor {operation, ...}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static applyOperation(document, descriptor = {}) {
        switch (descriptor.operation) {
            case 'addTab':
                return DockZoneModel.findContainingTabsId(document, descriptor.itemId)
                    ? DockZoneModel.moveItem(document, {itemId: descriptor.itemId, targetNodeId: descriptor.tabsNodeId, index: descriptor.index})
                    : DockZoneModel.addTab(document, descriptor);
            case 'moveItem':
                return DockZoneModel.moveItem(document, descriptor);
            case 'splitNode':
                return DockZoneModel.splitNode(document, descriptor);
            case 'detachItem':
                return DockZoneModel.detachItem(document, descriptor);
            case 'closeItem':
                return DockZoneModel.closeItem(document, descriptor);
            default:
                return {document, errors: [`unknown operation "${descriptor.operation}"`]}
        }
    }
}

export default Neo.setupClass(DockZoneModel);
