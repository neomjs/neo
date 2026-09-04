import DockTopologyDiff       from '../../dashboard/dock/model/TopologyDiff.mjs';
import DockTopologyReconciler from '../../dashboard/dock/model/TopologyReconciler.mjs';
import Operations             from '../../dashboard/dock/model/Operations.mjs';
import Persistence            from '../../dashboard/dock/model/Persistence.mjs';
import Service                from './Service.mjs';
import {deriveSubtreePath}    from '../deriveSubtreePath.mjs';

/**
 * @summary Registers the JSON-RPC method prefixes one DockService instance answers.
 * @param {Object} serviceMap Mutable Client prefix map.
 * @param {DockService} service Owning service instance.
 * @returns {Object} The same map after registration.
 */
export function registerDockServiceMethods(serviceMap, service) {
    return Object.assign(serviceMap, {
        capture_perspective   : service,
        diff_dock_topology    : service,
        execute_dock_operation: service,
        get_dock_topology     : service,
        list_perspectives     : service,
        restore_perspective   : service
    })
}

/**
 * Handles dock-layout Neural Link requests: topology readout, semantic operation execution and
 * the perspective tool trio (capture / list / restore) against a live dockZone.v1 document
 * holder (contract of record: learn/agentos/DockZoneModel.md and the docking
 * design tier built on it).
 *
 * The service never mutates layout state outside the landed commit path: operations dispatch
 * through `Operations.applyOperation()` (or the holder's own `applyDockZoneOperation`
 * override when present), and successful documents commit back exactly the way
 * `DockSplitter.commitResizeOperation()` does — including the `onDockZoneDocumentChange`
 * notification hook. Policy rejections (e.g. `pinnable: false`) therefore surface as the
 * executor's structured `errors`, never get bypassed.
 *
 * Perspective verbs consume the executable substrate directly. Capture scope selects one of two
 * schemas: single-workspace layouts stay in `PerspectiveLibrary`; keyed topology records stay in a
 * separate topology collection. Restore routes by the stored schema before state moves, and keyed
 * topologies commit through one atomic holder seam.
 * @class Neo.ai.client.DockService
 * @extends Neo.ai.client.Service
 */
