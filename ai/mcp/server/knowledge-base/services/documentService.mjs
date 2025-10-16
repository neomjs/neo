import { ChromaClient } from 'chromadb';
import aiConfig from '../../config.mjs';

/**
 * Retrieves a paginated list of all documents from the knowledge base collection.
 * @param {object} params - The parameters for listing documents.
 * @param {number} [params.limit=100] - The maximum number of documents to return.
 * @param {number} [params.offset=0] - The number of documents to skip for pagination.
 * @returns {Promise<object>} A promise that resolves to the list of documents.
 */
async function listDocuments({ limit = 100, offset = 0 } = {}) {
    const dbClient = new ChromaClient();
    const collection = await dbClient.getCollection({ name: aiConfig.knowledgeBase.collectionName });

    const results = await collection.get({
        limit: limit,
        offset: offset,
        include: ["metadatas", "documents"]
    });

    const documents = results.ids.map((id, index) => ({
        id: id,
        metadata: results.metadatas[index],
        content: results.documents[index]
    }));

    return {
        count: documents.length,
        documents: documents
    };
}

/**
 * Retrieves a single document from the collection by its unique ID.
 * @param {string} id - The unique ID of the document to retrieve.
 * @returns {Promise<object>} A promise that resolves to the requested document.
 */
async function getDocumentById({ id }) {
    const dbClient = new ChromaClient();
    const collection = await dbClient.getCollection({ name: aiConfig.knowledgeBase.collectionName });

    const result = await collection.get({
        ids: [id],
        include: ["metadatas", "documents"]
    });

    if (result.ids.length === 0) {
        throw new Error(`Document with id '${id}' not found.`);
    }

    return {
        id: result.ids[0],
        metadata: result.metadatas[0],
        content: result.documents[0]
    };
}

export { listDocuments, getDocumentById };
