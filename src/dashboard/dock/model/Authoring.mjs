import Base              from '../../../core/Base.mjs';
import WorkspaceDocument from './WorkspaceDocument.mjs';

/**
 * @class Neo.dashboard.dock.model.Authoring
 * @extends Neo.core.Base
 * @summary Pure conversion between nested pane arrangements and the committed dock document.
 *
 * `fromZones` accepts component configurations but copies only the document catalog fields.
 * `toConfig` exports that catalog and a nested tree; it cannot recover runtime configuration.
 * Both APIs fail closed, leave inputs untouched and apply WorkspaceDocument.normalizeTree.
 * Independent validation failures accumulate; malformed branches stop before unsafe traversal.
 * Round trips compare after normalization and catalog defaults, not byte-for-byte with an
 * input that omitted title/componentRef. No component construction or host lifecycle lives here.
 */
class Authoring extends Base {
    /**
     * Valid values for a split node's orientation.
     * @member {String[]} orientations=['horizontal','vertical']
     * @protected
     * @static
     */
    static orientations = ['horizontal', 'vertical']

    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.Authoring'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.Authoring'
    }

    /**
     * @summary Lowers a pane catalog and one nested root into `neo.dock.zone.v1`.
     *
     * A string or array abbreviates tabs. Objects discriminate by `items`, `children`, or
     * edge names; an explicit `type` supports all three node types, including an empty edge.
     * Edge-child `extent`/`resizable` belong to the descriptor. Splits require orientation;
     * omitted sizes are even fractions. Omitted activeItemId selects the first pane; null
     * preserves no selection. Empty/redundant descendants follow normal tree normalization.
     *
     * Explicit IDs are reserved before any generated allocation. The unnamed root reserves
     * `root`; other nodes use readable pane-derived prefixes and occupancy suffixes (`-0`, …).
     * Prefixes are hints, not a uniqueness guarantee. Errors name the authored config path.
     *
     * Catalog defaults: componentRef is the pane key; title is header.text, then the key
     * (nullish values use the default). Other defined catalog fields pass
     * through the existing JSON/model checks. Unplaced panes remain in the catalog.
     * Independent failures are collected across readable branches; malformed branches stop
     * safely, and any error prevents lowering from publishing a partial document.
     * @param {Object<String,Object>} panes Pane configs keyed by stable item ID
     * @param {Object|String|String[]} zones Nested root
     * @returns {{document:(Object|null), errors:String[]}}
     * @static
     */
    static fromZones(panes, zones) {
        const errors = [];
        try {
            const catalogKnown = WorkspaceDocument.isJsonRecord(panes);
            if (!catalogKnown) errors.push('panes: must be a record of pane configurations');
            this.validateJson(zones, 'zones', errors);
            const items    = Object.fromEntries(Object.entries(catalogKnown ? panes : {}).map(([key, pane]) => [key, this.toItem(key, pane, errors)])),
                  occupied = {},
                  explicit = new Set(),
                  placed   = new Set(),
                  rootId   = WorkspaceDocument.isJsonRecord(zones) && Object.hasOwn(zones, 'id') ? zones.id : 'root';

            const tree     = this.readNode(zones, 'zones', {explicit, placed, rootId, items, catalogKnown, errors, seen: new WeakSet()}, true),
                  document = {schema: WorkspaceDocument.SCHEMA, root: rootId, items, nodes: {}};

            if (errors.length) return {document: null, errors};
            occupied[rootId] = true;
            explicit.forEach(id => { occupied[id] = true });

            const lower = (node, isRoot=false) => {
                let id = node.id;
                if (id === undefined) {
                    const prefix = node.prefix;
                    id = isRoot ? rootId : Object.hasOwn(occupied, prefix)
                        ? WorkspaceDocument.genId({nodes: occupied}, prefix) : prefix;
                }
                occupied[id] = true;

                const wire = node.type === 'tabs'
                    ? {type: 'tabs', items: node.items, activeItemId: node.activeItemId}
                    : node.type === 'split'
                        ? {type: 'split', orientation: node.orientation, children: node.children.map(child => lower(child)), sizes: node.sizes}
                        : {type: 'edge-zone', zones: Object.fromEntries(node.children.map(({edge, child, descriptor}) =>
                            [edge, {nodeId: lower(child), ...descriptor}]))};

                Object.defineProperty(document.nodes, id, {value: wire, enumerable: true, writable: true, configurable: true});
                return id
            };

            document.root = lower(tree, true);
            const normalized = WorkspaceDocument.normalizeTree(document);
            if (!Object.hasOwn(normalized.nodes, normalized.root)) errors.push('normalizes to an empty root; use an empty edge-zone instead');
            else errors.push(...WorkspaceDocument.validate(normalized));
            return errors.length ? {document: null, errors: errors.map(error => `zones: ${error}`)} : {document: normalized, errors: []}
        } catch (error) {
            errors.push(error.message);
            return {document: null, errors}
        }
    }

    /**
     * @summary Exports the complete catalog and normalized nested arrangement from a wire document.
     *
     * Retained IDs reproduce the normalized document after fromZones' catalog defaults.
     * `keepIds: false` preserves catalog and tree semantics with freshly generated node IDs.
     * Runtime-only component configuration is unavailable in a document and is never invented.
     * Readable records contribute errors independently. Recursive graph validation and
     * normalization run only after their JSON/shape prerequisites are satisfied.
     * @param {Object} document A JSON-only dock-zone document
     * @param {Object} [options]
     * @param {Boolean} [options.keepIds=true] Include every surviving node ID
     * @returns {{config:(Object|null), errors:String[]}}
     * @static
     */
    static toConfig(document, options={}) {
        const errors = [];
        try {
            const optionsValid = WorkspaceDocument.isJsonRecord(options),
                  {keepIds=true} = optionsValid ? options : {};
            if (!optionsValid) errors.push('options: must be a record');
            else if (typeof keepIds !== 'boolean') errors.push('options.keepIds: must be a boolean');
            this.validateDocument(document, errors);
            if (errors.length) return {config: null, errors};

            const normalized = WorkspaceDocument.normalizeTree(document);
            if (!Object.hasOwn(normalized.nodes, normalized.root)) return {config: null, errors: ['document.root: normalizes to an empty root']};

            const inline = id => {
                const node = normalized.nodes[id], out = keepIds ? {id} : {};
                if (node.type === 'tabs') {
                    out.items = [...node.items];
                    out.activeItemId = node.activeItemId;
                } else if (node.type === 'split') {
                    out.orientation = node.orientation;
                    out.children = node.children.map(inline);
                    out.sizes = [...node.sizes];
                } else {
                    if (!Object.keys(node.zones).length) out.type = 'edge-zone';
                    for (const edge of WorkspaceDocument.dockZoneEdgeKeys) {
                        if (!Object.hasOwn(node.zones, edge)) continue;
                        const {nodeId, ...descriptor} = node.zones[edge];
                        out[edge] = {...inline(nodeId), ...descriptor};
                    }
                }
                return out
            };

            const panes = Object.fromEntries(Object.entries(normalized.items).map(([key, item]) => {
                const {title, ...pane} = item;
                if (title !== undefined) pane.header = {text: title};
                return [key, pane]
            }));
            return {config: {panes, zones: inline(normalized.root)}, errors: []}
        } catch (error) {
            errors.push(error.message);
            return {config: null, errors}
        }
    }

    /**
     * @summary Copies one pane's wire fields and validates them before cloning.
     * @param {String} key
     * @param {Object} pane
     * @param {String[]} errors Collected independent refusals.
     * @returns {Object|null}
     * @protected
     * @static
     */
    static toItem(key, pane, errors) {
        const path = this.path('panes', key);
        if (key === '__proto__') errors.push(`${path}: is not supported by the document clone boundary`);
        if (!WorkspaceDocument.isJsonRecord(pane)) {
            errors.push(`${path}: must be a pane configuration record`);
            return null
        }
        const start = errors.length;
        const item  = Object.fromEntries([...WorkspaceDocument.dockZoneItemKeys]
            .filter(field => field !== 'title' && pane[field] !== undefined).map(field => [field, pane[field]]));
        item.componentRef ??= key;
        item.title = pane.header?.text ?? key;
        this.validateJson(item.title, `${path}.header.text`, errors);
        this.validateJson({...item, title: null}, path, errors);
        this.validateItemPolicy(key, item, path, errors);
        return errors.length === start ? WorkspaceDocument.clone(item) : null
    }

    /**
     * @summary Checks authored grammar and reserves explicit IDs before building the flat graph.
     * @param {*} value
     * @param {String} path
     * @param {Object} context Shared errors, visited objects, explicit IDs, pane placement and catalog
     * @param {Boolean} [isRoot=false]
     * @param {Boolean} [isEdgeChild=false]
     * @returns {Object|null} Parsed node, or null when this branch cannot be inspected safely
     * @protected
     * @static
     */
    static readNode(value, path, context, isRoot=false, isEdgeChild=false) {
        const shorthand = typeof value === 'string' || Array.isArray(value),
              record    = shorthand ? {} : value,
              {errors}  = context;
        if (!WorkspaceDocument.isJsonRecord(record)) {
            errors.push(`${path}: must be a node record, pane name or pane array`);
            return null
        }
        if (value && typeof value === 'object') {
            if (context.seen.has(value)) {
                errors.push(`${path}: cyclic or repeated node configuration`);
                return null
            }
            context.seen.add(value)
        }
        const edges = [...WorkspaceDocument.dockZoneEdgeKeys],
              type  = shorthand ? 'tabs' : Object.hasOwn(record, 'type') ? record.type : (Object.hasOwn(record, 'items') ? 'tabs'
                  : Object.hasOwn(record, 'children') ? 'split' : edges.some(edge => Object.hasOwn(record, edge)) ? 'edge-zone' : null);
        if (typeof type !== 'string' || !Object.hasOwn(WorkspaceDocument.dockZoneNodeKeys, type)) {
            errors.push(`${path}: needs items, children, an edge key or a supported type`);
            return null
        }
        const allowed = new Set(type === 'edge-zone' ? ['type', ...edges] : WorkspaceDocument.dockZoneNodeKeys[type]);
        allowed.add('id');
        if (isEdgeChild) { allowed.add('extent'); allowed.add('resizable') }
        for (const key of Reflect.ownKeys(record)) {
            if (!allowed.has(key)) errors.push(`${this.path(path, String(key))}: is not part of this node type`)
        }

        const node = {type};
        if (Object.hasOwn(record, 'id')) {
            const id = record.id;
            if (typeof id !== 'string' || !id.trim()) errors.push(`${path}.id: must be a non-empty string`);
            else if (id === '__proto__') errors.push(`${path}.id: "__proto__" is not supported by the document clone boundary`);
            else if (context.explicit.has(id) || (!isRoot && id === context.rootId)) errors.push(`${path}.id: duplicate or reserved node ID "${id}"`);
            else {
                context.explicit.add(id);
                node.id = id
            }
        }

        if (type === 'tabs') {
            const items = typeof value === 'string' ? [value] : Array.isArray(value) ? value : record.items;
            if (!Array.isArray(items)) {
                errors.push(`${path}.items: must be an array of pane names`);
                return null
            }
            items.forEach((key, index) => {
                const itemPath = typeof value === 'string' ? path : `${path}${Array.isArray(value) ? '' : '.items'}[${index}]`;
                if (typeof key !== 'string') errors.push(`${itemPath}: must be a pane name`);
                else if (context.catalogKnown && !Object.hasOwn(context.items, key)) errors.push(`${itemPath}: unknown pane "${key}"`);
                else if (context.placed.has(key)) errors.push(`${itemPath}: pane "${key}" is already placed`);
                else context.placed.add(key);
            });
            node.items = [...items];
            node.activeItemId = Object.hasOwn(record, 'activeItemId') ? record.activeItemId : items[0] ?? null;
            if (node.activeItemId !== null && !items.includes(node.activeItemId)) errors.push(`${path}.activeItemId: must name one of this node's panes or be null`);
            node.firstPane = typeof items[0] === 'string' ? items[0] : undefined;
            node.prefix = `tabs-${node.firstPane ?? 'empty'}`;
        } else if (type === 'split') {
            if (!Array.isArray(record.children)) {
                errors.push(`${path}.children: must be an array of nodes`);
                this.validateSplit(record, path, null, errors);
                return null
            }
            node.orientation = record.orientation;
            node.children = record.children.map((child, i) => this.readNode(child, `${path}.children[${i}]`, context)).filter(Boolean);
            node.sizes = Object.hasOwn(record, 'sizes') ? record.sizes : record.children.map(() => 1 / record.children.length);
            this.validateSplit(node, path, record.children.length, errors);
            if (Array.isArray(node.sizes)) node.sizes = [...node.sizes];
            node.firstPane = node.children.find(child => child.firstPane !== undefined)?.firstPane;
            node.prefix = `split-${node.children.map(child => child.firstPane ?? 'empty').join('-')}`;
        } else {
            node.children = edges.filter(edge => Object.hasOwn(record, edge)).map(edge => {
                const value = record[edge], descriptor = {};
                if (WorkspaceDocument.isJsonRecord(value)) {
                    if (Object.hasOwn(value, 'extent')) {
                        if (typeof value.extent !== 'number' || !(value.extent > 0 && value.extent < 1)) errors.push(`${path}.${edge}.extent: must be a fraction between 0 and 1`);
                        descriptor.extent = value.extent;
                    }
                    if (Object.hasOwn(value, 'resizable')) {
                        if (typeof value.resizable !== 'boolean') errors.push(`${path}.${edge}.resizable: must be a boolean`);
                        descriptor.resizable = value.resizable;
                    }
                }
                return {edge, descriptor, child: this.readNode(value, `${path}.${edge}`, context, false, true)}
            }).filter(({child}) => child);
            const panes = node.children.map(({child}) => child.firstPane).filter(key => key !== undefined);
            node.firstPane = panes[0];
            node.prefix = panes.length ? `edge-${panes.join('-')}` : 'edge';
        }
        return node
    }

    /**
     * @summary Applies canonical item-policy validation while retaining the authored path.
     * @param {String} key
     * @param {Object} item
     * @param {String} path
     * @param {String[]} errors
     * @protected
     * @static
     */
    static validateItemPolicy(key, item, path, errors) {
        errors.push(...WorkspaceDocument.validateItemPolicy(key, item).map(error => `${path}: ${error}`))
    }

    /**
     * @summary Collects record-shape errors before admitting the existing wire validators.
     *
     * Catalog/node siblings remain inspectable when another record is malformed. Canonical wire
     * validation continues across malformed node records; recursive fingerprinting waits for a
     * traversable shape. No synthetic repairs or parallel schema authority normalize invalid input.
     * @param {*} document
     * @param {String[]} errors
     * @protected
     * @static
     */
    static validateDocument(document, errors) {
        const jsonStart = errors.length;
        this.validateJson(document, 'document', errors);
        const jsonSafe = errors.length === jsonStart;
        if (!WorkspaceDocument.isJsonRecord(document)) {
            errors.push('document: must be a record');
            return
        }
        for (const key of Object.keys(document)) {
            if (!WorkspaceDocument.dockZoneDocumentKeys.has(key)) errors.push(`${this.path('document', key)}: is outside the document schema`)
        }
        const catalogKnown = WorkspaceDocument.isJsonRecord(document.items),
              nodesKnown   = WorkspaceDocument.isJsonRecord(document.nodes), catalog = [];
        let traversable = catalogKnown && nodesKnown, safeReferences = true;
        if (typeof document.root !== 'string') {
            errors.push('document.root: must be a node ID');
            traversable = safeReferences = false
        }
        if (!catalogKnown) errors.push('document.items: must be a record');
        else for (const [key, item] of Object.entries(document.items)) {
            const path = this.path('document.items', key);
            if (!WorkspaceDocument.isJsonRecord(item)) {
                errors.push(`${path}: must be an item record`);
                traversable = false;
                continue
            }
            for (const field of Object.keys(item)) {
                if (!WorkspaceDocument.dockZoneItemKeys.has(field)) errors.push(`${this.path(path, field)}: is outside the item schema`)
            }
            catalog.push({key, item, path})
        }
        if (!nodesKnown) errors.push('document.nodes: must be a record');
        else for (const [id, node] of Object.entries(document.nodes)) {
            const path = this.path('document.nodes', id);
            if (!WorkspaceDocument.isJsonRecord(node)) {
                errors.push(`${path}: must be a node record`);
                traversable = false;
                continue
            }
            if (typeof node.type !== 'string' || !Object.hasOwn(WorkspaceDocument.dockZoneNodeKeys, node.type)) {
                errors.push(`${path}.type: must be a supported node type`);
                traversable = false;
                continue
            }
            for (const field of Object.keys(node)) {
                if (!WorkspaceDocument.dockZoneNodeKeys[node.type].has(field)) errors.push(`${this.path(path, field)}: is outside this node type`)
            }
            if (node.type === 'split') {
                const readable = Array.isArray(node.children);
                this.validateSplit(node, path, readable ? node.children.length : null, errors);
                if (!readable) {
                    errors.push(`${path}.children: must be an array`);
                    traversable = false
                } else node.children.forEach((childId, index) => {
                    if (typeof childId !== 'string') {
                        errors.push(`${path}.children[${index}]: must be a node ID`);
                        traversable = safeReferences = false
                    }
                });
            } else if (node.type === 'tabs') {
                if (!Array.isArray(node.items)) {
                    errors.push(`${path}.items: must be an array`);
                    traversable = false
                } else node.items.forEach((itemId, index) => {
                    if (typeof itemId !== 'string') {
                        errors.push(`${path}.items[${index}]: must be an item ID`);
                        traversable = safeReferences = false
                    }
                });
            } else if (node.type === 'edge-zone' && !WorkspaceDocument.isJsonRecord(node.zones)) {
                errors.push(`${path}.zones: must be a record`);
                traversable = false
            }
        }
        // Graph traversal still requires readable shapes; the canonical validator can report
        // malformed node containers and continue checking independent records without recursion.
        if (traversable && jsonSafe) errors.push(...WorkspaceDocument.computeShapeFingerprint(document).errors);
        if (catalogKnown && nodesKnown && jsonSafe && safeReferences) {
            errors.push(...WorkspaceDocument.validate(document))
        } else {
            // Safe catalog records still have independent policy failures even when an unrelated
            // node prevents calling the whole-document validator.
            catalog.forEach(({key, item, path}) => this.validateItemPolicy(key, item, path, errors))
        }
    }

    /**
     * @summary Applies the same split grammar at the authoring and export boundaries.
     * @param {Object} node
     * @param {String} path
     * @param {Number|null} count Null when malformed children prevent checking arity.
     * @param {String[]} errors
     * @protected
     * @static
     */
    static validateSplit(node, path, count, errors) {
        const {orientation, sizes} = node;

        if (!this.orientations.includes(orientation)) {
            errors.push(`${path}.orientation: must be ${this.orientations.join(' or ')}`)
        }

        if (count === null && sizes === undefined) return;
        if (!Array.isArray(sizes) || (count !== null && sizes.length !== count) ||
            sizes.some(size => !Number.isFinite(size) || size < 0) ||
            (sizes.length && Math.abs(sizes.reduce((a, b) => a + b, 0) - 1) > 1e-6)) {
            errors.push(`${path}.sizes: must contain one finite nonnegative fraction per child, summing to 1`)
        }
    }

    /**
     * @summary Collects JSON/clone-boundary failures, stopping at an invalid or repeated object.
     * @param {*} value
     * @param {String} path
     * @param {String[]} errors
     * @param {WeakSet<Object>} [seen=new WeakSet()]
     * @protected
     * @static
     */
    static validateJson(value, path, errors, seen=new WeakSet()) {
        if (!Array.isArray(value) && !WorkspaceDocument.isJsonRecord(value)) {
            const failure = WorkspaceDocument.findNonJsonValue(value, path);
            if (failure) errors.push(`${failure.path}: ${failure.reason}`);
            return
        }
        if (seen.has(value)) {
            errors.push(`${path}: cyclic or repeated object is not JSON-serializable`);
            return
        }
        seen.add(value);
        const array = Array.isArray(value),
              keys  = array ? [
                  ...Array.from({length: value.length}, (_, i) => String(i)),
                  ...Reflect.ownKeys(value).filter(key => key !== 'length' &&
                      (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
              ] : Reflect.ownKeys(value);
        for (const key of keys) {
            const childPath = array ? `${path}[${String(key)}]` : this.path(path, String(key));
            if (typeof key === 'symbol') errors.push(`${childPath}: symbol keys are not JSON-serializable`);
            else {
                if (key === '__proto__') errors.push(`${childPath}: is not supported by the document clone boundary`);
                if (WorkspaceDocument.forbiddenPreviewKeys.has(key)) errors.push(`${childPath}: runtime-only field must not enter committed dock-zone state`);
                this.validateJson(value[key], childPath, errors, seen)
            }
        }
    }

    /**
     * @summary Names record keys without confusing dotted pane IDs with nested paths.
     * @param {String} parent
     * @param {String} key
     * @returns {String}
     * @protected
     * @static
     */
    static path(parent, key) {
        return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`
    }
}

export default Neo.setupClass(Authoring);
