/**
 * @plane in-plane
 */
import {pathToFileURL} from 'url';

export const DEFAULT_BATCH_SIZE = 500;
export const DEFAULT_LIMIT      = 50;

const SUCCESS_REASONS = new Set(['already-exists', 'backfilled', 'backfilled-minimal']);

/**
 * @param {*} value
 * @param {Number} fallback
 * @returns {Number}
 */
export function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/**
 * @param {*} value
 * @param {Number|null} fallback
 * @returns {Number|null}
 */
export function normalizeCandidateLimit(value, fallback = DEFAULT_LIMIT) {
    if (value === 'all') {
        return null
    }

    return normalizePositiveInteger(value, fallback)
}

/**
 * @param {String} sessionId
 * @returns {String|null}
 */
export function createSessionGraphId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
        return null
    }

    return 'session:' + sessionId.replace(/^session:/i, '')
}

/**
 * @param {Object} meta
 * @returns {Boolean}
 */
export function isGraphDigested(meta = {}) {
    return meta.graphDigested === true || meta.graphDigested === 'true'
}

/**
 * @param {Object} batch
 * @returns {Object[]}
 */
export function extractSummaryRows(batch) {
    if (!batch?.ids?.length) {
        return []
    }

    return batch.ids.map((id, index) => ({
        chromaId: id,
        meta    : batch.metadatas?.[index] || {}
    }))
}

/**
 * @param {Object} options
 * @param {Object} options.graphDb
 * @param {String} options.graphNodeId
 * @returns {Boolean}
 */
export function hasDurableSessionNode({graphDb, graphNodeId} = {}) {
    if (!graphDb?.prepare || !graphNodeId) {
        return false
    }

    const row = graphDb.prepare(`
        SELECT 1 AS found
        FROM Nodes
        WHERE id = ?
          AND json_extract(data, '$.label') = 'SESSION'
        LIMIT 1
    `).get(graphNodeId);

    return Boolean(row)
}

/**
 * @param {Number} count
 * @param {Number|null} limit
 * @returns {Boolean}
 */
function hasCandidateCapacity(count, limit) {
    return limit === null || count < limit
}

/**
 * @summary Scans Chroma session summaries for graphDigested rows whose durable SESSION graph
 * node is missing. This targets the one-time hard-orphan repair: rows already marked digested
 * will not be re-selected by DreamService, so they need explicit projection repair.
 * @param {Object} options
 * @param {Object} options.summaryCollection Chroma summary collection.
 * @param {Object} options.graphDb SQLite graph database handle.
 * @param {Number} [options.batchSize=DEFAULT_BATCH_SIZE]
 * @param {Number|null} [options.limit=DEFAULT_LIMIT] Max candidates; `null` means no cap.
 * @param {Boolean} [options.digestedOnly=true] True limits repair to `graphDigested:true` rows.
 * @returns {Promise<Object>}
 */
export async function findUnprojectedSessions({
    summaryCollection,
    graphDb,
    batchSize    = DEFAULT_BATCH_SIZE,
    limit        = DEFAULT_LIMIT,
    digestedOnly = true
} = {}) {
    if (!summaryCollection?.count || !summaryCollection?.get) {
        throw new Error('repairUnprojectedSessions requires a Chroma summary collection with count() and get().')
    }
    if (!graphDb?.prepare) {
        throw new Error('repairUnprojectedSessions requires a SQLite graph database handle.')
    }

    const
        resolvedBatchSize = normalizePositiveInteger(batchSize, DEFAULT_BATCH_SIZE),
        resolvedLimit     = limit === null ? null : normalizeCandidateLimit(limit),
        total             = await summaryCollection.count(),
        candidates        = [],
        stats             = {
            total,
            scanned            : 0,
            skippedNoSessionId : 0,
            skippedNotDigested : 0,
            skippedAlreadyGraph: 0
        };

    for (let offset = 0; offset < total && hasCandidateCapacity(candidates.length, resolvedLimit); offset += resolvedBatchSize) {
        const page = await summaryCollection.get({
            include: ['metadatas'],
            limit  : Math.min(resolvedBatchSize, total - offset),
            offset
        });

        for (const row of extractSummaryRows(page)) {
            if (!hasCandidateCapacity(candidates.length, resolvedLimit)) {
                break;
            }

            stats.scanned++;

            if (digestedOnly && !isGraphDigested(row.meta)) {
                stats.skippedNotDigested++;
                continue;
            }

            const graphNodeId = createSessionGraphId(row.meta.sessionId);

            if (!graphNodeId) {
                stats.skippedNoSessionId++;
                continue;
            }

            if (hasDurableSessionNode({graphDb, graphNodeId})) {
                stats.skippedAlreadyGraph++;
                continue;
            }

            candidates.push({
                chromaId : row.chromaId,
                sessionId: row.meta.sessionId,
                graphNodeId
            });
        }
    }

    return {candidates, stats}
}

/**
 * @param {Object} options
 * @param {Object} options.summaryCollection
 * @param {Object} options.graphDb
 * @param {Object} [options.memorySessionIngestor]
 * @param {Boolean} [options.apply=false]
 * @param {Number} [options.batchSize=DEFAULT_BATCH_SIZE]
 * @param {Number|null} [options.limit=DEFAULT_LIMIT]
 * @param {Boolean} [options.digestedOnly=true]
 * @returns {Promise<Object>}
 */
