import Base from '../../../../../src/core/Base.mjs';

/**
 * @class Neo.ai.mcp.server.memory-core.managers.AbstractVectorManager
 * @extends Neo.core.Base
 * @abstract
 */
class AbstractVectorManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.managers.AbstractVectorManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.managers.AbstractVectorManager'
    }

    async getMemoryCollection() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async getSummaryCollection() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async add(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async upsert(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async update(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async get(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async query(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async count() {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async delete(args) {
        throw new Error('Abstract method: must be implemented by subclass');
    }

    async deleteCollection(name) {
        throw new Error('Abstract method: must be implemented by subclass');
    }
}

export default Neo.setupClass(AbstractVectorManager);
