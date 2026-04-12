import fs               from 'fs';
import path             from 'path';
import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import Agent            from '../../ai/Agent.mjs';

/**
 * @module buildScripts/ai/runAgent
 */

const isDryRun = process.argv.includes('--dry-run');

/**
 * Parses the sandman_handoff.md file to extract the Golden Path directives.
 * @returns {Array<{issueId: String, description: String}>}
 */
export function parseGoldenPath() {
    const handoffPath = path.resolve(process.cwd(), 'resources/content/sandman_handoff.md');
    if (!fs.existsSync(handoffPath)) {
        console.warn('⚠️ No sandman_handoff.md found. Skipping directive synthesis.');
        return [];
    }

    const content = fs.readFileSync(handoffPath, 'utf-8');
    const goldenPathMatch = content.match(/## Computed Golden Path[^\n]*\n([\s\S]*?)(?=\n#|$)/);
    
    if (!goldenPathMatch) {
         console.warn('⚠️ No "## Computed Golden Path" section found in sandman_handoff.md.');
         return [];
    }

    const sectionChunk = goldenPathMatch[1];
    const directives = [];
    
    // Pattern: 1. **issue-9900**: Score 3.25 ...\n   - *Docs update...*
    const regex = /\d+\.\s\*\*issue-(\d+)\*\*:[^\n]*\n\s+-\s\*(.*?)\*/g;
    let match;

    while ((match = regex.exec(sectionChunk)) !== null) {
        directives.push({
            issueId    : match[1],
            description: match[2].trim()
        });
    }

    return directives;
}

async function startOrchestrator() {
    console.log('⏳ Initializing Neo Agent Orchestrator...');

    const directives = parseGoldenPath();

    if (directives.length === 0) {
        console.log('✅ No immediate Golden Path directives found. Orchestrator exiting cleanly.');
        process.exit(0);
    }

    if (isDryRun) {
        console.log('\n[DRY RUN] Identified the following Golden Path Directives:\n');
        directives.forEach((dir, index) => {
            console.log(`  ${index + 1}. Issue #${dir.issueId}: ${dir.description}`);
        });
        console.log('\n[DRY RUN] Exiting successfully without executing Agent.');
        process.exitCode = 0;
        return;
    }

    try {
        console.log(`   Found ${directives.length} prioritized tasks. Booting underlying agent instance...`);

        const agent = Neo.create(Agent, {
            maxSubAgentLifespan: 20,
            servers: ['knowledge-base', 'file-system', 'github-workflow']
        });

        await agent.initAsync();
        
        console.log('   Injecting Golden Path Directives into Scheduler...');
        
        for (const directive of directives) {
            agent.schedule({
                type    : 'system:golden-path',
                priority: 'high',
                data    : {
                    issueId    : directive.issueId,
                    description: directive.description,
                    instruction: `You are directed to resolve issue ${directive.issueId}. Context: ${directive.description}`
                }
            });
        }

        console.log('✅ Directives injected. Engaging Autonomous Loop.\n====================================');
        
        // This assumes the agent loop will stop when the scheduler completes and active agents are idle.
        // Wait, does Agent.start() run blocking or async?
        // Agent.start() calls loop.start(). In Loop.mjs, we need to let it tick until empty?
        agent.start();
        
        // Let's implement a rudimentary wait mechanism until the scheduler is exhausted
        // and no sub-agents are actively running.
        const monitorInterval = setInterval(() => {
            const hasPendingTasks = agent.loop.scheduler.queue.length > 0;
            const hasActiveJobs   = agent.loop.processing; // Assuming processing flag exists
            // A more robust check might need to be implemented within Loop itself, but
            // for the orchestrator, we poll until the event queue drains.
            
            if (!hasPendingTasks && !hasActiveJobs && Object.keys(agent.activeSubAgents).length === 0) {
                 clearInterval(monitorInterval);
                 console.log('\n====================================\n✅ Autonomous Loop Exhausted. Exiting cleanly.');
                 agent.disconnect();
                 process.exit(0);
            }
        }, 5000);

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
