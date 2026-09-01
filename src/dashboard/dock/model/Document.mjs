import Base from '../../../core/Base.mjs';

/**
 * @class Neo.dashboard.dock.model.Document
 * @extends Neo.core.Base
 *
 * @summary The committed dock-zone document contract: schema keys, validation, normalization, tree helpers, and the fail-closed commit.
 *
 * Split out of the former monolithic zone model per the graduated v13.2 DockLayouts
 * architecture: `model.Document` owns the committed-document contract, `model.Operations`
 * owns the semantic reducer vocabulary, `model.Persistence` owns saved-layout envelopes,
 * and `persistence.PerspectiveLibrary` is the sole collection/perspective authority.
 * Return shape for every operation and envelope helper: `{document|layout, errors}` —
 * fail-closed, the input is never partially mutated.
 */
class Document extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.Document'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.Document'
    }

    /**
     * The persisted dock-zone document schema this executor operates on.
     * @member {String} SCHEMA='neo.dock.zone.v1'
     * @static
     */
    static SCHEMA = 'neo.dock.zone.v1'

    /**
     * Top-level fields allowed in a persisted dock-zone document.
     * @member {Set<String>} dockZoneDocumentKeys
     * @protected
     * @static
     */
    static dockZoneDocumentKeys = new Set(['schema', 'root', 'items', 'nodes'])

    /**
     * Fields allowed on persisted dock-zone item records.
     * @member {Set<String>} dockZoneItemKeys
     * @protected
     * @static
     */
    static dockZoneItemKeys = new Set([
        'componentRef', 'title', 'kind', 'blueprint', 'closable', 'pinnable', 'pinned',
        'autoHidden', 'lockable', 'locked', 'movable', 'metadata'
    ])

    /**
     * Fields allowed on persisted dock-zone nodes, keyed by node type.
     * @member {Object<String, Set<String>>} dockZoneNodeKeys
     * @protected
     * @static
     */
    static dockZoneNodeKeys = {
        'edge-zone': new Set(['type', 'zones']),
        split      : new Set(['type', 'orientation', 'children', 'sizes']),
        tabs       : new Set(['type', 'items', 'activeItemId'])
    }

    /**
     * Runtime-only preview / interaction keys that must never enter committed OR persisted dock-zone
     * state (the JSON-first serialization contract). `validate` rejects a document carrying any of
     * these ANYWHERE — including inside the opaque `metadata` channel — so they cannot be smuggled
     * through a saved layout; `Neo.dashboard.dock.projection.LayoutAdapter` reads this same set at the projection
     * boundary, so persistence-rejection and projection-rejection cannot drift.
     * @member {Set<String>} forbiddenPreviewKeys
     * @protected
     * @static
     */
    static forbiddenPreviewKeys = new Set([
        'appName',
        'currentIndex',
        'draggedItem',
        'dockPreview',
        'domRect',
        'DOMRect',
        'groupNodeId',
        'isWindowDragging',
        'placement',
        'pointer',
        'pointerX',
        'pointerY',
        'previewId',
        'sourceSortZone',
        'targetSortZone',
        'windowId'
    ])

    /**
     * @summary Recursively finds the first runtime-only preview key ({@link #forbiddenPreviewKeys})
     * anywhere in an arbitrary JSON graph — including nested `metadata` — or null when the graph is
     * clean. Both the persistence contract (`validate`) and the render boundary (adapter projection)
     * scan through this one finder.
     * @param {*} value
     * @returns {String|null}
     * @protected
     * @static
     */
    static findForbiddenPreviewKey(value) {
        if (!value || typeof value !== 'object') {
            return null
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                let match = Document.findForbiddenPreviewKey(value[i]);

                if (match) {
                    return match
                }
            }

            return null
        }

        for (let key of Object.keys(value)) {
            if (Document.forbiddenPreviewKeys.has(key)) {
                return key
            }

            let match = Document.findForbiddenPreviewKey(value[key]);

            if (match) {
                return match
            }
        }

        return null
    }

    /**
     * Zone names allowed in an `edge-zone` node.
     * @member {Set<String>} dockZoneEdgeKeys
     * @protected
     * @static
     */
    static dockZoneEdgeKeys = new Set(['top', 'right', 'bottom', 'left', 'center'])

    /**
     * Fields allowed on one nested edge-zone descriptor.
     * @member {Set<String>} dockZoneDescriptorKeys
     * @protected
     * @static
     */
    static dockZoneDescriptorKeys = new Set(['nodeId', 'extent', 'resizable'])

    /**
     * @summary Resolves the child node id owned by one final nested edge-zone descriptor.
     *
     * The v13.2 greenfield contract deliberately rejects the retired string shorthand. Returning
     * null for every non-record shape keeps tree walkers fail-closed without creating a hidden
     * compatibility reader.
     * @param {*} descriptor
     * @returns {String|null}
     * @static
     */
    static getZoneNodeId(descriptor) {
        return Document.isJsonRecord(descriptor) && typeof descriptor.nodeId === 'string' && descriptor.nodeId
            ? descriptor.nodeId
            : null
    }

    /**
     * @summary Repoints one nested edge-zone descriptor while preserving its extent and policy.
     * @param {Object} edgeZoneNode
     * @param {String} edge
     * @param {String} nodeId
     * @protected
     * @static
     */
    static setZoneNodeId(edgeZoneNode, edge, nodeId) {
        edgeZoneNode.zones[edge] = {
            ...(Document.isJsonRecord(edgeZoneNode.zones[edge]) ? edgeZoneNode.zones[edge] : {}),
            nodeId
        }
    }

    /**
     * @summary Type-aware deep clone of a dock-zone document.
     *
     * Uses `Neo.clone` (deep, ignoring Neo instances) rather than a `JSON.parse(JSON.stringify())`
     * round-trip: the round-trip corrupts `Date` values into strings and silently drops `undefined`,
     * functions, `Map`/`Set`, and symbol keys, whereas `Neo.clone`'s type map preserves them.
     * @param {Object} document
     * @returns {Object}
     * @static
     */
    static clone(document) {
        return Neo.clone(document, true, true)
    }

    /**
     * @summary Returns true for JSON object records only.
     * @param {*} value
     * @returns {Boolean}
     * @protected
     * @static
     */
    static isJsonRecord(value) {
        return value !== null &&
            typeof value === 'object' &&
            (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    }

    /**
     * @summary Returns the first value that cannot round-trip as JSON.
     * @param {*} value
     * @param {String} [path='value']
     * @param {WeakSet<Object>} [seen=new WeakSet()]
     * @returns {{path:String, reason:String}|null}
     * @protected
     * @static
     */
    static findNonJsonValue(value, path='value', seen=new WeakSet()) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') {
            return null
        }

        if (typeof value === 'number') {
            return Number.isFinite(value) ? null : {path, reason: 'number must be finite'}
        }

        if (typeof value !== 'object') {
            return {path, reason: `${typeof value} is not JSON-serializable`}
        }

        if (seen.has(value)) {
            return {path, reason: 'cyclic object graph is not JSON-serializable'}
        }

        seen.add(value);

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                let match = Document.findNonJsonValue(value[i], `${path}[${i}]`, seen);

                if (match) {
                    return match
                }
            }

            return null
        }

        if (!Document.isJsonRecord(value)) {
            return {path, reason: `${value.constructor?.name || 'object'} is not a JSON record`}
        }

        for (const key of Reflect.ownKeys(value)) {
            if (typeof key === 'symbol') {
                return {path: `${path}.${String(key)}`, reason: 'symbol keys are not JSON-serializable'}
            }

            let match = Document.findNonJsonValue(value[key], `${path}.${key}`, seen);

            if (match) {
                return match
            }
        }

        return null
    }

    /**
     * @summary Returns the first own string key outside a finite schema allowlist.
     * @param {Object} record
     * @param {Set<String>} allowedKeys
     * @param {String} path
     * @returns {{key:String, path:String, reason:String}|null}
     * @protected
     * @static
     */
    static findUnexpectedKey(record, allowedKeys, path) {
        for (const key of Object.keys(record)) {
            if (!allowedKeys.has(key)) {
                return {key, path: `${path}.${key}`, reason: 'field is outside the saved-layout schema'}
            }
        }

        return null
    }

    /**
     * @summary Returns true when a metadata key name is likely to carry credential material.
     * @param {String} key
     * @returns {Boolean}
     * @protected
     * @static
     */
    static isSecretMetadataKey(key) {
        let normalized = key
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();

        return /(^|_)(secret|secrets|token|tokens|credential|credentials|password|passwords|pat|pats)$/.test(normalized) ||
            /(^|_)(api|auth|session|access|refresh|bridge|github|private|personal_access)_?(key|token|secret|credential|password)$/.test(normalized)
    }

    /**
     * @summary Returns the first metadata key that looks like credential material.
     * @param {*} value
     * @param {String} [path='metadata']
     * @returns {{key:String, path:String, reason:String}|null}
     * @protected
     * @static
     */
    static findSecretMetadataKey(value, path='metadata') {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                let match = Document.findSecretMetadataKey(value[i], `${path}[${i}]`);

                if (match) {
                    return match
                }
            }

            return null
        }

        if (!Document.isJsonRecord(value)) {
            return null
        }

        for (const [key, child] of Object.entries(value)) {
            if (Document.isSecretMetadataKey(key)) {
                return {key, path: `${path}.${key}`, reason: 'metadata must not contain credentials or secrets'}
            }

            let match = Document.findSecretMetadataKey(child, `${path}.${key}`);

            if (match) {
                return match
            }
        }

        return null
    }

    /**
     * @summary Returns the first field in a dock-zone document that is outside the persisted schema.
     *
     * `metadata` and `blueprint` are explicit opaque JSON-only extension points. They are caller-owned
     * descriptive/config payloads and must not carry secrets or runtime authority; the helper enforces
     * their JSON value shape, while this allowlist rejects runtime fields added beside the known model.
     * @param {Object} document
     * @param {String} [path='dockZone']
     * @returns {{key:String, path:String, reason:String}|null}
     * @protected
     * @static
     */
    static findUnexpectedDockZoneKey(document, path='dockZone') {
        if (!Document.isJsonRecord(document)) {
            return null
        }

        let unexpected = Document.findUnexpectedKey(document, Document.dockZoneDocumentKeys, path);

        if (unexpected) {
            return unexpected
        }

        if (Document.isJsonRecord(document.items)) {
            for (const [itemId, item] of Object.entries(document.items)) {
                if (!Document.isJsonRecord(item)) {
                    return {key: itemId, path: `${path}.items.${itemId}`, reason: 'item record must be a JSON object'}
                }

                unexpected = Document.findUnexpectedKey(item, Document.dockZoneItemKeys, `${path}.items.${itemId}`);

                if (unexpected) {
                    return unexpected
                }
            }
        }

        if (Document.isJsonRecord(document.nodes)) {
            for (const [nodeId, node] of Object.entries(document.nodes)) {
                if (!Document.isJsonRecord(node)) {
                    return {key: nodeId, path: `${path}.nodes.${nodeId}`, reason: 'node record must be a JSON object'}
                }

                let allowedNodeKeys = Document.dockZoneNodeKeys[node.type];

                if (!allowedNodeKeys) {
                    return {key: 'type', path: `${path}.nodes.${nodeId}.type`, reason: `unsupported dock-zone node type "${node.type}"`}
                }

                unexpected = Document.findUnexpectedKey(node, allowedNodeKeys, `${path}.nodes.${nodeId}`);

                if (unexpected) {
                    return unexpected
                }

                if (node.type === 'edge-zone') {
                    if (!Document.isJsonRecord(node.zones)) {
                        return {key: 'zones', path: `${path}.nodes.${nodeId}.zones`, reason: 'edge-zone zones must be a JSON object'}
                    }

                    unexpected = Document.findUnexpectedKey(node.zones, Document.dockZoneEdgeKeys, `${path}.nodes.${nodeId}.zones`);

                    if (unexpected) {
                        return unexpected
                    }

                    for (const [edge, descriptor] of Object.entries(node.zones)) {
                        if (!Document.isJsonRecord(descriptor)) {
                            return {
                                key   : edge,
                                path  : `${path}.nodes.${nodeId}.zones.${edge}`,
                                reason: 'edge-zone descriptor must be a JSON object'
                            }
                        }

                        unexpected = Document.findUnexpectedKey(
                            descriptor,
                            Document.dockZoneDescriptorKeys,
                            `${path}.nodes.${nodeId}.zones.${edge}`
                        );

                        if (unexpected) {
                            return unexpected
                        }
                    }
                }
            }
        }

        return null
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
     * @summary Captures an item's exact tree placement — the stored-position half of
     * exact-position reintegration (docking design record §2.8,
     * `learn/agentos/decisions/0029-docking-design.md`).
     *
     * `addTab` appends by default, so a detached item's way back to its ORIGINAL slot exists
     * only if this pair was captured while the item was still in the tree — capture happens
     * BEFORE the detach commit, restore passes the pair straight into `addTab`'s clamped
     * `index`. Fail-closed: an item no tabs node currently holds captures `null` (catalog
     * presence is not placement; there is nothing to restore to).
     * @param {Object} document
     * @param {String} itemId
     * @returns {{tabsNodeId: String, index: Number}|null}
     * @static
     */
    static captureItemPlacement(document, itemId) {
        let tabsNodeId = Document.findContainingTabsId(document, itemId),
            index      = tabsNodeId ? document.nodes[tabsNodeId].items.indexOf(itemId) : -1;

        return index >= 0 ? {tabsNodeId, index} : null
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
                for (const [zone, descriptor] of Object.entries(node.zones)) {
                    if (Document.getZoneNodeId(descriptor) === nodeId) return {parentId, slot: zone}
                }
            }
        }

        return null
    }

    /**
     * @summary Returns the workspace edge whose rail `itemId` would collapse to, or null when no
     * edge owns it — the structural half of docking design record §2.7's "the rail an item collapses
     * to is the edge zone that contains it".
     *
     * Walks item → tabs node → ancestors, recording every `edge-zone` ancestor reached through a
     * DIRECTIONAL slot and returning the OUTERMOST one. Outermost is not an arbitrary tie-break: it
     * is what the projection already does. `LayoutAdapter.projectEdgeZoneNode` collects each band
     * with `collectAutoHiddenItems`, which recurses through nested edge-zones, then passes the
     * claimed set down as `railedItemIds` so the inner tab flow drops them — so an item nested two
     * edge-zones deep rails on the OUTER edge, and an inner band that also contains it never gets to
     * claim it, because that projection filters its own collection against the inherited claim.
     *
     * This query and that projection must agree, and `DockZoneModel.spec` pins them together against
     * the RENDERED tree — `LayoutAdapter.project()`, not `collectAutoHiddenItems`. Comparing against
     * the collection helper is what let them drift: the helper recurses correctly and so agreed with
     * this query by construction, while the projection built from it re-railed the nested item and
     * left its sibling in the tab flow. Two derivations agreeing with each other was never the
     * property; agreeing with what renders is.
     *
     * A `center` slot is not a claim (§2.7: center-zone items never rail — main content does not
     * auto-hide), so an item reaching the root only through center zones returns null. Null is
     * therefore the fail-safe answer for BOTH "center-owned" and "no such item": a caller gating an
     * affordance on a truthy edge cannot offer a collapse the projection would not render.
     * @param {Object} document
     * @param {String} itemId
     * @returns {String|null} One of `top`, `right`, `bottom`, `left`, else null
     * @static
     */
    static findOwningEdge(document, itemId) {
        let nodeId = Document.findContainingTabsId(document, itemId),
            edge   = null,
            seen   = new Set(),
            parent;

        // `seen` bounds the climb. A well-formed document is a tree, but this query also runs
        // against documents mid-operation, and a cycle here would hang the render thread.
        while (nodeId && !seen.has(nodeId)) {
            seen.add(nodeId);

            parent = Document.findParentSlot(document, nodeId);

            if (!parent) break;

            if (document.nodes[parent.parentId]?.type === 'edge-zone' &&
                ['top', 'right', 'bottom', 'left'].includes(parent.slot)) {
                edge = parent.slot
            }

            nodeId = parent.parentId
        }

        return edge
    }

    /**
     * @summary Mutating helper: removes `itemId` from whatever tabs node holds it, fixing activeItemId.
     * @param {Object} document the working (already-cloned) document
     * @param {String} itemId
     * @protected
     * @static
     */
    static detachFromTabs(document, itemId) {
        let tabsId = Document.findContainingTabsId(document, itemId);

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
                    Object.values(node.zones || {}).map(Document.getZoneNodeId).forEach(walk)
                }
            };

        walk(document.root);

        return seen
    }

    /**
     * @summary Mutating helper: unlinks the subtree rooted at `nodeId` from its parent, leaving the
     * subtree's nodes in place (an unreferenced subtree the caller re-attaches, or `normalizeTree`
     * prunes). A split parent has the child spliced out and its remaining sizes renormalized to sum 1
     * (preserving the survivors' relative ratios); an edge-zone parent has the zone deleted.
     * @param {Object} document the working (already-cloned) document
     * @param {String} nodeId
     * @protected
     * @static
     */
    static detachNode(document, nodeId) {
        let slot = Document.findParentSlot(document, nodeId);

        if (!slot) return;

        let parent = document.nodes[slot.parentId];

        if (typeof slot.slot === 'number') {
            parent.children.splice(slot.slot, 1);

            if (Array.isArray(parent.sizes)) {
                parent.sizes.splice(slot.slot, 1);

                let sum = parent.sizes.reduce((total, size) => total + size, 0);

                if (sum > 0) {
                    parent.sizes = parent.sizes.map(size => size / sum);

                    // pin the last ratio to absorb float drift so the survivors sum to exactly 1
                    let last = parent.sizes.length - 1;

                    if (last > 0) {
                        parent.sizes[last] = 1 - parent.sizes.slice(0, last).reduce((total, size) => total + size, 0)
                    }
                }
            }
        } else {
            delete parent.zones[slot.slot]
        }
    }

    /**
     * @summary Mutating helper: grafts an already-present subtree root `nodeId` into `document` at
     * `targetNodeId` per `placement`. A `{kind: 'tab-into'}` placement merges the moved tabs node's
     * items into the target tabs node in order then drops the emptied node; otherwise a split
     * placement (`{orientation, position|edge, sizes}`) wraps the target + the moved subtree in a new
     * split — the same parent-slot swap `splitNode` performs, generalized from a fresh pane to an
     * existing subtree. Assumes `nodeId` is already detached and its nodes are present. Returns the
     * (possibly empty) errors — empty means it mutated `document`.
     * @param {Object} document the working (already-cloned) document
     * @param {String} nodeId the subtree root to attach
     * @param {String} targetNodeId the node the placement is relative to
     * @param {Object} placement `{kind:'tab-into'}` or `{orientation, position, edge, sizes}`
     * @returns {String[]}
     * @protected
     * @static
     */
    static attachNode(document, nodeId, targetNodeId, placement = {}) {
        let node   = document.nodes[nodeId],
            target = document.nodes[targetNodeId];

        if (!node)   return [`unknown node "${nodeId}"`];
        if (!target) return [`unknown target node "${targetNodeId}"`];

        if (placement.kind === 'tab-into') {
            if (node.type !== 'tabs' || target.type !== 'tabs') {
                return ['tab-into placement requires both the moved node and the target to be tabs nodes']
            }

            target.items = [...(target.items || []), ...(node.items || [])];

            if ((target.activeItemId === null || target.activeItemId === undefined) && target.items.length) {
                target.activeItemId = target.items[0]
            }

            delete document.nodes[nodeId];

            return []
        }

        if (placement.orientation !== 'horizontal' && placement.orientation !== 'vertical') {
            return [`invalid split orientation "${placement.orientation}"`]
        }

        let {edge, orientation, position, sizes} = placement,
            newSplitId                           = Document.genId(document, `split-${targetNodeId}`),
            ratio                                = (Array.isArray(sizes) && sizes.length === 2) ? sizes : [0.5, 0.5],
            atPosition                           = position || ((edge === 'top' || edge === 'left') ? 'before' : 'after'),
            // Resolve the target's parent BEFORE inserting the new split (which references the target).
            parentSlot = Document.findParentSlot(document, targetNodeId);

        document.nodes[newSplitId] = {
            type    : 'split',
            orientation,
            children: atPosition === 'before' ? [nodeId, targetNodeId] : [targetNodeId, nodeId],
            sizes   : ratio
        };

        if (!parentSlot) {
            document.root = newSplitId
        } else if (typeof parentSlot.slot === 'number') {
            document.nodes[parentSlot.parentId].children[parentSlot.slot] = newSplitId
        } else {
            Document.setZoneNodeId(document.nodes[parentSlot.parentId], parentSlot.slot, newSplitId)
        }

        return []
    }

    /**
     * @summary Validates a dock-zone document against the contract invariants.
     *
     * Checks: schema, root presence, reference integrity (split children / edge-zone zones / tabs
     * items all resolve), each item appears at most once across the tree, committed item-state
     * booleans have the right type, split sizes match child count and sum to 1, and
     * `tabs.activeItemId` is null or one of `tabs.items`.
     * @param {Object} document
     * @returns {String[]} the (possibly empty) list of invariant violations
     * @static
     */
    static validate(document) {
        let errors = [];

        if (!document || typeof document !== 'object') return ['document is not an object'];
        if (document.schema !== Document.SCHEMA)   errors.push(`schema must be ${Document.SCHEMA}`);
        if (!document.nodes || !document.nodes[document.root]) errors.push(`root node "${document.root}" is missing`);

        // Runtime-only preview state is invalid at the model boundary — not just at render projection.
        // The scan reaches into the opaque `metadata` channel, so a preview key cannot ride a saved
        // layout through createSavedLayout / restoreSavedLayout (both validate through here).
        let previewKey = Document.findForbiddenPreviewKey(document);

        if (previewKey) {
            errors.push(`runtime-only preview field "${previewKey}" must not enter committed dock-zone state`)
        }

        let items   = document.items || {},
            nodes   = document.nodes || {},
            itemUse = {};

        for (const [itemId, item] of Object.entries(items)) {
            if (Document.isJsonRecord(item) && Object.hasOwn(item, 'pinned') && typeof item.pinned !== 'boolean') {
                errors.push(`item "${itemId}" pinned must be a boolean`)
            }

            if (Document.isJsonRecord(item) && Object.hasOwn(item, 'autoHidden') && typeof item.autoHidden !== 'boolean') {
                errors.push(`item "${itemId}" autoHidden must be a boolean`)
            }

            if (Document.isJsonRecord(item) && Object.hasOwn(item, 'lockable') && typeof item.lockable !== 'boolean') {
                errors.push(`item "${itemId}" lockable must be a boolean`)
            }

            if (Document.isJsonRecord(item) && Object.hasOwn(item, 'locked') && typeof item.locked !== 'boolean') {
                errors.push(`item "${itemId}" locked must be a boolean`)
            }

            if (Document.isJsonRecord(item) && item.pinned === true && item.autoHidden === true) {
                errors.push(`item "${itemId}" cannot be pinned and autoHidden at the same time`)
            }
        }

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
                if (!Document.isJsonRecord(node.zones)) {
                    errors.push(`edge-zone "${nodeId}" zones must be a JSON object`)
                    continue
                }

                for (const [edge, descriptor] of Object.entries(node.zones)) {
                    if (!Document.dockZoneEdgeKeys.has(edge)) {
                        errors.push(`edge-zone "${nodeId}" has unsupported edge "${edge}"`);
                        continue
                    }

                    if (!Document.isJsonRecord(descriptor)) {
                        errors.push(`edge-zone "${nodeId}" zone "${edge}" descriptor must be a JSON object`);
                        continue
                    }

                    let unexpected = Document.findUnexpectedKey(
                            descriptor,
                            Document.dockZoneDescriptorKeys,
                            `document.nodes.${nodeId}.zones.${edge}`
                        ),
                        targetId = Document.getZoneNodeId(descriptor);

                    if (unexpected) {
                        errors.push(`${unexpected.path} ${unexpected.reason}`)
                    }

                    if (!targetId) {
                        errors.push(`edge-zone "${nodeId}" zone "${edge}" descriptor requires a non-empty nodeId`)
                    } else if (!nodes[targetId]) {
                        errors.push(`edge-zone "${nodeId}" references missing node "${targetId}"`)
                    }

                    if (Object.hasOwn(descriptor, 'extent') && (
                        typeof descriptor.extent !== 'number' ||
                        !Number.isFinite(descriptor.extent) ||
                        descriptor.extent <= 0 ||
                        descriptor.extent >= 1
                    )) {
                        errors.push(`edge-zone "${nodeId}" zone "${edge}" extent must be a finite number between 0 and 1`)
                    }

                    if (Object.hasOwn(descriptor, 'resizable') && typeof descriptor.resizable !== 'boolean') {
                        errors.push(`edge-zone "${nodeId}" zone "${edge}" resizable must be a boolean`)
                    }
                }
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
        let doc = Document.clone(document);

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
                for (const [zone, descriptor] of Object.entries(node.zones || {})) {
                    let resolved = collapse(Document.getZoneNodeId(descriptor));

                    if (resolved && doc.nodes[resolved]) {
                        Document.setZoneNodeId(node, zone, resolved)
                    } else {
                        delete node.zones[zone]
                    }
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
        let reachable = Document.reachableNodeIds(doc);
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
        let normalized = Document.normalizeTree(mutated),
            errors     = Document.validate(normalized);

        return errors.length ? {document: original, errors} : {document: normalized, errors: []}
    }

    /**
     * @summary Validates and normalizes split-size ratios to sum to 1.
     * @param {Array<Number>} sizes
     * @param {Number} count
     * @param {String} splitNodeId
     * @returns {{sizes:Number[], errors:String[]}}
     * @protected
     * @static
     */
    static normalizeSplitSizes(sizes, count, splitNodeId) {
        let errors = [];

        if (!Array.isArray(sizes)) {
            return {sizes: [], errors: ['sizes must be an array']}
        }

        if (sizes.length !== count) {
            return {sizes: [], errors: [`split "${splitNodeId}" sizes length ${sizes.length} != children length ${count}`]}
        }

        for (let i = 0; i < sizes.length; i++) {
            let value = sizes[i];

            if (typeof value !== 'number' || !Number.isFinite(value)) {
                errors.push(`split "${splitNodeId}" size ${i} must be a finite number`)
            } else if (value <= 0) {
                errors.push(`split "${splitNodeId}" size ${i} must be greater than 0`)
            }
        }

        if (errors.length) {
            return {sizes: [], errors}
        }

        let total = sizes.reduce((sum, value) => sum + value, 0);

        if (!Number.isFinite(total) || total <= 0) {
            return {sizes: [], errors: [`split "${splitNodeId}" sizes must sum to a finite positive value`]}
        }

        let normalized = sizes.map(value => value / total);

        if (normalized.length > 1) {
            normalized[normalized.length - 1] = 1 - normalized.slice(0, -1).reduce((sum, value) => sum + value, 0)
        }

        return {sizes: normalized, errors: []}
    }

    /**
     * @summary Computes the shape-only fingerprint of a dock-zone document.
     *
     * The fingerprint describes topology SHAPE — node types, nesting, child arity, zone
     * occupancy — and deliberately contains no node ids, item ids, sizes, titles or window
     * identity, so two structurally identical layouts fingerprint identically regardless of
     * where or when they were captured (the persistence guardrail for `windowFingerprint`).
     * Deterministic by construction: child arrays keep document order, edge zones walk in the
     * fixed {@link #dockZoneEdgeKeys} order.
     *
     * An edge-zone must carry a JSON-record zones container; malformed containers fail closed
     * instead of collapsing into the legitimate empty-record shape. Optional slots may be absent.
     * A present slot whose descriptor cannot resolve to a node id also fails closed, so corrupt
     * input cannot fingerprint identically to an omitted slot and pass downstream shape gates as a
     * legitimate no-change result.
     * @param {Object} document The committed dock-zone document.
     * @returns {{fingerprint:(Object|null), errors:String[]}}
     * @static
     */
    static computeShapeFingerprint(document) {
        let errors = [];

        if (!Document.isJsonRecord(document) || !Document.isJsonRecord(document.nodes)) {
            return {fingerprint: null, errors: ['fingerprint requires a document with a nodes record']}
        }

        const counts  = {'edge-zone': 0, split: 0, tabs: 0},
              visited = new Set();

        const walk = nodeId => {
            const node = document.nodes[nodeId];

            if (!node) {
                errors.push(`fingerprint walk found no node for id "${nodeId}"`);
                return '?'
            }

            // cycle guard: a node graph that references an ancestor would recurse forever —
            // fail closed through the errors path, never a RangeError out of the public API
            if (visited.has(nodeId)) {
                errors.push(`fingerprint walk detected a cycle at node "${nodeId}"`);
                return '?'
            }

            visited.add(nodeId);

            counts[node.type] = (counts[node.type] || 0) + 1;

            switch (node.type) {
                case 'split':
                    return `${node.orientation === 'horizontal' ? 'h' : 'v'}(${(node.children || []).map(walk).join(',')})`;
                case 'tabs':
                    return `t${node.items?.length || 0}`;
                case 'edge-zone': {
                    if (!Document.isJsonRecord(node.zones)) {
                        errors.push(`fingerprint walk found a non-record zones container for edge-zone "${nodeId}"`);
                        return '?'
                    }

                    const zones = node.zones;

                    return `e{${[...Document.dockZoneEdgeKeys]
                        .map(zone => {
                            if (!Object.hasOwn(zones, zone)) {
                                return ''
                            }

                            let childNodeId = Document.getZoneNodeId(zones[zone]);

                            if (!childNodeId) {
                                errors.push(`fingerprint walk found unusable descriptor for edge-zone "${nodeId}" zone "${zone}"`);
                                return ''
                            }

                            return `${zone}:${walk(childNodeId)}`
                        })
                        .filter(Boolean).join(',')}}`;
                }
                default:
                    errors.push(`fingerprint walk found unsupported node type "${node.type}"`);
                    return '?'
            }
        };

        const shape = walk(document.root);

        if (errors.length) {
            return {fingerprint: null, errors}
        }

        return {
            fingerprint: {
                schema    : 'neo.dock.shape.v1',
                shape,
                nodeCounts: counts,
                itemCount : Object.keys(document.items || {}).length
            },
            errors
        }
    }

    /**
     * @summary Composes per-window shape fingerprints into one whole-topology fingerprint.
     *
     * Slot ORDER is meaning: the reconciliation of a restored topology maps captured slots onto
     * live windows positionally-by-shape, so the composed term preserves input order verbatim.
     * Envelope-agnostic by design — whichever record shape the topology capture persists,
     * it carries this composition. Fails closed on an empty list, any entry that is not a
     * window-shape fingerprint record, and any INCOMPLETE record: the composition consumes
     * `itemCount`, and a window fingerprint always emits an integer count ≥ 0, so a missing or
     * malformed count is rejected — never defaulted into a fake zero.
     * @param {Object[]} windowFingerprints Ordered per-window records from {@link #computeShapeFingerprint}.
     * @returns {{fingerprint:(Object|null), errors:String[]}}
     * @static
     */
    static composeTopologyFingerprint(windowFingerprints) {
        let errors = [];

        if (!Array.isArray(windowFingerprints) || windowFingerprints.length < 1) {
            return {fingerprint: null, errors: ['topology fingerprint requires a non-empty ordered array of window fingerprints']}
        }

        windowFingerprints.forEach((entry, index) => {
            if (entry?.schema !== 'neo.dock.shape.v1' || typeof entry.shape !== 'string') {
                errors.push(`entry ${index} is not a window shape fingerprint record`)
            } else if (!Number.isInteger(entry.itemCount) || entry.itemCount < 0) {
                errors.push(`entry ${index} is an incomplete window fingerprint record: itemCount must be an integer >= 0`)
            }
        });

        if (errors.length) {
            return {fingerprint: null, errors}
        }

        return {
            fingerprint: {
                schema     : 'neo.dock.topologyShape.v1',
                windowCount: windowFingerprints.length,
                shape      : `w[${windowFingerprints.map(entry => entry.shape).join('|')}]`,
                totalItems : windowFingerprints.reduce((sum, entry) => sum + entry.itemCount, 0)
            },
            errors
        }
    }

    /**
     * @summary Resolves a workspace document's transferable STACK ROOT — the explicit source-side
     * projection for whole-stack reintegration (docking design record §2.8,
     * `learn/agentos/decisions/0029-docking-design.md`).
     *
     * The canonical vessel document shape is an `edge-zone` ROOT (window chrome) whose `center`
     * zone names the subtree holding the vessel's content — so "the whole stack" is the root's
     * center child, never the document root itself. Resolving it keeps `transferNode`'s root
     * rejection byte-identical: whole-stack transfer is explicit resolution composed with the
     * landed two-document executor, and an implicit root transfer stays impossible.
     *
     * Fail-closed: a missing document, a missing root node, a root that is not an `edge-zone`,
     * or a center zone that is absent or names an unknown node all resolve `null` — a document
     * that cannot prove its stack root never transfers.
     * @param {Object} document a committed dock-zone document
     * @returns {String|null} the stack-root node id, or null
     * @static
     */
    static resolveStackRoot(document) {
        let root = document?.nodes?.[document?.root],
            centerId;

        if (!root || root.type !== 'edge-zone') {
            return null
        }

        centerId = Document.getZoneNodeId(root.zones?.center);

        return centerId && document.nodes[centerId] ? centerId : null
    }
}

export default Neo.setupClass(Document);
