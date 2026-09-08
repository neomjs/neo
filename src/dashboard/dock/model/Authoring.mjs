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
 * Round trips compare after normalization and catalog defaults, not byte-for-byte with an
 * input that omitted title/componentRef. No component construction or host lifecycle lives here.
 */
class Authoring extends Base {
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
     * @param {Object<String,Object>} panes Pane configs keyed by stable item ID
     * @param {Object|String|String[]} zones Nested root
     * @returns {{document:(Object|null), errors:String[]}}
     * @static
     */
    static fromZones(panes, zones) {
        try {
            this.require(WorkspaceDocument.isJsonRecord(panes), 'panes', 'must be a record of pane configurations');
            this.requireJson(zones, 'zones');

            const items    = Object.fromEntries(Object.entries(panes).map(([key, pane]) => [key, this.toItem(key, pane)])),
                  occupied = {},
                  explicit = new Set(),
                  placed   = new Set(),
                  rootId   = WorkspaceDocument.isJsonRecord(zones) && Object.hasOwn(zones, 'id') ? zones.id : 'root';

            occupied[rootId] = true;
            const tree     = this.readNode(zones, 'zones', {explicit, placed, rootId, items}, true),
                  document = {schema: WorkspaceDocument.SCHEMA, root: rootId, items, nodes: {}};

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
            this.require(Object.hasOwn(normalized.nodes, normalized.root), 'zones', 'normalizes to an empty root; use an empty edge-zone instead');
            const errors = WorkspaceDocument.validate(normalized);
            return errors.length ? {document: null, errors: errors.map(error => `zones: ${error}`)} : {document: normalized, errors: []}
        } catch (error) {
            return {document: null, errors: [error.message]}
        }
    }

    /**
     * @summary Exports the complete catalog and normalized nested arrangement from a wire document.
     *
     * Retained IDs reproduce the normalized document after fromZones' catalog defaults.
     * `keepIds: false` preserves catalog and tree semantics with freshly generated node IDs.
     * Runtime-only component configuration is unavailable in a document and is never invented.
     * @param {Object} document A JSON-only dock-zone document
     * @param {Object} [options]
     * @param {Boolean} [options.keepIds=true] Include every surviving node ID
     * @returns {{config:(Object|null), errors:String[]}}
     * @static
     */
    static toConfig(document, options={}) {
        try {
            this.require(WorkspaceDocument.isJsonRecord(options), 'options', 'must be a record');
            const {keepIds=true} = options;
            this.require(typeof keepIds === 'boolean', 'options.keepIds', 'must be a boolean');
            this.requireJson(document, 'document');
            this.require(WorkspaceDocument.isJsonRecord(document), 'document', 'must be a record');
            this.require(WorkspaceDocument.isJsonRecord(document.items), 'document.items', 'must be a record');
            this.require(WorkspaceDocument.isJsonRecord(document.nodes), 'document.nodes', 'must be a record');
            for (const [id, node] of Object.entries(document.nodes)) {
                const path = this.path('document.nodes', id);
                this.require(WorkspaceDocument.isJsonRecord(node), path, 'must be a node record');
                this.require(Object.hasOwn(WorkspaceDocument.dockZoneNodeKeys, node.type), `${path}.type`, 'must be a supported node type');
                if (node.type === 'split') {
                    this.require(Array.isArray(node.children), `${path}.children`, 'must be an array');
                    this.validateSplit(node, path, node.children.length);
                }
                if (node.type === 'tabs') this.require(Array.isArray(node.items), `${path}.items`, 'must be an array');
            }
            const unexpected = WorkspaceDocument.findUnexpectedDockZoneKey(document, 'document');
            if (unexpected) this.require(false, unexpected.path, unexpected.reason);

            const shape = WorkspaceDocument.computeShapeFingerprint(document);
            if (shape.errors.length) return {config: null, errors: shape.errors};
            const errors = WorkspaceDocument.validate(document);
            if (errors.length) return {config: null, errors};

            const normalized = WorkspaceDocument.normalizeTree(document);
            this.require(Object.hasOwn(normalized.nodes, normalized.root), 'document.root', 'normalizes to an empty root');

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
            return {config: null, errors: [error.message]}
        }
    }

