import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import InstanceManager  from '../../src/manager/Instance.mjs';
import DreamService     from '../../ai/daemons/DreamService.mjs';
import GraphService     from '../../ai/mcp/server/memory-core/services/GraphService.mjs';
import LifecycleService from '../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs';
import Memory_Config    from '../../ai/mcp/server/memory-core/config.mjs';

/**
 * @module buildScripts/ai/runGoldenPath
 */

async function testGoldenPath() {
    Memory_Config.data.debug = true;
    
    // STRICTLY bypass daemon startup auto-queue.
    Memory_Config.data.autoDream = false;
    Memory_Config.data.autoSummarize = false;
    Memory_Config.data.autoGoldenPath = false;

    console.log('⏳ Starting Lifecycle Service...');
    await LifecycleService.ready();

    console.log('⏳ Initializing Mathematical Priority Graph Traversal...');
    await DreamService.ready();

    // Call the newly implemented mathematical traversal
    await DreamService.synthesizeGoldenPath();

    console.log('✅ Golden Path synthesis complete. Checking Context Frontier:');
    const frontier = GraphService.getContextFrontier({depth: 1});
    console.log(JSON.stringify(frontier, null, 2));

    process.exit(0);
}

testGoldenPath();
