import fs     from 'fs';
import Base   from '../../../src/core/Base.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import aiConfig from '../../mcp/server/memory-core/config.mjs';
import logger  from '../../mcp/server/memory-core/logger.mjs';

/**
 * @summary Drains the lazy-edges JSONL queue into the Native Edge Graph.
 *
 * This service is the consumer side of the producer/consumer contract used by
 * `SemanticGraphExtractor`: the extractor writes unresolved provenance edges, and this drainer
 * resolves or retains them once the referenced `MEMORY:` / `SESSION:` endpoints exist.
 *
 * `SemanticGraphExtractor` writes provenance edges (`MENTIONED_IN`, `DISCUSSED_IN`,
 * `REFERENCED_BY`) whose `MEMORY:` / `SESSION:` targets may not yet exist in the graph — those
 * edges get appended as JSONL lines to `aiConfig.lazyEdgesQueuePath` (defaults to
 * `.neo-ai-data/memory-core/lazy-edges.jsonl`) rather than being culled. This service drains that
 * queue: for each queued edge it calls `GraphService.linkNodesAsync`, which in turn triggers
 * `MemorySessionIngestor.ingestSingleRow` to back-fill the missing endpoint from its Chroma
 * source row before attempting the edge creation. Edges that still fail resolution (genuine
 * hallucinations, missing Chroma rows) are written back to the queue for a future drain pass;
 * successfully-drained edges are removed.
 *
 * **Atomicity via rename-then-drain:** the queue file is renamed to a `.draining` suffix at
 * the start of a drain cycle, so any concurrent `SemanticGraphExtractor` appends create a fresh
 * queue file rather than racing against the drain read. After processing, failures are appended
 * to the (potentially fresh) queue file for the next cycle. This matches the standard "log
 * rotation" pattern and preserves the queue's append-only producer semantics.
 *
 * **Invocation surface:** no MCP tool surface — this is an internal daemon service invoked
 * from either the REM cycle (`DreamService`) or the standalone `ai/scripts/migrations/priorityBackfill.mjs`
 * CLI. Keeping it off the MCP tool surface preserves the caller constraint that back-fill is
 * an **operational** concern, not an **agent-facing** one.
 *
 * **Why a separate service rather than a method on `GraphService`:** the drainer owns
 * filesystem I/O + JSONL parsing + queue rotation — responsibilities distinct from the
 * in-memory / SQLite graph operations `GraphService` owns. Separating them keeps `GraphService`
 * substrate-agnostic (no filesystem coupling) and makes the drainer testable in isolation with
 * a mock queue path.
 *
 * @class Neo.ai.daemons.services.LazyEdgeDrainer
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.daemons.services.MemorySessionIngestor
 * @see Neo.ai.services.memory-core.GraphService
 */
