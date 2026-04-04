import '../../src/Neo.mjs';
import '../../src/core/_export.mjs';
import '../../src/manager/Instance.mjs';
import ChromaManager from '../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';
import SQLiteVectorManager from '../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';
import TextEmbeddingService from '../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';
import aiConfig from '../../ai/mcp/server/memory-core/config.mjs';

// We must override the local model config just in case, but let's assume it resolves
// To safely get from Chroma, we just instantiate ChromaManager collections.

async function sync() {
    try {
        console.log("=== STARTING MEMORY CORE MIGRATION (CHROMA => NEO SQLITE) ===");

        // Wait for managers to boot
        console.log("1. Booting ChromaDB (Legacy)...");
        await ChromaManager.ready();
        
        console.log("2. Booting SQLite (Neo Native)...");
        await SQLiteVectorManager.ready();
        
        console.log("3. Booting TextEmbeddingService (Local Model)...");
        await TextEmbeddingService.initAsync();

        const processCollection = async (chromaGetter, sqliteGetter, name) => {
            console.log(`\n--- Migrating Collection: ${name} ---`);
            const chromaColl = await chromaGetter();
            const sqliteColl = await sqliteGetter();

            const count = await chromaColl.count();
            console.log(`[${name}] Legacy Count: ${count}`);

            if (count === 0) {
                console.log(`[${name}] Skipping, nothing to migrate.`);
                return;
            }

            console.log(`[${name}] Fetching raw documents and metadata from Chroma...`);
            const batchSize = 1000;
            let offset = 0;

            while (offset < count) {
                const batch = await chromaColl.get({
                    include: ["documents", "metadatas"],
                    limit: batchSize,
                    offset: offset
                });

                if (!batch.ids || batch.ids.length === 0) break;
                
                console.log(`[${name}] Processing batch ${offset} => ${offset + batch.ids.length}`);
                
                // We process sequentially or in parallel batches for the local VRAM
                // We construct the arrays required by sqliteVectorManager: ids, embeddings, metadatas, documents
                const generatedEmbeddings = [];
                const ids = batch.ids;
                const metadatas = batch.metadatas;
                const documents = batch.documents;

                // Re-embed chunks sequentially to prevent OOM
                for (let i = 0; i < documents.length; i++) {
                    const docText = documents[i];
                    // Generate using the new local active TextEmbeddingService
                    const vec = await TextEmbeddingService.embedText(docText);
                    generatedEmbeddings.push(vec);
                    
                    if (i > 0 && i % 10 === 0) {
                        process.stdout.write(`... embedded ${i}/${documents.length}\r`);
                    }
                }
                
                console.log(`\n[${name}] Upserting batch to SQLite...`);
                await sqliteColl.upsert({
                    ids,
                    embeddings: generatedEmbeddings,
                    metadatas,
                    documents
                });
                
                offset += batchSize;
            }
            console.log(`[${name}] ✅ Completed Migration.`);
        }

        await processCollection(
            () => ChromaManager.getSummaryCollection(),
            () => SQLiteVectorManager.getSummaryCollection(),
            'Summaries'
        );

        await processCollection(
            () => ChromaManager.getMemoryCollection(),
            () => SQLiteVectorManager.getMemoryCollection(),
            'Memories'
        );

        console.log("\n=== MIGRATION SUCCESSFULLY TRANSACTED! ===");
        process.exit(0);

    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}

sync();
