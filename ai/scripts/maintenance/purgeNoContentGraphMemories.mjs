/**
 * @plane in-plane
 */
// Bootstrap Neo namespace BEFORE importing Memory Core services; runtime config evaluates
// through the Neo singleton namespace during service setup.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import {Command}       from 'commander';
import {pathToFileURL} from 'url';

import {getPendingSessionSummaryCount} from '../../daemons/orchestrator/scheduling/summary.mjs';
import {
    Memory_GraphService as GraphService,
    Memory_LifecycleService as LifecycleService,
    Memory_StorageRouter as StorageRouter
} from '../../services.mjs';

/**
 * @module ai.scripts.maintenance.purgeNoContentGraphMemories
 * @summary Dry-run-first one-shot cleanup for archived no-content `AGENT_MEMORY` graph nodes.
 *
 * This script targets only the confirmed destructive subset: graph `AGENT_MEMORY`
 * nodes already archived with `archivedReason = 'no-content'` and missing from the active
 * Chroma memory collection. It is dry-run by default. Destructive execution requires both
 * `--apply` and the explicit confirmation token, then routes deletion through
 * {@link GraphService#removeNodes} so graph cache and SQLite edge cascades stay coherent.
 *
 * Usage:
 *   node ai/scripts/maintenance/purgeNoContentGraphMemories.mjs
 *   node ai/scripts/maintenance/purgeNoContentGraphMemories.mjs --apply --confirm CONFIRM_ARCHIVED_NO_CONTENT_GRAPH_DELETE
 */

export const DEFAULT_CHROMA_FETCH_CHUNK_SIZE = 500;
export const APPLY_CONFIRMATION_TOKEN        = 'CONFIRM_ARCHIVED_NO_CONTENT_GRAPH_DELETE';

/**
 * @summary Splits an array into fixed-size chunks.
 * @param {Array} items Source items.
 * @param {Number} size Positive chunk size.
 * @returns {Array[]}
 */
export function chunk(items, size) {
    const boundedSize = Number.isInteger(size) && size > 0 ? size : DEFAULT_CHROMA_FETCH_CHUNK_SIZE;
    const chunks      = [];

    for (let i = 0; i < items.length; i += boundedSize) {
        chunks.push(items.slice(i, i + boundedSize));
    }

    return chunks;
}

/**
 * @summary Finds graph memories already marked as archived no-content cleanup candidates.
 * @param {Object} options
 * @param {Object} options.db Better-SQLite3 graph handle.
 * @returns {Object[]}
 */
export function listArchivedNoContentMemoryRows({db}) {
    if (!db?.prepare) {
        throw new TypeError('A Better-SQLite3 graph handle is required.');
    }

    return db.prepare(`
        SELECT
            id,
            json_extract(data, '$.properties.sessionId')      AS sessionId,
            json_extract(data, '$.properties.agentIdentity')  AS agentIdentity,
            json_extract(data, '$.properties.timestamp')      AS timestamp,
            json_extract(data, '$.properties.archivedAt')     AS archivedAt,
            json_extract(data, '$.properties.archivedReason') AS archivedReason
        FROM Nodes
        WHERE json_extract(data, '$.label') = 'AGENT_MEMORY'
          AND json_extract(data, '$.properties.archivedAt') IS NOT NULL
          AND json_extract(data, '$.properties.archivedReason') = 'no-content'
        ORDER BY sessionId, id
    `).all();
}

/**
 * @summary Reads which candidate ids still exist in Chroma memory content.
 * @param {Object} options
 * @param {Object} options.collection Chroma collection or compatible seam.
 * @param {String[]} options.ids Candidate graph node ids.
 * @param {Number} [options.chunkSize]
 * @returns {Promise<Set<String>>}
 */
export async function collectExistingMemoryIds({collection, ids, chunkSize = DEFAULT_CHROMA_FETCH_CHUNK_SIZE}) {
    if (!collection?.get) {
        throw new TypeError('A Chroma memory collection handle is required.');
    }

    const existing = new Set();

    for (const slice of chunk(ids, chunkSize)) {
        if (slice.length === 0) continue;

        const page = await collection.get({ids: slice, include: []});

        for (const id of page?.ids || []) {
            existing.add(id);
        }
    }

    return existing;
}

/**
 * @summary Counts graph edges attached to the selected node ids before deletion.
 * @param {Object} options
 * @param {Object} options.db Better-SQLite3 graph handle.
 * @param {String[]} options.nodeIds
 * @param {Number} [options.chunkSize]
 * @returns {Number}
 */
export function countIncidentEdges({db, nodeIds, chunkSize = DEFAULT_CHROMA_FETCH_CHUNK_SIZE}) {
    if (!db?.prepare || !Array.isArray(nodeIds) || nodeIds.length === 0) {
        return 0;
    }

    let count = 0;

    for (const slice of chunk(nodeIds, chunkSize)) {
        const placeholders = slice.map(() => '?').join(',');
        const row          = db.prepare(`
            SELECT COUNT(*) AS count
            FROM Edges
            WHERE source IN (${placeholders})
               OR target IN (${placeholders})
        `).get(...slice, ...slice);

        count += Number(row?.count || 0);
    }

    return count;
}

/**
 * @summary Builds the dry-run/apply plan for archived no-content graph memory cleanup.
 * @param {Object} options
 * @param {Object} options.db Better-SQLite3 graph handle.
 * @param {Object} options.collection Chroma memory collection or compatible seam.
 * @param {Number} [options.chunkSize]
 * @returns {Promise<Object>}
 */
