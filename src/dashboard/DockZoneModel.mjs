import Base from '../core/Base.mjs';

/**
 * @class Neo.dashboard.DockZoneModel
 * @extends Neo.core.Base
 *
 * @summary Executor for the dock-zone semantic operations (`neo.harness.dockZone.v1`).
 *
 * The "missing middle" of the docking line: `Neo.dashboard.dock.interaction.Preview.previewToOperation()`
 * produces an operation descriptor on drop, this executor applies it to mutate the persisted
 * dock-zone tree, and `Neo.dashboard.dock.projection.LayoutAdapter` renders the committed result. The contract
 * and data model are defined in `learn/agentos/DockZoneModel.md` (§Data Model + §Operations);
 * this class is the code realization of §Operations.
 *
 * All operations are **pure static functions** over a `dockZone.v1` document: each deep-clones the
 * input, applies the mutation, normalizes, then validates. They are **fail-closed** — an operation
 * with an invalid reference or one that would violate an invariant returns the ORIGINAL document
 * unchanged plus a non-empty `errors` array, never a partially-mutated tree. The model persists
 * semantic splits/tabs/order only; runtime pixels, DOMRects and preview state never enter it.
 *
 * Saved-layout helpers wrap the same committed model in `neo.harness.dockLayout.v1` after enforcing
 * the finite saved-layout schema and JSON-only values. They deliberately do not choose a storage backend.
 * Named-layout collection helpers wrap multiple saved-layout envelopes in
 * `neo.harness.dockLayoutCollection.v1` while keeping the active-layout choice pure and storage-free.
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

    /**
     * The saved layout wrapper schema around a normalized dock-zone document. v2 adds the
     * perspective fields (`captureScope`, `windowFingerprint`, `perspectiveName`); writes always
     * emit v2, while v1 records stay readable through {@link #migrateSavedLayout} (fail-open read
     * with honest defaults — a legacy record never errors, and never silently re-persists as v1).
     * @member {String} LAYOUT_SCHEMA='neo.harness.dockLayout.v2'
     * @static
     */
    static LAYOUT_SCHEMA = 'neo.harness.dockLayout.v2'

    /**
     * The legacy saved-layout wrapper schema, accepted on read via {@link #migrateSavedLayout}.
     * @member {String} LAYOUT_SCHEMA_V1='neo.harness.dockLayout.v1'
     * @static
     */
    static LAYOUT_SCHEMA_V1 = 'neo.harness.dockLayout.v1'

    /**
     * The saved layout collection schema for named layout perspectives. The collection envelope
     * stays v1: its `layouts` values migrate individually at restore time.
     * @member {String} LAYOUT_COLLECTION_SCHEMA='neo.harness.dockLayoutCollection.v1'
     * @static
     */
    static LAYOUT_COLLECTION_SCHEMA = 'neo.harness.dockLayoutCollection.v1'

    /**
     * The capture scopes a saved layout may declare: one window's dock document, or the whole
     * multi-window topology.
     * @member {String[]} CAPTURE_SCOPES
     * @static
     */
    static CAPTURE_SCOPES = ['window', 'topology']

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
            DockZoneModel.findContainingTabsId(document, descriptor.itemId)
                ? DockZoneModel.moveItem(document, {itemId: descriptor.itemId, targetNodeId: descriptor.tabsNodeId, index: descriptor.index})
                : DockZoneModel.addTab(document, descriptor),
        applyDocument    : (document, descriptor) => DockZoneModel.applyDocument(document, descriptor),
        moveItem         : (document, descriptor) => DockZoneModel.moveItem(document, descriptor),
        splitNode        : (document, descriptor) => DockZoneModel.splitNode(document, descriptor),
        moveNode         : (document, descriptor) => DockZoneModel.moveNode(document, descriptor),
        resizeSplit      : (document, descriptor) => DockZoneModel.resizeSplit(document, descriptor),
        detachItem       : (document, descriptor) => DockZoneModel.detachItem(document, descriptor),
        closeItem        : (document, descriptor) => DockZoneModel.closeItem(document, descriptor),
        setItemPinned    : (document, descriptor) => DockZoneModel.setItemPinned(document, descriptor),
        setItemAutoHidden: (document, descriptor) => DockZoneModel.setItemAutoHidden(document, descriptor),
        // transferItem / transferNode are TWO-document operations; their single-document dispatch is a
        // fail-closed redirect so each still joins the derived `operations` vocabulary without a
        // hand-listed entry. Execute them through the matching two-document DockZoneModel method.
        transferItem: document => ({document, errors: ['transferItem is a two-document operation; call DockZoneModel.transferItem(sourceDocument, targetDocument, descriptor)']}),
        transferNode: document => ({document, errors: ['transferNode is a two-document operation; call DockZoneModel.transferNode(sourceDocument, targetDocument, descriptor)']})
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
    static operations = Object.freeze(Object.keys(DockZoneModel.operationHandlers))

    /**
     * Top-level fields allowed in a saved-layout wrapper.
     * @member {Set<String>} savedLayoutKeys
     * @protected
     * @static
     */
    static savedLayoutKeys = new Set([
        'schema', 'layoutId', 'title', 'dockZone', 'metadata', 'revision',
        'captureScope', 'windowFingerprint', 'perspectiveName', 'windowDocuments'
    ])

    /**
     * Top-level fields allowed in a named saved-layout collection.
     * @member {Set<String>} savedLayoutCollectionKeys
     * @protected
     * @static
     */
    static savedLayoutCollectionKeys = new Set(['schema', 'activeLayoutId', 'layouts', 'metadata', 'revision'])

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
    static dockZoneItemKeys = new Set(['componentRef', 'title', 'kind', 'blueprint', 'closable', 'pinnable', 'pinned', 'autoHidden', 'movable', 'metadata'])

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
                let match = DockZoneModel.findForbiddenPreviewKey(value[i]);

                if (match) {
                    return match
                }
            }

            return null
        }

        for (let key of Object.keys(value)) {
            if (DockZoneModel.forbiddenPreviewKeys.has(key)) {
                return key
            }

            let match = DockZoneModel.findForbiddenPreviewKey(value[key]);

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

    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockZoneModel'
         * @protected
         */
        className: 'Neo.dashboard.DockZoneModel'
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
                let match = DockZoneModel.findNonJsonValue(value[i], `${path}[${i}]`, seen);

                if (match) {
                    return match
                }
            }

            return null
        }

        if (!DockZoneModel.isJsonRecord(value)) {
            return {path, reason: `${value.constructor?.name || 'object'} is not a JSON record`}
        }

        for (const key of Reflect.ownKeys(value)) {
            if (typeof key === 'symbol') {
                return {path: `${path}.${String(key)}`, reason: 'symbol keys are not JSON-serializable'}
            }

            let match = DockZoneModel.findNonJsonValue(value[key], `${path}.${key}`, seen);

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
                let match = DockZoneModel.findSecretMetadataKey(value[i], `${path}[${i}]`);

                if (match) {
                    return match
                }
            }

            return null
        }

        if (!DockZoneModel.isJsonRecord(value)) {
            return null
        }

        for (const [key, child] of Object.entries(value)) {
            if (DockZoneModel.isSecretMetadataKey(key)) {
                return {key, path: `${path}.${key}`, reason: 'metadata must not contain credentials or secrets'}
            }

            let match = DockZoneModel.findSecretMetadataKey(child, `${path}.${key}`);

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
        if (!DockZoneModel.isJsonRecord(document)) {
            return null
        }

        let unexpected = DockZoneModel.findUnexpectedKey(document, DockZoneModel.dockZoneDocumentKeys, path);

        if (unexpected) {
            return unexpected
        }

        if (DockZoneModel.isJsonRecord(document.items)) {
            for (const [itemId, item] of Object.entries(document.items)) {
                if (!DockZoneModel.isJsonRecord(item)) {
                    return {key: itemId, path: `${path}.items.${itemId}`, reason: 'item record must be a JSON object'}
                }

                unexpected = DockZoneModel.findUnexpectedKey(item, DockZoneModel.dockZoneItemKeys, `${path}.items.${itemId}`);

                if (unexpected) {
                    return unexpected
                }
            }
        }

        if (DockZoneModel.isJsonRecord(document.nodes)) {
            for (const [nodeId, node] of Object.entries(document.nodes)) {
                if (!DockZoneModel.isJsonRecord(node)) {
                    return {key: nodeId, path: `${path}.nodes.${nodeId}`, reason: 'node record must be a JSON object'}
                }

                let allowedNodeKeys = DockZoneModel.dockZoneNodeKeys[node.type];

                if (!allowedNodeKeys) {
                    return {key: 'type', path: `${path}.nodes.${nodeId}.type`, reason: `unsupported dock-zone node type "${node.type}"`}
                }

                unexpected = DockZoneModel.findUnexpectedKey(node, allowedNodeKeys, `${path}.nodes.${nodeId}`);

                if (unexpected) {
                    return unexpected
                }

                if (node.type === 'edge-zone' && DockZoneModel.isJsonRecord(node.zones)) {
                    unexpected = DockZoneModel.findUnexpectedKey(node.zones, DockZoneModel.dockZoneEdgeKeys, `${path}.nodes.${nodeId}.zones`);

                    if (unexpected) {
                        return unexpected
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
        let tabsNodeId = DockZoneModel.findContainingTabsId(document, itemId),
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
        let slot = DockZoneModel.findParentSlot(document, nodeId);

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
            newSplitId                           = DockZoneModel.genId(document, `split-${targetNodeId}`),
            ratio                                = (Array.isArray(sizes) && sizes.length === 2) ? sizes : [0.5, 0.5],
            atPosition                           = position || ((edge === 'top' || edge === 'left') ? 'before' : 'after'),
            // Resolve the target's parent BEFORE inserting the new split (which references the target).
            parentSlot = DockZoneModel.findParentSlot(document, targetNodeId);

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
            document.nodes[parentSlot.parentId].zones[parentSlot.slot] = newSplitId
        }

        return []
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

        // Runtime-only preview state is invalid at the model boundary — not just at render projection.
        // The scan reaches into the opaque `metadata` channel, so a preview key cannot ride a saved
        // layout through createSavedLayout / restoreSavedLayout (both validate through here).
        let previewKey = DockZoneModel.findForbiddenPreviewKey(document);

        if (previewKey) {
            errors.push(`runtime-only preview field "${previewKey}" must not enter committed dock-zone state`)
        }

        let items   = document.items || {},
            nodes   = document.nodes || {},
            itemUse = {};

        for (const [itemId, item] of Object.entries(items)) {
            if (DockZoneModel.isJsonRecord(item) && Object.hasOwn(item, 'pinned') && typeof item.pinned !== 'boolean') {
                errors.push(`item "${itemId}" pinned must be a boolean`)
            }

            if (DockZoneModel.isJsonRecord(item) && Object.hasOwn(item, 'autoHidden') && typeof item.autoHidden !== 'boolean') {
                errors.push(`item "${itemId}" autoHidden must be a boolean`)
            }

            if (DockZoneModel.isJsonRecord(item) && item.pinned === true && item.autoHidden === true) {
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
            ? DockZoneModel.commit(document, descriptor.document)
            : {document, errors: ['applyDocument requires a candidate document']}
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
     * @summary Migrates a saved-layout record to the current wrapper schema, read-side and pure.
     *
     * A legacy v1 record gains the perspective fields with honest defaults (`captureScope:
     * 'window'` — v1 could only ever capture one window's document — and `windowFingerprint:
     * null`, since no fingerprint was recorded at capture time); `perspectiveName` stays absent
     * because it is optional by contract. Idempotent: current-schema records pass through
     * untouched, and unknown schemas pass through for the caller's validation to reject, so this
     * never masks a genuinely foreign envelope. Writers never emit v1 again.
     * @param {Object} savedLayout A saved-layout record of any known schema revision.
     * @returns {Object} The record at the current schema revision (a shallow-cloned upgrade for v1).
     * @static
     */
    static migrateSavedLayout(savedLayout) {
        if (savedLayout?.schema !== DockZoneModel.LAYOUT_SCHEMA_V1) {
            return savedLayout
        }

        return {
            ...savedLayout,
            schema           : DockZoneModel.LAYOUT_SCHEMA,
            captureScope     : 'window',
            windowFingerprint: null
        }
    }

    /**
     * @summary Validates the perspective fields shared by the create and restore paths.
     *
     * `captureScope` must be one of {@link #CAPTURE_SCOPES}; `windowFingerprint` describes
     * topology SHAPE only and must be a JSON object or null (never window ids or coordinates —
     * the persistence guardrail); `perspectiveName`, when present, must be a non-empty string.
     * @param {Object} layout The saved-layout record carrying the perspective fields.
     * @returns {String[]} Validation errors, empty when the fields are contract-clean.
     * @static
     */
    static validatePerspectiveFields(layout) {
        let errors = [];

        if (!DockZoneModel.CAPTURE_SCOPES.includes(layout.captureScope)) {
            errors.push(`captureScope must be one of: ${DockZoneModel.CAPTURE_SCOPES.join(', ')}`)
        }

        if (layout.windowFingerprint !== null && !DockZoneModel.isJsonRecord(layout.windowFingerprint)) {
            errors.push('windowFingerprint must be a JSON object or null')
        }

        if (Object.hasOwn(layout, 'perspectiveName') &&
            (typeof layout.perspectiveName !== 'string' || !layout.perspectiveName.trim())
        ) {
            errors.push('perspectiveName must be a non-empty string when present')
        }

        // windowDocuments carries the ADDITIONAL windows' trees (slots 1..N; slot 0 stays
        // `dockZone`, so the degenerate single-window topology record equals a window-scope
        // capture by construction). Topology-scope-only: a window-scope record carrying it
        // fails closed; every slot tree passes the full dock-zone validation, offender indexed.
        if (Object.hasOwn(layout, 'windowDocuments')) {
            if (layout.captureScope !== 'topology') {
                errors.push('windowDocuments is only valid on captureScope "topology" records')
            } else if (!Array.isArray(layout.windowDocuments)) {
                errors.push('windowDocuments must be an array of dock-zone documents')
            } else {
                layout.windowDocuments.forEach((tree, index) => {
                    const treeErrors = DockZoneModel.validate(tree);

                    if (treeErrors.length) {
                        errors.push(`windowDocuments[${index}] is not a valid dock-zone document: ${treeErrors[0]}`)
                    }

                    // The finite durable-field boundary applies to EVERY captured slot, not only
                    // the primary `dockZone` — runtime-bearing fields (window fingerprints,
                    // rects) must not ride an additional window document into persistence.
                    const unexpected = DockZoneModel.findUnexpectedDockZoneKey(tree, `windowDocuments[${index}]`);

                    if (unexpected) {
                        errors.push(`windowDocuments[${index}] contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
                    }
                })
            }
        }

        return errors
    }

    /**
     * @summary Captures a whole multi-window topology as ONE v2 saved-layout perspective.
     *
     * Slot order is meaning: `documents[0]` becomes the primary `dockZone`, the remaining
     * slots persist as `windowDocuments` (topology-scope-only), and `windowFingerprint` holds
     * the composed topology term — so a single-document topology capture is structurally
     * identical to a window-scope capture apart from its declared scope and composed
     * fingerprint schema (the degenerate-case identity, asserted in the unit specs).
     *
     * Fingerprint-coherence by construction (same rule as {@link #capturePerspective}): raw
     * inputs are fingerprint-PROBED first purely as the cycle/shape gate (results discarded —
     * the writer's normalize pass must never see a cyclic graph), then the composed fingerprint
     * derives exclusively from the PERSISTED trees, so it can never describe shapes the record
     * does not contain.
     * @param {Object[]} documents Ordered committed dock-zone documents, primary first.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static captureTopologyPerspective(documents, metadata={}) {
        if (!Array.isArray(documents) || documents.length < 1) {
            return {layout: null, errors: ['topology capture requires a non-empty ordered array of documents']}
        }

        // probe every raw input first — the cycle/shape gate before any recursion-bearing pass
        for (let i = 0; i < documents.length; i++) {
            const probe = DockZoneModel.computeShapeFingerprint(documents[i]);

            if (probe.errors.length) {
                return {layout: null, errors: probe.errors.map(error => `documents[${i}]: ${error}`)}
            }
        }

        const written = DockZoneModel.createSavedLayout(documents[0], {
            ...metadata,
            captureScope     : 'topology',
            windowFingerprint: null,
            ...(documents.length > 1 && {
                windowDocuments: documents.slice(1).map(DockZoneModel.normalizeTree)
            })
        });

        if (written.errors.length) {
            return written
        }

        // compose from the PERSISTED trees — the primary + the stored slots — never the raw inputs
        const persisted    = [written.layout.dockZone, ...(written.layout.windowDocuments || [])],
              fingerprints = [];

        for (let i = 0; i < persisted.length; i++) {
            const {fingerprint, errors} = DockZoneModel.computeShapeFingerprint(persisted[i]);

            if (errors.length) {
                return {layout: null, errors: errors.map(error => `persisted[${i}]: ${error}`)}
            }

            fingerprints.push(fingerprint)
        }

        const composed = DockZoneModel.composeTopologyFingerprint(fingerprints);

        if (composed.errors.length) {
            return {layout: null, errors: composed.errors}
        }

        written.layout.windowFingerprint = composed.fingerprint;

        return written
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
     * @param {Object} document The committed dock-zone document.
     * @returns {{fingerprint:(Object|null), errors:String[]}}
     * @static
     */
    static computeShapeFingerprint(document) {
        let errors = [];

        if (!DockZoneModel.isJsonRecord(document) || !DockZoneModel.isJsonRecord(document.nodes)) {
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
                case 'edge-zone':
                    return `e{${[...DockZoneModel.dockZoneEdgeKeys]
                        .map(zone => node.zones?.[zone] ? `${zone}:${walk(node.zones[zone])}` : '')
                        .filter(Boolean).join(',')}}`;
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
                schema    : 'neo.harness.dockShape.v1',
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
            if (entry?.schema !== 'neo.harness.dockShape.v1' || typeof entry.shape !== 'string') {
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
                schema     : 'neo.harness.dockTopologyShape.v1',
                windowCount: windowFingerprints.length,
                shape      : `w[${windowFingerprints.map(entry => entry.shape).join('|')}]`,
                totalItems : windowFingerprints.reduce((sum, entry) => sum + entry.itemCount, 0)
            },
            errors
        }
    }

    /**
     * @summary Captures the current window's dock document as a v2 saved-layout perspective.
     *
     * The single-window capture scope: layout truth only enters the record — the committed
     * document tree — never render projections, runtime handles or pane-internal state (panes
     * are layout-blind, so their internals are not the layout's to save).
     *
     * Fingerprint-coherence by construction: the wrapper is written FIRST (validate + normalize
     * through the one writer path), and the fingerprint is computed from the PERSISTED
     * `layout.dockZone` — never the raw input — so the stored fingerprint cannot describe a
     * tree the record does not contain (normalization collapses e.g. a single-child split to
     * its child; a pre-normalization fingerprint would immortalize the collapsed wrapper).
     * @param {Object} document The committed dock-zone document to capture.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static capturePerspective(document, metadata={}) {
        // pre-probe the RAW input purely as the cycle/shape gate: the writer's normalize pass
        // recurses and must never see a cyclic graph; the probe's fingerprint is DISCARDED so
        // coherence with the persisted tree is never at risk
        const probe = DockZoneModel.computeShapeFingerprint(document);

        if (probe.errors.length) {
            return {layout: null, errors: probe.errors}
        }

        const written = DockZoneModel.createSavedLayout(document, {
            ...metadata,
            captureScope     : 'window',
            windowFingerprint: null
        });

        if (written.errors.length) {
            return written
        }

        const {fingerprint, errors} = DockZoneModel.computeShapeFingerprint(written.layout.dockZone);

        if (errors.length) {
            return {layout: null, errors}
        }

        written.layout.windowFingerprint = fingerprint;

        return written
    }

    /**
     * @summary Wraps a valid committed dock-zone document in a JSON-only saved-layout envelope.
     *
     * The wrapper and dock-zone tree are finite-schema: unknown fields fail closed. The explicit
     * `metadata` field is an opaque JSON-only non-secret annotation channel; callers must not place
     * credentials or runtime authority inside it.
     * @param {Object} document The committed dock-zone document to normalize and wrap.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, captureScope, windowFingerprint, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static createSavedLayout(document, metadata={}) {
        if (!DockZoneModel.isJsonRecord(metadata)) {
            return {layout: null, errors: ['metadata must be a JSON object']}
        }

        let errors = DockZoneModel.validate(document);

        if (errors.length) {
            return {layout: null, errors}
        }

        let unexpectedKey = DockZoneModel.findUnexpectedDockZoneKey(document, 'document');

        if (unexpectedKey) {
            return {
                layout: null,
                errors: [`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`]
            }
        }

        let normalized = DockZoneModel.normalizeTree(document),
            layoutId   = Object.hasOwn(metadata, 'layoutId') ? metadata.layoutId : 'default',
            title      = Object.hasOwn(metadata, 'title') ? metadata.title : layoutId,
            layout     = {
                schema           : DockZoneModel.LAYOUT_SCHEMA,
                layoutId,
                title,
                dockZone         : normalized,
                metadata         : Object.hasOwn(metadata, 'metadata') ? metadata.metadata : {},
                captureScope     : Object.hasOwn(metadata, 'captureScope') ? metadata.captureScope : 'window',
                windowFingerprint: Object.hasOwn(metadata, 'windowFingerprint') ? metadata.windowFingerprint : null
            };

        if (Object.hasOwn(metadata, 'revision')) {
            layout.revision = metadata.revision
        }

        if (Object.hasOwn(metadata, 'perspectiveName')) {
            layout.perspectiveName = metadata.perspectiveName
        }

        if (Object.hasOwn(metadata, 'windowDocuments')) {
            layout.windowDocuments = metadata.windowDocuments
        }

        if (typeof layout.layoutId !== 'string' || !layout.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        }

        if (typeof layout.title !== 'string' || !layout.title.trim()) {
            errors.push('title must be a non-empty string')
        }

        errors.push(...DockZoneModel.validatePerspectiveFields(layout))

        if (!DockZoneModel.isJsonRecord(layout.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = DockZoneModel.findSecretMetadataKey(layout.metadata, 'savedLayout.metadata');

        if (secretKey) {
            errors.push(`saved layout metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        unexpectedKey = DockZoneModel.findUnexpectedKey(layout, DockZoneModel.savedLayoutKeys, 'savedLayout') ||
            DockZoneModel.findUnexpectedDockZoneKey(layout.dockZone, 'savedLayout.dockZone');

        if (unexpectedKey) {
            errors.push(`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = DockZoneModel.findNonJsonValue(layout);

        if (nonJson) {
            errors.push(`saved layout ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        return errors.length ? {layout: null, errors} : {layout: DockZoneModel.clone(layout), errors: []}
    }

    /**
     * @summary Restores a saved-layout wrapper into a validated dock-zone document.
     *
     * The wrapper and dock-zone tree must match the finite persisted schema. The explicit `metadata`
     * and item `blueprint` fields are opaque JSON-only non-secret payloads; runtime fields beside the
     * known model are rejected rather than filtered or repaired.
     * @param {Object} savedLayout
     * @returns {{document:(Object|null), errors:String[]}}
     * @static
     */
    static restoreSavedLayout(savedLayout) {
        let errors = [];

        if (!DockZoneModel.isJsonRecord(savedLayout)) {
            return {document: null, errors: ['saved layout must be a JSON object']}
        }

        savedLayout = DockZoneModel.migrateSavedLayout(savedLayout);

        if (savedLayout.schema !== DockZoneModel.LAYOUT_SCHEMA) {
            errors.push(`schema must be ${DockZoneModel.LAYOUT_SCHEMA}`)
        }

        errors.push(...DockZoneModel.validatePerspectiveFields(savedLayout));

        if (typeof savedLayout.layoutId !== 'string' || !savedLayout.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        }

        if (typeof savedLayout.title !== 'string' || !savedLayout.title.trim()) {
            errors.push('title must be a non-empty string')
        }

        if (!DockZoneModel.isJsonRecord(savedLayout.dockZone)) {
            errors.push('dockZone must be a JSON object')
        }

        if (Object.hasOwn(savedLayout, 'metadata') && !DockZoneModel.isJsonRecord(savedLayout.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = Object.hasOwn(savedLayout, 'metadata')
            ? DockZoneModel.findSecretMetadataKey(savedLayout.metadata, 'savedLayout.metadata')
            : null;

        if (secretKey) {
            errors.push(`saved layout metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        let unexpectedKey = DockZoneModel.findUnexpectedKey(savedLayout, DockZoneModel.savedLayoutKeys, 'savedLayout') ||
            DockZoneModel.findUnexpectedDockZoneKey(savedLayout.dockZone, 'savedLayout.dockZone');

        if (unexpectedKey) {
            errors.push(`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = DockZoneModel.findNonJsonValue(savedLayout);

        if (nonJson) {
            errors.push(`saved layout ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        if (!errors.length) {
            errors.push(...DockZoneModel.validate(savedLayout.dockZone));
        }

        if (errors.length) {
            return {document: null, errors}
        }

        let normalized       = DockZoneModel.normalizeTree(savedLayout.dockZone),
            normalizedErrors = DockZoneModel.validate(normalized);

        return normalizedErrors.length
            ? {document: null, errors: normalizedErrors}
            : {document: DockZoneModel.clone(normalized), errors: []}
    }

    /**
     * @summary Validates a named saved-layout collection and each contained saved-layout wrapper.
     * @param {Object} collection
     * @returns {String[]} the (possibly empty) list of invariant violations
     * @static
     */
    static validateSavedLayoutCollection(collection) {
        let errors = [];

        if (!DockZoneModel.isJsonRecord(collection)) {
            return ['saved layout collection must be a JSON object']
        }

        if (collection.schema !== DockZoneModel.LAYOUT_COLLECTION_SCHEMA) {
            errors.push(`schema must be ${DockZoneModel.LAYOUT_COLLECTION_SCHEMA}`)
        }

        if (!Object.hasOwn(collection, 'activeLayoutId')) {
            errors.push('activeLayoutId is required')
        } else if (collection.activeLayoutId !== null && (typeof collection.activeLayoutId !== 'string' || !collection.activeLayoutId.trim())) {
            errors.push('activeLayoutId must be a non-empty string or null')
        }

        if (!DockZoneModel.isJsonRecord(collection.layouts)) {
            errors.push('layouts must be a JSON object')
        }

        if (Object.hasOwn(collection, 'metadata') && !DockZoneModel.isJsonRecord(collection.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = Object.hasOwn(collection, 'metadata')
            ? DockZoneModel.findSecretMetadataKey(collection.metadata, 'layoutCollection.metadata')
            : null;

        if (secretKey) {
            errors.push(`layout collection metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        let unexpectedKey = DockZoneModel.findUnexpectedKey(collection, DockZoneModel.savedLayoutCollectionKeys, 'layoutCollection');

        if (unexpectedKey) {
            errors.push(`layout collection contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = DockZoneModel.findNonJsonValue(collection, 'layoutCollection');

        if (nonJson) {
            errors.push(`layout collection ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        if (DockZoneModel.isJsonRecord(collection.layouts)) {
            for (const [layoutId, savedLayout] of Object.entries(collection.layouts)) {
                if (!layoutId.trim()) {
                    errors.push('layout keys must be non-empty strings');
                    continue
                }

                if (!DockZoneModel.isJsonRecord(savedLayout)) {
                    errors.push(`layout "${layoutId}" must be a JSON object`);
                    continue
                }

                if (savedLayout.layoutId !== layoutId) {
                    errors.push(`layout key "${layoutId}" must match saved layout id "${savedLayout.layoutId}"`)
                }

                let restored = DockZoneModel.restoreSavedLayout(savedLayout);

                if (restored.errors.length) {
                    errors.push(...restored.errors.map(error => `layout "${layoutId}": ${error}`))
                }
            }
        }

        let layoutCount = DockZoneModel.isJsonRecord(collection.layouts) ? Object.keys(collection.layouts).length : 0;

        if (collection.activeLayoutId === null && layoutCount > 0) {
            errors.push('activeLayoutId must name an existing layout when layouts are present')
        } else if (typeof collection.activeLayoutId === 'string' && DockZoneModel.isJsonRecord(collection.layouts) && !Object.hasOwn(collection.layouts, collection.activeLayoutId)) {
            errors.push(`activeLayoutId "${collection.activeLayoutId}" does not exist`)
        }

        return errors
    }

    /**
     * @summary Creates a storage-free collection of named saved-layout wrappers.
     * @param {Array<Object>|Object<String,Object>} [layouts=[]]
     * @param {Object} [options={}] {activeLayoutId, metadata, revision}
     * @returns {{collection:(Object|null), errors:String[]}}
     * @static
     */
    static createSavedLayoutCollection(layouts=[], options={}) {
        if (!Array.isArray(layouts) && !DockZoneModel.isJsonRecord(layouts)) {
            return {collection: null, errors: ['layouts must be an array or JSON object']}
        }

        if (!DockZoneModel.isJsonRecord(options)) {
            return {collection: null, errors: ['options must be a JSON object']}
        }

        let collection = {
                schema        : DockZoneModel.LAYOUT_COLLECTION_SCHEMA,
                activeLayoutId: Object.hasOwn(options, 'activeLayoutId') ? options.activeLayoutId : null,
                layouts       : {},
                metadata      : Object.hasOwn(options, 'metadata') ? options.metadata : {}
            },
            entries    = Array.isArray(layouts)
                ? layouts.map((layout, index) => [DockZoneModel.isJsonRecord(layout) ? layout.layoutId : `index-${index}`, layout])
                : Object.entries(layouts),
            errors     = [];

        for (const [layoutId, savedLayout] of entries) {
            if (typeof layoutId !== 'string' || !layoutId.trim()) {
                errors.push('layoutId must be a non-empty string');
                continue
            }

            collection.layouts[layoutId] = DockZoneModel.clone(savedLayout)
        }

        if (!Object.hasOwn(options, 'activeLayoutId')) {
            collection.activeLayoutId = Object.keys(collection.layouts)[0] ?? null
        }

        if (Object.hasOwn(options, 'revision')) {
            collection.revision = options.revision
        }

        errors.push(...DockZoneModel.validateSavedLayoutCollection(collection));

        return errors.length
            ? {collection: null, errors}
            : {collection: DockZoneModel.clone(collection), errors: []}
    }

    /**
     * @summary Adds or replaces a saved-layout wrapper in a collection.
     * @param {Object} collection
     * @param {Object} savedLayout
     * @param {Object} [options={}] {activate}
     * @returns {{collection:Object, errors:String[]}}
     * @static
     */
    static upsertSavedLayout(collection, savedLayout, options={}) {
        let errors = DockZoneModel.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {collection, errors}
        }

        let restored = DockZoneModel.restoreSavedLayout(savedLayout);

        if (restored.errors.length) {
            return {collection, errors: restored.errors}
        }

        let doc      = DockZoneModel.clone(collection),
            layoutId = savedLayout.layoutId;

        doc.layouts[layoutId] = DockZoneModel.clone(savedLayout);

        if (options?.activate === true || doc.activeLayoutId === null) {
            doc.activeLayoutId = layoutId
        }

        errors = DockZoneModel.validateSavedLayoutCollection(doc);

        return errors.length ? {collection, errors} : {collection: DockZoneModel.clone(doc), errors: []}
    }

    /**
     * @summary Selects the active saved layout by id without restoring it.
     * @param {Object} collection
     * @param {String} layoutId
     * @returns {{collection:Object, errors:String[]}}
     * @static
     */
    static selectSavedLayout(collection, layoutId) {
        let errors = DockZoneModel.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {collection, errors}
        }

        if (typeof layoutId !== 'string' || !layoutId.trim()) {
            return {collection, errors: ['layoutId must be a non-empty string']}
        }

        if (!Object.hasOwn(collection.layouts, layoutId)) {
            return {collection, errors: [`layoutId "${layoutId}" does not exist`]}
        }

        let doc = DockZoneModel.clone(collection);

        doc.activeLayoutId = layoutId;

        return {collection: DockZoneModel.clone(doc), errors: []}
    }

    /**
     * @summary Removes a saved layout and requires an explicit replacement when removing the active one.
     * @param {Object} collection
     * @param {Object} args {layoutId, replacementLayoutId}
     * @returns {{collection:Object, errors:String[]}}
     * @static
     */
    static removeSavedLayout(collection, {layoutId, replacementLayoutId} = {}) {
        let errors = DockZoneModel.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {collection, errors}
        }

        if (typeof layoutId !== 'string' || !layoutId.trim()) {
            return {collection, errors: ['layoutId must be a non-empty string']}
        }

        if (!Object.hasOwn(collection.layouts, layoutId)) {
            return {collection, errors: [`layoutId "${layoutId}" does not exist`]}
        }

        let removingActive = collection.activeLayoutId === layoutId;

        if (removingActive) {
            if (typeof replacementLayoutId !== 'string' || !replacementLayoutId.trim()) {
                return {collection, errors: ['removing the active layout requires replacementLayoutId']}
            }

            if (replacementLayoutId === layoutId) {
                return {collection, errors: ['replacementLayoutId must differ from the removed layoutId']}
            }

            if (!Object.hasOwn(collection.layouts, replacementLayoutId)) {
                return {collection, errors: [`replacementLayoutId "${replacementLayoutId}" does not exist`]}
            }
        }

        let doc = DockZoneModel.clone(collection);

        delete doc.layouts[layoutId];

        if (removingActive) {
            doc.activeLayoutId = replacementLayoutId
        }

        errors = DockZoneModel.validateSavedLayoutCollection(doc);

        return errors.length ? {collection, errors} : {collection: DockZoneModel.clone(doc), errors: []}
    }

    /**
     * @summary Restores the active saved-layout wrapper from a named layout collection.
     * @param {Object} collection
     * @returns {{document:(Object|null), errors:String[]}}
     * @static
     */
    static restoreActiveSavedLayout(collection) {
        let errors = DockZoneModel.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {document: null, errors}
        }

        if (typeof collection.activeLayoutId !== 'string' || !Object.hasOwn(collection.layouts, collection.activeLayoutId)) {
            return {document: null, errors: ['activeLayoutId must name an existing layout']}
        }

        return DockZoneModel.restoreSavedLayout(collection.layouts[collection.activeLayoutId])
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
     * `split` whose children are `[new, target]` (leading) or `[target, new]` (trailing). When
     * `targetNodeId` is the root, the new split becomes the root.
     *
     * The leading/trailing side comes from an explicit `position` (`before` / `after`) when given;
     * otherwise it is derived from the descriptor's `edge` — `top` / `left` lead (before), `bottom` /
     * `right` trail (after) — so a `DockPreview.previewToOperation()` edge descriptor places correctly.
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

        let doc = DockZoneModel.clone(document);

        DockZoneModel.detachFromTabs(doc, itemId);

        let newTabsId  = DockZoneModel.genId(doc, `tabs-${itemId}`),
            newSplitId = DockZoneModel.genId(doc, `split-${targetNodeId}`),
            ratio      = (Array.isArray(sizes) && sizes.length === 2) ? sizes : [0.5, 0.5],
            // Edge descriptors encode the side in `edge`, not `position`: top / left lead (before),
            // bottom / right trail (after). An explicit `position` always wins.
            atPosition = position || ((edge === 'top' || edge === 'left') ? 'before' : 'after');

        // Resolve the target's parent BEFORE inserting the new split — otherwise the new split
        // (which references the target) would be found as the target's own parent.
        let parentSlot = DockZoneModel.findParentSlot(doc, targetNodeId);

        doc.nodes[newTabsId] = {type: 'tabs', items: [itemId], activeItemId: itemId};
        doc.nodes[newSplitId] = {
            type    : 'split',
            orientation,
            children: atPosition === 'before' ? [newTabsId, targetNodeId] : [targetNodeId, newTabsId],
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

        let normalized = DockZoneModel.normalizeSplitSizes(sizes, (split.children || []).length, splitNodeId);

        if (normalized.errors.length) {
            return {document, errors: normalized.errors}
        }

        let doc = DockZoneModel.clone(document);

        doc.nodes[splitNodeId].sizes = normalized.sizes;

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

        let tabsNodeId  = DockZoneModel.findContainingTabsId(document, itemId),
            closedIndex = tabsNodeId ? document.nodes[tabsNodeId].items.indexOf(itemId) : -1,
            wasActive   = tabsNodeId ? document.nodes[tabsNodeId].activeItemId === itemId : false,
            doc         = DockZoneModel.clone(document);

        DockZoneModel.detachFromTabs(doc, itemId);

        if (wasActive && tabsNodeId && doc.nodes[tabsNodeId]?.type === 'tabs') {
            let node = doc.nodes[tabsNodeId];

            // When the closed item owned activation, the item now occupying its slot wins;
            // closing the last item falls back to its preceding sibling. A surviving active item
            // is left untouched. This is semantic model policy, not a projected-index guess.
            node.activeItemId = node.items[Math.min(closedIndex, node.items.length - 1)] ?? null
        }

        delete doc.items[itemId];

        return DockZoneModel.commit(document, doc)
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

        let doc = DockZoneModel.clone(document);

        doc.items[itemId].pinned = pinned;

        if (pinned) {
            doc.items[itemId].autoHidden = false
        }

        return DockZoneModel.commit(document, doc)
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

        let doc = DockZoneModel.clone(document);

        doc.items[itemId].autoHidden = autoHidden;

        return DockZoneModel.commit(document, doc)
    }

    /**
     * @summary Applies an operation descriptor (the shape `DockPreview.previewToOperation()` emits)
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
        const handler = Object.hasOwn(DockZoneModel.operationHandlers, descriptor.operation)
            ? DockZoneModel.operationHandlers[descriptor.operation]
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
        let sourceWorking = DockZoneModel.clone(sourceDocument);

        DockZoneModel.detachFromTabs(sourceWorking, itemId);
        delete sourceWorking.items[itemId];

        let sourceResult = DockZoneModel.commit(sourceDocument, sourceWorking);

        // Target side: insert the verbatim record into the catalog, then place it through the landed
        // single-document dispatch (which normalizes + validates the target tree). The transfer's
        // `itemId` overrides any id the caller left in the nested descriptor.
        let targetWorking = DockZoneModel.clone(targetDocument);

        targetWorking.items[itemId] = DockZoneModel.clone(record);

        let targetResult = DockZoneModel.applyOperation(targetWorking, {...target, itemId}),
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
        if (DockZoneModel.reachableNodeIds({nodes, root: nodeId}).has(targetNodeId)) {
            return {document, errors: [`cannot move node "${nodeId}" into its own subtree`]}
        }

        let doc = DockZoneModel.clone(document);

        DockZoneModel.detachNode(doc, nodeId);

        let errors = DockZoneModel.attachNode(doc, nodeId, targetNodeId, placement);

        return errors.length ? {document, errors} : DockZoneModel.commit(document, doc)
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

        centerId = root.zones?.center;

        return centerId && document.nodes[centerId] ? centerId : null
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
        let subtreeNodeIds = DockZoneModel.reachableNodeIds({nodes: sourceNodes, root: nodeId}),
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
        let sourceWorking = DockZoneModel.clone(sourceDocument);

        DockZoneModel.detachNode(sourceWorking, nodeId);
        subtreeNodeIds.forEach(id => delete sourceWorking.nodes[id]);
        memberItemIds.forEach(itemId => delete sourceWorking.items[itemId]);

        let sourceResult = DockZoneModel.commit(sourceDocument, sourceWorking);

        // Target side: graft the member records + subtree nodes verbatim, then attach the subtree root
        // through the shared moveNode placement grammar; normalize + validate.
        let targetWorking = DockZoneModel.clone(targetDocument);

        memberItemIds.forEach(itemId => targetWorking.items[itemId] = DockZoneModel.clone(sourceDocument.items[itemId]));
        subtreeNodeIds.forEach(id => targetWorking.nodes[id] = DockZoneModel.clone(sourceDocument.nodes[id]));

        let attachErrors = DockZoneModel.attachNode(targetWorking, nodeId, target.targetNodeId, target.placement || {}),
            targetResult = attachErrors.length
                ? {document: targetDocument, errors: attachErrors}
                : DockZoneModel.commit(targetDocument, targetWorking),
            errors       = [...sourceResult.errors, ...targetResult.errors];

        // Commit-or-neither: any error on either side rolls the whole transfer back to both inputs.
        if (errors.length) {
            return fail(errors)
        }

        return {sourceDocument: sourceResult.document, targetDocument: targetResult.document, errors: []}
    }
}

export default Neo.setupClass(DockZoneModel);
