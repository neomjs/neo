/**
 * @module ai/scripts/summarize-sessions
 * @summary Manual session-summarization trigger for Memory Core context refresh.
 *
 * Backfills chronological session summaries into the Memory Core's `neo-agent-sessions`
 * Chroma collection, bypassing the auto-summarization that was disabled on MC server
 * startup per #9942 (daemon-collision fix). Operator-runnable via `npm run ai:summarize-sessions`.
 *
 * Defaults to last-30-days lookback (`includeAll: false`); for fresh-deployment
 * full-summarization, edit the call-site or extend with a `--include-all` CLI flag (future).
 *
 * @see ai/mcp/server/memory-core/services/SessionService.summarizeSessions
 * @see #10458 (origin), #9942 (daemon-collision context)
 */
import { Memory_SessionService } from '../services.mjs';

async function summarize() {
    console.log('[summarize-sessions] Initializing SessionService...');
    try {
        await Memory_SessionService.initAsync();
        
        console.log('[summarize-sessions] Starting session summarization...');
        // includeAll: false will only summarize sessions from the last 30 days
        const result = await Memory_SessionService.summarizeSessions({ includeAll: false });
        
        if (result && result.error) {
            console.error(`[summarize-sessions] Summarization failed: ${result.message}`);
            process.exit(1);
        }
        
        console.log(`[summarize-sessions] Summarization complete. Processed: ${result?.processed || 0}`);
        process.exit(0);
    } catch (err) {
        console.error('[summarize-sessions] Error:', err);
        process.exit(1);
    }
}

summarize();
