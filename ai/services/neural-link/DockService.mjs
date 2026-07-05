import Base              from '../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages dock-layout inspection and semantic operations for the Neural Link MCP Server.
 *
 * This service provides tools for reading a live dock workspace's serializable layout document
 * (its topology) and for executing dockZone.v1 semantic operations against it. Both calls are
 * thin passthroughs to the App Worker, where the dock document holder applies operations through
 * the landed commit path — policy rejections surface as structured executor errors.
 *
 * @class Neo.ai.services.neural-link.DockService
 * @extends Neo.core.Base
 * @singleton
 */
class DockService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.DockService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.DockService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Computes a semantic diff between a supplied before-document and a live workspace's
     * current layout document.
     * @param {Object} opts
     * @param {String} opts.componentId    The dock workspace / document-holder component id
     * @param {Object} opts.beforeDocument The earlier dockZone.v1 document to compare against
     * @param {Number} [opts.sizeEpsilon]  Optional resize tolerance on split size fractions
     * @param {String} [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async diffDockTopology({componentId, beforeDocument, sizeEpsilon, sessionId}) {
        return await ConnectionService.call(sessionId, 'diff_dock_topology', {
            beforeDocument,
            componentId,
            sizeEpsilon
        })
    }

    /**
     * Applies one semantic dock operation to a live workspace's layout document and returns
     * the post-operation state for immediate verification.
     * @param {Object} opts
     * @param {String} opts.componentId The dock workspace / document-holder component id
     * @param {Object} opts.descriptor  The operation descriptor `{operation, ...}`
     * @param {String} [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async executeDockOperation({componentId, descriptor, sessionId}) {
        return await ConnectionService.call(sessionId, 'execute_dock_operation', {
            componentId,
            descriptor
        })
    }

    /**
     * Reads a live dock workspace's serializable layout document plus the executable
     * operation vocabulary.
     * @param {Object} opts
     * @param {String} opts.componentId The dock workspace / document-holder component id
     * @param {String} [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async getDockTopology({componentId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_dock_topology', {
            componentId
        })
    }
}

export default Neo.setupClass(DockService);
