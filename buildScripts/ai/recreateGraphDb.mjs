import fs              from 'fs';
import path            from 'path';
import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';
import aiConfig        from '../../ai/mcp/server/memory-core/config.mjs';
import GraphService    from '../../ai/mcp/server/memory-core/services/GraphService.mjs';
import StorageRouter   from '../../ai/mcp/server/memory-core/managers/StorageRouter.mjs';

async function recreateGraphDb() {
    console.log('⏳ Initializing Graph DB Recreation Script...');
    
    const dbPath = path.resolve(aiConfig.engines.neo.dataDir, aiConfig.engines.neo.filename);
    
    // 1. Delete Native Edge Graph structural elements ONLY (do not destroy standard SQLite Vector memory schemas)
    console.log(`   Deleting Native Edge Graph Database schema nodes...`);
    // Connect explicitly via GraphService bounds
    await GraphService.ready();
    if (GraphService.db && GraphService.db.storage) {
        GraphService.db.storage.clear();
        console.log(`   ✅ SQLite Graph Nodes and Edges wiped successfully.`);
    } else {
        console.log(`   ℹ️ GraphService not initialized properly, unable to clear native tables.`);
    }

    // 2. Clear flags in Vector DB
    console.log('   Waiting for StorageRouter...');
    await StorageRouter.ready();
    const summaryCollection = await StorageRouter.getSummaryCollection();
    
    console.log('   Fetching all session summaries from Vector Storage...');
    const allSummaries = await summaryCollection.get({ limit: 100000 });
    
    if (allSummaries && allSummaries.ids && allSummaries.ids.length > 0) {
        console.log(`   Found ${allSummaries.ids.length} summaries. Reseting graphDigested flag...`);
        
        const updatedMetadatas = allSummaries.metadatas.map(meta => ({
            ...meta,
            graphDigested: false
        }));

        await summaryCollection.update({
            ids: allSummaries.ids,
            metadatas: updatedMetadatas
        });
        
        console.log(`   ✅ Successfully flagged ${allSummaries.ids.length} sessions for REM processing.`);
    } else {
         console.log(`   ℹ️ No session summaries found in Database.`);
    }

    console.log('✅ Graph DB Recreation complete. You may now start runSandman.mjs.');
    process.exit(0);
}

recreateGraphDb().catch(e => {
    console.error('❌ Recreation cycle failed:', e);
    process.exit(1);
});
