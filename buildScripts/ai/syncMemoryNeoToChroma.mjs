import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';

import ChromaManager   from '../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';
import Database        from 'better-sqlite3';
import * as sqliteVec  from 'sqlite-vec';

/**
 * @module buildScripts/ai/syncMemoryNeoToChroma
 */

/**
 * @summary Synchronizes and migrates Native SQLite Vector Database into ChromaDB memory persistence layer.
 *
 * This performs a 1:1 hardware buffer clone, bypassing TextEmbeddingService.
 * This is used to rescue local SQLite episodic memories after they were fully decoupled from Vector ops.
 *
 * @async
 * @function sync
 */
async function sync() {
    try {
        console.log("=== STARTING MEMORY CORE MIGRATION (NEO SQLITE => CHROMA) ===");

        // Wait for ChromaDB to boot
        console.log("1. Booting ChromaDB...");
        await ChromaManager.ready();

        console.log("2. Connecting to Native SQLite...");
        const sqlDbUrl = new URL('../../.neo-ai-data/neo-sqlite/memory-core.sqlite', import.meta.url);
        const fs = (await import('fs')).default;
        
        if (!fs.existsSync(sqlDbUrl)) {
             throw new Error("No SQLite knowledge-graph found at: " + sqlDbUrl);
        }

        const db = new Database(sqlDbUrl.pathname);
        sqliteVec.load(db);
        console.log("   -> sqlite-vec extension successfully mounted in standalone mode.");

        const processCollection = async (chromaGetter, tableName, name) => {
            console.log(`\n--- Migrating Table: ${tableName} ---`);
            const chromaColl = await chromaGetter();

            // Count rows in the source Table
            let countRow;
            try {
                countRow = db.prepare(`SELECT count(*) as c FROM ${tableName}_data`).get();
            } catch(e) {
                if (e.message.includes('no such table')) {
                    console.log(`[${name}] Source table ${tableName}_data does not exist. Skipping.`);
                    return;
                }
                throw e;
            }

            const count = countRow.c;
            console.log(`[${name}] Source Count: ${count}`);

            if (count === 0) {
                console.log(`[${name}] Skipping, nothing to migrate.`);
                return;
            }

            console.log(`[${name}] Fetching raw documents, metadata, and embeddings from SQLite natively...`);
            
            const batchSize = 1000;
            let offset = 0;

            const pullQuery = db.prepare(`
                SELECT d.chroma_id as id, d.metadata, d.document, v.embedding 
                FROM ${tableName}_data d 
                LEFT JOIN ${tableName}_vec v ON d.rowid = v.rowid
                ORDER BY d.rowid ASC
                LIMIT ? OFFSET ?
            `);

            while (offset < count) {
                console.log(`[${name}] Processing batch ${offset} => ${offset + batchSize}`);
                
                const rows = pullQuery.all(batchSize, offset);
                
                if (rows.length === 0) break;

                const ids = [];
                const documents = [];
                const metadatas = [];
                const embeddings = [];

                for (const row of rows) {
                     ids.push(row.id);
                     documents.push(row.document);
                     metadatas.push(row.metadata ? JSON.parse(row.metadata) : {});
                     if (row.embedding) {
                          const f32 = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
                          embeddings.push(Array.from(f32));
                     } else {
                          embeddings.push(null);
                     }
                }

                console.log(`[${name}] Upserting batch of size ${ids.length} to ChromaDB...`);
                // Chroma throws if embedding is null. We need to filter those out or skip them.
                const validIds = [];
                const validDocs = [];
                const validMetas = [];
                const validEmbeds = [];
                
                for(let i=0; i < ids.length; i++) {
                     if (embeddings[i] !== null && embeddings[i].length > 0) {
                         validIds.push(ids[i]);
                         validDocs.push(documents[i]);
                         validMetas.push(metadatas[i]);
                         validEmbeds.push(embeddings[i]);
                     }
                }

                if (validIds.length > 0) {
                     await chromaColl.upsert({
                         ids: validIds,
                         embeddings: validEmbeds,
                         metadatas: validMetas,
                         documents: validDocs
                     });
                     console.log(`[${name}] Upserted ${validIds.length} valid vectors.`);
                } else {
                     console.log(`[${name}] Upsert skipped, no valid embeddings in this batch.`);
                }
                
                offset += batchSize;
            }
            console.log(`[${name}] ✅ Completed Migration.`);
        }

        await processCollection(
            () => ChromaManager.getSummaryCollection(),
            'neo_agent_sessions_summary',
            'Summaries'
        );

        await processCollection(
            () => ChromaManager.getMemoryCollection(),
            'neo_agent_memory',
            'Memories'
        );

        console.log("\n=== MIGRATION SUCCESSFULLY TRANSACTED! ===");
        db.close();
        process.exit(0);

    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}

sync();
