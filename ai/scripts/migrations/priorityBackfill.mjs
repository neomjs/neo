/**
 * @summary Eager batch back-fill for high-activity sessions into the Native Edge Graph.
 *
 * Complements the lazy back-fill path. Where the lazy path is reactive
 * (back-fill-on-demand when `linkNodesAsync` encounters a missing endpoint),
 * this CLI is proactive: pre-warms the graph with sessions and memories from a
 * configurable recent window (default: last 30 days). Opt-in — run before mass
 * cross-tenant permission rollouts or mailbox traffic demonstrations across
 * historical sessions to avoid latency spikes from lazy back-fills during the
 * workload.
 *
 * **Usage:**
 * ```
 * node ai/scripts/migrations/priorityBackfill.mjs [--days N] [--dry-run] [--skip-drain]
 * ```
 *
 * - `--days N` — window in days (default 30)
 * - `--dry-run` — report what would be back-filled without mutating graph or queue
 * - `--skip-drain` — skip the post-ingest `LazyEdgeDrainer` pass
 *
 * **Two-phase execution:**
 * 1. **Ingest phase:** fetches sessions with `metadata.createdAt >= (now - daysWindow)` from
 *    the Chroma summary collection; for each, invokes `MemorySessionIngestor.syncSessionToGraph`
 *    which upserts the SESSION node plus all MEMORY children + `ORIGINATES_IN` edges.
 * 2. **Drain phase** (skippable): runs `LazyEdgeDrainer.drainQueue` to retry any queued
 *    provenance edges (`MENTIONED_IN`/`DISCUSSED_IN`/`REFERENCED_BY`) whose
 *    endpoints may now exist in the graph after the ingest phase.
 * @plane in-plane
 */
import 'dotenv/config';
import {
    Memory_GraphService as GraphService,
    Memory_StorageRouter as StorageRouter
} from '../../services.mjs';
import MemorySessionIngestor from '../../services/ingestion/MemorySessionIngestor.mjs';
import LazyEdgeDrainer       from '../../services/graph/LazyEdgeDrainer.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';

const
    args        = process.argv.slice(2),
    flags       = {daysWindow: 30, dryRun: false, skipDrain: false};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--days') {
        flags.daysWindow = parseInt(args[++i], 10) || 30;
    } else if (arg === '--dry-run') {
        flags.dryRun = true;
    } else if (arg === '--skip-drain') {
        flags.skipDrain = true;
    } else if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/migrations/priorityBackfill.mjs [--days N] [--dry-run] [--skip-drain]');
        process.exit(0);
    }
}

async function run() {
    logger.info('[priorityBackfill] Awaiting Memory Graph Service readiness...');
    await GraphService.ready();

    const summaryCollection = await StorageRouter.getSummaryCollection();

    if (!summaryCollection) {
        logger.error('[priorityBackfill] Summary collection unavailable — aborting.');
        process.exit(1);
    }

    const
        cutoffTimestamp = Date.now() - flags.daysWindow * 24 * 60 * 60 * 1000,
        cutoffIso       = new Date(cutoffTimestamp).toISOString();

    logger.info(`[priorityBackfill] Fetching sessions with createdAt >= ${cutoffIso} (window: ${flags.daysWindow} days)`);

    const allSessions = await summaryCollection.get({include: ['metadatas']});
    const inWindow    = [];

    for (let i = 0; i < (allSessions?.ids?.length || 0); i++) {
        const
            meta      = allSessions.metadatas?.[i] || {},
            createdAt = meta.createdAt;

        if (createdAt && createdAt >= cutoffIso) {
            inWindow.push({id: allSessions.ids[i], meta});
        }
    }

    logger.info(`[priorityBackfill] ${inWindow.length} sessions in window.`);

    if (flags.dryRun) {
        logger.info('[priorityBackfill] Dry-run: skipping ingestion.');

        if (!flags.skipDrain) {
            const drainStats = await LazyEdgeDrainer.drainQueue({dryRun: true});
            logger.info(`[priorityBackfill] Dry-run drain stats: ${JSON.stringify(drainStats)}`);
        }

        process.exit(0);
    }

    const totalStats = {
        sessionsUpserted : 0,
        memoriesUpserted : 0,
        memoriesSkipped  : 0,
        errors           : 0
    };

    for (const session of inWindow) {
        try {
            const stats = await MemorySessionIngestor.syncSessionToGraph(session);
            if (stats.sessionUpserted) totalStats.sessionsUpserted++;
            totalStats.memoriesUpserted += stats.memoriesUpserted;
            totalStats.memoriesSkipped  += stats.memoriesSkipped;
            totalStats.errors           += stats.errors.length;
        } catch (e) {
            logger.error(`[priorityBackfill] Session ${session.meta?.sessionId || session.id} failed:`, e);
            totalStats.errors++;
        }
    }

    logger.info(`[priorityBackfill] Ingest phase complete: ${JSON.stringify(totalStats)}`);

    if (!flags.skipDrain) {
        logger.info('[priorityBackfill] Draining lazy-edges queue...');
        const drainStats = await LazyEdgeDrainer.drainQueue();
        logger.info(`[priorityBackfill] Drain phase complete: ${JSON.stringify(drainStats)}`);
    }

    process.exit(0);
}

run().catch(err => {
    logger.error('[priorityBackfill] Fatal:', err);
    process.exit(1);
});