class LazyEdgeDrainer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.LazyEdgeDrainer'
         * @protected
         */
        className: 'Neo.ai.daemons.services.LazyEdgeDrainer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Drains the lazy-edges JSONL queue, attempting to resolve each queued edge via
     * `GraphService.linkNodesAsync` (which back-fills missing endpoints). Successfully-drained
     * edges are removed; failures are written back to the queue for a future cycle.
     *
     * Idempotent: re-invoking against the same queue re-attempts any edges whose endpoints are
     * still unresolvable (e.g. Chroma row genuinely missing). No duplicate graph edges are
     * created — `linkNodesAsync` delegates to `linkNodes`, which recognizes existing
     * source+target+type combinations and updates weight instead of duplicating.
     *
     * **Malformed-line policy:** lines that fail JSON parsing or lack required fields (`source`,
     * `target`, `relationship`) are counted as `skippedMalformed` and discarded rather than
     * retained — they would never succeed on retry and keeping them would bloat the queue. Operators
     * with concerns about malformed-line loss should inspect the logs prior to draining.
     *
     * @param {Object}  [options]
     * @param {String}  [options.filePath] Absolute path to the queue file. Defaults to
     *     `aiConfig.lazyEdgesQueuePath`.
     * @param {Boolean} [options.dryRun=false] If true, parses and counts the queue without
     *     mutating the graph or the queue file. Useful for operator diagnostics.
     * @returns {Promise<Object>} Drain statistics:
     *     `{totalLines, processed, succeeded, failed, skippedMalformed, queueRotated}`.
     */
    async drainQueue({filePath = null, dryRun = false} = {}) {
        const
            queuePath    = filePath || aiConfig.lazyEdgesQueuePath,
            drainingPath = queuePath + '.draining',
            stats        = {totalLines: 0, processed: 0, succeeded: 0, failed: 0, skippedMalformed: 0, queueRotated: false, orphanRecovered: false};

        if (!queuePath) {
            logger.warn('[LazyEdgeDrainer] No queue path configured (aiConfig.lazyEdgesQueuePath); nothing to drain.');
            return stats;
        }

        // Recovery-on-boot for orphaned `.draining` files — addresses the SIGKILL edge case
        // where a prior drain crashed between `rename` and the `try`/`catch` restore path
        // (the catch only runs on thrown exceptions; `SIGKILL` / `SIGSTOP` / process exit
        // bypass it). Merging orphan content back into the live queue is idempotent and
        // preserves the "failures retained for retry" contract.
        stats.orphanRecovered = await this.recoverOrphanedDraining(queuePath, drainingPath);

        try {
            if (dryRun) {
                // Dry-run: read from the live queue without rotating, so concurrent producers
                // remain undisturbed. The count may be a lower bound if producers append
                // mid-read.
                if (!fs.existsSync(queuePath)) {
                    return stats;
                }
                const content = await fs.promises.readFile(queuePath, 'utf8');
                return this.processLines(content, {stats, dryRun: true});
            }

            try {
                await fs.promises.rename(queuePath, drainingPath);
                stats.queueRotated = true;
            } catch (e) {
                if (e.code === 'ENOENT') {
                    return stats; // Queue doesn't exist — nothing to drain.
                }
                throw e;
            }

            const content  = await fs.promises.readFile(drainingPath, 'utf8');
            const failures = [];

            await this.processLines(content, {stats, dryRun: false, failures});

            if (failures.length > 0) {
                // Append failures back to the live queue (may have grown via concurrent producers
                // since the rename). The next drain cycle will retry them.
                await fs.promises.appendFile(queuePath, failures.join('\n') + '\n', 'utf8');
            }

            await fs.promises.unlink(drainingPath).catch(() => {});

            logger.info(
                `[LazyEdgeDrainer] Drained ${queuePath}: ${stats.succeeded} resolved, ` +
                `${stats.failed} retained for retry, ${stats.skippedMalformed} malformed discarded.`
            );
        } catch (e) {
            logger.error('[LazyEdgeDrainer] Fatal drain error:', e);
            // Best-effort restore — if we rotated but crashed mid-processing, put the draining
            // file back as the live queue so nothing is lost.
            if (stats.queueRotated) {
                await fs.promises.rename(drainingPath, queuePath).catch(() => {});
            }
            throw e;
        }

        return stats;
    }

    /**
     * Recovers an orphaned `.draining` file from a prior drain cycle that crashed between
     * `rename(queuePath, drainingPath)` and the catch-block restore. Such orphans occur under
     * process termination signals that bypass `try`/`catch` (`SIGKILL`, OOM kills, hardware
     * failure). Without recovery, the orphaned edges would remain on disk but never be
     * retried until manual intervention.
     *
     * Resolution: merge the orphan's content into the live queue (prepended so orphaned
     * edges are processed first, preserving FIFO semantics for the entries that have been
     * waiting longest), then delete the orphan. The merge is idempotent — a subsequent
     * recovery-on-boot finds no orphan and no-ops.
     *
     * @param {String} queuePath    The live queue path
     * @param {String} drainingPath The `.draining` orphan path
     * @returns {Promise<Boolean>} `true` if an orphan was recovered; `false` if none existed.
     * @protected
     */
    async recoverOrphanedDraining(queuePath, drainingPath) {
        if (!fs.existsSync(drainingPath)) {
            return false;
        }

        try {
            const orphanContent = await fs.promises.readFile(drainingPath, 'utf8');

            if (orphanContent.length > 0) {
                const existingContent = fs.existsSync(queuePath)
                    ? await fs.promises.readFile(queuePath, 'utf8')
                    : '';

                // Normalize trailing newline on the orphan so the concat doesn't produce
                // adjacent JSON objects on a single line.
                const merged = orphanContent.endsWith('\n') ? orphanContent + existingContent : orphanContent + '\n' + existingContent;
                await fs.promises.writeFile(queuePath, merged, 'utf8');
            }

            await fs.promises.unlink(drainingPath);
            logger.warn(`[LazyEdgeDrainer] Recovered orphaned ${drainingPath} from prior run and merged into live queue.`);
            return true;
        } catch (e) {
            logger.error(`[LazyEdgeDrainer] Failed to recover orphaned ${drainingPath}:`, e);
            return false;
        }
    }

    /**
     * Processes the raw JSONL content — one edge per line. Parses, validates, attempts
     * resolution via `GraphService.linkNodesAsync`, and accumulates stats + failures.
     *
     * @param {String}  content JSONL content (one edge JSON per newline-delimited line)
     * @param {Object}  opts
     * @param {Object}  opts.stats Stats accumulator (mutated)
     * @param {Boolean} opts.dryRun If true, skip the `linkNodesAsync` call
     * @param {Array}   [opts.failures] Array accumulator for lines whose edge creation failed
     * @returns {Promise<Object>} The mutated stats object
     * @protected
     */
    async processLines(content, {stats, dryRun, failures}) {
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        stats.totalLines = lines.length;

        for (const line of lines) {
            stats.processed++;

            let edge;

            try {
                edge = JSON.parse(line);
            } catch (e) {
                stats.skippedMalformed++;
                continue;
            }

            if (!edge.source || !edge.target || !edge.relationship) {
                stats.skippedMalformed++;
                continue;
            }

            if (dryRun) {
                stats.succeeded++;
                continue;
            }

            let ok = false;

            try {
                ok = await GraphService.linkNodesAsync(
                    edge.source,
                    edge.target,
                    edge.relationship,
                    edge.weight || 1.0,
                    edge.properties || {}
                );
            } catch (e) {
                logger.warn(`[LazyEdgeDrainer] linkNodesAsync threw for ${edge.source} -> ${edge.target}: ${e.message}`);
                ok = false;
            }

            if (ok) {
                stats.succeeded++;
            } else {
                stats.failed++;
                failures?.push(line);
            }
        }

        return stats;
    }
}

export default Neo.setupClass(LazyEdgeDrainer);