    /**
     * @summary Copies one pane's wire fields and validates them before cloning.
     * @param {String} key
     * @param {Object} pane
     * @returns {Object}
     * @protected
     * @static
     */
    static toItem(key, pane) {
        const path = this.path('panes', key);
        this.require(key !== '__proto__', path, 'is not supported by the document clone boundary');
        this.require(WorkspaceDocument.isJsonRecord(pane), path, 'must be a pane configuration record');
        const item = Object.fromEntries([...WorkspaceDocument.dockZoneItemKeys]
            .filter(field => field !== 'title' && pane[field] !== undefined).map(field => [field, pane[field]]));
        item.componentRef ??= key;
        item.title = pane.header?.text ?? key;
        this.requireJson(item.title, `${path}.header.text`);
        this.requireJson(item, path);
        const errors = WorkspaceDocument.validate({schema: WorkspaceDocument.SCHEMA, root: 'root', items: {[key]: item}, nodes: {root: {type: 'edge-zone', zones: {}}}});
        this.require(!errors.length, path, errors.join('; '));
        return WorkspaceDocument.clone(item)
    }

    /**
     * @summary Checks authored grammar and reserves explicit IDs before building the flat graph.
     * @param {*} value
     * @param {String} path
     * @param {Object} context Shared explicit IDs, pane placement and catalog
     * @param {Boolean} [isRoot=false]
     * @param {Boolean} [isEdgeChild=false]
     * @returns {Object} Parsed node with deterministic naming hints
     * @protected
     * @static
     */
    static readNode(value, path, context, isRoot=false, isEdgeChild=false) {
        const shorthand = typeof value === 'string' || Array.isArray(value),
              record    = shorthand ? {} : value;
        this.require(WorkspaceDocument.isJsonRecord(record), path, 'must be a node record, pane name or pane array');
        const edges = [...WorkspaceDocument.dockZoneEdgeKeys],
              type  = shorthand ? 'tabs' : Object.hasOwn(record, 'type') ? record.type : (Object.hasOwn(record, 'items') ? 'tabs'
                  : Object.hasOwn(record, 'children') ? 'split' : edges.some(edge => Object.hasOwn(record, edge)) ? 'edge-zone' : null);
        this.require(Object.hasOwn(WorkspaceDocument.dockZoneNodeKeys, type), path, 'needs items, children, an edge key or a supported type');
        const allowed = new Set(type === 'edge-zone' ? ['type', ...edges] : WorkspaceDocument.dockZoneNodeKeys[type]);
        allowed.add('id');
        if (isEdgeChild) { allowed.add('extent'); allowed.add('resizable') }
        const unexpected = WorkspaceDocument.findUnexpectedKey(record, allowed, path);
        if (unexpected) this.require(false, unexpected.path, 'is not part of this node type');

        const node = {type};
        if (Object.hasOwn(record, 'id')) {
            const id = record.id;
            this.require(typeof id === 'string' && !!id.trim(), `${path}.id`, 'must be a non-empty string');
            this.require(id !== '__proto__', `${path}.id`, '"__proto__" is not supported by the document clone boundary');
            this.require(!context.explicit.has(id) && (isRoot || id !== context.rootId), `${path}.id`, `duplicate or reserved node ID "${id}"`);
            context.explicit.add(id);
            node.id = id;
        }

        if (type === 'tabs') {
            const items = typeof value === 'string' ? [value] : Array.isArray(value) ? value : record.items;
            this.require(Array.isArray(items), `${path}.items`, 'must be an array of pane names');
            items.forEach((key, index) => {
                const itemPath = typeof value === 'string' ? path : `${path}${Array.isArray(value) ? '' : '.items'}[${index}]`;
                this.require(typeof key === 'string' && Object.hasOwn(context.items, key), itemPath, `unknown pane "${key}"`);
                this.require(!context.placed.has(key), itemPath, `pane "${key}" is already placed`);
                context.placed.add(key);
            });
            node.items = [...items];
            node.activeItemId = Object.hasOwn(record, 'activeItemId') ? record.activeItemId : items[0] ?? null;
            this.require(node.activeItemId === null || items.includes(node.activeItemId), `${path}.activeItemId`, 'must name one of this node\'s panes or be null');
            node.firstPane = items[0];
            node.prefix = `tabs-${items[0] ?? 'empty'}`;
        } else if (type === 'split') {
            this.require(Array.isArray(record.children), `${path}.children`, 'must be an array of nodes');
            node.orientation = record.orientation;
            node.children = record.children.map((child, i) => this.readNode(child, `${path}.children[${i}]`, context));
            node.sizes = Object.hasOwn(record, 'sizes') ? record.sizes : node.children.map(() => 1 / node.children.length);
            this.validateSplit(node, path, node.children.length);
            node.sizes = [...node.sizes];
            node.firstPane = node.children.find(child => child.firstPane !== undefined)?.firstPane;
            node.prefix = `split-${node.children.map(child => child.firstPane ?? 'empty').join('-')}`;
        } else {
            node.children = edges.filter(edge => Object.hasOwn(record, edge)).map(edge => {
                const value = record[edge], descriptor = {};
                if (WorkspaceDocument.isJsonRecord(value)) {
                    if (Object.hasOwn(value, 'extent')) {
                        this.require(typeof value.extent === 'number' && value.extent > 0 && value.extent < 1, `${path}.${edge}.extent`, 'must be a fraction between 0 and 1');
                        descriptor.extent = value.extent;
                    }
                    if (Object.hasOwn(value, 'resizable')) {
                        this.require(typeof value.resizable === 'boolean', `${path}.${edge}.resizable`, 'must be a boolean');
                        descriptor.resizable = value.resizable;
                    }
                }
                return {edge, descriptor, child: this.readNode(value, `${path}.${edge}`, context, false, true)}
            });
            const panes = node.children.map(({child}) => child.firstPane).filter(key => key !== undefined);
            node.firstPane = panes[0];
            node.prefix = panes.length ? `edge-${panes.join('-')}` : 'edge';
        }
        return node
    }

