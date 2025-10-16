import { ChromaClient } from 'chromadb';
import aiConfig from '../../../../buildScripts/ai/aiConfig.mjs';

/**
 * Permanently deletes the entire knowledge base collection from ChromaDB.
 * This is a destructive operation used for a clean reset.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function deleteDatabase() {
    const dbClient = new ChromaClient();
    const collectionName = aiConfig.knowledgeBase.collectionName;

    try {
        await dbClient.deleteCollection({ name: collectionName });
        return {
            message: `Knowledge base collection '${collectionName}' deleted successfully.`
        };
    } catch (error) {
        // ChromaDB throws an error if the collection doesn't exist, which we can treat as a success for this operation.
        if (error.message.includes(`Collection ${collectionName} does not exist.`)) {
            return {
                message: `Knowledge base collection '${collectionName}' did not exist. No action taken.`
            };
        }
        // Re-throw other unexpected errors.
        throw error;
    }
}

export { deleteDatabase };