export async function buildCleanupPlan({db, collection, chunkSize = DEFAULT_CHROMA_FETCH_CHUNK_SIZE}) {
    const archivedRows = listArchivedNoContentMemoryRows({db});
    const existingIds  = await collectExistingMemoryIds({
        collection,
        ids: archivedRows.map(row => row.id),
        chunkSize
    });
    const deletableRows = archivedRows.filter(row => !existingIds.has(row.id));
    const nodeIds       = deletableRows.map(row => row.id);

    return {
        scannedArchivedNoContent  : archivedRows.length,
        protectedWithChromaContent: existingIds.size,
        deletableNodes            : nodeIds.length,
        deletableSessions         : new Set(deletableRows.map(row => row.sessionId).filter(Boolean)).size,
        deletableAgents           : new Set(deletableRows.map(row => row.agentIdentity).filter(Boolean)).size,
        incidentEdges             : countIncidentEdges({db, nodeIds, chunkSize}),
        nodeIds,
        sample                    : deletableRows.slice(0, 10).map(row => ({
            id           : row.id,
            sessionId    : row.sessionId,
            agentIdentity: row.agentIdentity,
            timestamp    : row.timestamp
        }))
    };
}

/**
 * @summary Requires the explicit destructive confirmation token.
 * @param {String} confirmation Operator-provided confirmation.
 */
export function assertApplyConfirmed(confirmation) {
    if (confirmation !== APPLY_CONFIRMATION_TOKEN) {
        throw new Error(
            `Refusing destructive graph cleanup without --confirm ${APPLY_CONFIRMATION_TOKEN}.`
        );
    }
}

/**
 * @summary Runs the dry-run-first graph cleanup.
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function runNoContentGraphMemoryCleanup({
    apply = false,
    confirmation = '',
    chunkSize = DEFAULT_CHROMA_FETCH_CHUNK_SIZE,
    lifecycle = LifecycleService,
    graphService = GraphService,
    storageRouter = StorageRouter,
    collection = null,
    logger = console
} = {}) {
    if (apply) {
        assertApplyConfirmed(confirmation);
    }

    await lifecycle?.ready?.();
    await graphService?.ready?.();

    const db = graphService?.db?.storage?.db;

    if (!db?.prepare) {
        throw new Error('Graph SQLite storage is unavailable; cannot build cleanup plan.');
    }

    collection ??= await storageRouter.getMemoryCollection();

    const beforePendingSessionSummaryCount = getPendingSessionSummaryCount(db);
    const plan                             = await buildCleanupPlan({db, collection, chunkSize});

    let deletedNodes = 0;

    if (apply && plan.nodeIds.length > 0) {
        graphService.removeNodes(plan.nodeIds);
        deletedNodes = plan.nodeIds.length;
    }

    const afterPendingSessionSummaryCount = getPendingSessionSummaryCount(db);
    const result                          = {
        apply,
        dryRun: !apply,
        beforePendingSessionSummaryCount,
        afterPendingSessionSummaryCount,
        ...plan,
        deletedNodes
    };

    logCleanupResult(result, {logger});

    return result;
}

/**
 * @summary Prints the operator-facing cleanup report.
 * @param {Object} result Cleanup result.
 * @param {Object} options
 */
export function logCleanupResult(result, {logger = console} = {}) {
    logger.log(`No-content graph memory cleanup ${result.apply ? 'APPLY' : 'DRY-RUN'}`);
    logger.log(`  archived no-content graph rows scanned: ${result.scannedArchivedNoContent}`);
    logger.log(`  protected because Chroma content exists: ${result.protectedWithChromaContent}`);
    logger.log(`  deletable graph nodes: ${result.deletableNodes}`);
    logger.log(`  distinct sessions: ${result.deletableSessions}`);
    logger.log(`  distinct agents: ${result.deletableAgents}`);
    logger.log(`  incident edges: ${result.incidentEdges}`);
    logger.log(
        `  pending-session-summary marker: ${result.beforePendingSessionSummaryCount} -> ` +
        `${result.afterPendingSessionSummaryCount}`
    );

    if (result.sample.length > 0) {
        logger.log('  sample:');
        for (const row of result.sample) {
            logger.log(`    ${row.id} session=${row.sessionId || '(none)'} agent=${row.agentIdentity || '(none)'}`);
        }
    }

    if (!result.apply) {
        logger.log(`  dry-run only; re-run with --apply --confirm ${APPLY_CONFIRMATION_TOKEN} to delete eligible nodes.`);
        return;
    }

    logger.log(`  deleted graph nodes: ${result.deletedNodes}`);
}

/**
 * @summary Creates the CLI command object.
 * @returns {Command}
 */
export function createCommand() {
    return new Command()
        .name('purgeNoContentGraphMemories')
        .description('Dry-run-first cleanup for archived no-content AGENT_MEMORY graph nodes.')
        .option('--apply', 'Actually delete eligible graph nodes. Without this flag the script is dry-run only.', false)
        .option('--confirm <token>', `Required with --apply: ${APPLY_CONFIRMATION_TOKEN}.`, '')
        .option('--chunk-size <n>', 'Candidate id batch size for Chroma/SQLite probes.', String(DEFAULT_CHROMA_FETCH_CHUNK_SIZE));
}

/**
 * @summary Runs the CLI from process argv.
 * @param {String[]} argv
 * @returns {Promise<Object>}
 */
export async function runCli(argv = process.argv) {
    const command = createCommand();

    command.parse(argv);

    const options   = command.opts();
    const chunkSize = Number(options.chunkSize);

    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new Error(`chunk-size must be a positive integer; received ${options.chunkSize}`);
    }

    return runNoContentGraphMemoryCleanup({
        apply       : options.apply,
        confirmation: options.confirm,
        chunkSize
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runCli();
}
