import fs                  from 'fs-extra';
import readline            from 'readline';
import Neo                 from '../../src/Neo.mjs';
import * as core           from '../../src/core/_export.mjs';
import InstanceManager     from '../../src/manager/Instance.mjs';
import SQLiteVectorManager from '../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';

/**
 * @module buildScripts/ai/importBackupToSQLite
 */

/**
 * @summary Directly streams and imports raw JSONL backup files into the native Neo SQLite `.neo-ai-data` memory matrix.
 * This standalone script bypasses standard MCP limits and ensures ultra-fast native batching for memory recovery operations.
 * Implements strict Anchor & Echo contextualization logic for batch upserts.
 * @returns {Promise<void>}
 */
async function run() {
    console.log("Initialize SQLiteManager");
    await SQLiteVectorManager.ready();
    const collectionName = 'neo_agent_memory';
    const coll = await SQLiteVectorManager.getOrCreateCollection({name: collectionName});

    // NOTE: Keep the specific path updated to whatever backup JSONL needs to be ingested
    const fileStream = fs.createReadStream('./.neo-ai-data/backups/memory-backup-2026-04-07T16-21-32.985Z.jsonl');
    const rl = readline.createInterface({input: fileStream, crlfDelay: Infinity});

    let records = [];
    console.log("Reading backup file...");

    for await (const line of rl) {
        if (line.trim()) {
            records.push(JSON.parse(line));
        }
    }
    console.log(`Found ${records.length} records. Beginning fast upsert...`);

    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const ids = [];
        const documents = [];
        const metadatas = [];
        const embeddings = [];

        for (const item of batch) {
            ids.push(item.id);
            documents.push(item.document);
            metadatas.push(item.metadata);
            embeddings.push(item.embedding); // USE EXISTING 4096D EMBEDDING directly
        }

        if (ids.length > 0) {
            await coll.upsert({ids, documents, metadatas, embeddings});
        }
    }

    console.log("Import Complete!");
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
