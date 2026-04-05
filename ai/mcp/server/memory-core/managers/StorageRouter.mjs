import Base            from '../../../../../src/core/Base.mjs';
import CollectionProxy from './CollectionProxy.mjs';

/**
 * StorageRouter acts as a transparent Proxy pattern for the underlying vector databases.
 * It reads aiConfig.engine ('neo', 'chroma', or 'both') and dispatches collection
 * calls (add, upsert, get, query) to the appropriate managers.
 * 
 * If 'both' is selected:
 *  - Writes are dispatched to both databases (mirroring).
 *  - Reads return from the primary database (Neo) to avoid duplication.
 *
 * @class Neo.ai.mcp.server.memory-core.managers.StorageRouter
 * @extends Neo.core.Base
 */
class StorageRouter extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.managers.StorageRouter'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.managers.StorageRouter',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<CollectionProxy>} A proxy respecting aiConfig.engine
     */
    async getMemoryCollection() {
        return Neo.create(CollectionProxy, { collectionType: 'memory' });
    }

    /**
     * @returns {Promise<CollectionProxy>} A proxy respecting aiConfig.engine
     */
    async getSummaryCollection() {
        return Neo.create(CollectionProxy, { collectionType: 'summary' });
    }
    
    /**
     * Used by export/import processes to target specific or all active engines
     * @returns {Promise<Object[]>}
     */
    async getActiveManagers() {
        const proxy = Neo.create(CollectionProxy, { collectionType: 'memory' });
        return proxy.getManagers();
    }

    /**
     * Ensure the active engines are booted
     */
    async initAsync() {
        await super.initAsync();
        const proxy = Neo.create(CollectionProxy, { collectionType: 'memory' });
        await proxy.getManagers();
    }
}

export default Neo.setupClass(StorageRouter);
