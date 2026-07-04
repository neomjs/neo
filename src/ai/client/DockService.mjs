import DockZoneModel from '../../dashboard/DockZoneModel.mjs';
import Service       from './Service.mjs';

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
     * The dockZone.v1 semantic operations `DockZoneModel.applyOperation()` dispatches,
     * mirrored verbatim from its switch. The tool contract is fail-closed against exactly
     * this set: unknown operations are rejected with the vocabulary enumerated.
     * @member {String[]} operations
     * @static
     */
    static operations = [
        'addTab', 'moveItem', 'splitNode', 'resizeSplit',
        'detachItem', 'closeItem', 'setItemPinned', 'setItemAutoHidden'
    ]

    /**
     * Resolves a live dock-document holder — a component that carries a `dockZoneDocument`
     * (or its own `applyDockZoneOperation` override). v1 deliberately requires the holder's
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

        if (!component.dockZoneDocument && typeof component.applyDockZoneOperation !== 'function') {
            throw new Error(
                `Component ${componentId} holds no dock document: expected a component carrying ` +
                '`dockZoneDocument` or `applyDockZoneOperation` (the dock workspace container)'
            )
        }

        return component
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
            document  : holder.dockZoneDocument || null,
            operations: DockService.operations
        }
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

        if (typeof holder.applyDockZoneOperation === 'function') {
            result = holder.applyDockZoneOperation(descriptor, this) || null
        } else {
            result = DockZoneModel.applyOperation(holder.dockZoneDocument, descriptor)
        }

        if (!result) {
            return {
                applied : false,
                document: holder.dockZoneDocument || null,
                errors  : ['The holder\'s applyDockZoneOperation() returned no result.']
            }
        }

        if (!result.errors?.length && result.document) {
            holder.dockZoneDocument = result.document;

            if (typeof holder.onDockZoneDocumentChange === 'function') {
                holder.onDockZoneDocumentChange(result.document, descriptor, this)
            }
        }

        return {
            applied : !result.errors?.length,
            document: result.document || holder.dockZoneDocument || null,
            errors  : result.errors || []
        }
    }
}

export default Neo.setupClass(DockService);
