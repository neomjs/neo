/**
 * analyzeNlTelemetry.mjs
 *
 * Compresses raw Neural Link memory logs into high-signal demonstrations
 * of intelligence (trajectories) for RLAIF dataset curation.
 *
 * Usage: node ai/scripts/diagnostics/analyzeNlTelemetry.mjs <sessionId> [--save]
 * @plane in-plane
 */
import Neo from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve upward from neo/ai/scripts to neo root
const ROOT_DIR = path.resolve(__dirname, '../../../');
import aiConfig from '../../mcp/server/memory-core/config.mjs';

// The Memory Core config leaf owns the NEO_MEMORY_DB_PATH env override.
const DB_PATH = aiConfig.storagePaths.graph;
const RLAIF_PATH = aiConfig.datasets.rlaif.trajectories;

const sessionId = process.argv[2];
const save = process.argv.includes('--save');

if (!sessionId) {
    console.error('Usage: node ai/scripts/diagnostics/analyzeNlTelemetry.mjs <sessionId> [--save]');
    process.exit(1);
}

try {
    if (!fs.existsSync(DB_PATH)) {
        throw new Error(`Memory Core database not found at ${DB_PATH}. Run the agent OS to initialize.`);
    }

    const db = new Database(DB_PATH, { readonly: true });

    // Fetch all memories
    const rows = db.prepare('SELECT metadata FROM neo_agent_memory_data').all();

    const sessionLogs = [];
    for (const row of rows) {
        try {
            const meta = JSON.parse(row.metadata);
            if (meta.sessionId === sessionId) {
                sessionLogs.push(meta);
            }
        } catch (e) {
            // Ignore parse errors on specific rows, skip gracefully
        }
    }

    if (sessionLogs.length === 0) {
        console.warn(`No logs found for sessionId: ${sessionId}`);
        process.exit(0);
    }

    // Sort chronologically (assuming timestamp exists on standard memory logs)
    sessionLogs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const trajectories = [];
    let currentTrajectory = [];

    sessionLogs.forEach((log) => {
        // Simple heuristic: A step belongs to a trajectory if it invoked Neural Link
        // or explicitly discussed it.
        const toolsUsed = Array.isArray(log.toolsUsed) ? log.toolsUsed : [];
        const isNlTurn =
            toolsUsed.some(tool => tool.includes('neural-link')) ||
            (log.thought && log.thought.includes('neural-link'));

        if (isNlTurn) {
            currentTrajectory.push({
                prompt: log.prompt,
                thought: log.thought,
                response: log.response,
                toolsUsed: toolsUsed
            });
        } else if (currentTrajectory.length > 0) {
            // Cap off the trajectory if the agent shifted context
            trajectories.push([...currentTrajectory]);
            currentTrajectory = [];
        }
    });

    // Catch trailing trajectory
    if (currentTrajectory.length > 0) {
        trajectories.push([...currentTrajectory]);
    }

    if (trajectories.length === 0) {
        console.log(`No neural link trajectories found in session: ${sessionId}`);
        process.exit(0);
    }

    // Convert into RLAIF fine-tuning format (SFT/DPO compatible)
    const outputTrajectories = trajectories.map(traj => {
        return {
            metadata: {
                sessionId,
                extractionDate: new Date().toISOString(),
                type: 'whitebox_e2e_introspection'
            },
            messages: traj.flatMap(turn => [
                { role: 'user', content: turn.prompt },
                { role: 'assistant', content: `[THOUGHT]\n${turn.thought}\n[RESPONSE]\n${turn.response}` }
            ])
        };
    });

    console.log(`Found ${outputTrajectories.length} Neural Link trajectories for session ${sessionId}.`);

    if (save) {
        // Ensure directory exists
        const rlaifDir = path.dirname(RLAIF_PATH);
        if (!fs.existsSync(rlaifDir)) {
            fs.mkdirSync(rlaifDir, { recursive: true });
        }

        let saveCount = 0;
        for (const data of outputTrajectories) {
            fs.appendFileSync(RLAIF_PATH, JSON.stringify(data) + '\n');
            saveCount++;
        }
        console.log(`Successfully appended ${saveCount} trajectories to ${RLAIF_PATH}`);
    } else {
        console.log('\n--- Preview of Trajectory [0] ---');
        console.log(JSON.stringify(outputTrajectories[0], null, 2));
        console.log('\nRun with --save to append to trajectories.jsonl');
    }

} catch (error) {
    console.error('Error analyzing telemetry:', error);
    process.exit(1);
}
