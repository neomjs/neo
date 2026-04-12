import Neo          from '../../src/Neo.mjs';
import * as core    from '../../src/core/_export.mjs';
import Orchestrator from '../../ai/agent/Orchestrator.mjs';

/**
 * @module buildScripts/ai/runAgent
 */

const isDryRun = process.argv.includes('--dry-run');

async function startOrchestrator() {
    try {
        const orchestrator = Neo.create(Orchestrator);
        await orchestrator.execute({ dryRun: isDryRun });
    } catch (err) {
        console.error('❌ Agent Orchestrator failed:', err);
        process.exit(1);
    }
}

// Only run automatically if this is the main module
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startOrchestrator();
}

