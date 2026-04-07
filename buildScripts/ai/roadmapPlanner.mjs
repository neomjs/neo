import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Boot internal services
import Neo                  from '../../src/Neo.mjs';
import * as core            from '../../src/core/_export.mjs';
import MemoryService from '../../ai/mcp/server/memory-core/services/MemoryService.mjs';
import DreamService from '../../ai/mcp/server/memory-core/services/DreamService.mjs';
import GraphService from '../../ai/mcp/server/memory-core/services/GraphService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROADMAP_PATH = path.resolve(__dirname, '../../ROADMAP.md');

const ROLLING_WINDOW_DAYS = 14;

async function buildVelocity() {
    console.log('Booting Graph Engine...');
    
    // Ingests issues from files and populates Memory/Graph SQLite DBs.
    // Also returns open issues array.
    const openIssuesData = await DreamService.ingestIssueStates();
    
    console.log('Calculating velocity from Native Graph topology...');
    const now = new Date();
    const windowStart = new Date(now.getTime() - (ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000));
    
    // Scan nodes of type 'ISSUE'
    const nodes = GraphService.db.nodes.items.filter(n => n.label === 'ISSUE');
    
    let closed14d = 0;
    let open = 0;
    
    nodes.forEach(node => {
        if (node.properties.state === 'OPEN') {
            open++;
        } else if (node.properties.state === 'CLOSED') {
            if (node.properties.updatedAt) {
                const ts = new Date(node.properties.updatedAt);
                if (ts >= windowStart && ts <= now) {
                    closed14d++;
                }
            }
        }
    });
    
    return { closed14d, open };
}

async function plannerAgent() {
    console.log('--- Neo.mjs Hybrid Roadmap Planner Agent ---');
    
    const velocity = await buildVelocity();
    console.log('Velocity Stats:');
    console.log('  - Closed last ' + ROLLING_WINDOW_DAYS + ' days: ' + velocity.closed14d);
    console.log('  - Active open tickets: ' + velocity.open);

    if (!fs.existsSync(ROADMAP_PATH)) {
        console.error('ROADMAP.md not found. Exiting.');
        process.exit(1);
    }

    const roadmapContent = fs.readFileSync(ROADMAP_PATH, 'utf8');

    const prompt = `You are the autonomous CTO of the Neo.mjs project.
Your task is to update the 'ROADMAP.md' file based on our team's current velocity.

Here is the current velocity over the last ` + ROLLING_WINDOW_DAYS + ` days:
- Tickets completed: ` + velocity.closed14d + `
- Open active tickets: ` + velocity.open + `

Based on this velocity, if completion is slow, you should consider de-scoping items or explicitly adjusting the wording of the remaining tasks to be more realistic. If completion is high, you can prioritize marking more items [x] completed, delegating to AI, or promoting "Future" targets to "Active".

Here is the current ROADMAP.md:
=========================
\n` + roadmapContent + `\n
=========================

Output the final, fully written markdown content for the updated ROADMAP.md file. Only output the raw markdown file. Do not include markdown \`\`\` wrappers.`;

    console.log('Querying openAiCompatible to synthesize new ROADMAP.md...');

    // Extract dynamic host/model instead of hardcoded 11434/gemma
    const host = Memory_Config?.data?.openAiCompatible?.host || 'http://127.0.0.1:8000';
    const model = Memory_Config?.data?.openAiCompatible?.model || 'gemma4';

    try {
        const payload = JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false
        });

        const responseStr = execSync(`curl -s -m 1800 -X POST ${host}/v1/chat/completions -H "Content-Type: application/json" -d @-`, {
            input: payload,
            maxBuffer: 50 * 1024 * 1024
        }).toString();

        const data = JSON.parse(responseStr);
        const text = data.choices?.[0]?.message?.content;
        
        if (text) {
            let newRoadmap = text.trim();
            // Prune wrappers
            if (newRoadmap.startsWith('\`\`\`markdown')) newRoadmap = newRoadmap.substring(11).trim();
            if (newRoadmap.startsWith('\`\`\`')) newRoadmap = newRoadmap.substring(3).trim();
            if (newRoadmap.endsWith('\`\`\`')) newRoadmap = newRoadmap.substring(0, newRoadmap.length - 3).trim();

            console.log('Saving updated ROADMAP.md locally...');
            fs.writeFileSync(ROADMAP_PATH, newRoadmap, 'utf8');

            console.log('Creating pull request... (DRY RUN disabled, pushing to separate branch)');
            const branchName = 'ai/roadmap-update-' + Date.now();
            execSync('git checkout -b ' + branchName);
            execSync('git add ROADMAP.md');
            execSync('git commit -m "chore: Autonomous Roadmap adjustment based on velocity"');
            
            // Push it to remote
            execSync('git push -u origin ' + branchName);
            
            // GH CLI to make PR
            execSync('gh pr create --title "Autonomous Strategic Roadmap Update" --body "Automated update generated by Hybrid Roadmap Planner based on the last 14 days of issue velocity." --base dev');
            
            // Revert branch
            execSync('git checkout dev');
            
            console.log('Successfully completed Roadmap alignment.');
        } else {
            console.error('LLM synthesis failed. No response received.');
        }

    } catch (e) {
        console.error('Planner agent failed critical operation:', e.message);
    }
}

// Initializer wrapper because top level await is tricky with legacy setups sometimes
(async () => {
    try {
        // Must init GraphService first
        await GraphService.ready();
        await MemoryService.ready();
        
        await plannerAgent();
        process.exit(0);
    } catch (e) {
        console.error('Failed to boot Planner:', e);
        process.exit(1);
    }
})();
