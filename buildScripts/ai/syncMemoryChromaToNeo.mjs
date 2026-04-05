import '../../src/Neo.mjs';
import '../../src/core/_export.mjs';
import '../../src/manager/Instance.mjs';
import ChromaManager        from '../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';
import SQLiteVectorManager  from '../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';
import TextEmbeddingService from '../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';
import aiConfig             from '../../ai/mcp/server/memory-core/config.mjs';

// We must override the local model config just in case, but let's assume it resolves
// To safely get from Chroma, we just instantiate ChromaManager collections.

async function sync() {
    try {
        console.log("=== STARTING MEMORY CORE MIGRATION (CHROMA => NEO SQLITE) ===");

        // Wait for managers to boot
        console.log("1. Booting ChromaDB (Legacy)...");
        await ChromaManager.ready();

        console.log("2. Cleaning up Native SQLite for a FULL Re-sync...");
        const fs = (await import('fs')).default;
        const path = (await import('path')).default;
        const sqlDbUrl = new URL('../../neo-memory-core-sqlite/memories.sqlite', import.meta.url);
        if (fs.existsSync(sqlDbUrl)) {
            fs.unlinkSync(sqlDbUrl);
            console.log("   -> Old memories.sqlite deleted.");
        }

        console.log("3. Booting SQLite (Neo Native)...");
        await SQLiteVectorManager.ready();

        console.log("4. Booting TextEmbeddingService...");
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
                const isProviderMatch = aiConfig.neoEmbeddingProvider === aiConfig.chromaEmbeddingProvider;

                const batch = await chromaColl.get({
                    include: isProviderMatch ? ["documents", "metadatas", "embeddings"] : ["documents", "metadatas"],
                    limit: batchSize,
                    offset: offset
                });

                if (!batch.ids || batch.ids.length === 0) break;

                console.log(`[${name}] Processing batch ${offset} => ${offset + batch.ids.length}`);

                // We process sequentially or in parallel batches for the local VRAM
                // We construct the arrays required by sqliteVectorManager: ids, embeddings, metadatas, documents
                let generatedEmbeddings = [];
                const ids = batch.ids;
                const metadatas = batch.metadatas;
                const documents = batch.documents;

                if (isProviderMatch) {
                    console.log(`[${name}] Providers match (${aiConfig.neoEmbeddingProvider}). Hardware 1:1 vector transfer active.`);
                    generatedEmbeddings = batch.embeddings;
                } else {
                    console.log(`[${name}] Translating semantic space from ${aiConfig.chromaEmbeddingProvider} to ${aiConfig.neoEmbeddingProvider}.`);
                    // Re-embed chunks sequentially to prevent OOM
                    for (let i = 0; i < documents.length; i++) {
                        const docText = documents[i];
                        // Generate using the new local active TextEmbeddingService
                        const vec = await TextEmbeddingService.embedText(docText, aiConfig.neoEmbeddingProvider);
                        generatedEmbeddings.push(vec);

                        if (i > 0 && i % 10 === 0) {
                            process.stdout.write(`... embedded ${i}/${documents.length}\r`);
                        }
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
