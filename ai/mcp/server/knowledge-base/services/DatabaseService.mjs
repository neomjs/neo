import aiConfig           from '../config.mjs';
import Base               from '../../../../../src/core/Base.mjs';
import ChromaManager      from './ChromaManager.mjs';
import VectorService      from './VectorService.mjs';
import ApiSource          from '../source/ApiSource.mjs';
import LearningSource     from '../source/LearningSource.mjs';
import ReleaseNotesSource from '../source/ReleaseNotesSource.mjs';
import TestSource         from '../source/TestSource.mjs';
import TicketSource       from '../source/TicketSource.mjs';
import crypto             from 'crypto';
import dotenv             from 'dotenv';
import fs                 from 'fs-extra';
import logger             from '../logger.mjs';
import path               from 'path';

const cwd       = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;

dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

/**
 * @summary Core engine for building and maintaining the AI's knowledge base.
 *
 * This service is the core engine for building and maintaining the AI's knowledge base.
 * It orchestrates the entire ETL (Extract, Transform, Load) process for knowledge and
 * ensures the database is synchronized on application startup.
 *
 * ### Key Responsibilities:
 * 1.  **Autonomous Startup:** On initialization, it automatically checks if the knowledge base
 *     is synchronized with the source files and runs the necessary embedding or creation
 *     processes to bring it up-to-date.
 * 2.  **ETL Pipeline:**
 *     - **Extract:** Reads from diverse source-of-truth files (`createKnowledgeBase`).
 *     - **Transform:** Parses and structures data into a unified JSONL format.
 *     - **Load:** Delegates embedding and vector storage to `VectorService`.
 * 3.  **Lifecycle Management:** Provides methods for the full lifecycle of the knowledge base,
 *     from creation and synchronization to deletion.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.DatabaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Creates a SHA-256 hash from a stable JSON string representation of a chunk's content.
     * This hash is used to detect changes in content without having to compare the full text.
     * @param {Object} chunk The chunk object.
     * @returns {String} The hexadecimal hash string.
     * @private
     */
    createContentHash(chunk) {
        const contentString = JSON.stringify({
            type       : chunk.type,
            name       : chunk.name,
            description: chunk.description,
            content    : chunk.content,
            extends    : chunk.extends,
            configType : chunk.configType,
            params     : chunk.params,
            returns    : chunk.returns
        });
        return crypto.createHash('sha256').update(contentString).digest('hex');
    }

    /**
     * Manages knowledge base data operations based on the provided action.
     * @param {Object} params
     * @param {String} params.action - 'sync', 'create', 'embed', or 'delete'
     * @returns {Promise<Object>}
     */
    async manageKnowledgeBase({action}) {
        switch (action) {
            case 'sync':
                return this.syncDatabase();
            case 'create':
                return this.createKnowledgeBase();
            case 'embed':
                return this.embedKnowledgeBase();
            case 'delete':
                return this.deleteDatabase();
            default:
                throw new Error(`Invalid action: ${action}. Must be 'sync', 'create', 'embed', or 'delete'.`);
        }
    }

    /**
     * Parses all knowledge sources (JSDoc, guides, release notes, tickets) and generates
     * a structured JSONL file at `dist/ai-knowledge-base.jsonl`.
     *
     * This function acts as the "compiler" for the knowledge base. Its primary role is to
     * read from various source-of-truth files and convert them into a unified, structured format.
     * It uses a write stream to handle potentially large amounts of data efficiently without
     * holding everything in memory at once.
     *
     * ### Key Characteristics:
     * - **Input:** Reads from `docs/output/all.json` for API data and `learn/tree.json` for the guide structure.
     * - **Processing:** It breaks down the content into logical "chunks" (e.g., a class, a method, a section of a guide).
     * - **Output:** It streams each chunk as a JSON object into the `dist/ai-knowledge-base.jsonl` file.
     *
     * @returns {Promise<object>} A promise that resolves to a success message with the total chunk count.
     */
    async createKnowledgeBase() {
        logger.log('Starting knowledge base file creation...');
        const outputPath = aiConfig.dataPath;
        await fs.ensureDir(path.dirname(outputPath));
        const writeStream = fs.createWriteStream(outputPath);
        let totalChunks   = 0;

        const sources = [
            ApiSource,
            LearningSource,
            ReleaseNotesSource,
            TicketSource,
            TestSource
        ];

        const createHashFn = this.createContentHash.bind(this);

        for (const source of sources) {
            const sourceName = source.className.split('.').pop();
            logger.log(`Extracting knowledge from ${sourceName}...`);
            totalChunks += await source.extract(writeStream, createHashFn);
        }

        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                const message = `Knowledge base file created with ${totalChunks} chunks.`;
                logger.log(message);
                resolve({message});
            });
            writeStream.on('error', reject);
            writeStream.end();
        });
    }

    /**
     * Permanently deletes the entire knowledge base collection from ChromaDB.
     * Delegates to VectorService.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteDatabase() {
        return await VectorService.deleteCollection();
    }

    /**
     * Reads the generated JSONL file and upserts the data into the ChromaDB collection.
     * Delegates to VectorService.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async embedKnowledgeBase() {
        return await VectorService.embed(aiConfig.dataPath);
    }

    /**
     * Orchestrates the automated startup synchronization of the knowledge base.
     *
     * This method is called automatically by the framework after the service is constructed.
     * It ensures that the knowledge base is ready and up-to-date before the application
     * proceeds.
     *
     * The logic is as follows:
     * 1. It first waits for the underlying database connection to be ready.
     * 2. It then checks for the existence of the `ai-knowledge-base.jsonl` file.
     * 3. If the file does not exist, it triggers a full `syncDatabase()` (create + embed).
     * 4. If the file exists, it triggers `embedKnowledgeBase()` to process any new or changed content.
     *
     * This entire process is awaited via the `ready()` promise on the service, ensuring
     * that dependent services or startup sequences only proceed once the knowledge base is
     * fully initialized.
     * @protected
     */
    async initAsync() {
        await super.initAsync();

        // Wait for ChromaManager (which waits for LifecycleService) to be ready
        await ChromaManager.ready();

        logger.info('[Startup] Checking knowledge base status...');
        const knowledgeBasePath = aiConfig.dataPath;
        const kbExists          = await fs.pathExists(knowledgeBasePath);

        try {
            if (!kbExists) {
                logger.info('[Startup] Knowledge base file not found. Starting full synchronization...');
                await this.syncDatabase();
                logger.info('✅ [Startup] Full synchronization complete.');
            } else {
                logger.info('[Startup] Knowledge base file found. Starting embedding process...');
                await this.embedKnowledgeBase();
                logger.info('✅ [Startup] Embedding process complete.');
            }
        } catch (error) {
            logger.warn('⚠️  [Startup] Knowledge base synchronization/embedding failed:', error.message);
        }
    }

    /**
     * A convenience orchestrator that runs the entire knowledge base synchronization process.
     * It first creates the knowledge base file and then embeds its contents into the vector database.
     * This provides a simple, single-command way to update the knowledge base from scratch.
     * @returns {Promise<object>} A promise that resolves to the final success message from the embedding step.
     */
    async syncDatabase() {
        logger.log('Starting full database synchronization...');
        await this.createKnowledgeBase();
        return await this.embedKnowledgeBase();
    }
}

export default Neo.setupClass(DatabaseService);
