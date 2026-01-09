import {ChromaClient} from 'chromadb';
import fs from 'fs-extra';
import path from 'path';
import {promisify} from 'util';

// Hardcoded configs to match project
const DB_PATH = path.resolve(process.cwd(), 'chroma-neo-knowledge-base');
const COLLECTION_NAME = 'neo-knowledge-base';
const EMBEDDING_MODEL = 'gemini-embedding-001'; // Just for metadata if needed

const sleep = promisify(setTimeout);

async function defragKnowledgeBase() {
    console.log('🧹 Starting Knowledge Base Defragmentation...');
    
    // 1. Connect to Source (Bloated)
    console.log(`\n1️⃣  Connecting to existing database at ${DB_PATH}...`);
    const client = new ChromaClient({
        host: 'localhost',
        port: 8000
    });

    // LIST COLLECTIONS DEBUG
    try {
        const collections = await client.listCollections();
        console.log('   📂 Available Collections:', collections.map(c => c.name));
    } catch (e) {
        console.log('   ⚠️  Could not list collections:', e.message);
    }

    // Use dummy embedding function to avoid validation errors
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
    // Warning: With 400MB bloat but 7MB data, this fits in RAM.
    // If data grows > 1GB, we'd need a temp file buffer.
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
    
    // We can't delete the folder while the client is connected? 
    // Actually, in JS the ChromaClient communicates via HTTP to the Python/Rust core if running separately,
    // OR via ffi if embedded. The node module uses a server process or direct ffi?
    // The default `chroma run` spawns a server. If we are running this script standalone...
    // Wait, the npm `chromadb` client expects a server running.
    // BUT the project uses `chroma run --path ...`.
    
    // CRITICAL: We need to shut down the server to release file locks before deleting.
    // If we assume the server IS running (we need it to fetch), we can't delete the files yet.
    
    // Strategy:
    // 1. Fetch data (Done)
    // 2. Client.reset()? Chroma API has a reset() but it's often disabled.
    // 3. Delete Collection? 
    
    console.log('   Attempting to delete collection via API...');
    try {
        await client.deleteCollection({ name: COLLECTION_NAME });
        console.log('   ✅ Collection deleted.');
    } catch (e) {
        console.error('   ❌ Failed to delete collection:', e.message);
        console.log('   Proceeding to physical deletion (requires manual server restart if running)...');
    }

    // Since we can't easily restart the server from inside the script if it was external,
    // AND `client.reset()` requires `ALLOW_RESET=TRUE` env var...
    
    // Let's try `client.reset()` first.
    try {
        const resetResult = await client.reset(); 
        if (resetResult) console.log('   ✅ Database reset via API.');
    } catch (e) {
         console.log('   ℹ️  API Reset failed (likely disabled). using collection recreation.');
    }

    // Re-creating collection
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
        
        // Fix: Documents cannot be null/objects. If missing, pass empty strings or null (if allowed).
        // Chroma requires documents to be strings if provided.
        // Since we are restoring from "allData.documents", let's inspect what we got.
        // It seems some are objects or null.
        // Safe bet: Ensure they are strings or undefined.
        
        const batchDocs = allData.documents.slice(i, end).map(d => {
            if (d === null || d === undefined) return ''; // Fix: Chroma rejects null, use empty string
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
                // Check if this directory is a UUID (approximate check)
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
