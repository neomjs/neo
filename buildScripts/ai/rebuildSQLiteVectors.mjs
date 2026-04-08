import { Memory_LifecycleService, Memory_SQLiteVectorManager } from '../../ai/services.mjs';
import TextEmbeddingService from '../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';
import aiConfig from '../../ai/mcp/server/memory-core/config.mjs';
import fs from 'fs-extra';
import path from 'path';

/**
 * @module buildScripts/ai/rebuildSQLiteVectors
 */

const BATCH_SIZE = 15;

async function bootstrap() {
    console.log("0. Booting Neo.mjs Framework & Memory Core via AI SDK...");
    await Memory_LifecycleService.ready();
    await Memory_SQLiteVectorManager.initAsync();

    const db = Memory_SQLiteVectorManager.db;

    if (!db) {
        throw new Error("SQLiteVectorManager DB not initialized.");
    }

    const {dataDir, filename} = aiConfig.engines.neo;
    const dbPath = path.resolve(process.cwd(), dataDir, filename);

    console.log(`\n🔒 SAFETY PROTOCOL: Probing configured embedding model dimensions...`);
    const dummy = await TextEmbeddingService.embedText("dimension_test", aiConfig.neoEmbeddingProvider);
    const incomingDim = dummy.length;

    if (incomingDim !== aiConfig.vectorDimension) {
        console.error(`\n❌ FATAL SAFETY ERROR: Embedding model outputs ${incomingDim}D, but system config enforces ${aiConfig.vectorDimension}D!`);
        console.error(`Please update your configured embedding model or update NEO_VECTOR_DIMENSION in .env before rebuilding.`);
        process.exit(1);
    }
    console.log(`✅ Embedding model matches enforced config (${aiConfig.vectorDimension}D).`);

    const backupPath = `${dbPath}.bak_${Date.now()}`;
    console.log(`\n🔒 SAFETY PROTOCOL: Backing up current database to ${backupPath}`);
    await fs.copy(dbPath, backupPath);
    console.log(`✅ Backup secured.`);

    // 1. Identify collections
    const collections = db.prepare('SELECT * FROM vector_collections_meta').all();
    console.log(`\nDiscovered ${collections.length} vector collections to re-index.`);

    for (const collMeta of collections) {
        console.log(`\n--- Processing Collection: ${collMeta.name} (Currently ${collMeta.dimension}D) ---`);
        
        // 2. Extract Data
        const tableName = collMeta.name;
        // Check if table exists (it should, but just in case)
        let rows = [];
        try {
            rows = db.prepare(`SELECT chroma_id, document, metadata FROM ${tableName}_data`).all();
            console.log(` > Extracted ${rows.length} rows from memory.`);
        } catch (e) {
            console.warn(` > Failed to read from ${tableName}_data. It might be empty or missing. Skipping logic...`);
            continue;
        }

        // Parse metadata JSON
        rows = rows.map(r => ({
            id: r.chroma_id,
            document: r.document,
            metadata: JSON.parse(r.metadata)
        }));

        // 3. Drop existing 3072D tables
        console.log(` > Dropping existing vector tables for ${collMeta.name}...`);
        await Memory_SQLiteVectorManager.client.deleteCollection({ name: collMeta.name });
        console.log(` > Successfully dropped ${collMeta.name}.`);

        // 4. Re-initialize collection dynamically (will trigger configured vectorDimension creation)
        console.log(` > Re-initializing ${collMeta.name}. This will use the locked dimension from configuration...`);
        const newCollection = await Memory_SQLiteVectorManager.getOrCreateCollection({ name: collMeta.name });
        
        const checkMeta = db.prepare('SELECT dimension FROM vector_collections_meta WHERE name = ?').get(collMeta.name);
        console.log(` > Re-created tables. New vector dimension lock: ${checkMeta.dimension}D`);

        // 5. Re-embed and Upsert in Batches
        console.log(` > Re-embedding ${rows.length} documents in batches of ${BATCH_SIZE}...`);
        
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const ids        = [];
            const documents  = [];
            const metadatas  = [];
            const embeddings = [];

            console.log(`   * Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(rows.length / BATCH_SIZE)} (Items ${i+1} to ${Math.min(i+BATCH_SIZE, rows.length)})`);

            for (const item of batch) {
                // Ignore empty documents (though they shouldn't exist)
                if (!item.document || item.document.trim() === '') {
                    console.log(`     - Warning: Skipping empty document for ID: ${item.id}`);
                    continue;
                }

                try {
                    const vec = await TextEmbeddingService.embedText(item.document, aiConfig.neoEmbeddingProvider);
                    ids.push(item.id);
                    documents.push(item.document);
                    metadatas.push(item.metadata);
                    embeddings.push(vec);
                } catch (err) {
                    console.error(`     ! Error embedding document ${item.id}:`, err?.message || err);
                }
            }

            if (ids.length > 0) {
                await newCollection.upsert({
                    ids,
                    documents,
                    metadatas,
                    embeddings
                });
            }
        }

        console.log(` > Finished re-indexing collection ${collMeta.name}.`);
    }

    console.log("\n✅ ALL COLLECTIONS RE-INDEXED SUCCESSFULLY.");
    console.log("   You may now restore dimension validation in SQLiteVectorManager.mjs.");
    process.exit(0);
}

bootstrap().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