class DockService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.DockService'
         * @protected
         */
        className: 'Neo.ai.client.DockService'
    }

    /**
     * The dockZone.v1 semantic operation vocabulary — read by reference from the executor's
     * exported SSOT, never mirrored. The tool contract stays fail-closed against exactly
     * this set: unknown operations are rejected with the vocabulary enumerated.
     * @member {ReadonlyArray<String>} operations
     * @static
     */
    static operations = Operations.operations

    /**
     * @summary Resolves one topology by product name first, then technical layout id.
     * @param {Object|null} collection A `neo.dock.topologyCollection.v1` candidate.
     * @param {String} name
     * @returns {{layoutId:String, topology:Object}|null}
     * @static
     */
    static resolveTopologyEntry(collection, name) {
        const topologies = collection?.topologies;

        if (!topologies || typeof topologies !== 'object' || Array.isArray(topologies)) {
            return null
        }

        for (const [layoutId, topology] of Object.entries(topologies)) {
            if (topology?.perspectiveName === name) {
                return {layoutId, topology}
            }
        }

        return Object.hasOwn(topologies, name)
            ? {layoutId: name, topology: topologies[name]}
            : null
    }

    /**
     * @summary Returns plain topology summaries without exposing held records.
     * @param {Object|null} collection
     * @returns {Object[]}
     * @static
     */
    static listTopologies(collection) {
        return Object.entries(collection?.topologies || {}).map(([layoutId, topology]) => ({
            layoutId,
            perspectiveName: topology?.perspectiveName ?? null,
            revision       : topology?.revision ?? null,
            schema         : topology?.schema ?? null,
            title          : topology?.title ?? null
        }))
    }

    /**
     * @summary Atomically stores one topology in the holder's separate collection.
     *
     * Name and technical-id collisions require the caller's explicit `replace` decision, matching
     * the single-workspace perspective library. A holder without a `topologyCollection` field still
     * captures successfully but reports `saved: false`; the Group leaf supplies the durable owner.
     * @param {Object} holder
     * @param {Object} topology
     * @param {Object} [options={}]
     * @param {Boolean} [options.replace=false]
     * @returns {{saved:Boolean,collision:(Object|null),errors:String[]}}
     * @static
     */
    static storeTopology(holder, topology, {replace=false}={}) {
        if (!('topologyCollection' in holder)) {
            return {saved: false, collision: null, errors: []}
        }

        const current       = holder.topologyCollection ?? Persistence.createTopologyCollection().collection,
              currentErrors = Persistence.validateTopologyCollection(current);

        if (currentErrors.length) {
            return {saved: false, collision: null, errors: currentErrors}
        }

        const name       = topology.perspectiveName ?? topology.layoutId,
              byName     = DockService.resolveTopologyEntry(current, name),
              byId       = DockService.resolveTopologyEntry(current, topology.layoutId),
              collisions = [byName, byId]
                  .filter(Boolean)
                  .filter((entry, index, entries) =>
                      entry.layoutId !== topology.layoutId &&
                      entries.findIndex(other => other.layoutId === entry.layoutId) === index);

        if (collisions.length && !replace) {
            const holderEntry = collisions[0];

            return {
                saved    : false,
                collision: {
                    holderLayoutId: holderEntry.layoutId,
                    holderTitle   : holderEntry.topology?.title ?? null,
                    name
                },
                errors: []
            }
        }

        const topologies = {...current.topologies};

        collisions.forEach(entry => delete topologies[entry.layoutId]);
        topologies[topology.layoutId] = topology;

        const created = Persistence.createTopologyCollection(topologies, {
            activeLayoutId: topology.layoutId,
            metadata      : current.metadata,
            ...(Object.hasOwn(current, 'revision') && {revision: current.revision})
        });

        if (created.errors.length) {
            return {saved: false, collision: null, errors: created.errors}
        }

        holder.topologyCollection = created.collection;
        return {saved: true, collision: null, errors: []}
    }

    /**
     * Resolves a live dock-document holder — a component that carries a `dockZoneDocument`,
     * exposes `getDockZoneDocument()` (the canonical workspace shape), or provides its own
     * `applyDockZoneOperation` override. v1 deliberately requires the holder's
     * own component id (agents locate it via `find_instances` / `get_component_tree` first);
     * no parent-chain guessing, so a wrong id fails loudly instead of resolving surprisingly.
     * @param {String} componentId The dock workspace / holder component id
     * @returns {Neo.component.Base} The holder
     */
    resolveHolder(componentId) {
        const component = Neo.getComponent(componentId);

        if (!component) {
            throw new Error(`Component not found: ${componentId}`)
        }

        if (
            !component.dockZoneDocument &&
            typeof component.getDockZoneDocument !== 'function' &&
            typeof component.applyDockZoneOperation !== 'function'
        ) {
            throw new Error(
                `Component ${componentId} holds no dock document: expected a component carrying ` +
                '`dockZoneDocument`, `getDockZoneDocument()` or `applyDockZoneOperation` ' +
                '(the dock workspace container)'
            )
        }

        return component
    }

    /**
     * Reads the holder's current dock document through the v1 holder contract:
     * `getDockZoneDocument()` (the canonical workspace accessor — read-path twin of the
     * `applyDockZoneOperation` write seam) first, then the plain `dockZoneDocument` field.
     * Keeps the topology readable BEFORE any operation has run on holders that own their
     * document state internally (e.g. the `examples/dashboard/dock` MainContainer's `dockModel`).
     * @param {Neo.component.Base} holder The resolved dock-document holder
     * @returns {Object|null} The current dockZone.v1 document
     */
    readDocument(holder) {
        return holder.getDockZoneDocument?.() ?? holder.dockZoneDocument ?? null
    }

    /**
     * Serializes the holder's current dockZone.v1 document — the layout topology in the exact
     * JSON-first shape the persistence wrapper stores (no live references by contract).
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @returns {Object} `{document, operations}` — the topology plus the executable vocabulary
     */
    async getDockTopology({componentId}) {
        const holder = this.resolveHolder(componentId);

        return {
            document  : this.readDocument(holder),
            operations: DockService.operations
        }
    }

    /**
     * Computes a semantic, snapshot-stable diff between a supplied before-document and the
     * holder's current live dock document.
     * @param {Object} params
     * @param {String} params.componentId     The dock workspace / holder component id
     * @param {Object} params.beforeDocument  The earlier dockZone.v1 document to compare against
     * @param {Number} [params.sizeEpsilon]   Optional resize tolerance on split size fractions
     * @returns {Object} The {@link Neo.dashboard.dock.model.TopologyDiff#diffDockDocuments} result
     */
    async diffDockTopology({componentId, beforeDocument, sizeEpsilon}) {
        const holder = this.resolveHolder(componentId);

        return DockTopologyDiff.diffDockDocuments(beforeDocument, this.readDocument(holder), {sizeEpsilon})
    }

    /**
     * Captures the holder's CURRENT layout as a named saved-layout record through the landed
     * scope producers, and stores it when the holder exposes a perspective store — the capture
     * verb of the perspective tool trio.
     *
     * `captureScope` validates against {@link Neo.dashboard.dock.model.Persistence#CAPTURE_SCOPES}:
     * `window` (the default) captures the holder's own document through
     * `Persistence.capturePerspective()` (fingerprint-coherent by construction); `topology`
     * captures the whole multi-window workspace through
     * `Persistence.captureTopologyPerspective()` over the holder's topology read seam —
     * `getDockTopologyWorkspaces()`, returning documents keyed by semantic workspace identity.
     * A holder without that seam refuses topology capture with the missing seam declared —
     * never a silent downgrade to window scope.
     * @param {Object} params
     * @param {String}  params.componentId       The dock workspace / holder component id
     * @param {String}  params.layoutId          Stable technical id for the record
     * @param {String} [params.perspectiveName]  Product-facing name (resolves first on load)
     * @param {String} [params.title]            Display title
     * @param {String} [params.captureScope]     'window' (default) | 'topology' — the CAPTURE_SCOPES SSOT
     * @param {Boolean} [params.replace]         Explicit collision decision for the store
     * @returns {Object} `{captured, stored, collision, errors, layout, topology}` — exactly one
     * record is non-null on success.
     */
    async capturePerspective({componentId, layoutId, perspectiveName, title, captureScope = 'window', replace = false}) {
        if (!Persistence.CAPTURE_SCOPES.includes(captureScope)) {
            return {
                captured : false,
                collision: null,
                errors   : [`unknown captureScope "${captureScope}" — the vocabulary is: ${Persistence.CAPTURE_SCOPES.join(', ')}`],
                layout   : null,
                topology : null,
                stored   : false
            }
        }

        const holder   = this.resolveHolder(componentId),
              metadata = {
                  layoutId,
                  metadata: {source: 'neural-link-capture'},
                  // the wrapper requires a display title; a capture must not refuse over a
                  // missing label — the name (or id) is the honest default
                  title   : title ?? perspectiveName ?? layoutId,
                  // the writer keys on own-property presence: an own `perspectiveName: undefined`
                  // would fail field validation, so the key only exists when a name was given
                  ...(perspectiveName !== undefined && {perspectiveName})
              };

        let produced;

        if (captureScope === 'topology') {
            if (typeof holder.getDockTopologyWorkspaces !== 'function') {
                return {
                    captured : false,
                    collision: null,
                    errors   : [
                        `Component ${componentId} exposes no getDockTopologyWorkspaces() seam — topology ` +
                        'capture needs documents keyed by the holder\'s registered workspace identities'
                    ],
                    layout  : null,
                    stored  : false,
                    topology: null
                }
            }

            produced = Persistence.captureTopologyPerspective(holder.getDockTopologyWorkspaces(), metadata)
        } else {
            produced = Persistence.capturePerspective(this.readDocument(holder), metadata)
        }

        if (produced.errors.length) {
            return {captured: false, collision: null, errors: produced.errors, layout: null, stored: false, topology: null}
        }

        if (captureScope === 'topology') {
            const {topology} = produced,
                  saved      = DockService.storeTopology(holder, topology, {replace});

            return {
                captured : true,
                collision: saved.collision,
                errors   : saved.errors,
                layout   : null,
                stored   : saved.saved,
                topology
            }
        }

        const {layout} = produced,
              store    = holder.perspectiveStore;

        if (typeof store?.savePerspective !== 'function') {
            // capture still succeeds — the agent holds the record; storing needs the holder's
            // perspective surface, and its absence is declared, never silently absorbed
            return {captured: true, collision: null, errors: [], layout, stored: false, topology: null}
        }

        const saved = store.savePerspective(layout, {replace});

        return {
            captured : true,
            collision: saved.collision,
            errors   : saved.errors,
            layout,
            stored   : saved.saved,
            topology : null
        }
    }

    /**
     * Lists the holder's stored single-workspace perspectives and keyed topologies without
     * combining their collections. Fail-closed only when neither surface exists.
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @returns {Object} `{perspectives, topologies, activeLayoutId, activeTopologyLayoutId, errors}`
     */
    async listPerspectives({componentId}) {
        const holder        = this.resolveHolder(componentId),
              store         = holder.perspectiveStore,
              collection    = holder.topologyCollection,
              hasLayouts    = typeof store?.list === 'function',
              hasTopologies = collection !== undefined && collection !== null;

        if (!hasLayouts && !hasTopologies) {
            return {
                activeLayoutId        : null,
                activeTopologyLayoutId: null,
                errors                : [`Component ${componentId} exposes no perspective or topology store — nothing to list`],
                perspectives          : null,
                topologies            : null
            }
        }

        const topologyErrors = hasTopologies ? Persistence.validateTopologyCollection(collection) : [];

        if (topologyErrors.length) {
            return {
                activeLayoutId        : hasLayouts ? store.collection?.activeLayoutId ?? null : null,
                activeTopologyLayoutId: null,
                errors                : topologyErrors,
                perspectives          : hasLayouts ? store.list() : [],
                topologies            : null
            }
        }

        return {
            activeLayoutId        : hasLayouts ? store.collection?.activeLayoutId ?? null : null,
            activeTopologyLayoutId: hasTopologies ? collection.activeLayoutId : null,
            errors                : [],
            perspectives          : hasLayouts ? store.list() : [],
            topologies            : hasTopologies ? DockService.listTopologies(collection) : []
        }
    }

    /**
     * Restores a named record by schema after read-only lookup in the separate layout and topology
     * collections. A name present in both is ambiguous and fails closed. `layout.v1` prefers the
     * holder's switch seam, while `topology.v1` uses keyed reconciliation plus one atomic commit.
     * Neither active pointer advances before the corresponding document commit succeeds.
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @param {String} params.name        The perspective's product name (or technical layoutId)
     * @returns {Object} Layout: `{switched, schema, captureScope, errors, document}`. Topology adds
     * `{workspaces, restored, unrestored, displaced}`.
     */
    async restorePerspective({componentId, name}) {
        const holder            = this.resolveHolder(componentId),
              store             = holder.perspectiveStore,
              collection        = holder.topologyCollection,
              hasLayoutReader   = typeof store?.getPerspective === 'function',
              hasTopologyReader = collection !== undefined && collection !== null;

        if (!hasLayoutReader && !hasTopologyReader) {
            return {
                captureScope: null,
                document    : this.readDocument(holder),
                errors      : [
                    `Component ${componentId} exposes no perspective store with a read-only getPerspective() ` +
                    'seam and no topology collection — schema must be inspected before state moves'
                ],
                schema  : null,
                switched: false
            }
        }

        const layoutEntry   = hasLayoutReader ? store.getPerspective(name) : null,
              topologyEntry = hasTopologyReader ? DockService.resolveTopologyEntry(collection, name) : null;

        if (layoutEntry && topologyEntry) {
            return {
                captureScope: null,
                document    : this.readDocument(holder),
                errors      : [`perspective name "${name}" is ambiguous across layout and topology collections`],
                schema      : null,
                switched    : false
            }
        }

        if (topologyEntry) {
            return this.restoreTopologyPerspective({collection, holder, name, record: topologyEntry.topology})
        }

        if (!layoutEntry) {
            return {
                captureScope: null,
                document    : this.readDocument(holder),
                errors      : [`no perspective named "${name}"`],
                schema      : null,
                switched    : false
            }
        }

        if (layoutEntry.layout?.schema !== Persistence.LAYOUT_SCHEMA) {
            return {
                captureScope: null,
                document    : this.readDocument(holder),
                errors      : [`perspective "${name}" is not a ${Persistence.LAYOUT_SCHEMA} record`],
                schema      : layoutEntry.layout?.schema ?? null,
                switched    : false
            }
        }

        // window scope: the holder's own switch seam rides its full commit loop
        if (typeof holder.activatePerspective === 'function') {
            const verdict = holder.activatePerspective(name);

            return {
                captureScope: 'window',
                document    : this.readDocument(holder),
                errors      : verdict.errors,
                schema      : Persistence.LAYOUT_SCHEMA,
                switched    : verdict.switched
            }
        }

        if (typeof store.loadPerspective !== 'function') {
            return {
                captureScope: 'window',
                document    : this.readDocument(holder),
                errors      : [`Component ${componentId}'s perspective store exposes no loadPerspective() seam`],
                schema      : Persistence.LAYOUT_SCHEMA,
                switched    : false
            }
        }

        const {document, errors} = store.loadPerspective(name);

        if (errors.length) {
            return {captureScope: 'window', document: this.readDocument(holder), errors, schema: Persistence.LAYOUT_SCHEMA, switched: false}
        }

        // the same commit semantics executeDockOperation uses for plain holders
        if (typeof holder.getDockZoneDocument !== 'function') {
            holder.dockZoneDocument = document
        }

        if (typeof holder.onDockZoneDocumentChange === 'function') {
            holder.onDockZoneDocumentChange(document, {name, operation: 'restorePerspective'}, this)
        }

        return {captureScope: 'window', document, errors: [], schema: Persistence.LAYOUT_SCHEMA, switched: true}
    }

    /**
     * Reconciles one keyed topology against the holder's registered workspaces and commits the
     * complete result once. The activated topology-collection candidate validates before commit;
     * its active pointer is assigned only after the workspace write succeeds.
     * @param {Object} config
     * @param {Neo.component.Base} config.holder The resolved dock-document holder
     * @param {String} config.name               The perspective name being restored
     * @param {Object} config.record             The stored `neo.dock.topology.v1` record
     * @param {Object} config.collection         The containing topology collection
     * @returns {Object} `{switched, schema, errors, document, workspaces, restored, unrestored, displaced}`
     * @protected
     */
    restoreTopologyPerspective({collection, holder, name, record}) {
        const missing = ['getDockTopologyWorkspaces', 'commitDockTopologyWorkspaces']
            .filter(seam => typeof holder[seam] !== 'function');

        const refusal = (errors, reconcileResult = null) => ({
            displaced    : reconcileResult?.displaced    ?? [],
            document     : this.readDocument(holder),
            errors,
            restored     : reconcileResult?.restored     ?? [],
            schema       : Persistence.TOPOLOGY_SCHEMA,
            switched     : false,
            unmatchedLive: reconcileResult?.unmatchedLive ?? [],
            unrestored   : reconcileResult?.unrestored   ?? [],
            workspaces   : null
        });

        if (missing.length) {
            return refusal([
                `Component ${holder.id} cannot restore a topology perspective: missing holder seam(s) ` +
                `${missing.join(', ')} — a topology record commits all keyed workspaces atomically or not at all`
            ])
        }

        const result           = DockTopologyReconciler.reconcile(record, holder.getDockTopologyWorkspaces()),
              collectionErrors = Persistence.validateTopologyCollection(collection);

        if (collectionErrors.length || result.errors.length) {
            return refusal([...new Set([...collectionErrors, ...result.errors])], result)
        }

        const activated = Persistence.createTopologyCollection(collection.topologies, {
            activeLayoutId: record.layoutId,
            metadata      : collection.metadata,
            ...(Object.hasOwn(collection, 'revision') && {revision: collection.revision})
        });

        if (activated.errors.length) {
            return refusal(activated.errors, result)
        }

        const commit = holder.commitDockTopologyWorkspaces(result.workspaces, {
            name,
            operation: 'restorePerspective'
        });

        if (commit?.errors?.length) {
            return refusal(commit.errors, result)
        }

        holder.topologyCollection = activated.collection;

        return {
            displaced    : result.displaced,
            document     : this.readDocument(holder),
            errors       : [],
            restored     : result.restored,
            schema       : Persistence.TOPOLOGY_SCHEMA,
            switched     : true,
            unmatchedLive: result.unmatchedLive,
            unrestored   : result.unrestored,
            workspaces   : result.workspaces
        }
    }

    /**
     * Builds the reverse-op for an `execute_dock_operation` write — `op⁻¹ = applyDocument(preDoc)`,
     * capturing the pre-mutation document BEFORE the forward op lands: the document IS the state,
     * so the honest inverse of any dock mutation is re-committing its prior document through the
     * shared fail-closed commit path. Returns `null` for a legacy / unattributed write (no writer
     * identity ⇒ no per-writer undo stack) or an unresolvable target, so {@link #recordUndo} no-ops.
     * The reverse is a re-dispatchable validated tool descriptor — data-not-code, per the Neural
     * Link capability boundary.
     *
     * Named bound: a whole-document reverse is **per-writer last-writer-wins**. A's undo re-commits
     * A's pre-mutation document and silently discards any mutation B interleaved between A's capture
     * and A's undo — `targetSubtreePath` is audit metadata, never an enforcement path, so nothing at
     * undo time checks that the subtree still matches capture-time. Inherent to document-as-state,
     * not a defect; single-writer surfaces never reveal it.
     * @param {Object} params
     * @param {Object|null} params.context  The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @param {String} params.componentId The dock workspace / holder component id
     * @param {Object} params.descriptor  The forward `{operation, ...}` descriptor
     * @param {Object} params.preDocument Deep clone of the pre-mutation dockZone.v1 document
     * @returns {Object|null} A reverse-record op, or `null` when the write is not capturable.
     * @protected
     */
    buildDockReverse({context, componentId, descriptor, preDocument}) {
        if (!context?.agentId || !context?.sessionId) {
            return null
        }

        const targetSubtreePath = deriveSubtreePath(componentId, cid => Neo.getComponent(cid)?.parentId);

        if (!targetSubtreePath) {
            return null
        }

        return {
            sequenceId  : `${componentId}:${++this.undoSequence}`,
            originWriter: {agentId: context.agentId, sessionId: context.sessionId},
            targetSubtreePath,
            forward     : {tool: 'execute_dock_operation', args: {componentId, descriptor}},
            reverse     : {tool: 'execute_dock_operation', args: {componentId, descriptor: {operation: 'applyDocument', document: preDocument}}},
            label       : `dock ${descriptor.operation} on ${componentId}`
        }
    }

    /**
     * Applies one semantic dock operation to the holder's document through the landed commit
     * path and returns the post-operation state, so agents can verify without a second call.
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @param {Object} params.descriptor  `{operation, ...}` — the `Operations.applyOperation()` shape
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object} `{applied, errors, document}` — `applied: false` carries the executor's errors
     */
    async executeDockOperation({componentId, descriptor}, context) {
        const operation = descriptor?.operation;

        if (!operation || !DockService.operations.includes(operation)) {
            throw new Error(
                `Unknown dock operation: ${operation}. ` +
                `The dockZone.v1 vocabulary is: ${DockService.operations.join(', ')}`
            )
        }

        const holder = this.resolveHolder(componentId);
        let result;

        // Capture the reverse (a deep clone of the pre-mutation document) BEFORE applying — an undo
        // replay (`context.undoReplay`, set by the undo/redo dispatch) is NOT captured: re-applying a
        // captured op must never enqueue a new transaction. A legacy / unattributed write builds no
        // op at all, so the post-commit recordUndo no-ops.
        const undoOp = context?.undoReplay
            ? null
            : this.buildDockReverse({
                  componentId,
                  context,
                  descriptor,
                  preDocument: Neo.clone(this.readDocument(holder), true)
              });

        try {
            if (typeof holder.applyDockZoneOperation === 'function') {
                result = holder.applyDockZoneOperation(descriptor, this) || null
            } else {
                result = Operations.applyOperation(this.readDocument(holder), descriptor)
            }
        } catch (e) {
            // the reducer contract assumes a well-formed document; a malformed holder document
            // (or a throwing holder override) surfaces as structured errors, never a raw RPC crash
            return {
                applied : false,
                document: this.readDocument(holder),
                errors  : [`Dock operation failed before commit: ${e.message}`]
            }
        }

        if (!result) {
            return {
                applied : false,
                document: this.readDocument(holder),
                errors  : ['The holder\'s applyDockZoneOperation() returned no result.']
            }
        }

        if (!result.errors?.length && result.document) {
            // Holders exposing `getDockZoneDocument()` own their document state internally and
            // sync it inside `onDockZoneDocumentChange` (e.g. MainContainer advances `dockModel`
            // there); writing `dockZoneDocument` onto them would create a stray divergent field.
            if (typeof holder.getDockZoneDocument !== 'function') {
                holder.dockZoneDocument = result.document
            }

            if (typeof holder.onDockZoneDocumentChange === 'function') {
                holder.onDockZoneDocumentChange(result.document, descriptor, this)
            }

            // After the commit, never before: capturing an undo must never break the forward write.
            this.recordUndo(context, undoOp)
        }

        return {
            applied : !result.errors?.length,
            document: result.document || this.readDocument(holder),
            errors  : result.errors || []
        }
    }
}

export default Neo.setupClass(DockService);
