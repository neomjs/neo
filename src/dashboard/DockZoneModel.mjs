import Base from '../core/Base.mjs';

/**
 * @class Neo.dashboard.DockZoneModel
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
     * The saved layout wrapper schema around a normalized dock-zone document.
     * @member {String} LAYOUT_SCHEMA='neo.harness.dockLayout.v1'
     * @static
     */
    static LAYOUT_SCHEMA = 'neo.harness.dockLayout.v1'

    /**
     * The saved layout collection schema for named layout perspectives.
     * @member {String} LAYOUT_COLLECTION_SCHEMA='neo.harness.dockLayoutCollection.v1'
     * @static
     */
    static LAYOUT_COLLECTION_SCHEMA = 'neo.harness.dockLayoutCollection.v1'

    /**
     * Top-level fields allowed in a saved-layout wrapper.
     * @member {Set<String>} savedLayoutKeys
     * @protected
     * @static
     */
    static savedLayoutKeys = new Set(['schema', 'layoutId', 'title', 'dockZone', 'metadata', 'revision'])

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
     * @summary Wraps a valid committed dock-zone document in a JSON-only saved-layout envelope.
     *
     * The wrapper and dock-zone tree are finite-schema: unknown fields fail closed. The explicit
     * `metadata` field is an opaque JSON-only non-secret annotation channel; callers must not place
     * credentials or runtime authority inside it.
     * @param {Object} document The committed dock-zone document to normalize and wrap.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata}
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
                schema  : DockZoneModel.LAYOUT_SCHEMA,
                layoutId,
                title,
                dockZone: normalized,
                metadata: Object.hasOwn(metadata, 'metadata') ? metadata.metadata : {}
            };

        if (Object.hasOwn(metadata, 'revision')) {
            layout.revision = metadata.revision
        }

        if (typeof layout.layoutId !== 'string' || !layout.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        }

        if (typeof layout.title !== 'string' || !layout.title.trim()) {
            errors.push('title must be a non-empty string')
        }

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

        if (savedLayout.schema !== DockZoneModel.LAYOUT_SCHEMA) {
            errors.push(`schema must be ${DockZoneModel.LAYOUT_SCHEMA}`)
        }

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

        let normalized = DockZoneModel.normalizeTree(savedLayout.dockZone),
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
            case 'resizeSplit':
                return DockZoneModel.resizeSplit(document, descriptor);
            case 'detachItem':
                return DockZoneModel.detachItem(document, descriptor);
            case 'closeItem':
                return DockZoneModel.closeItem(document, descriptor);
            case 'setItemPinned':
                return DockZoneModel.setItemPinned(document, descriptor);
            case 'setItemAutoHidden':
                return DockZoneModel.setItemAutoHidden(document, descriptor);
            default:
                return {document, errors: [`unknown operation "${descriptor.operation}"`]}
        }
    }
}

export default Neo.setupClass(DockZoneModel);
