/**
 * @module ai/scripts/summarize-sessions
 * @summary Manual session-summarization trigger for Memory Core context refresh.
 *
 * Backfills chronological session summaries into the Memory Core's `neo-agent-sessions`
 * Chroma collection, bypassing the auto-summarization that was disabled on MC server
 * startup to avoid daemon collision. Operator-runnable via `npm run ai:summarize-sessions`.
 *
 * Summarizes all unsummarized sessions (all-time). The earlier 30-day lookback window was
 * removed as an obsolete boot/healthcheck-timeout safeguard.
 *
 * @see ai/services/memory-core/SessionService.summarizeSessions
 * @plane in-plane
 */
// Neo namespace bootstrap (entry-point invariant) — this script is an orchestrator
// spawn-child entry point (`spawn(node, [summarize-sessions.mjs])`). Each spawned
// child is its own Node process and needs its own bootstrap. `Neo` + `core/_export`
// populate `globalThis.Neo`; `InstanceManager` binds Neo.find/findFirst/get aliases
// + consumes pre-singleton `Neo.idMap`.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import { Memory_SessionService } from '../../services.mjs';

const logInfo = message => console.error(`[INFO] ${message}`);

async function summarize() {
    logInfo('[summarize-sessions] Initializing SessionService...');
    try {
        await Memory_SessionService.ready();

        logInfo('[summarize-sessions] Draining pending session summarization markers...');
        const pendingResult = await Memory_SessionService.summarizePendingSessions();

        if (pendingResult && pendingResult.error) {
            console.error(`[summarize-sessions] Pending summarization failed: ${pendingResult.message}`);
            process.exit(1);
        }

        logInfo(`[summarize-sessions] Pending drain complete. Pending: ${pendingResult?.pending || 0}; processed: ${pendingResult?.processed || 0}`);

        logInfo('[summarize-sessions] Starting drift-detection session summarization...');
        // All-time scope: summarizes every unsummarized session (the 30-day window was removed).
        const result = await Memory_SessionService.summarizeSessions();

        if (result && result.error) {
            console.error(`[summarize-sessions] Summarization failed: ${result.message}`);
            process.exit(1);
        }

        logInfo(`[summarize-sessions] Summarization complete. Processed: ${result?.processed || 0}`);
        process.exit(0);
    } catch (err) {
        console.error('[summarize-sessions] Error:', err);
        process.exit(1);
    }
}

summarize();
