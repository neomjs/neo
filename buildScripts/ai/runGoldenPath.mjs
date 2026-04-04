import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import DreamService     from '../../ai/mcp/server/memory-core/services/DreamService.mjs';
import GraphService     from '../../ai/mcp/server/memory-core/services/GraphService.mjs';
import LifecycleService from '../../ai/mcp/server/memory-core/services/DatabaseLifecycleService.mjs';
import Memory_Config    from '../../ai/mcp/server/memory-core/config.mjs';

async function testGoldenPath() {
    Memory_Config.data.debug = true;
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
