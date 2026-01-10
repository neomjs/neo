import {ChromaClient} from 'chromadb';
import fs from 'fs-extra';
import path from 'path';
import {promisify} from 'util';

/**
 * @summary A maintenance script to defragment the ChromaDB knowledge base by performing a full "Nuke and Pave".
 *
 * This script addresses the issue of HNSW index fragmentation and file bloat in ChromaDB.
 * Deleted records in ChromaDB often leave behind orphaned UUID directories and fragmented index files,
 * causing the knowledge base size to grow significantly (e.g., from 100MB to 500MB) even when the actual data size is small.
 *
 * The "Nuke and Pave" strategy implemented here involves:
 * 1.  Fetching all existing data (IDs, embeddings, metadata, documents) into memory.
 * 2.  Deleting the collection via the API to release logical references.
 * 3.  Attempting a database reset or collection recreation to ensure a clean slate.
 * 4.  Restoring the buffered data into the new, clean collection.
 * 5.  Physically scanning the filesystem to identify and delete orphaned UUID directories that do not match the active collection's ID.
 *
 * This process ensures that the knowledge base remains compact and optimized for distribution, especially
 * before a release.
 *
 * @module buildScripts/defragKnowledgeBase
 * @see Neo.ai.mcp.server.knowledge-base.services.KnowledgeBaseService
 */

// Hardcoded configs to match project
const DB_PATH = path.resolve(process.cwd(), 'chroma-neo-knowledge-base');
const COLLECTION_NAME = 'neo-knowledge-base';

const sleep = promisify(setTimeout);

/**
 * Executes the knowledge base defragmentation process.
 *
 * This function orchestrates the entire ETL (Extract, Transform, Load) and cleanup pipeline:
 * 1.  **Extract**: Connects to the local ChromaDB instance and buffers all 2000+ records into memory.
 * 2.  **Transform**: Sanitizes document fields to ensure they are valid strings (handling nulls/objects).
 * 3.  **Nuke**: Deletes the existing collection to free up the namespace.
 * 4.  **Load**: Recreates the collection with consistent settings (cosine distance) and batches the inserts.
 * 5.  **Cleanup**: Performs a filesystem audit on `chroma-neo-knowledge-base`, deleting any directory that looks like a UUID but is not the active collection.
 *
 * @async
 * @returns {Promise<void>}
 * @keywords knowledge base, defragmentation, optimization, vector database, chromadb, bloat, maintenance
 */
