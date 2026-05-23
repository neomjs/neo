import Neo               from '../../../src/Neo.mjs';
import * as core         from '../../../src/core/_export.mjs';
import InstanceManager   from '../../../src/manager/Instance.mjs';
import AgentOrchestrator from '../../ai/agent/AgentOrchestrator.mjs';

/**
 * @module ai/scripts/runners/runAgent
 */

const isDryRun = process.argv.includes('--dry-run');

async function startOrchestrator() {
    try {
        const orchestrator = Neo.create(AgentOrchestrator);
        await orchestrator.execute({ dryRun: isDryRun });
    } catch (err) {
        console.error('❌ AgentOrchestrator failed:', err);
        process.exit(1);
    }
}

// Only run automatically if this is the main module
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startOrchestrator();
}

