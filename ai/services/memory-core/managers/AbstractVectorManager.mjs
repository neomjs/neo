import Base from '../../../../src/core/Base.mjs';

/**
 * @summary Defines the rigid interface contract for all vector database engines in the Memory Core.
 *
 * This class establishes the abstract foundation for the **Vector Storage Layer**. It enforces a standardized
 * CRUD and query interface across diverse physical storage implementations (e.g., ChromaDB, SQLite-Vec).
 *
 * By defining this contract, the architecture ensures that higher-level services like the `CollectionProxy`
 * and `DreamService` can seamlessly swap vector engines without tightly coupling to vendor-specific APIs.
 *
 * Future AI sessions should search for `vector engine`, `storage abstraction`, or `database adapter` to find this boundary.
 *
 * @class Neo.ai.services.memory-core.managers.AbstractVectorManager
 * @extends Neo.core.Base
 * @abstract
 * @see Neo.ai.services.memory-core.managers.CollectionProxy
 * @see Neo.ai.services.memory-core.managers.ChromaManager
 * @see Neo.ai.services.memory-core.managers.SQLiteVectorManager
 */
class AbstractVectorManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.managers.AbstractVectorManager'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.managers.AbstractVectorManager'
    }

    /**
     * @summary Resolves the memory collection abstraction from the active Vector Storage Layer.
     * @abstract
     * @returns {Promise<Object>}
     */
    async getMemoryCollection() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Resolves the session summary collection abstraction from the Vector Storage Layer.
     * @abstract
     * @returns {Promise<Object>}
     */
    async getSummaryCollection() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Resolves the temporal-summary collection abstraction from the Vector Storage Layer
     * (the pyramid's durable L1/L2 window records — one collection, level-partitioned by metadata).
     * @abstract
     * @returns {Promise<Object>}
     */
    async getTemporalSummaryCollection() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Ingests data directly into the active Vector Storage Layer adapter.
     * @abstract
     * @param {Object} args
     */
    async add(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Upserts data directly into the active Vector Storage Layer adapter.
     * @abstract
     * @param {Object} args
     */
    async upsert(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Updates existing data within the active Vector Storage Layer.
     * @abstract
     * @param {Object} args
     */
    async update(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Retrieves specific raw documents from the Vector Storage Layer.
     * @abstract
     * @param {Object} args
     */
    async get(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Executes a semantic or keyword search against the Vector Storage Layer topology.
     * @abstract
     * @param {Object} args
     */
    async query(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Resolves the total structural node count mapped natively in the active Vector Storage Layer.
     * @abstract
     */
    async count() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Permanently drops structural elements from the active Vector Storage Layer.
     * @abstract
     * @param {Object} args
     */
    async delete(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    /**
     * @summary Permanently drops an entire structural collection instance from the Vector Storage Layer.
     * @abstract
     * @param {String} name
     */
    async deleteCollection(name) {
        throw new Error('Abstract method: must be implemented by subclass');
    }
}

export default Neo.setupClass(AbstractVectorManager);
