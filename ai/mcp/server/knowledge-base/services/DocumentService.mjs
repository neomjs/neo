import Base          from '../../../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';

/**
 * This service provides methods for retrieving documents from the knowledge base.
 * It uses the ChromaManager to interact with the underlying ChromaDB collection.
 * @class Neo.ai.mcp.server.knowledge-base.services.DocumentService
 * @extends Neo.core.Base
 * @singleton
 */
class DocumentService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.DocumentService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.DocumentService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Retrieves a paginated list of all documents from the knowledge base collection.
     * @param {object} params - The parameters for listing documents.
     * @param {number} [params.limit=100] - The maximum number of documents to return.
     * @param {number} [params.offset=0] - The number of documents to skip for pagination.
     * @returns {Promise<object>} A promise that resolves to the list of documents.
     */
    async listDocuments({ limit = 100, offset = 0 } = {}) {
        const collection = await ChromaManager.getKnowledgeBaseCollection();

        const results = await collection.get({
            limit,
            offset,
            include: ["metadatas", "documents"]
        });

        const documents = results.ids.map((id, index) => ({
            id,
            metadata: results.metadatas[index],
            content : results.documents[index]
        }));

        return {
            count: documents.length,
            documents
        };
    }

    /**
     * Retrieves a single document from the collection by its unique ID.
     * @param {string} id - The unique ID of the document to retrieve.
     * @returns {Promise<object>} A promise that resolves to the requested document.
     */
    async getDocumentById({ id }) {
        const collection = await ChromaManager.getKnowledgeBaseCollection();

        const result = await collection.get({
            ids    : [id],
            include: ["metadatas", "documents"]
        });

        if (result.ids.length === 0) {
            throw new Error(`Document with id '${id}' not found.`);
        }

        return {
            id      : result.ids[0],
            metadata: result.metadatas[0],
            content : result.documents[0]
        };
    }
}

export default Neo.setupClass(DocumentService);
