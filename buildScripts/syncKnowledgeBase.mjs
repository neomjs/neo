import Neo                  from '../src/Neo.mjs';
import * as core            from '../src/core/_export.mjs';
import KB_Config            from '../ai/mcp/server/knowledge-base/config.mjs';
import KB_DatabaseService   from '../ai/mcp/server/knowledge-base/services/DatabaseService.mjs';
import KB_ChromaManager     from '../ai/mcp/server/knowledge-base/services/ChromaManager.mjs';
import KB_LifecycleService  from '../ai/mcp/server/knowledge-base/services/DatabaseLifecycleService.mjs';

async function syncKnowledgeBase() {
    // Enable debug logging to see progress
    KB_Config.data.debug = true;

    console.log('⏳ Initializing Knowledge Base Services...');
    
    try {
        console.log('   Waiting for Lifecycle Service...');
        await KB_LifecycleService.ready();
        console.log('   Lifecycle Service Ready. Database should be running.');

        console.log('   Waiting for Chroma Manager...');
        await KB_ChromaManager.ready();
        console.log('   Chroma Manager Ready.');
        
        console.log('   Waiting for Database Service...');
        await KB_DatabaseService.ready();
        console.log('   Database Service Ready.');
        
        console.log('✅ Services Ready. Starting Synchronization...');
        
        // Execute the full sync (create + embed)
        const result = await KB_DatabaseService.syncDatabase();
        
        console.log('✅ Synchronization Complete:', result);
        process.exit(0);
    } catch (e) {
        console.error('❌ Synchronization Failed:', e);
        process.exit(1);
    }
}

syncKnowledgeBase();