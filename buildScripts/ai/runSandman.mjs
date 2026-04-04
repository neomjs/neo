import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';
import Memory_Config from '../../ai/mcp/server/memory-core/config.mjs';
import Memory_Service from '../../ai/mcp/server/memory-core/services/MemoryService.mjs';
import DreamService from '../../ai/mcp/server/memory-core/services/DreamService.mjs';
import ChromaManager from '../../ai/mcp/server/memory-core/services/ChromaManager.mjs';
import LifecycleService from '../../ai/mcp/server/memory-core/services/DatabaseLifecycleService.mjs';
import GraphService from '../../ai/mcp/server/memory-core/services/GraphService.mjs';

import { spawn } from 'child_process';
import http from 'http';

function checkOllama() {
    return new Promise(resolve => {
        const req = http.get('http://127.0.0.1:11434', () => resolve(true));
        req.on('error', () => resolve(false));
    });
}

async function runSandman() {
    // Enable debug logging to see progress
    Memory_Config.data.debug = true;

    console.log('⏳ Initializing Sandman REM Extraction Pipeline...');
    
    const isOllamaRunning = await checkOllama();
    if (!isOllamaRunning) {
        console.log('   Ollama is not running. Starting Ollama serve...');
        const ollamaProcess = spawn('ollama', ['serve'], {
            detached: true,
            stdio: 'ignore'
        });
        ollamaProcess.unref();

        // Give it 3 seconds to boot
        await new Promise(r => setTimeout(r, 3000));
        
        const checkAgain = await checkOllama();
        if (!checkAgain) {
            console.error('❌ Failed to start Ollama automatically. Please start it manually.');
            process.exit(1);
        }
        console.log('   ✅ Ollama serve started automatically.');
    } else {
        console.log('   ✅ Ollama is running.');
    }

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
