import DockTopologyDiff from '../../dashboard/DockTopologyDiff.mjs';
import DockZoneModel    from '../../dashboard/DockZoneModel.mjs';
import Service          from './Service.mjs';

/**
 * Handles dock-layout Neural Link requests: topology readout and semantic operation execution
 * against a live dockZone.v1 document holder (contract of record:
 * learn/agentos/HarnessDockZoneModel.md and the harness docking design tier built on it).
 *
 * The service never mutates layout state outside the landed commit path: operations dispatch
 * through `DockZoneModel.applyOperation()` (or the holder's own `applyDockZoneOperation`
 * override when present), and successful documents commit back exactly the way
 * `DockSplitter.commitResizeSplit()` does — including the `onDockZoneDocumentChange`
 * notification hook. Policy rejections (e.g. `pinnable: false`) therefore surface as the
 * executor's structured `errors`, never get bypassed.
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
    static operations = DockZoneModel.operations

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
     * @returns {Object} The {@link Neo.dashboard.DockTopologyDiff#diffDockDocuments} result
     */
    async diffDockTopology({componentId, beforeDocument, sizeEpsilon}) {
        const holder = this.resolveHolder(componentId);

        return DockTopologyDiff.diffDockDocuments(beforeDocument, this.readDocument(holder), {sizeEpsilon})
    }

    /**
     * Captures the holder's CURRENT document as a named saved-layout record (the persistence
     * wrapper), and stores it when the holder exposes a perspective store — the capture verb
     * of the perspective tool trio.
     *
     * Capture scope follows the settled two-scope vocabulary EXACTLY: `workspace` (one
     * document — the landed wrapper) is shipped; `topology` (the multi-window tier) fails
     * closed with a structured error until its wrapper tranche lands — never a silent
     * downgrade to workspace scope.
     * @param {Object} params
     * @param {String}  params.componentId       The dock workspace / holder component id
     * @param {String}  params.layoutId          Stable technical id for the record
     * @param {String} [params.perspectiveName]  Product-facing name (resolves first on load)
     * @param {String} [params.title]            Display title
     * @param {String} [params.captureScope]     'workspace' (default) | 'topology'
     * @param {Boolean} [params.replace]         Explicit collision decision for the store
     * @returns {Object} `{captured, stored, collision, errors, layout}`
     */
    async capturePerspective({componentId, layoutId, perspectiveName, title, captureScope = 'workspace', replace = false}) {
        if (captureScope !== 'workspace') {
            const errors = captureScope === 'topology'
                ? ['capture scope "topology" is the multi-window perspective tier — its wrapper has not shipped; the shipped scope is "workspace"']
                : [`unknown captureScope "${captureScope}" — the vocabulary is: workspace, topology`];

            return {captured: false, collision: null, errors, layout: null, stored: false}
        }

        const holder           = this.resolveHolder(componentId),
              {layout, errors} = DockZoneModel.createSavedLayout(this.readDocument(holder), {
                  layoutId,
                  metadata: {source: 'neural-link-capture'},
                  perspectiveName,
                  // the wrapper requires a display title; a capture must not refuse over a
                  // missing label — the name (or id) is the honest default
                  title   : title ?? perspectiveName ?? layoutId
              });

        if (errors.length) {
            return {captured: false, collision: null, errors, layout: null, stored: false}
        }

        const store = holder.perspectiveStore;

        if (typeof store?.savePerspective !== 'function') {
            // capture still succeeds — the agent holds the record; storing needs the holder's
            // perspective surface, and its absence is declared, never silently absorbed
            return {captured: true, collision: null, errors: [], layout, stored: false}
        }

        const saved = store.savePerspective(layout, {replace});

        return {
            captured : true,
            collision: saved.collision,
            errors   : saved.errors,
            layout,
            stored   : saved.saved
        }
    }

    /**
     * Lists the holder's stored perspectives — the read verb of the trio. Fail-closed when
     * the holder exposes no perspective store: a structured error, never a crash or an empty
     * list masquerading as "no perspectives exist".
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @returns {Object} `{perspectives, activeLayoutId, errors}`
     */
    async listPerspectives({componentId}) {
        const holder = this.resolveHolder(componentId),
              store  = holder.perspectiveStore;

        if (typeof store?.list !== 'function') {
            return {
                activeLayoutId: null,
                errors        : [`Component ${componentId} exposes no perspective store — nothing to list`],
                perspectives  : null
            }
        }

        return {
            activeLayoutId: store.collection?.activeLayoutId ?? null,
            errors        : [],
            perspectives  : store.list()
        }
    }

    /**
     * Restores a stored perspective by name through the holder's OWN switch seam when present
     * (`activatePerspective` — rides the holder's commit loop, animation and error rendering
     * included), else through the store's fail-closed load + the landed commit path. Returns
     * the post-restore document so agents verify in one call.
     *
     * Fail-closed per the settled restore semantics: validate everything before mutating
     * anything — a refused restore leaves the live layout byte-untouched and surfaces the
     * store's structured errors.
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @param {String} params.name        The perspective's product name (or technical layoutId)
     * @returns {Object} `{switched, errors, document}`
     */
    async restorePerspective({componentId, name}) {
        const holder = this.resolveHolder(componentId);

        if (typeof holder.activatePerspective === 'function') {
            const verdict = holder.activatePerspective(name);

            return {
                document: this.readDocument(holder),
                errors  : verdict.errors,
                switched: verdict.switched
            }
        }

        const store = holder.perspectiveStore;

        if (typeof store?.loadPerspective !== 'function') {
            return {
                document: this.readDocument(holder),
                errors  : [`Component ${componentId} exposes no perspective surface (neither activatePerspective nor a perspective store)`],
                switched: false
            }
        }

        const {document, errors} = store.loadPerspective(name);

        if (errors.length) {
            return {document: this.readDocument(holder), errors, switched: false}
        }

        // the same commit semantics executeDockOperation uses for plain holders
        if (typeof holder.getDockZoneDocument !== 'function') {
            holder.dockZoneDocument = document
        }

        if (typeof holder.onDockZoneDocumentChange === 'function') {
            holder.onDockZoneDocumentChange(document, {name, operation: 'restorePerspective'}, this)
        }

        return {document, errors: [], switched: true}
    }

    /**
     * Applies one semantic dock operation to the holder's document through the landed commit
     * path and returns the post-operation state, so agents can verify without a second call.
     * @param {Object} params
     * @param {String} params.componentId The dock workspace / holder component id
     * @param {Object} params.descriptor  `{operation, ...}` — the `DockZoneModel.applyOperation()` shape
     * @returns {Object} `{applied, errors, document}` — `applied: false` carries the executor's errors
     */
    async executeDockOperation({componentId, descriptor}) {
        const operation = descriptor?.operation;

        if (!operation || !DockService.operations.includes(operation)) {
            throw new Error(
                `Unknown dock operation: ${operation}. ` +
                `The dockZone.v1 vocabulary is: ${DockService.operations.join(', ')}`
            )
        }

        const holder = this.resolveHolder(componentId);
        let result;

        try {
            if (typeof holder.applyDockZoneOperation === 'function') {
                result = holder.applyDockZoneOperation(descriptor, this) || null
            } else {
                result = DockZoneModel.applyOperation(this.readDocument(holder), descriptor)
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
        }

        return {
            applied : !result.errors?.length,
            document: result.document || this.readDocument(holder),
            errors  : result.errors || []
        }
    }
}

export default Neo.setupClass(DockService);
