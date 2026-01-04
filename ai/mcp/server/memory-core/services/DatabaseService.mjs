import aiConfig      from '../config.mjs';
import fs            from 'fs-extra';
import logger               from '../logger.mjs';
import path          from 'path';
import readline      from 'readline';
import Base          from '../../../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';
import TextEmbeddingService from './TextEmbeddingService.mjs';

/**
 * @summary Service for exporting and importing memory core data.
 *
 * This class provides functionality to backup and restore the agent's memory and session summary data.
 * It supports exporting collections to JSONL files and importing them back, with options to either merge
 * or replace existing data. This is crucial for data migration and disaster recovery.
 *
 * @class Neo.ai.mcp.server.memory-core.services.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.DatabaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Helper method to export a ChromaDB collection.
     * @param {Object} collection The ChromaDB collection to export.
     * @param {String} backupPath The directory to save the backup file.
     * @param {String} filePrefix The prefix for the backup filename.
     * @returns {Promise<number>} The number of exported documents.
     * @private
     */
    async #exportCollection(collection, backupPath, filePrefix) {
        logger.log(`Fetching all documents from "${collection.name}"...`);

        // 1. Get total count first
        const count = await collection.count();
        if (count === 0) {
            logger.log(`No documents found in ${collection.name} to export.`);
            return 0;
        }

        logger.log(`Found ${count} documents in ${collection.name} to export.`);

        await fs.ensureDir(backupPath);
        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

        // 2. Paginated Fetch
        const limit = 2000; // Safe batch size
        let offset  = 0;

        while (offset < count) {
            logger.log(`Fetching batch: ${offset} to ${Math.min(offset + limit, count)} of ${count}`);

            const batch = await collection.get({
                include: ["documents", "embeddings", "metadatas"],
                limit  : limit,
                offset : offset
            });

            if (!batch.ids || batch.ids.length === 0) break;

            for (let i = 0; i < batch.ids.length; i++) {
                const record = {
                    id       : batch.ids[i],
                    embedding: batch.embeddings[i],
                    metadata : batch.metadatas[i],
                    document : batch.documents[i]
                };
                writeStream.write(JSON.stringify(record) + '\n');
            }

            offset += limit;
        }

        writeStream.end();
        logger.log(`Successfully exported ${count} documents to: ${backupFile}`);
        return count;
    }

    /**
     * Exports the entire memory database (both memories and summaries) to a JSONL file.
     * @param {Object} options
     * @param {String[]} [options.include=['memories', 'summaries']] Array of collections to export.
     * @returns {Promise<{message: string}>}
     */
    async exportDatabase({include=['memories', 'summaries']} = {}) {
        try {
            logger.log('Starting agent memory export...');
            let memoryCount = 0, summaryCount = 0;

            if (include.includes('memories')) {
                const collection = await ChromaManager.getMemoryCollection();
                memoryCount = await this.#exportCollection(collection, aiConfig.memoryDb.backupPath, 'memory-backup');
            }

            if (include.includes('summaries')) {
                const collection = await ChromaManager.getSummaryCollection();
                summaryCount = await this.#exportCollection(collection, aiConfig.sessionDb.backupPath, 'summaries-backup');
            }

            return {message: `Export complete. Exported ${memoryCount} memories and ${summaryCount} summaries.`};
        } catch (error) {
            logger.error('[DatabaseService] Error exporting database:', error);
            return {
                error  : 'Failed to export database',
                message: error.message,
                code   : 'DATABASE_EXPORT_ERROR'
            };
        }
    }

    /**
     * Imports a previously exported JSONL file back into the database.
     * @param {Object} options
     * @param {String} options.file The path to the backup file to import.
     * @param {String} options.mode The import mode: 'merge' or 'replace'.
     * @param {Boolean} [options.reEmbed=false] If true, regenerates embeddings for all records.
     * @returns {Promise<{imported: number, total: number, mode: string}>}
     */
    async importDatabase({file, mode, reEmbed=false}) {
        try {
            const filePath = file; // Assuming file object contains path
            logger.log(`Starting agent memory import from: ${filePath}`);

            if (!await fs.pathExists(filePath)) {
                throw new Error(`Backup file not found at ${filePath}`);
            }

            // Determine which collection to import into based on filename
            const isMemoryBackup = path.basename(filePath).startsWith('memory-backup');
            let collection = isMemoryBackup
                ? await ChromaManager.getMemoryCollection()
                : await ChromaManager.getSummaryCollection();

            if (mode === 'replace') {
                await ChromaManager.client.deleteCollection({ name: collection.name });

                if (isMemoryBackup) {
                    ChromaManager.memoryCollection = null;
                    collection = await ChromaManager.getMemoryCollection();
                } else {
                    ChromaManager.summaryCollection = null;
                    collection = await ChromaManager.getSummaryCollection();
                }

                logger.log('Replaced mode: existing collection cleared and recreated.');
            }

            const fileStream = fs.createReadStream(filePath);
            const rl         = readline.createInterface({input: fileStream, crlfDelay: Infinity});
            const records    = [];

            for await (const line of rl) {
                records.push(JSON.parse(line));
            }

            if (records.length === 0) {
                return { message: 'No records found in backup file to import.' };
            }

            // --- Re-Embedding Logic ---
            if (reEmbed) {
                logger.log('Re-embedding enabled. Generating new embeddings for all records (Model: gemini-embedding-001)...');
                const batchSize = 50;
                const delay     = 10000; // 10s

                for (let i = 0; i < records.length; i += batchSize) {
                    const batch = records.slice(i, i + batchSize);
                    logger.log(`Processing batch ${Math.ceil((i + 1) / batchSize)}/${Math.ceil(records.length / batchSize)}...`);

                    const promises = batch.map(async (record) => {
                        try {
                            const newEmbedding = await TextEmbeddingService.embedText(record.document);
                            record.embedding = newEmbedding;
                        } catch (err) {
                            logger.error(`Failed to re-embed record ${record.id}:`, err);
                            throw err;
                        }
                    });

                    await Promise.all(promises);

                    if (i + batchSize < records.length) {
                        logger.log(`Waiting ${delay}ms to respect rate limits...`);
                        await this.timeout(delay);
                    }
                }
            }
            // --------------------------

            logger.log(`Importing ${records.length} documents into ${collection.name}...`);

            await collection.upsert({
                ids       : records.map(r => r.id),
                embeddings: records.map(r => r.embedding),
                metadatas : records.map(r => r.metadata),
                documents : records.map(r => r.document)
            });

            const count = await collection.count();
            logger.log(`Import complete. Collection "${collection.name}" now contains ${count} documents.`);
            return {
                message : `Import complete. Collection "${collection.name}" now contains ${count} documents.`,
                imported: records.length,
                total   : count,
                mode
            };
        } catch (error) {
            logger.error('[DatabaseService] Error importing database:', error);
            return {
                error  : 'Failed to import database',
                message: error.message,
                code   : 'DATABASE_IMPORT_ERROR'
            };
        }
    }

    /**
     * Manages database backups (import/export).
     * @param {Object} options
     * @param {String} options.action   The action to perform: 'import' or 'export'.
     * @param {Object} [options.config] Additional options for the action.
     * @returns {Promise<Object>}
     */
    async manageDatabaseBackup({action, ...config}) {
        if (action === 'export') {
            return this.exportDatabase(config);
        } else if (action === 'import') {
            return this.importDatabase(config);
        } else {
            throw new Error(`Unknown action: ${action}`);
        }
    }
}

export default Neo.setupClass(DatabaseService);