async function defragKnowledgeBase() {
    console.log('🧹 Starting Knowledge Base Defragmentation...');
    
    // 1. Connect to Source (Bloated)
    console.log(`\n1️⃣  Connecting to existing database at ${DB_PATH}...`);
    const client = new ChromaClient({
        host: 'localhost',
        port: 8000
    });

    // List available collections for debugging purposes
    try {
        const collections = await client.listCollections();
        console.log('   📂 Available Collections:', collections.map(c => c.name));
    } catch (e) {
        console.log('   ⚠️  Could not list collections:', e.message);
    }

    // Use dummy embedding function to avoid validation errors during raw data transfer
    const dummyEf = {
        generate: () => null,
        name: 'dummy',
        getConfig: () => ({}),
        constructor: { buildFromConfig: () => ({ generate: () => null }) }
    };

    let sourceCollection;
    try {
        sourceCollection = await client.getCollection({
            name: COLLECTION_NAME,
            embeddingFunction: dummyEf
        });
        console.log(`   🆔 Collection ID: ${sourceCollection.id}`);
        const count = await sourceCollection.count();
        console.log(`   ✅ Connected. Found ${count} items.`);
        
        if (count === 0) {
            console.log('   ⚠️  Database is empty. Nothing to defrag.');
            process.exit(0);
        }
    } catch (e) {
        console.error('   ❌ Could not connect to source database:', e.message);
        process.exit(1);
    }

    // 2. Fetch All Data (In-Memory Buffer)
    // Note: The current dataset size (~7MB) easily fits in memory.
    // If the dataset grows significantly (> 1GB), this buffer strategy should be replaced with a file-based stream.
    console.log(`\n2️⃣  Fetching all records into memory...`);
    const limit = 2000;
    let offset = 0;
    let allData = { ids: [], embeddings: [], metadatas: [], documents: [] };
    let hasMore = true;

    while (hasMore) {
        process.stdout.write(`   Fetching batch starting at ${offset}... `);
        const batch = await sourceCollection.get({
            limit,
            offset,
            include: ['embeddings', 'metadatas', 'documents']
        });

        if (batch.ids.length === 0) {
            hasMore = false;
            console.log('Done.');
        } else {
            allData.ids.push(...batch.ids);
            allData.embeddings.push(...batch.embeddings);
            allData.metadatas.push(...batch.metadatas);
            allData.documents.push(...batch.documents);
            
            console.log(`Got ${batch.ids.length} items.`);
            offset += limit;
            
            if (batch.ids.length < limit) hasMore = false;
        }
    }
    console.log(`   ✅ Buffered ${allData.ids.length} records.`);

    // 3. Nuke the DB
    console.log(`\n3️⃣  Resetting Database Storage...`);
    
    // Limitation: We cannot delete the physical database folder while the server is running due to file locks.
    // However, deleting the collection via the API releases the logical references, allowing the subsequent
    // filesystem scan to identify the orphaned artifacts.
    
    console.log('   Attempting to delete collection via API...');
    try {
        await client.deleteCollection({ name: COLLECTION_NAME });
        console.log('   ✅ Collection deleted.');
    } catch (e) {
        console.error('   ❌ Failed to delete collection:', e.message);
        console.log('   Proceeding to physical deletion (requires manual server restart if running)...');
    }

    // Attempt an API-level reset if enabled on the server.
    // This is often disabled in production environments (ALLOW_RESET=FALSE).
    try {
        const resetResult = await client.reset(); 
        if (resetResult) console.log('   ✅ Database reset via API.');
    } catch (e) {
         console.log('   ℹ️  API Reset failed (likely disabled). Proceeding with collection recreation.');
    }

    // Re-creating collection to establish a clean index state
    console.log(`\n4️⃣  Re-creating fresh collection...`);
    const newCollection = await client.createCollection({
        name: COLLECTION_NAME,
        embeddingFunction: dummyEf,
        metadata: { "hnsw:space": "cosine" } // Ensure consistent distance metric
    });

    // 4. Insert Data
    console.log(`\n5️⃣  Restoring data...`);
    const batchSize = 1000; // Chroma default
    const total = allData.ids.length;
    
    for (let i = 0; i < total; i += batchSize) {
        const end = Math.min(i + batchSize, total);
        process.stdout.write(`   Upserting ${i} to ${end}... `);
        
        /**
         * Document Sanitization:
         * ChromaDB strictly requires the 'documents' field to be an array of strings.
         * We must handle potential nulls, undefined values, or objects that may have existed in the source data.
         * - Null/Undefined -> Converted to empty string.
         * - Objects -> Stringified.
         */
        const batchDocs = allData.documents.slice(i, end).map(d => {
            if (d === null || d === undefined) return '';
            if (typeof d === 'object') return JSON.stringify(d);
            return String(d);
        });

        await newCollection.add({
            ids: allData.ids.slice(i, end),
            embeddings: allData.embeddings.slice(i, end),
            metadatas: allData.metadatas.slice(i, end),
            documents: batchDocs
        });
        console.log('✅');
    }

    // 5. Cleanup Orphaned Folders
    console.log(`\n6️⃣  Cleaning up orphaned index folders...`);
    const activeId = newCollection.id;
    console.log(`   Active Collection ID: ${activeId}`);
    
    try {
        const entries = await fs.readdir(DB_PATH, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                // Heuristic: Check if directory name resembles a UUID (length 36, contains hyphens)
                if (entry.name.length === 36 && entry.name.includes('-')) {
                     if (entry.name !== activeId) {
                         const orphanPath = path.join(DB_PATH, entry.name);
                         console.log(`   🗑️  Deleting orphan: ${entry.name}`);
                         await fs.remove(orphanPath);
                     } else {
                         console.log(`   ✨ Keeping active: ${entry.name}`);
                     }
                }
            }
        }
    } catch (e) {
        console.error('   ⚠️  Cleanup failed:', e.message);
    }

    console.log(`\n🎉 Defragmentation Complete!`);
    
    // Log Final Size
    try {
        const getDirSize = async (dir) => {
            const files = await fs.readdir(dir, { withFileTypes: true });
            let size = 0;
            for (const file of files) {
                const filePath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    size += await getDirSize(filePath);
                } else {
                    const stats = await fs.stat(filePath);
                    size += stats.size;
                }
            }
            return size;
        };

        const finalSize = await getDirSize(DB_PATH);
        console.log(`   📉 Final Database Size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    } catch (e) {
        console.log(`   ℹ️  Could not calculate final size: ${e.message}`);
    }
}

defragKnowledgeBase();
