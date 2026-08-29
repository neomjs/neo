import Base     from '../../../core/Base.mjs';
import Document from './Document.mjs';

/**
 * @class Neo.dashboard.dock.model.Operations
 * @extends Neo.core.Base
 *
 * @summary The semantic operation vocabulary and reducer dispatch over committed dock-zone documents.
 *
 * Split out of the former monolithic zone model per the graduated v13.2 DockLayouts
 * architecture: `model.Document` owns the committed-document contract, `model.Operations`
 * owns the semantic reducer vocabulary, `model.Persistence` owns saved-layout envelopes,
 * and `persistence.PerspectiveLibrary` is the sole collection/perspective authority.
 * Return shape for every operation and envelope helper: `{document|layout, errors}` —
 * fail-closed, the input is never partially mutated.
 */
class Operations extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.Operations'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.Operations'
    }

    /**
     * Dispatch table for `applyOperation()` — operation name → executor. THE single source of
     * the dockZone.v1 semantic vocabulary: `operations` derives from these keys, so an
     * operation cannot exist in dispatch without being exported, nor be exported without
     * dispatching — the two directions cannot diverge by construction. Handlers share the
     * executor signature `(document, descriptor)` and the fail-closed `{document, errors}`
     * result contract. The `addTab` entry carries the contract's "addTab or moveItem"
     * downgrade: a `tab-*` descriptor dispatches as a move when its item already lives
     * in the tree.
     * @member {Object} operationHandlers
     * @protected
     * @static
     */
    static operationHandlers = Object.freeze({
        addTab: (document, descriptor) =>
            Document.findContainingTabsId(document, descriptor.itemId)
                ? Operations.moveItem(document, {itemId: descriptor.itemId, targetNodeId: descriptor.tabsNodeId, index: descriptor.index})
                : Operations.addTab(document, descriptor),
        applyDocument    : (document, descriptor) => Operations.applyDocument(document, descriptor),
        setActiveItem    : (document, descriptor) => Operations.setActiveItem(document, descriptor),
        moveItem         : (document, descriptor) => Operations.moveItem(document, descriptor),
        splitNode        : (document, descriptor) => Operations.splitNode(document, descriptor),
        moveNode         : (document, descriptor) => Operations.moveNode(document, descriptor),
        resizeSplit      : (document, descriptor) => Operations.resizeSplit(document, descriptor),
        resizeEdgeZone   : (document, descriptor) => Operations.resizeEdgeZone(document, descriptor),
        detachItem       : (document, descriptor) => Operations.detachItem(document, descriptor),
        closeItem        : (document, descriptor) => Operations.closeItem(document, descriptor),
        setItemPinned    : (document, descriptor) => Operations.setItemPinned(document, descriptor),
        setItemAutoHidden: (document, descriptor) => Operations.setItemAutoHidden(document, descriptor),
        // transferItem / transferNode are TWO-document operations; their single-document dispatch is a
        // fail-closed redirect so each still joins the derived `operations` vocabulary without a
        // hand-listed entry. Execute them through the matching two-document Operations method.
        transferItem: document => ({document, errors: ['transferItem is a two-document operation; call Operations.transferItem(sourceDocument, targetDocument, descriptor)']}),
        transferNode: document => ({document, errors: ['transferNode is a two-document operation; call Operations.transferNode(sourceDocument, targetDocument, descriptor)']})
    })

    /**
     * The semantic operation vocabulary — derived from the dispatch table's keys, never
     * hand-listed, so vocabulary and dispatch agree in both directions by construction.
     * Consumers that enumerate, validate, or advertise executable operations read this
     * export (the Neural Link service tier reads it by reference). Prose surfaces (e.g.
     * OpenAPI tool descriptions) remain manual mirrors with NO mechanical guard — they
     * update by review discipline.
     * @member {ReadonlyArray<String>} operations
     * @static
     */
    static operations = Object.freeze(Object.keys(Operations.operationHandlers))

    /**
     * @summary Re-applies a whole candidate document through the shared fail-closed commit — the
     * generic reverse of any forward operation: the document IS the state, so the honest inverse
     * of a mutation (or a mutation burst) is the pre-mutation document, normalized + validated
     * exactly like any forward commit. A missing candidate fails closed with the original returned
     * untouched; a candidate failing validation never commits, per the `commit()` contract.
     * @param {Object} document the committed dock-zone document
     * @param {Object} descriptor {document: Object} the candidate document to commit
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static applyDocument(document, descriptor = {}) {
        return descriptor.document
            ? Document.commit(document, descriptor.document)
            : {document, errors: ['applyDocument requires a candidate document']}
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

        let doc = Document.clone(document);

        Document.detachFromTabs(doc, itemId);

        let node = doc.nodes[tabsNodeId],
            at   = Number.isInteger(index) ? Math.max(0, Math.min(index, node.items.length)) : node.items.length;

        node.items.splice(at, 0, itemId);
        node.activeItemId = itemId;

        return Document.commit(document, doc)
    }

    /**
     * @summary Relocates an in-tree `itemId` into the target tabs node at `index`.
     * @param {Object} document
     * @param {Object} args {itemId, targetNodeId, index}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static moveItem(document, {itemId, targetNodeId, index} = {}) {
        if (!Document.findContainingTabsId(document, itemId)) {
            return {document, errors: [`item "${itemId}" is not in the tree`]}
        }

        return Operations.addTab(document, {itemId, tabsNodeId: targetNodeId, index})
    }

    /**
     * @summary Commits one tabs node's active item through the semantic reducer.
     *
     * Projection events carry both the semantic tabs-node id and the selected item id. Membership
     * is validated against the committed document so a stale projected tab cannot redirect
     * activation into another stack. An already-active item is a successful byte-identical no-op.
     * @param {Object} document
     * @param {Object} args {tabsNodeId, itemId}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static setActiveItem(document, {tabsNodeId, itemId} = {}) {
        let tabs = document.nodes?.[tabsNodeId];

        if (!tabs) {
            return {document, errors: [`unknown tabs node "${tabsNodeId}"`]}
        }

        if (tabs.type !== 'tabs') {
            return {document, errors: [`"${tabsNodeId}" is not a tabs node`]}
        }

        if (!(tabs.items || []).includes(itemId)) {
            return {document, errors: [`item "${itemId}" is not a member of tabs node "${tabsNodeId}"`]}
        }

        if (tabs.activeItemId === itemId) {
            return {document, errors: []}
        }

        let doc = Document.clone(document);

        doc.nodes[tabsNodeId].activeItemId = itemId;

        return Document.commit(document, doc)
    }

    /**
     * @summary Splits `targetNodeId` against a new pane holding `itemId`.
     *
     * Wraps `itemId` in a fresh single-tab node and replaces `targetNodeId` in its parent with a new
     * `split` whose children are `[new, target]` (leading) or `[target, new]` (trailing). When
     * `targetNodeId` is the root, the new split becomes the root.
     *
     * The leading/trailing side comes from an explicit `position` (`before` / `after`) when given;
     * otherwise it is derived from the descriptor's `edge` — `top` / `left` lead (before), `bottom` /
     * `right` trail (after) — so a `Preview.previewToOperation()` edge descriptor places correctly.
     * @param {Object} document
     * @param {Object} args {itemId, targetNodeId, orientation, position, sizes, edge}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static splitNode(document, {edge, itemId, orientation, position, sizes, targetNodeId} = {}) {
        if (!document.items?.[itemId])     return {document, errors: [`unknown item "${itemId}"`]};
        if (!document.nodes?.[targetNodeId]) return {document, errors: [`unknown target node "${targetNodeId}"`]};
        if (orientation !== 'horizontal' && orientation !== 'vertical') {
            return {document, errors: [`invalid split orientation "${orientation}"`]}
        }

        let doc = Document.clone(document);

        Document.detachFromTabs(doc, itemId);

        let newTabsId  = Document.genId(doc, `tabs-${itemId}`),
            newSplitId = Document.genId(doc, `split-${targetNodeId}`),
            ratio      = (Array.isArray(sizes) && sizes.length === 2) ? sizes : [0.5, 0.5],
            // Edge descriptors encode the side in `edge`, not `position`: top / left lead (before),
            // bottom / right trail (after). An explicit `position` always wins.
            atPosition = position || ((edge === 'top' || edge === 'left') ? 'before' : 'after');

        // Resolve the target's parent BEFORE inserting the new split — otherwise the new split
        // (which references the target) would be found as the target's own parent.
        let parentSlot = Document.findParentSlot(doc, targetNodeId);

        doc.nodes[newTabsId] = {type: 'tabs', items: [itemId], activeItemId: itemId};
        doc.nodes[newSplitId] = {
            type    : 'split',
            orientation,
            children: atPosition === 'before' ? [newTabsId, targetNodeId] : [targetNodeId, newTabsId],
            // `sizes` maps positionally to `children` in their final order; the caller
            // (Preview.previewToOperation) supplies them already in that order.
            sizes   : ratio
        };

        if (!parentSlot) {
            doc.root = newSplitId
        } else if (typeof parentSlot.slot === 'number') {
            doc.nodes[parentSlot.parentId].children[parentSlot.slot] = newSplitId
        } else {
            Document.setZoneNodeId(doc.nodes[parentSlot.parentId], parentSlot.slot, newSplitId)
        }

        return Document.commit(document, doc)
    }

    /**
     * @summary Updates an existing split node's normalized child sizes.
     *
     * Resizable splitter affordances can pass pixel-derived or ratio-derived positive values. This
     * operation normalizes them to the persisted dock-zone ratio contract and commits through the
     * same fail-closed path as the rest of the semantic model.
     * @param {Object} document
     * @param {Object} args {splitNodeId, sizes}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static resizeSplit(document, {splitNodeId, sizes} = {}) {
        let split = document.nodes?.[splitNodeId];

        if (!split) {
            return {document, errors: [`unknown split node "${splitNodeId}"`]}
        }

        if (split.type !== 'split') {
            return {document, errors: [`"${splitNodeId}" is not a split node`]}
        }

        let normalized = Document.normalizeSplitSizes(sizes, (split.children || []).length, splitNodeId);

        if (normalized.errors.length) {
            return {document, errors: normalized.errors}
        }

        let doc = Document.clone(document);

        doc.nodes[splitNodeId].sizes = normalized.sizes;

        return Document.commit(document, doc)
    }

    /**
     * @summary Commits one normalized extent onto a resizable nested edge-zone descriptor.
     *
     * Runtime pixels and CSS constraints stay outside the document. The interaction layer converts
     * its final CSS-bounded geometry into this normalized fraction; the reducer validates only the
     * durable semantic domain and the descriptor's explicit resize permission.
     * @param {Object} document
     * @param {Object} args {edgeZoneId, edge, extent}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static resizeEdgeZone(document, {edgeZoneId, edge, extent} = {}) {
        let edgeZone   = document.nodes?.[edgeZoneId],
            descriptor = edgeZone?.zones?.[edge];

        if (!edgeZone) {
            return {document, errors: [`unknown edge-zone node "${edgeZoneId}"`]}
        }

        if (edgeZone.type !== 'edge-zone') {
            return {document, errors: [`"${edgeZoneId}" is not an edge-zone node`]}
        }

        if (!['top', 'right', 'bottom', 'left'].includes(edge)) {
            return {document, errors: [`edge "${edge}" is not resizable`]}
        }

        if (!Document.isJsonRecord(descriptor) || !Document.getZoneNodeId(descriptor)) {
            return {document, errors: [`edge-zone "${edgeZoneId}" has no valid "${edge}" descriptor`]}
        }

        if (descriptor.resizable !== true) {
            return {document, errors: [`edge-zone "${edgeZoneId}" edge "${edge}" is not resizable`]}
        }

        if (typeof extent !== 'number' || !Number.isFinite(extent) || extent <= 0 || extent >= 1) {
            return {document, errors: ['extent must be a finite number between 0 and 1']}
        }

        if (descriptor.extent === extent) {
            return {document, errors: []}
        }

        let doc = Document.clone(document);

        doc.nodes[edgeZoneId].zones[edge].extent = extent;

        return Document.commit(document, doc)
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
        if (!Document.findContainingTabsId(document, itemId)) {
            return {document, errors: [`item "${itemId}" is not in the tree`]}
        }

        let doc = Document.clone(document);

        Document.detachFromTabs(doc, itemId);

        return Document.commit(document, doc)
    }

    /**
     * @summary Removes a closeable `itemId` from the tree and catalog. When the item was active,
     * activates the item at its former index or the preceding item; closing a non-active item
     * preserves the surviving activation. An explicit `closable:false` fails closed.
     * @param {Object} document
     * @param {Object} args {itemId}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static closeItem(document, {itemId} = {}) {
        let item = document.items?.[itemId];

        if (!item) return {document, errors: [`unknown item "${itemId}"`]};
        if (item.closable === false) return {document, errors: [`item "${itemId}" is not closable`]};

        let tabsNodeId  = Document.findContainingTabsId(document, itemId),
            closedIndex = tabsNodeId ? document.nodes[tabsNodeId].items.indexOf(itemId) : -1,
            wasActive   = tabsNodeId ? document.nodes[tabsNodeId].activeItemId === itemId : false,
            doc         = Document.clone(document);

        Document.detachFromTabs(doc, itemId);

        if (wasActive && tabsNodeId && doc.nodes[tabsNodeId]?.type === 'tabs') {
            let node = doc.nodes[tabsNodeId];

            // When the closed item owned activation, the item now occupying its slot wins;
            // closing the last item falls back to its preceding sibling. A surviving active item
            // is left untouched. This is semantic model policy, not a projected-index guess.
            node.activeItemId = node.items[Math.min(closedIndex, node.items.length - 1)] ?? null
        }

        delete doc.items[itemId];

        return Document.commit(document, doc)
    }

    /**
     * @summary Updates an item's persisted pin state when its policy permits pinning.
     * @param {Object} document
     * @param {Object} args {itemId, pinned}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static setItemPinned(document, {itemId, pinned} = {}) {
        let item = document.items?.[itemId];

        if (!item) return {document, errors: [`unknown item "${itemId}"`]};
        if (typeof pinned !== 'boolean') return {document, errors: ['pinned must be a boolean']};
        if (item.pinnable === false) return {document, errors: [`item "${itemId}" is not pinnable`]};

        let doc = Document.clone(document);

        doc.items[itemId].pinned = pinned;

        if (pinned) {
            doc.items[itemId].autoHidden = false
        }

        return Document.commit(document, doc)
    }

    /**
     * @summary Updates an item's persisted auto-hide/collapsed state when its policy permits it.
     * @param {Object} document
     * @param {Object} args {itemId, autoHidden}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static setItemAutoHidden(document, {itemId, autoHidden} = {}) {
        let item = document.items?.[itemId];

        if (!item) return {document, errors: [`unknown item "${itemId}"`]};
        if (typeof autoHidden !== 'boolean') return {document, errors: ['autoHidden must be a boolean']};
        if (item.pinnable === false) return {document, errors: [`item "${itemId}" is not pinnable`]};
        if (autoHidden && item.pinned === true) return {document, errors: [`item "${itemId}" is pinned and cannot be autoHidden`]};

        let doc = Document.clone(document);

        doc.items[itemId].autoHidden = autoHidden;

        return Document.commit(document, doc)
    }

    /**
     * @summary Applies an operation descriptor (the shape `Preview.previewToOperation()` emits)
     * to the document, dispatching through {@link #operationHandlers} — the table whose keys ARE
     * the exported vocabulary, so dispatch and `operations` cannot diverge.
     *
     * A `tab-*` descriptor (`operation: 'addTab'`) is dispatched as a move when its item already
     * lives in the tree — the contract's "addTab or moveItem" downgrade, carried by the table's
     * `addTab` entry.
     * @param {Object} document
     * @param {Object} descriptor {operation, ...}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static applyOperation(document, descriptor = {}) {
        // Own-key lookup only: inherited names ('constructor', '__proto__', …) must reject
        // exactly like any unknown operation, never resolve to a prototype member.
        const handler = Object.hasOwn(Operations.operationHandlers, descriptor.operation)
            ? Operations.operationHandlers[descriptor.operation]
            : null;

        return handler
            ? handler(document, descriptor)
            : {document, errors: [`unknown operation "${descriptor.operation}"`]}
    }

    /**
     * @summary Atomically transfers `itemId` out of `sourceDocument` and into `targetDocument` in one
     * commit-or-neither step: the item is removed from the source tree + catalog and placed into the
     * target through the nested `target` placement descriptor. The item record travels verbatim — no
     * re-instantiation semantics enter the executor, which operates on documents only.
     *
     * Fail-closed and atomic: a validation error on EITHER document returns BOTH inputs untouched plus
     * a non-empty `errors` array, so a half-transferred item — removed here but not placed there, the
     * contract's named violation — can never commit. The nested `target` is dispatched through the
     * landed single-document placement path (`addTab` / `splitNode` via {@link #applyOperation}), so
     * no second placement grammar is introduced.
     *
     * The executor is document-centric: `sourceWorkspaceId` / `targetWorkspaceId` are the caller's
     * (adapter-tier) resolution keys, used here only to reject a same-workspace transfer — that is a
     * `moveItem`, not a transfer.
     * @param {Object} sourceDocument the committed dock-zone document the item leaves
     * @param {Object} targetDocument the committed dock-zone document the item joins
     * @param {Object} descriptor {itemId, sourceWorkspaceId, targetWorkspaceId, target}
     * @returns {{sourceDocument:Object, targetDocument:Object, errors:String[]}}
     * @static
     */
    static transferItem(sourceDocument, targetDocument, {itemId, sourceWorkspaceId, targetWorkspaceId, target} = {}) {
        let fail   = errors => ({sourceDocument, targetDocument, errors}),
            record = sourceDocument?.items?.[itemId];

        // Preconditions checked against BOTH documents before any mutation (fail-closed).
        if (!record)                         return fail([`unknown item "${itemId}"`]);
        if (record.movable === false)        return fail([`item "${itemId}" is not movable`]);
        if (targetDocument?.items?.[itemId]) return fail([`item "${itemId}" already exists in the target document`]);
        if (sourceWorkspaceId !== undefined && sourceWorkspaceId === targetWorkspaceId) {
            return fail(['transferItem requires distinct source and target workspaces'])
        }
        if (!target || (target.operation !== 'addTab' && target.operation !== 'splitNode')) {
            return fail(['transferItem target must be an addTab or splitNode descriptor'])
        }

        // Source side: drop from the tree (a no-op for an already-detached item) + catalog, then
        // normalize + validate through the shared fail-closed commit.
        let sourceWorking = Document.clone(sourceDocument);

        Document.detachFromTabs(sourceWorking, itemId);
        delete sourceWorking.items[itemId];

        let sourceResult = Document.commit(sourceDocument, sourceWorking);

        // Target side: insert the verbatim record into the catalog, then place it through the landed
        // single-document dispatch (which normalizes + validates the target tree). The transfer's
        // `itemId` overrides any id the caller left in the nested descriptor.
        let targetWorking = Document.clone(targetDocument);

        targetWorking.items[itemId] = Document.clone(record);

        let targetResult = Operations.applyOperation(targetWorking, {...target, itemId}),
            errors       = [...sourceResult.errors, ...targetResult.errors];

        // Commit-or-neither: any error on either side rolls the whole transfer back to both inputs.
        if (errors.length) {
            return fail(errors)
        }

        return {sourceDocument: sourceResult.document, targetDocument: targetResult.document, errors: []}
    }

    /**
     * @summary Re-parents the subtree rooted at `nodeId` to `targetNodeId` within one document — the
     * grouped-drag move. The dock tree already models a group as a `tabs` node, so grouped drag moves
     * a NODE, not N items. A `{kind: 'tab-into'}` placement merges the moved tabs node's items into the
     * target tabs node in order; otherwise a split placement (`{orientation, position|edge, sizes}`)
     * wraps the target + the subtree in a new split. `normalizeTree` restores invariants (collapsing
     * the emptied source slot) afterward.
     *
     * Fail-closed: unknown node/target, moving the root, moving a node onto itself, an invalid
     * placement, or moving a node into its OWN subtree (the cycle guard, via the reachable-set walk
     * rooted at `nodeId`) all return the document untouched + errors.
     * @param {Object} document
     * @param {Object} args {nodeId, targetNodeId, placement}
     * @returns {{document:Object, errors:String[]}}
     * @static
     */
    static moveNode(document, {nodeId, targetNodeId, placement = {}} = {}) {
        let nodes = document?.nodes || {};

        if (!nodes[nodeId])           return {document, errors: [`unknown node "${nodeId}"`]};
        if (!nodes[targetNodeId])     return {document, errors: [`unknown target node "${targetNodeId}"`]};
        if (nodeId === targetNodeId)  return {document, errors: [`cannot move node "${nodeId}" onto itself`]};
        if (nodeId === document.root) return {document, errors: ['cannot move the root node']};

        // cycle guard: the target must not live inside the moved subtree (walk rooted AT nodeId)
        if (Document.reachableNodeIds({nodes, root: nodeId}).has(targetNodeId)) {
            return {document, errors: [`cannot move node "${nodeId}" into its own subtree`]}
        }

        let doc = Document.clone(document);

        Document.detachNode(doc, nodeId);

        let errors = Document.attachNode(doc, nodeId, targetNodeId, placement);

        return errors.length ? {document, errors} : Document.commit(document, doc)
    }

    /**
     * @summary Atomically transfers the subtree rooted at `nodeId` out of `sourceDocument` and into
     * `targetDocument` in one commit-or-neither step — the cross-window grouped-drag transfer. It is
     * the two-document sibling of `moveNode`: `transferItem` atomicity applied to a whole subtree. The
     * subtree's nodes and all its member item records travel verbatim, and it re-homes at
     * `target.targetNodeId` per `target.placement` (the `moveNode` attach grammar). Reuses the landed
     * atomic path — no second atomicity implementation.
     *
     * Fail-closed and atomic: any error on either document returns BOTH inputs untouched + a non-empty
     * `errors` array. A node-id or member-item-id already present in the target, an unmovable member,
     * the root node, a same-workspace transfer, or a placement failure all reject with nothing committed.
     * @param {Object} sourceDocument the committed dock-zone document the subtree leaves
     * @param {Object} targetDocument the committed dock-zone document the subtree joins
     * @param {Object} descriptor {nodeId, sourceWorkspaceId, targetWorkspaceId, target:{targetNodeId, placement}}
     * @returns {{sourceDocument:Object, targetDocument:Object, errors:String[]}}
     * @static
     */
    static transferNode(sourceDocument, targetDocument, {nodeId, sourceWorkspaceId, targetWorkspaceId, target} = {}) {
        let fail        = errors => ({sourceDocument, targetDocument, errors}),
            sourceNodes = sourceDocument?.nodes || {};

        if (!sourceNodes[nodeId])           return fail([`unknown node "${nodeId}"`]);
        if (nodeId === sourceDocument.root) return fail(['cannot transfer the root node']);
        if (sourceWorkspaceId !== undefined && sourceWorkspaceId === targetWorkspaceId) {
            return fail(['transferNode requires distinct source and target workspaces'])
        }
        if (!target || !targetDocument?.nodes?.[target.targetNodeId]) {
            return fail(['transferNode target must name an existing target node'])
        }

        // The subtree: its node ids + the member item ids its tabs nodes carry.
        let subtreeNodeIds = Document.reachableNodeIds({nodes: sourceNodes, root: nodeId}),
            memberItemIds  = [];

        subtreeNodeIds.forEach(id => {
            if (sourceNodes[id].type === 'tabs') memberItemIds.push(...(sourceNodes[id].items || []))
        });

        // Preconditions across BOTH documents before any mutation: no node-id or member-id may already
        // exist in the target, and every member must be movable.
        for (const id of subtreeNodeIds) {
            if (targetDocument.nodes?.[id]) return fail([`node "${id}" already exists in the target document`])
        }
        for (const itemId of memberItemIds) {
            if (sourceDocument.items?.[itemId]?.movable === false) return fail([`item "${itemId}" is not movable`]);
            if (targetDocument.items?.[itemId])                    return fail([`item "${itemId}" already exists in the target document`])
        }

        // Source side: unlink the subtree, drop its nodes + member records, normalize + validate.
        let sourceWorking = Document.clone(sourceDocument);

        Document.detachNode(sourceWorking, nodeId);
        subtreeNodeIds.forEach(id => delete sourceWorking.nodes[id]);
        memberItemIds.forEach(itemId => delete sourceWorking.items[itemId]);

        let sourceResult = Document.commit(sourceDocument, sourceWorking);

        // Target side: graft the member records + subtree nodes verbatim, then attach the subtree root
        // through the shared moveNode placement grammar; normalize + validate.
        let targetWorking = Document.clone(targetDocument);

        memberItemIds.forEach(itemId => targetWorking.items[itemId] = Document.clone(sourceDocument.items[itemId]));
        subtreeNodeIds.forEach(id => targetWorking.nodes[id] = Document.clone(sourceDocument.nodes[id]));

        let attachErrors = Document.attachNode(targetWorking, nodeId, target.targetNodeId, target.placement || {}),
            targetResult = attachErrors.length
                ? {document: targetDocument, errors: attachErrors}
                : Document.commit(targetDocument, targetWorking),
            errors       = [...sourceResult.errors, ...targetResult.errors];

        // Commit-or-neither: any error on either side rolls the whole transfer back to both inputs.
        if (errors.length) {
            return fail(errors)
        }

        return {sourceDocument: sourceResult.document, targetDocument: targetResult.document, errors: []}
    }
}

export default Neo.setupClass(Operations);
