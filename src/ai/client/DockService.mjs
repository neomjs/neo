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
