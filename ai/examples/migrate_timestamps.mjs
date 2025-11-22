import {
    Memory_ChromaManager,
    Memory_SessionService
} from '../services.mjs';

async function migrateTimestamps() {
    console.log('🚀 Starting Timestamp Migration (String -> Number)...');

    // 1. Initialize
    console.log('⏳ Waiting for Memory Core readiness...');
    try {
        await Memory_ChromaManager.ready();
        // SessionService initialization also ensures collections are ready
        await Memory_SessionService.ready();
        console.log('✅ Memory Core Services Ready.');
    } catch (e) {
        console.error('❌ Failed to initialize services:', e);
        process.exit(1);
    }

    const memCol = Memory_SessionService.memoryCollection;
    const sumCol = Memory_SessionService.sessionsCollection;

    if (!memCol || !sumCol) {
        console.error('❌ Collections not initialized.');
        process.exit(1);
    }

    // Helper function to migrate a collection
    async function migrateCollection(collection, name) {
        console.log(`
📂 Processing Collection: ${name}`);
        
        let offset = 0;
        const limit = 2000;
        let hasMore = true;
        let totalProcessed = 0;
        let totalUpdated = 0;

        while (hasMore) {
            // Fetch batch
            const batch = await collection.get({
                include: ['metadatas', 'embeddings', 'documents'], // Need everything to upsert/update safely
                limit,
                offset
            });

            if (batch.ids.length === 0) {
                hasMore = false;
                break;
            }

            const updates = {
                ids: [],
                embeddings: [],
                metadatas: [],
                documents: []
            };

            // Process batch
            for (let i = 0; i < batch.ids.length; i++) {
                const id = batch.ids[i];
                const metadata = batch.metadatas[i];
                const currentTimestamp = metadata.timestamp;

                // Check if migration is needed (is it a string?)
                if (typeof currentTimestamp === 'string') {
                    const numericTimestamp = Date.parse(currentTimestamp);
                    
                    if (!isNaN(numericTimestamp)) {
                        // Create updated metadata
                        const newMetadata = { ...metadata, timestamp: numericTimestamp };
                        
                        updates.ids.push(id);
                        // If embeddings/documents are missing in fetch, we can't strictly "update" just metadata 
                        // easily without potential issues depending on Chroma version, 
                        // but 'update' method usually takes ids and metadatas.
                        // Let's try using collection.update which is designed for this.
                        updates.metadatas.push(newMetadata);
                    } else {
                        console.warn(`   ⚠️  Skipping ID ${id}: Invalid date string "${currentTimestamp}"`);
                    }
                }
            }

            // Perform updates for this batch
            if (updates.ids.length > 0) {
                // Use collection.update to only modify metadata
                // Note: ChromaDB JS client 'update' signature: { ids, embeddings?, metadatas?, documents? }
                await collection.update({
                    ids: updates.ids,
                    metadatas: updates.metadatas
                });
                
                totalUpdated += updates.ids.length;
                process.stdout.write(`\r   Migrated ${totalUpdated} records...`);
            }

            totalProcessed += batch.ids.length;
            offset += limit;
            
            if (batch.ids.length < limit) {
                hasMore = false;
            }
        }
        console.log(`\n   ✅ ${name} complete. Scanned: ${totalProcessed}, Updated: ${totalUpdated}`);
    }

    // Run migration for both collections
    await migrateCollection(memCol, 'Memories');
    await migrateCollection(sumCol, 'Summaries');

    console.log('\n✨ Migration finished successfully.');
    process.exit(0);
}

migrateTimestamps();
