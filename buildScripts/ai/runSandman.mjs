import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import InstanceManager  from '../../src/manager/Instance.mjs';
import Memory_Config    from '../../ai/mcp/server/memory-core/config.mjs';
import Memory_Service   from '../../ai/mcp/server/memory-core/services/MemoryService.mjs';
import DreamService     from '../../ai/mcp/server/memory-core/services/DreamService.mjs';
import LifecycleService from '../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs';
import GraphService     from '../../ai/mcp/server/memory-core/services/GraphService.mjs';
import {spawn}          from 'child_process';
import http             from 'http';

function checkProvider() {
    const host = Memory_Config.data.openAiCompatible?.host || 'http://127.0.0.1:8000';
    return new Promise(resolve => {
        const req = http.get(`${host}/v1/models`, () => resolve(true));
        req.on('error', () => resolve(false));
    });
}

async function runSandman() {
    // Enable debug logging to see progress
    Memory_Config.data.debug = true;

    // STRICTLY bypass daemon startup auto-queue.
    // If autoDream fires synchronously inside init(), the await processUndigestedSessions() skips.
    Memory_Config.data.autoDream = false;
    Memory_Config.data.autoSummarize = false;

    console.log('⏳ Initializing Sandman REM Extraction Pipeline...');

    const isProviderRunning = await checkProvider();
    if (!isProviderRunning) {
        console.error(`❌ openAiCompatible server is not running on ${Memory_Config.data.openAiCompatible?.host || 'http://127.0.0.1:8000'}. Please start your MLX provider manually.`);
        process.exit(1);
    } else {
        console.log('   ✅ openAiCompatible server is running.');
    }

    try {
        console.log('   Waiting for Lifecycle Service...');
        await LifecycleService.ready();
        console.log('   Lifecycle Service Ready. Database should be running.');

        console.log('   Waiting for DreamService Initialization...');
        // We might need to ensure DreamService is fully inited, though it initAsync runs automatically upon Neo.setupClass
        await DreamService.ready();
        console.log('   DreamService Ready.');

        console.log('✅ Services Ready. Entering REM Sleep...');

        // Execute the REM pipeline (extract undigested graph entities + Golden Path synthesis)
        await DreamService.processUndigestedSessions();

        console.log('✅ Sandman cycle complete.');
        process.exitCode = 0;
    } catch (e) {
        console.error('❌ REM cycle failed:', e);
        process.exitCode = 1;
    } finally {
        console.log('🧹 Triggering global topology decay & pruning mechanism...');
        try {
            // Need to await? decayGlobalTopology is synchronous.
            GraphService.decayGlobalTopology();
        } catch (e) {
            console.error('❌ Failed to decay topology:', e);
        }
        process.exit(process.exitCode);
    }
}

runSandman();
