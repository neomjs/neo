import Neo                  from '../../src/Neo.mjs';
import * as core            from '../../src/core/_export.mjs';
import InstanceManager      from '../../src/manager/Instance.mjs';
import ChromaManager        from '../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';
import SQLiteVectorManager  from '../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';
import TextEmbeddingService from '../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';
import aiConfig             from '../../ai/mcp/server/memory-core/config.mjs';
import {program}            from 'commander';

/**
 * @module buildScripts/ai/syncMemoryChromaToNeo
 */

program
    .name('sync-memory-chroma-to-neo')
    .description('Migrate ChromaDB memory to Neo SQLite with optional re-embedding')
    .option('-p, --target-provider <provider>', 'The target embedding provider (e.g., gemini, openAiCompatible).')
    .parse(process.argv);

const options = program.opts();
/**
 * @summary Synchronizes and migrates the ChromaDB memory persistence layer into the Native SQLite Vector Database.
 *
 * Supports dynamic re-embedding: if `--target-provider` matches the legacy Chroma provider,
 * it performs a 1:1 hardware buffer clone. Otherwise, it iteratively re-embeds the text context
 * into the target vector space to prevent dimension mismatch errors.
 *
 * This system targets the `.neo-ai-data/neo-sqlite/knowledge-graph.sqlite` topology.
 * @async
 * @function sync
 */
async function sync() {
    try {
        const targetProvider = options.targetProvider || aiConfig.neoEmbeddingProvider;
        console.log("=== STARTING MEMORY CORE MIGRATION (CHROMA => NEO SQLITE) ===");
        console.log(`Target Provider: ${targetProvider}`);
        console.log(`Source Provider: ${aiConfig.chromaEmbeddingProvider}`);

        // Wait for managers to boot
        console.log("1. Booting ChromaDB...");
        await ChromaManager.ready();

        console.log("2. Cleaning up Native SQLite for a FULL Re-sync...");
        const fs = (await import('fs')).default;
        const path = (await import('path')).default;
        const sqlDbUrl = new URL('../../.neo-ai-data/neo-sqlite/knowledge-graph.sqlite', import.meta.url);

        if (fs.existsSync(sqlDbUrl)) {
            fs.unlinkSync(sqlDbUrl);
            console.log("   -> Old knowledge-graph.sqlite deleted.");
        }

        console.log("3. Booting SQLite (Neo Native)...");
        // Ensure aiConfig is temporarily overridden if required so validation passes
        aiConfig.neoEmbeddingProvider = targetProvider;
        await SQLiteVectorManager.ready();

        console.log("4. Booting TextEmbeddingService...");
        await TextEmbeddingService.ready();

        const processCollection = async (chromaGetter, sqliteGetter, name) => {
            console.log(`\n--- Migrating Collection: ${name} ---`);
            const chromaColl = await chromaGetter();
            const sqliteColl = await sqliteGetter();

            const count = await chromaColl.count();
            console.log(`[${name}] Source Count: ${count}`);

            if (count === 0) {
                console.log(`[${name}] Skipping, nothing to migrate.`);
                return;
            }

            console.log(`[${name}] Fetching raw documents and metadata from Chroma...`);
            const batchSize = 1000;
            let offset = 0;

            while (offset < count) {
                const isProviderMatch = targetProvider === aiConfig.chromaEmbeddingProvider;

                let batch;
                try {
                    batch = await chromaColl.get({
                        include: isProviderMatch ? ["documents", "metadatas", "embeddings"] : ["documents", "metadatas"],
                        limit: batchSize,
                        offset: offset
                    });
                } catch (batchErr) {
                    console.log(`[${name}] Batch ${offset} fetch failed: ${batchErr.message}. Initiating surgical 1-by-1 rescue mode...`);
                    const idBatch = await chromaColl.get({
                        include: [],
                        limit: batchSize,
                        offset: offset
                    });

                    batch = { ids: [], metadatas: [], documents: [], embeddings: [] };
                    for (const id of idBatch.ids) {
                        try {
                            const single = await chromaColl.get({
                                ids: [id],
                                include: isProviderMatch ? ["documents", "metadatas", "embeddings"] : ["documents", "metadatas"]
                            });
                            if (single.ids && single.ids.length > 0) {
                                batch.ids.push(single.ids[0]);
                                batch.documents.push(single.documents[0]);
                                batch.metadatas.push(single.metadatas[0]);
                                if (isProviderMatch) batch.embeddings.push(single.embeddings[0]);
                            }
                        } catch(singleErr) {
                            console.log(`   -> Skipping corrupted vector ID: ${id}`);
                        }
                    }
                }

                if (!batch.ids || batch.ids.length === 0) break;

                console.log(`[${name}] Processing batch ${offset} => ${offset + batch.ids.length}`);

                let generatedEmbeddings = [];
                const ids = batch.ids;
                const metadatas = batch.metadatas;
                const documents = batch.documents;

                if (isProviderMatch) {
                    console.log(`[${name}] Providers match (${targetProvider}). Hardware 1:1 vector transfer active.`);
                    generatedEmbeddings = batch.embeddings;
                } else {
                    console.log(`[${name}] Translating semantic space from ${aiConfig.chromaEmbeddingProvider} to ${targetProvider}.`);
                    // Re-embed chunks sequentially to prevent OOM
                    for (let i = 0; i < documents.length; i++) {
                        const docText = documents[i];
                        const vec = await TextEmbeddingService.embedText(docText, targetProvider);
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
