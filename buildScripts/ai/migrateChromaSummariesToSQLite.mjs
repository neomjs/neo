import Neo                  from '../../src/Neo.mjs';
import * as core            from '../../src/core/_export.mjs';
import InstanceManager      from '../../src/manager/Instance.mjs';
import ChromaManager        from '../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';
import SQLiteVectorManager  from '../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';
import TextEmbeddingService from '../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';
import aiConfig             from '../../ai/mcp/server/memory-core/config.mjs';

/**
 * @module buildScripts/ai/migrateChromaSummariesToSQLite
 */

/**
 * @summary Extracts legacy session topologies from the deprecated Chroma DB, re-embeds them utilizing the script's `qwen3` parameters,
 * and surgically imports them natively into the Neo SQLite matrix for Graph ingestion.
 * This script serves as the bridge between legacy storage and native 4096D architecture alignment.
 * Implements the Anchor & Echo enhancement strategy by rigorously documenting the transition phase of the REM processing context.
 * @returns {Promise<void>}
 */
async function migrateChromaSummariesToSQLite() {
    try {
        console.log("=== MIGRATE SUMMARIES: CHROMA -> NEO SQLITE ===");
        aiConfig.neoEmbeddingProvider = 'openAiCompatible';
        
        await ChromaManager.ready();
        await SQLiteVectorManager.ready();
        await TextEmbeddingService.ready();

        const chromaColl = await ChromaManager.getSummaryCollection();
        const sqliteColl = await SQLiteVectorManager.getSummaryCollection();

        const count = await chromaColl.count();
        console.log(`Found ${count} session summaries in ChromaDB.`);

        if (count === 0) {
            console.log("No summaries to rescue!");
            process.exit(0);
        }

        const batchSize = 1000;
        let offset = 0;

        while (offset < count) {
            let batch = await chromaColl.get({
                include: ["documents", "metadatas"],
                limit: batchSize,
                offset: offset
            });

            if (!batch.ids || batch.ids.length === 0) break;

            const ids = batch.ids;
            const metadatas = batch.metadatas;
            const documents = batch.documents;
            const generatedEmbeddings = [];

            console.log(`Re-embedding ${documents.length} summaries via ${aiConfig.neoEmbeddingProvider}...`);
            
            for (let i = 0; i < documents.length; i++) {
                // Generates standardized 4096D vectors ensuring compliance with the native Edge Graph matrix properties
                const vec = await TextEmbeddingService.embedText(documents[i], 'openAiCompatible');
                generatedEmbeddings.push(vec);
                if ((i + 1) % 50 === 0) {
                    process.stdout.write(`... embedded ${i + 1}/${documents.length}\r`);
                }
            }

            console.log(`\nUpserting ${documents.length} summaries into SQLite...`);
            await sqliteColl.upsert({
                ids,
                embeddings: generatedEmbeddings,
                metadatas,
                documents
            });

            offset += batchSize;
        }

        console.log("✅ Successfully relocated summaries into SQLite vectors!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Migration Failed:", e);
        process.exit(1);
    }
}

migrateChromaSummariesToSQLite();
