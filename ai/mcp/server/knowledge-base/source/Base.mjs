import CoreBase from '../../../../../src/core/Base.mjs';

/**
 * Abstract base class for Knowledge Base data sources.
 * A Source is responsible for locating, reading, and yielding knowledge chunks from a specific part of the repository.
 *
 * @class Neo.ai.mcp.server.knowledge-base.source.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.Base'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.Base'
    }

    /**
     * Extracts content from this source and writes chunks to the stream.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     * @abstract
     */
    async extract(writeStream, createHashFn) {
        throw new Error('extract() must be implemented by subclass');
    }
}

export default Neo.setupClass(Base);
