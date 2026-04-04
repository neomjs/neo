import Neo                  from '../../src/Neo.mjs';
import * as core            from '../../src/core/_export.mjs';
import Memory_Config        from '../../ai/mcp/server/memory-core/config.mjs';
import Memory_Service       from '../../ai/mcp/server/memory-core/services/MemoryService.mjs';
import DreamService         from '../../ai/mcp/server/memory-core/services/DreamService.mjs';
import ChromaManager        from '../../ai/mcp/server/memory-core/services/ChromaManager.mjs';
import LifecycleService     from '../../ai/mcp/server/memory-core/services/DatabaseLifecycleService.mjs';

async function runSandman() {
    // Enable debug logging to see progress
    Memory_Config.data.debug = true;

    console.log('⏳ Initializing Sandman REM Extraction Pipeline...');
    
    try {
        console.log('   Waiting for Lifecycle Service...');
        await LifecycleService.ready();
        console.log('   Lifecycle Service Ready. Database should be running.');

        console.log('   Waiting for Chroma Manager...');
        await ChromaManager.ready();
        console.log('   Chroma Manager Ready.');
        
        console.log('   Waiting for DreamService Initialization...');
        // We might need to ensure DreamService is fully inited, though it initAsync runs automatically upon Neo.setupClass
        await DreamService.ready();
        console.log('   DreamService Ready.');
        
        console.log('✅ Services Ready. Entering REM Sleep...');
        
        // Execute the REM pipeline (extract undigested graph entities + Golden Path synthesis)
        await DreamService.processUndigestedSessions();
        
        console.log('✅ Sandman cycle complete.');
        process.exit(0);
    } catch (e) {
        console.error('❌ REM cycle failed:', e);
        process.exit(1);
    }
}

runSandman();
