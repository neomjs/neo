import Base          from '../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';
import {buildReadWhereClause} from './readVisibilityFilter.mjs';

/**
 * @summary Retrieves documents from the knowledge base.
 *
 * This service provides methods for retrieving documents from the knowledge base.
 * It uses the ChromaManager to interact with the underlying ChromaDB collection.
 *
 * @class Neo.ai.services.knowledge-base.DocumentService
 * @extends Neo.core.Base
 * @singleton
 */
class DocumentService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.DocumentService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.DocumentService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Retrieves a paginated, tenant-scoped list of documents from the knowledge base collection.
     *
     * When a request context is active, results are filtered to the requester's own tenant plus
     * Neo's curated `neo-shared` corpus (#11632). Without a context (stdio single-tenant / offline
     * daemon) every document is returned, byte-equivalent with pre-#11632 behavior.
     * @param {Object} params             The parameters for listing documents.
     * @param {Number} [params.limit=100] The maximum number of documents to return.
     * @param {Number} [params.offset=0]  The number of documents to skip for pagination.
     * @returns {Promise<Object>} A promise that resolves to the list of documents.
     */
    async listDocuments({limit=100, offset=0} = {}) {
        const collection = await ChromaManager.getKnowledgeBaseCollection();

        const getOptions = {
            limit,
            offset,
            include: ["metadatas", "documents"]
        };

        // Tenant isolation (#11632) + per-chunk visibility (#12163) from the authenticated context
        // (see readVisibilityFilter); offline / no-context → no filter, pre-#11632 byte-equivalent.
        const whereClause = buildReadWhereClause();
        if (whereClause) {
            getOptions.where = whereClause;
        }

        const results = await collection.get(getOptions);

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
     *
     * When a request context is active, the lookup is tenant-scoped (#11632): an ID owned by
     * another tenant resolves to a "not found" error, indistinguishable from a genuinely absent
     * ID so no cross-tenant existence signal leaks.
     * @param {String} id The unique ID of the document to retrieve.
     * @returns {Promise<Object>} A promise that resolves to the requested document.
     * @throws {Error} When no document with the given ID is visible to the requester.
     */
    async getDocumentById({id}) {
        const collection = await ChromaManager.getKnowledgeBaseCollection();

        const getOptions = {
            ids    : [id],
            include: ["metadatas", "documents"]
        };

        // Tenant isolation (#11632) + per-chunk visibility (#12163) from the authenticated context
        // (see readVisibilityFilter). A doc owned by another tenant — or another user's private doc
        // — resolves to "not found", fail-closed, leaking no cross-tenant/owner existence signal.
        const whereClause = buildReadWhereClause();
        if (whereClause) {
            getOptions.where = whereClause;
        }

        const result = await collection.get(getOptions);

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