export async function repairUnprojectedSessions({
    summaryCollection,
    graphDb,
    memorySessionIngestor,
    apply        = false,
    batchSize    = DEFAULT_BATCH_SIZE,
    limit        = DEFAULT_LIMIT,
    digestedOnly = true
} = {}) {
    const scan = await findUnprojectedSessions({
        summaryCollection,
        graphDb,
        batchSize,
        limit,
        digestedOnly
    });

    const results = [];

    if (apply) {
        if (!memorySessionIngestor?.ingestSingleRow) {
            throw new Error('repairUnprojectedSessions --apply requires MemorySessionIngestor.ingestSingleRow().')
        }

        for (const candidate of scan.candidates) {
            const result = await memorySessionIngestor.ingestSingleRow(candidate.graphNodeId, {summaryCollection});

            results.push({
                ...candidate,
                success: result?.success === true && SUCCESS_REASONS.has(result.reason),
                reason : result?.reason || 'unknown',
                error  : result?.error
            });
        }
    }

    const failed = results.filter(result => result.success === false);

    return {
        mode      : apply ? 'apply' : 'dry-run',
        digestedOnly,
        candidates: scan.candidates.length,
        repaired  : results.filter(result => result.success === true).length,
        failed    : failed.length,
        stats     : scan.stats,
        results   : apply ? results : scan.candidates
    }
}

/**
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv = []) {
    const options = {
        apply       : false,
        batchSize   : DEFAULT_BATCH_SIZE,
        digestedOnly: true,
        help        : false,
        limit       : DEFAULT_LIMIT
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--apply') {
            options.apply = true;
        } else if (arg === '--dry-run') {
            options.apply = false;
        } else if (arg === '--include-undigested') {
            options.digestedOnly = false;
        } else if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--batch-size') {
            options.batchSize = normalizePositiveInteger(argv[++i], DEFAULT_BATCH_SIZE);
        } else if (arg === '--limit') {
            options.limit = normalizeCandidateLimit(argv[++i], DEFAULT_LIMIT);
        } else {
            throw new Error(`Unknown argument: ${arg}`)
        }
    }

    return options
}

/**
 * @summary Builds the read-only runtime used by `--dry-run`, avoiding GraphService's writable
 * SQLite initialization while preserving the same summary-collection scan inputs.
 * @returns {Promise<Object>}
 */
export async function createDryRunRuntime() {
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const {default: aiConfig}      = await import('../../mcp/server/memory-core/config.mjs');
    const {default: ChromaManager} = await import('../../services/memory-core/managers/ChromaManager.mjs');
    const {default: Database}      = await import('better-sqlite3');

    await ChromaManager.ready();

    const
        summaryCollection = await ChromaManager.getSummaryCollection(),
        graphDb           = new Database(aiConfig.storagePaths.graph, {
            readonly     : true,
            fileMustExist: true
        });

    return {
        graphDb,
        summaryCollection,
        cleanup() {
            graphDb.close();
        }
    }
}

/**
 * @summary Builds the writable repair runtime used by `--apply`, where GraphService and
 * MemorySessionIngestor are required to backfill SESSION projections.
 * @returns {Promise<Object>}
 */
export async function createApplyRuntime() {
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const {
        Memory_GraphService    : GraphService,
        Memory_LifecycleService: LifecycleService,
        Memory_StorageRouter   : StorageRouter
    } = await import('../../services.mjs');
    const {default: MemorySessionIngestor} = await import('../../services/ingestion/MemorySessionIngestor.mjs');

    await LifecycleService.ready();
    await GraphService.ready();
    await StorageRouter.ready();

    const
        summaryCollection = await StorageRouter.getSummaryCollection(),
        graphDb           = GraphService.db?.storage?.db;

    if (!graphDb) {
        throw new Error('GraphService SQLite database is unavailable; cannot repair SESSION projection drift.')
    }

    return {
        graphDb,
        memorySessionIngestor: MemorySessionIngestor,
        summaryCollection
    }
}

/**
 * @summary Selects the dry-run or apply runtime after CLI argument parsing.
 * @param {Object} [options]
 * @param {Boolean} [options.apply=false]
 * @param {Object} [factories]
 * @param {Function} [factories.dryRunRuntimeFactory]
 * @param {Function} [factories.applyRuntimeFactory]
 * @returns {Promise<Object>}
 */
export function createRuntime({
    apply = false
} = {}, {
    dryRunRuntimeFactory = createDryRunRuntime,
    applyRuntimeFactory  = createApplyRuntime
} = {}) {
    return (apply ? applyRuntimeFactory : dryRunRuntimeFactory)()
}

export function usage() {
    return [
        'Usage: node ai/scripts/maintenance/repairUnprojectedSessions.mjs [--dry-run|--apply] [--limit N|all] [--batch-size N] [--include-undigested]',
        '',
        'Default: dry-run, --limit 50, only graphDigested=true rows.',
        '--apply mutates the Native Edge Graph by backfilling missing session:<sessionId> nodes from Chroma summaries.',
        '--include-undigested is diagnostic; the default avoids masking DreamService work still owed by graphDigested=false/unset rows.'
    ].join('\n')
}

/**
 * @param {String[]} [argv=process.argv.slice(2)]
 * @param {Object} [deps]
 * @returns {Promise<Number>} process exit code
 */
export async function runCli(argv = process.argv.slice(2), {
    runtimeFactory = createRuntime,
    stdout         = console.log,
    stderr         = console.error
} = {}) {
    let runtime;

    try {
        const options = parseArgs(argv);

        if (options.help) {
            stdout(usage());
            return 0
        }

        runtime = await runtimeFactory(options);

        const result = await repairUnprojectedSessions({...runtime, ...options});

        stdout(JSON.stringify(result, null, 2));

        return result.failed === 0 ? 0 : 1
    } catch (error) {
        stderr(`[repairUnprojectedSessions] ${error.message}`);
        return 2
    } finally {
        if (runtime?.cleanup) {
            try {
                await runtime.cleanup();
            } catch (error) {
                stderr(`[repairUnprojectedSessions] cleanup failed: ${error.message}`);
            }
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli().then(code => process.exit(code));
}
