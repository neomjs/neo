import aiConfig      from '../config.mjs';
import fs            from 'fs-extra';
import logger        from '../logger.mjs';
import path          from 'path';
import readline      from 'readline';
import Base          from '../../../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';

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
        const data  = await collection.get({include: ["documents", "embeddings", "metadatas"]});
        const count = data.ids.length;

        if (count === 0) {
            logger.log(`No documents found in ${collection.name} to export.`);
            return 0;
        }

        logger.log(`Found ${count} documents in ${collection.name} to export.`);

        await fs.ensureDir(backupPath);
        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

        for (let i = 0; i < count; i++) {
            const record = {
                id       : data.ids[i],
                embedding: data.embeddings[i],
                metadata : data.metadatas[i],
                document : data.documents[i]
            };
            writeStream.write(JSON.stringify(record) + '\n');
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
     * @returns {Promise<{imported: number, total: number, mode: string}>}
     */
    async importDatabase({file, mode}) {
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

            logger.log(`Importing ${records.length} documents into ${collection.name}...`);

            await collection.upsert({
                ids       : records.map(r => r.id),
                embeddings: records.map(r => r.embedding),
                metadatas : records.map(r => r.metadata),
                documents : records.map(r => r.document)
            });

            const count = await collection.count();
            logger.log(`Import complete. Collection "${collection.name}" now contains ${count} documents.`);
            return {imported: records.length, total: count, mode};
        } catch (error) {
            logger.error('[DatabaseService] Error importing database:', error);
            return {
                error  : 'Failed to import database',
                message: error.message,
                code   : 'DATABASE_IMPORT_ERROR'
            };
        }
    }
}

export default Neo.setupClass(DatabaseService);