    /**
     * @summary Applies the same split grammar at the authoring and export boundaries.
     * @param {Object} node
     * @param {String} path
     * @param {Number} count
     * @protected
     * @static
     */
    static validateSplit(node, path, count) {
        this.require(['horizontal', 'vertical'].includes(node.orientation), `${path}.orientation`, 'must be horizontal or vertical');
        this.require(Array.isArray(node.sizes) && node.sizes.length === count &&
            node.sizes.every(size => typeof size === 'number' && Number.isFinite(size) && size >= 0) &&
            (!node.sizes.length || Math.abs(node.sizes.reduce((a, b) => a + b, 0) - 1) <= 1e-6),
            `${path}.sizes`, 'must contain one finite nonnegative fraction per child, summing to 1');
    }

    /**
     * @summary Raises a path-labelled authoring error.
     * @param {Boolean} condition
     * @param {String} path
     * @param {String} reason
     * @protected
     * @static
     */
    static require(condition, path, reason) {
        if (!condition) throw new Error(`${path}: ${reason}`)
    }

    /**
     * @summary Rejects non-JSON values and keys that the document clone cannot preserve.
     * @param {*} value
     * @param {String} path
     * @protected
     * @static
     */
    static requireJson(value, path) {
        const failure = WorkspaceDocument.findNonJsonValue(value, path);
        if (failure) this.require(false, failure.path, failure.reason);
        const checkKeys = (value, path) => {
            if (value === null || typeof value !== 'object') return;
            for (const key of Object.keys(value)) {
                const childPath = Array.isArray(value) ? `${path}[${key}]` : this.path(path, key);
                this.require(key !== '__proto__', childPath, 'is not supported by the document clone boundary');
                checkKeys(value[key], childPath);
            }
        };
        checkKeys(value, path)
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
