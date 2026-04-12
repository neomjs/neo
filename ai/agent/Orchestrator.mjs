import Base  from '../../src/core/Base.mjs';
import Agent from '../Agent.mjs';
import fs    from 'fs';
import path  from 'path';

/**
 * Parses sandman_handoff.md and injects the resulting directives into a headless agent loop.
 * @class Neo.ai.agent.Orchestrator
 * @extends Neo.core.Base
 */
class Orchestrator extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.agent.Orchestrator'
         * @protected
         */
        className: 'Neo.ai.agent.Orchestrator',
        /**
         * @member {String} handoffPath=path.resolve(process.cwd(), 'resources/content/sandman_handoff.md')
         */
        handoffPath: path.resolve(process.cwd(), 'resources/content/sandman_handoff.md'),
        /**
         * Wait interval before checking if the scheduler is exhausted natively.
         * @member {Number} monitorIntervalMs=5000
         */
        monitorIntervalMs: 5000
    }

    /**
     * Parses the golden path handoff document using semantic regex.
     * @returns {Array<{issueId: String, description: String}>|null}
     */
    parseGoldenPath() {
        if (!fs.existsSync(this.handoffPath)) {
            console.warn(`[Orchestrator] No handoff file found at ${this.handoffPath}`);
            return null;
        }

        const content = fs.readFileSync(this.handoffPath, 'utf-8');
        const goldenPathMatch = content.match(/## Computed Golden Path[^\n]*\n([\s\S]*?)(?=\n#|$)/);

        if (!goldenPathMatch) {
             console.warn('[Orchestrator] No "## Computed Golden Path" section found.');
             return null;
        }

        const sectionChunk = goldenPathMatch[1];
        const directives   = [];
        const regex        = /\d+\.\s\*\*issue-(\d+)\*\*:[^\n]*\n\s+-\s\*(.*?)\*/g;
        let match;

        while ((match = regex.exec(sectionChunk)) !== null) {
            directives.push({
                issueId    : match[1],
                description: match[2].trim()
            });
        }

        return directives;
    }

    /**
     * Executes the orchestration pipeline.
     * @param {Object} [options]
     * @param {Boolean} [options.dryRun=false] Logs directives without agent execution.
     * @returns {Promise<void>}
     */
    async execute({ dryRun = false } = {}) {
        console.log('⏳ Initializing Neo Agent Orchestrator...');

        const directives = this.parseGoldenPath();

        if (!directives || directives.length === 0) {
            console.log('✅ No immediate Golden Path directives found. Orchestrator exiting cleanly.');
            return;
        }

        if (dryRun) {
            console.log('\n[DRY RUN] Identified the following Golden Path Directives:\n');
            directives.forEach((dir, index) => {
                console.log(`  ${index + 1}. Issue #${dir.issueId}: ${dir.description}`);
            });
            console.log('\n[DRY RUN] Exiting successfully without executing Agent.');
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
            agent.start();
            
            // Monitor loop exhaustion safely
            const monitorInterval = setInterval(() => {
                const hasPendingTasks = agent.loop.scheduler.queue.length > 0;
                const hasActiveJobs   = agent.loop.processing; 
                
                if (!hasPendingTasks && !hasActiveJobs && Object.keys(agent.activeSubAgents).length === 0) {
                     clearInterval(monitorInterval);
                     console.log('\n====================================\n✅ Autonomous Loop Exhausted. Exiting cleanly.');
                     agent.disconnect();
                     process.exit(0); // Optional depending on daemon runner structure
                }
            }, this.monitorIntervalMs);

        } catch (err) {
            console.error('❌ Agent Orchestrator failed:', err);
            throw err;
        }
    }
}

export default Neo.setupClass(Orchestrator);
