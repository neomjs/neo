/**
 * @plane host
 */
import {program}                      from 'commander';
import {ChromaClient}                 from 'chromadb';
import {execSync}                     from 'child_process';
import crypto                         from 'crypto';
import fs                             from 'fs-extra';
import path                           from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import Neo                            from '../../../src/Neo.mjs';
import AiConfig                       from '../../config.mjs';
import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {registerNeoChromaEmbeddingFunctions}                         from '../../services/shared/vector/chromaClientPrimitives.mjs';
import {auditChromaVectorCoverage}                                   from './checkChromaIntegrity.mjs';
import {extractMemoryCoreCollectionData, truncateToEmbedTokenBudget} from './repairMemoryCoreStoredEmbeddings.mjs';
import {resolveAutonomousRepairExit}                                 from '../../services/memory-core/helpers/acceptedLossSettlement.mjs';
import {appendAutoAcceptedLoss}                                      from '../../services/memory-core/helpers/acceptedLossAuditStore.mjs';
import {getAcceptedLossAuditFilePath}                                from '../../services/memory-core/helpers/acceptedLossAuditStore.mjs';
import {writeAutoAcceptedLossState}                                  from '../../services/memory-core/helpers/acceptedLossAuditStore.mjs';

/**
 * @summary Defragments collection groups inside the unified ChromaDB store.
 *
 * This script rewrites collection groups to eliminate HNSW index fragmentation and file bloat within
 * ChromaDB. Knowledge Base and Memory Core share one unified persist directory, while the target controls
 * which logical collections are eligible for rewrite. KB uses shadow/parking promotion; MC currently fails
 * closed until a safe multi-collection promotion exists.
 *
 * ## Peer Architecture
 *
 * This script and `ai/scripts/maintenance/backup.mjs` are **peer scripts with orthogonal responsibilities**.
 * Defrag does NOT call the canonical backup orchestrator — it retains its own private pre-nuke
 * physical-copy snapshot (step 1 below). The rationale:
 *
 * - `backup.mjs` captures current state as portable JSONL via the `ai/services.mjs` SDK boundary
 * - Defrag needs a *fast* pre-nuke snapshot that preserves exact HNSW index state, which a
 *   physical directory copy provides but a JSONL export does not
 * - Delegation between the two would re-create the discoverability failure this separation solves
 *
 * Operators who want compacted backups compose at the shell layer: `npm run ai:defrag-kb && npm run ai:backup`.
 *
 * ## The Shadow-Promote Strategy
 *
 * 1.  **Pre-Rewrite Snapshot (Defrag-Internal Safety)**: Before any rewrite operation, a full physical copy
 *     of the database folder is created via `fs.copy()`. This preserves exact HNSW index state for instant
 *     restore if the shadow-promotion ETL fails mid-flight. Snapshots live at `dist/chromadb-backups/<target>/`
 *     and are explicitly NOT the canonical backup — that lives at `.neo-ai-data/backups/backup-<ts>/` via
 *     `ai/scripts/maintenance/backup.mjs`. Automated retention: keep last 3, delete others older than 7 days.
 * 2.  **Extract (ETL)**: All data (IDs, embeddings, metadata, documents) is fetched from every collection in the
 *     selected collection group into an in-memory buffer.
 * 3.  **Shadow Load**: A process-unique shadow collection is created and loaded with the extracted data.
 * 4.  **Promote**: The live KB collection is renamed to parking, the shadow is renamed to the canonical name,
 *     then the parked old collection is deleted only after the canonical replacement validates.
 * 5.  **Cleanup (Physical)**: The filesystem is scanned for orphaned segment directories — UUID dirs absent
 *     from the live segment registry (`chroma.sqlite3` `segments` table) — which are physically deleted. The
 *     keep-set is the *segment* registry (on-disk dirs are segment-named), spanning the whole shared store,
 *     never a single target's collection ids.
 *
 * This is not an SQLite FTS5 integrity repair. If `pragma quick_check` reports malformed full-text search
 * indexes, use the dedicated integrity-repair lane instead of collection defrag.
 *
 * Usage:
 * `node ai/scripts/maintenance/defragChromaDB.mjs --target knowledge-base`
 * `node ai/scripts/maintenance/defragChromaDB.mjs --target memory-core` (fails closed until safe)
 *
 * @module ai.scripts.maintenance.defragChromaDB
 * @see ai/scripts/maintenance/backup.mjs   Canonical JSONL bundle backup orchestrator (peer, not dependency)
 * @see Neo.ai.mcp.server.knowledge-base.Config
 * @see Neo.ai.mcp.server.memory-core.Config
 * @see https://github.com/neomjs/neo/issues/10129
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
export const LOCAL_AI_CONFIG_FILE = path.join(PROJECT_ROOT, 'ai', 'config.mjs');
const DEFRAG_STATE_DIR = path.join(PROJECT_ROOT, '.neo-ai-data', 'maintenance', 'defrag-state');
const MEMORY_CORE_UNSAFE_MESSAGE  =
    'Memory Core defrag is disabled until a safe multi-collection shadow/parking promotion exists. ' +
    'MC is an irreplaceable store; use backup/restore or a purpose-built repair lane instead of delete/recreate defrag.';
const ACCEPTED_LOSS_STATE_SCHEMA_VERSION = 1;

registerNeoChromaEmbeddingFunctions({
    dummyEmbeddingFunction: AiConfig.dummyEmbeddingFunction
});

// Configuration Mapping
// Maps CLI target names to their collection-group config files. Both targets resolve
// to the same unified Chroma persist dir; only the collection set differs.
export const TARGETS = {
    'knowledge-base': {
        configPath: '../../mcp/server/knowledge-base/config.mjs',
        adapt     : (cfg) => ({
            host       : cfg.host,
            path       : cfg.path,
            port       : cfg.port,
            collections: [cfg.collectionName]
        })
    },
    'memory-core'   : {
        configPath: '../../mcp/server/memory-core/config.mjs',
        adapt     : (cfg) => ({
            host             : cfg.engines.chroma.host,
            path             : cfg.engines.chroma.dataDir,
            port             : cfg.engines.chroma.port,
            embeddingProvider: cfg.embeddingProvider,
            collections      : [
                cfg.collections.memory,
                cfg.collections.session,
                cfg.collections.graph
            ].filter(Boolean)
        })
    }
};

/**
 * Dynamically loads and adapts the configuration for the specified target.
 *
 * @param {String} targetName - The name of the target (e.g., 'knowledge-base').
 * @returns {Promise<Object>} The adapted configuration object {host, path, port, collections}.
 * @throws {Error} If the target is unknown or the config cannot be loaded.
 */
async function loadConfig(targetName) {
    const targetDef = TARGETS[targetName];
    if (!targetDef) {
        throw new Error(`Unknown target: ${targetName}. Valid targets: ${Object.keys(TARGETS).join(', ')}`);
    }

    const configAbsPath = path.resolve(__dirname, targetDef.configPath);
    console.log(`📖 Loading config from: ${configAbsPath}`);

    try {
        const module = await import(configAbsPath);
        return targetDef.adapt(module.default);
    } catch (e) {
        throw new Error(`Failed to load config for ${targetName}: ${e.message}`);
    }
}

/**
 * Loads the gitignored Tier-1 AI config for operator-run scripts when present.
 * @param {Object} [options]
 * @param {String} [options.configPath=LOCAL_AI_CONFIG_FILE] Config path.
 * @param {Object} [options.aiConfig=AiConfig] Config singleton.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<Object>}
 */
export async function loadTopLevelAiConfig({
    configPath = LOCAL_AI_CONFIG_FILE,
    aiConfig   = AiConfig,
    fsModule   = fs
} = {}) {
    if (!await fsModule.pathExists(configPath)) {
        return {loaded: false, configPath};
    }

    await aiConfig.load(configPath);

    return {loaded: true, configPath};
}

/**
 * Resolves defrag snapshot retention from Tier-1 AI maintenance config.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Tier-1 AI config.
 * @returns {Object}
 */
export function resolveDefragSnapshotRetention({
    aiConfig = AiConfig
} = {}) {
    return aiConfig.maintenance.defrag.snapshotRetention;
}

/**
 * Fails closed for target groups whose interruption safety is not yet proven. Memory Core is allowed
 * ONLY behind the explicit `allowMemoryCore` opt-in (the `--allow-memory-core` CLI flag), which routes
 * it through the dedicated full-enumeration repair path — never the KB delete/recreate defrag.
 *
 * @param {Object} options
 * @param {String} options.targetName CLI target name.
 * @param {Boolean} [options.allowMemoryCore=false] Explicit opt-in to the Memory Core repair path.
 * @returns {void}
 */
export function assertDefragTargetSupported({targetName, allowMemoryCore = false} = {}) {
    if (targetName === 'memory-core' && !allowMemoryCore) {
        const error = new Error(MEMORY_CORE_UNSAFE_MESSAGE);
        error.code  = 'DEFRAG_MEMORY_CORE_UNSAFE';
        throw error
    }
}

/**
 * Creates a Chroma collection name that the KB ChromaManager recognizes as an
 * active swap artifact for `shadow` / `parking` phases.
 *
 * @param {String} collectionName Canonical collection name.
 * @param {String} phase Swap phase suffix.
 * @param {Object} [options]
 * @param {Number} [options.timestamp=Date.now()] Stable run timestamp.
 * @param {String} [options.uuid=crypto.randomUUID()] Unique suffix.
 * @returns {String}
 */
export function createSwapCollectionName(collectionName, phase, {
    timestamp = Date.now(),
    uuid      = crypto.randomUUID()
} = {}) {
    return `${collectionName}-${phase}-${timestamp}-${uuid}`
}

/**
 * Resolves the durable state marker for an in-flight defrag promotion.
 *
 * @param {Object} options
 * @param {String} options.targetName CLI target name.
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repository root.
 * @returns {String}
 */
export function resolveDefragStatePath({
    targetName,
    projectRoot = PROJECT_ROOT
} = {}) {
    const stateDir = projectRoot === PROJECT_ROOT
        ? DEFRAG_STATE_DIR
        : path.join(projectRoot, '.neo-ai-data', 'maintenance', 'defrag-state');

    return path.join(stateDir, `${targetName}.json`)
}

/**
 * Refuses to run over an incomplete previous promotion unless its phase is explicitly resumable.
 *
 * @param {Object} options
 * @param {String} options.statePath State marker path.
 * @param {String[]} [options.allowedPhases=[]] Incomplete phases the caller knows how to resume.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<Object|undefined>} Existing resumable state, when allowed.
 */
export async function assertNoIncompleteDefragState({statePath, allowedPhases = [], fsModule = fs} = {}) {
    if (!await fsModule.pathExists(statePath)) {
        return
    }

    const state = await fsModule.readJson(statePath);

    if (allowedPhases.includes(state.phase)) {
        return state
    }

    const error = new Error(
        `Incomplete Chroma defrag state found at ${statePath}. ` +
        `Phase '${state.phase}' for target '${state.targetName || 'unknown'}' must be recovered or cleared before rerun.`
    );
    error.code  = 'DEFRAG_INCOMPLETE_STATE';
    error.state = state;
    throw error
}

/**
 * Writes the durable defrag phase marker.
 *
 * @param {Object} options
 * @param {String} options.statePath State marker path.
 * @param {Object} options.state Serializable state payload.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<void>}
 */
export async function writeDefragState({statePath, state, fsModule = fs} = {}) {
    await fsModule.ensureDir(path.dirname(statePath));
    await fsModule.writeJson(statePath, {
        ...state,
        updatedAt: new Date().toISOString()
    }, {spaces: 2})
}

/**
 * Clears the durable defrag phase marker after canonical validation succeeds.
 *
 * @param {Object} options
 * @param {String} options.statePath State marker path.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<void>}
 */
export async function clearDefragState({statePath, fsModule = fs} = {}) {
    await fsModule.remove(statePath)
}

/**
 * Manages backup retention.
 * Policy: Keep the newest `keepMinimum` snapshots, delete older extras after `maxDays`.
 *
 * @param {String} backupDir - The directory containing backups.
 * @param {Object} [retention] Retention policy.
 * @param {Number} [retention.keepMinimum=3] Newest snapshots retained unconditionally.
 * @param {Number} [retention.maxDays=7] Extra snapshots older than this are removed.
 */
export async function cleanOldBackups(backupDir, retention = resolveDefragSnapshotRetention()) {
    try {
        if (!await fs.pathExists(backupDir)) return;

        const keepMinimum = Number.isInteger(retention?.keepMinimum) ? retention.keepMinimum : 3;
        const maxDays     = Number.isFinite(retention?.maxDays) ? retention.maxDays : 7;

        const entries = await fs.readdir(backupDir, {withFileTypes: true});
        const backups = entries
            .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
            .map(e => {
                const parts = e.name.split('-');
                // timestamp is the last part
                const timestamp = parseInt(parts[parts.length - 1]);
                return {
                    name: e.name,
                    path: path.join(backupDir, e.name),
                    time: timestamp
                };
            })
            // Filter out any filenames that didn't match the parsing logic
            .filter(b => !isNaN(b.time))
            .sort((a, b) => b.time - a.time); // Newest first

        const toCheck = backups.slice(keepMinimum);
        const cutoff  = Date.now() - (maxDays * 24 * 60 * 60 * 1000);

        for (const backup of toCheck) {
            if (backup.time < cutoff) {
                console.log(`   🗑️  Removing old backup: ${backup.name}`);
                await fs.remove(backup.path);
            }
        }
    } catch (e) {
        console.warn(`   ⚠️  Backup cleanup failed (non-critical): ${e.message}`);
    }
}

/**
 * Recursively calculates the size of a directory in bytes.
 *
 * @param {String} dir - The directory path.
 * @returns {Promise<Number>} The total size in bytes.
 */
async function getDirSize(dir) {
    const files = await fs.readdir(dir, {withFileTypes: true});
    let   size  = 0;

    for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
            size += await getDirSize(filePath);
        } else {
            const stats = await fs.stat(filePath);
            size += stats.size;
        }
    }
    return size;
}

/**
 * Runs the SQLite VACUUM command on the chroma.sqlite3 file.
 * This is critical for reclaiming disk space after mass deletions.
 *
 * @param {String} dbDir - The directory containing chroma.sqlite3.
 */
function vacuumSqlite(dbDir) {
    const sqlitePath = path.join(dbDir, 'chroma.sqlite3');
    if (fs.existsSync(sqlitePath)) {
        console.log(`   🧹 Running SQLite VACUUM on ${sqlitePath}...`);
        try {
            execSync(`sqlite3 "${sqlitePath}" "VACUUM;"`, {stdio: 'inherit'});
            console.log(`   ✅ VACUUM complete.`);
        } catch (e) {
            console.warn(`   ⚠️  VACUUM failed (sqlite3 CLI might be missing?): ${e.message}`);
        }
    } else {
        console.log(`   ℹ️  No chroma.sqlite3 found to vacuum.`);
    }
}

/**
 * Resolves the set of live Chroma segment ids registered in a persist dir's
 * `chroma.sqlite3`. On-disk UUID directories are named by *segment* id (VECTOR /
 * METADATA), which is a disjoint UUID space from *collection* id — so the segment
 * registry, not recreated collection ids, is the authoritative keep-set for physical
 * orphan cleanup. In the unified topology a single persist dir is shared across all
 * subsystems, so the keep-set must span the whole instance, never one target.
 *
 * @param {Object} options
 * @param {String} options.dbPath Persist dir containing `chroma.sqlite3`.
 * @param {Function} [options.execFn=execSync] `child_process.execSync` seam (testing).
 * @returns {Set<String>} Live segment ids; empty when no sqlite is present.
 */
export function resolveLiveSegmentIds({dbPath, execFn = execSync} = {}) {
    const sqlitePath = path.join(dbPath, 'chroma.sqlite3');

    if (!fs.existsSync(sqlitePath)) {
        return new Set();
    }

    const raw = execFn(`sqlite3 "${sqlitePath}" "SELECT id FROM segments;"`, {
        encoding : 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });

    return new Set(raw.split('\n').map(line => line.trim()).filter(Boolean));
}

/**
 * Removes orphaned segment directories: on-disk UUID dirs whose name is not a live
 * segment id. Preserves every live segment dir (across all collections) and any
 * non-UUID entry. This is the unified-store-safe keep-set; the prior collection-id
 * keep-set matched zero segment dirs and deleted live HNSW indices on next restart.
 *
 * @param {Object} options
 * @param {String} options.dbPath Persist dir to scan.
 * @param {Set<String>} options.liveSegmentIds Authoritative keep-set of live segment ids.
 * @param {Object} [options.fsModule=fs] `fs-extra` seam (testing).
 * @param {Function} [options.log=console.log] Log seam (testing).
 * @returns {Promise<{kept: String[], removed: String[]}>}
 */
export async function cleanOrphanedSegmentDirs({dbPath, liveSegmentIds, fsModule = fs, log = console.log}) {
    const kept    = [];
    const removed = [];
    const entries = await fsModule.readdir(dbPath, {withFileTypes: true});

    for (const entry of entries) {
        // UUIDv4 heuristic (36 chars, contains hyphen) guards non-segment system entries.
        if (!entry.isDirectory() || entry.name.length !== 36 || !entry.name.includes('-')) {
            continue;
        }

        if (liveSegmentIds.has(entry.name)) {
            kept.push(entry.name);
            log(`   ✨ Keeping live segment: ${entry.name}`);
        } else {
            removed.push(entry.name);
            log(`   🗑️  Deleting orphan: ${entry.name}`);
            await fsModule.remove(path.join(dbPath, entry.name));
        }
    }

    return {kept, removed};
}

/**
 * Normalizes Chroma document payloads for collection re-insertion.
 *
 * @param {Array} documents Chroma document values.
 * @returns {String[]}
 */
export function sanitizeDocuments(documents = []) {
    return documents.map(d => {
        if (d == null)             return '';
        if (typeof d === 'object') return JSON.stringify(d);
        return String(d)
    })
}

/**
 * Adds extracted collection data into a replacement collection in batches.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle.
 * @param {Object} options.data Extracted `{ids, embeddings, metadatas, documents}`.
 * @param {Number} [options.batchSize=1000] Chroma add batch size.
 * @param {Function} [options.writeProgress=process.stdout.write.bind(process.stdout)] Progress sink.
 * @param {Function} [options.log=console.log] Log sink.
 * @returns {Promise<void>}
 */
export async function addCollectionData({
    collection,
    data,
    batchSize     = 1000,
    writeProgress = process.stdout.write.bind(process.stdout),
    log           = console.log
} = {}) {
    const total = data.ids.length;

    for (let i = 0; i < total; i += batchSize) {
        const end = Math.min(i + batchSize, total);
        writeProgress(`     Upserting ${i} to ${end}... `);

        await collection.add({
            ids       : data.ids.slice(i, end),
            embeddings: data.embeddings.slice(i, end),
            metadatas : data.metadatas.slice(i, end),
            documents : sanitizeDocuments(data.documents.slice(i, end))
        });
        log('✅');
    }
}

/**
 * Validates that a rewritten collection is readable before promotion / completion.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle.
 * @param {Object} options.data Extracted source data.
 * @param {String} options.collectionName Collection name for diagnostics.
 * @returns {Promise<{count: Number}>}
 */
export async function validateLoadedCollection({collection, data, collectionName} = {}) {
    const expected = data.ids.length;
    const count    = await collection.count();

    if (count !== expected) {
        throw new Error(`Collection '${collectionName}' validation failed: expected ${expected} rows, found ${count}.`)
    }

    if (expected > 0) {
        const sampleId = data.ids[0];
        const sample   = await collection.get({ids: [sampleId], include: []});

        if (!sample.ids?.includes(sampleId)) {
            throw new Error(`Collection '${collectionName}' validation failed: sample id '${sampleId}' was not readable.`)
        }
    }

    return {count}
}

/**
 * Lists all ids in a collection without requesting embeddings.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle.
 * @param {Number} [options.batchSize=2000] Chroma get page size.
 * @returns {Promise<String[]>}
 */
export async function listCollectionIds({collection, batchSize = 2000} = {}) {
    const ids    = [];
    let   offset = 0;

    while (true) {
        const batch    = await collection.get({limit: batchSize, offset, include: []});
        const batchIds = batch.ids || [];

        if (batchIds.length === 0) {
            break;
        }

        ids.push(...batchIds);
        offset += batchSize;

        if (batchIds.length < batchSize) {
            break;
        }
    }

    return ids
}

/**
 * Validates a loaded replacement collection without holding full source vectors in memory.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle.
 * @param {String[]} options.ids Expected source ids.
 * @param {String} options.collectionName Collection name for diagnostics.
 * @returns {Promise<{count: Number}>}
 */
export async function validateLoadedCollectionByIds({collection, ids = [], collectionName} = {}) {
    const expected = ids.length;
    const count    = await collection.count();

    if (count !== expected) {
        throw new Error(`Collection '${collectionName}' validation failed: expected ${expected} rows, found ${count}.`)
    }

    if (expected > 0) {
        const sampleId = ids[0];
        const sample   = await collection.get({ids: [sampleId], include: []});

        if (!sample.ids?.includes(sampleId)) {
            throw new Error(`Collection '${collectionName}' validation failed: sample id '${sampleId}' was not readable.`)
        }
    }

    return {count}
}

/**
 * Rewrites one canonical collection through a shadow/parking promotion. The
 * canonical name remains live while the shadow loads; the only absent-canonical
 * window is the bounded live->parking / shadow->canonical rename pair, where
 * active `shadow` / `parking` names make KB healthcheck fail closed instead of
 * creating an empty canonical collection.
 *
 * @param {Object} options
 * @param {Object} options.client Chroma client.
 * @param {String} options.collectionName Canonical collection name.
 * @param {Object} options.data Extracted source data.
 * @param {Object} options.embeddingFunction Chroma embedding function.
 * @param {String} options.statePath Durable state marker path.
 * @param {Object} [options.stateBase] Stable fields written into every phase marker.
 * @param {Number} [options.timestamp=Date.now()] Stable run timestamp.
 * @param {Function} [options.uuidFactory=crypto.randomUUID] Unique id factory.
 * @param {Function} [options.log=console.log] Log sink.
 * @param {Function} [options.warn=console.warn] Warning sink.
 * @param {Function} [options.writeProgress] Progress sink.
 * @returns {Promise<Object>}
 */
export async function rewriteCollectionViaShadowPromotion({
    client,
    collectionName,
    data,
    embeddingFunction,
    statePath,
    stateBase     = {},
    timestamp     = Date.now(),
    uuidFactory   = crypto.randomUUID,
    log           = console.log,
    warn          = console.warn,
    writeProgress
} = {}) {
    const shadowName  = createSwapCollectionName(collectionName, 'shadow',  {timestamp, uuid: uuidFactory()});
    const parkingName = createSwapCollectionName(collectionName, 'parking', {timestamp, uuid: uuidFactory()});
    const sourceCount = data.ids.length;
    const baseState   = {
        ...stateBase,
        collectionName,
        sourceCount,
        shadowName,
        parkingName
    };

    let shadowCollection;
    let liveCollection;
    let liveParked     = false;
    let shadowPromoted = false;
    let parkingDeleted = false;

    await writeDefragState({statePath, state: {...baseState, phase: 'creating-shadow'}});

    shadowCollection = await client.createCollection({
        name    : shadowName,
        embeddingFunction,
        metadata: {"hnsw:space": "cosine"}
    });

    try {
        await writeDefragState({statePath, state: {...baseState, phase: 'shadow-loading'}});
        await addCollectionData({collection: shadowCollection, data, writeProgress, log});
        await validateLoadedCollection({collection: shadowCollection, data, collectionName: shadowName});
        await writeDefragState({statePath, state: {...baseState, phase: 'shadow-loaded'}});

        liveCollection = await client.getCollection({
            name             : collectionName,
            embeddingFunction
        });

        await liveCollection.modify({name: parkingName});
        liveParked = true;
        await writeDefragState({statePath, state: {...baseState, phase: 'live-parked'}});

        await shadowCollection.modify({name: collectionName});
        shadowPromoted = true;
        await writeDefragState({statePath, state: {...baseState, phase: 'shadow-promoted'}});

        const canonicalCollection = await client.getCollection({
            name             : collectionName,
            embeddingFunction
        });
        await validateLoadedCollection({collection: canonicalCollection, data, collectionName});
        await writeDefragState({statePath, state: {...baseState, phase: 'canonical-validated'}});

        try {
            await client.deleteCollection({name: parkingName});
            parkingDeleted = true;
            await writeDefragState({statePath, state: {...baseState, phase: 'parking-deleted'}});
        } catch (error) {
            warn(`   ⚠️  Could not delete parked pre-defrag collection '${parkingName}': ${error.message}`);
        }

        return {
            collectionName,
            shadowName,
            parkingName,
            sourceCount,
            parkingDeleted
        }
    } catch (error) {
        if (liveParked && !shadowPromoted && liveCollection) {
            try {
                await liveCollection.modify({name: collectionName});
                await writeDefragState({statePath, state: {...baseState, phase: 'live-rollback-complete'}});
            } catch (rollbackError) {
                warn(`   ⚠️  Failed to roll back parked collection '${parkingName}': ${rollbackError.message}`);
            }
        }

        if (!shadowPromoted && shadowCollection?.modify) {
            try {
                const failedShadowName = createSwapCollectionName(collectionName, 'failed-shadow', {
                    timestamp,
                    uuid: uuidFactory()
                });
                await shadowCollection.modify({name: failedShadowName});
                await writeDefragState({
                    statePath,
                    state: {
                        ...baseState,
                        phase           : 'shadow-parked-after-failure',
                        failedShadowName
                    }
                });
            } catch (shadowError) {
                warn(`   ⚠️  Failed to park shadow collection '${shadowName}': ${shadowError.message}`);
            }
        }

        throw error
    }
}

/**
 * Promotes an already loaded shadow collection to the canonical name.
 *
 * Memory Core repair uses this after streaming recovered batches durably into a resumable
 * shadow collection. The shadow-loading phase is restartable; the bounded rename phase is
 * deliberately not auto-resumed because the live canonical name may have been parked.
 *
 * Retained-parking lifecycle: when `deleteParking` is false (the partial-promotion path, where
 * recovered rows are promoted but unrecoverable rows remain), the pre-promotion source is renamed to
 * a timestamped, uuid-suffixed parking collection (`<collectionName>-parking-<timestamp>-<uuid>`) and
 * KEPT as a recovery asset instead of being deleted; a `parking-retained` state marker records its
 * `parkingName` so an operator can inspect the unrecoverable residue and delete it after recovery.
 * Because each partial run mints a fresh parking name, repeated partial repairs accumulate distinct
 * parking collections — they are bounded by operator cleanup, not auto-pruned. A defrag or cleanup
 * pass must therefore treat a `parking-retained` source as live recovery state, never as orphaned clutter.
 *
 * @param {Object} options
 * @param {Object} options.client Chroma client.
 * @param {String} options.collectionName Canonical collection name.
 * @param {Object} options.shadowCollection Loaded shadow collection handle.
 * @param {String} options.shadowName Loaded shadow collection name.
 * @param {String[]} options.sourceIds Expected source ids.
 * @param {Object} options.embeddingFunction Chroma embedding function.
 * @param {String} options.statePath Durable state marker path.
 * @param {Object} [options.stateBase] Stable fields written into every phase marker.
 * @param {Boolean} [options.deleteParking=true] When true, delete the parked source after the promoted collection validates; when false (partial promotion), retain it as a recovery asset and write a `parking-retained` state marker.
 * @param {Number} [options.timestamp=Date.now()] Stable run timestamp.
 * @param {Function} [options.uuidFactory=crypto.randomUUID] Unique id factory.
 * @param {Function} [options.writeStateFn=writeDefragState] State writer seam.
 * @param {Function} [options.warn=console.warn] Warning sink.
 * @returns {Promise<Object>}
 */
export async function promoteLoadedShadowCollection({
    client,
    collectionName,
    shadowCollection,
    shadowName,
    sourceIds,
    embeddingFunction,
    statePath,
    stateBase   = {},
    deleteParking = true,
    timestamp   = Date.now(),
    uuidFactory = crypto.randomUUID,
    writeStateFn = writeDefragState,
    warn        = console.warn
} = {}) {
    const parkingName = createSwapCollectionName(collectionName, 'parking', {timestamp, uuid: uuidFactory()});
    const sourceCount = sourceIds.length;
    const baseState   = {
        ...stateBase,
        collectionName,
        sourceCount,
        shadowName,
        parkingName
    };

    let liveCollection;
    let liveParked     = false;
    let shadowPromoted = false;
    let parkingDeleted = false;

    await validateLoadedCollectionByIds({collection: shadowCollection, ids: sourceIds, collectionName: shadowName});
    await writeStateFn({statePath, state: {...baseState, phase: 'memory-core-repair-shadow-loaded'}});

    try {
        liveCollection = await client.getCollection({
            name             : collectionName,
            embeddingFunction
        });

        await liveCollection.modify({name: parkingName});
        liveParked = true;
        await writeStateFn({statePath, state: {...baseState, phase: 'live-parked'}});

        await shadowCollection.modify({name: collectionName});
        shadowPromoted = true;
        await writeStateFn({statePath, state: {...baseState, phase: 'shadow-promoted'}});

        const canonicalCollection = await client.getCollection({
            name             : collectionName,
            embeddingFunction
        });
        await validateLoadedCollectionByIds({collection: canonicalCollection, ids: sourceIds, collectionName});
        await writeStateFn({statePath, state: {...baseState, phase: 'canonical-validated'}});

        if (deleteParking) {
            try {
                await client.deleteCollection({name: parkingName});
                parkingDeleted = true;
                await writeStateFn({statePath, state: {...baseState, phase: 'parking-deleted'}});
            } catch (error) {
                warn(`   ⚠️  Could not delete parked pre-defrag collection '${parkingName}': ${error.message}`);
            }
        } else {
            await writeStateFn({statePath, state: {...baseState, phase: 'parking-retained'}});
        }

        return {
            collectionName,
            shadowName,
            parkingName,
            sourceCount,
            parkingDeleted
        }
    } catch (error) {
        if (liveParked && !shadowPromoted && liveCollection) {
            try {
                await liveCollection.modify({name: collectionName});
                await writeStateFn({statePath, state: {...baseState, phase: 'live-rollback-complete'}});
            } catch (rollbackError) {
                warn(`   ⚠️  Failed to roll back parked collection '${parkingName}': ${rollbackError.message}`);
            }
        }

        throw error
    }
}

/**
 * @summary Selects the coverage row that belongs to the live Chroma collection.
 *
 * Chroma snapshots can contain stale duplicate collection-name rows even when `listCollections()`
 * exposes only one active collection. Name-only pairing can then feed ids from a stale row into
 * the active collection repair. Single rows remain the normal path; duplicate names must match
 * the live collection id or fail before any shadow promotion is attempted.
 *
 * @param {Object} options
 * @param {String} options.collectionName Collection name being repaired.
 * @param {Object[]} [options.coverageRows=[]] Audit rows with matching collection names.
 * @param {String} [options.liveCollectionId] Collection id returned by `client.getCollection`.
 * @returns {Object}
 */
function selectMemoryCoreRepairCoverageRow({
    collectionName,
    coverageRows = [],
    liveCollectionId
} = {}) {
    if (coverageRows.length === 1) {
        return coverageRows[0];
    }

    if (!liveCollectionId) {
        throw new Error(`repairMemoryCoreCollectionsViaFullEnumeration: '${collectionName}' has ${coverageRows.length} coverage rows, but the live collection id is unavailable — refusing name-only repair.`);
    }

    const match = coverageRows.find(row => row.collectionId === liveCollectionId);

    if (!match) {
        const ids = coverageRows.map(row => row.collectionId || '(missing-id)').join(', ');
        throw new Error(`repairMemoryCoreCollectionsViaFullEnumeration: '${collectionName}' has duplicate coverage rows, but none match live collection id '${liveCollectionId}' (coverage ids: ${ids}) — refusing ambiguous repair.`);
    }

    return match
}

/**
 * @summary Repairs one Memory Core collection through a resumable shadow-load phase.
 *
 * Recovered batches are added to the shadow collection immediately, then the state marker records
 * the loaded count. If the process crashes, the next run lists the shadow ids and skips them during
 * extraction/re-embedding instead of starting the provider work from zero.
 *
 * @param {Object} options
 * @param {Object} options.client Chroma client.
 * @param {String} options.collectionName Canonical collection name.
 * @param {Object} options.collection Live canonical collection handle.
 * @param {String[]} options.allIds Full source ids from metadata enumeration.
 * @param {String[]} options.missingVectorIds Ids missing from the vector index.
 * @param {Function} options.embedFn Re-embedder.
 * @param {Object} options.embeddingFunction Chroma embedding function.
 * @param {String} options.statePath Durable defrag state path.
 * @param {Object} [options.stateBase={}] Stable state fields.
 * @param {Object|null} [options.resumeState=null] Previously allowed resumable state.
 * @param {Function} [options.extractFn=extractMemoryCoreCollectionData] Extraction seam.
 * @param {Function} [options.addDataFn=addCollectionData] Shadow add seam.
 * @param {Function} [options.listIdsFn=listCollectionIds] Collection id listing seam.
 * @param {Function} [options.promoteLoadedFn=promoteLoadedShadowCollection] Promotion seam.
 * @param {Function} [options.writeStateFn=writeDefragState] State writer seam.
 * @param {Number} [options.timestamp=Date.now()] Stable run timestamp.
 * @param {Function} [options.uuidFactory=crypto.randomUUID] Unique id factory.
 * @param {Function} [options.log=console.log] Log sink.
 * @returns {Promise<Object>} Repair result.
 */
export async function repairMemoryCoreCollectionViaResumableShadow({
    client,
    collectionName,
    collection,
    allIds = [],
    missingVectorIds = [],
    embedFn,
    embeddingFunction,
    statePath,
    stateBase = {},
    resumeState = null,
    extractFn = extractMemoryCoreCollectionData,
    addDataFn = addCollectionData,
    listIdsFn = listCollectionIds,
    promoteLoadedFn = promoteLoadedShadowCollection,
    writeStateFn = writeDefragState,
    timestamp = Date.now(),
    uuidFactory = crypto.randomUUID,
    log = console.log
} = {}) {
    const sourceCount = allIds.length;
    const baseState   = {
        ...stateBase,
        collectionName,
        sourceCount
    };

    let shadowName       = resumeState?.shadowName;
    let shadowCollection = null;

    if (shadowName) {
        log(`   ♻️  '${collectionName}': resuming shadow load from '${shadowName}' (${resumeState.phase}).`);
        shadowCollection = await client.getCollection({name: shadowName, embeddingFunction});
    } else {
        shadowName = createSwapCollectionName(collectionName, 'shadow', {timestamp, uuid: uuidFactory()});
        await writeStateFn({statePath, state: {...baseState, phase: 'memory-core-repair-shadow-creating', shadowName}});
        shadowCollection = await client.createCollection({
            name    : shadowName,
            embeddingFunction,
            metadata: {"hnsw:space": "cosine"}
        });
    }

    const shadowIds = await listIdsFn({collection: shadowCollection});
    const sourceSet = new Set(allIds);
    const extraIds  = shadowIds.filter(id => !sourceSet.has(id));

    if (extraIds.length > 0) {
        throw new Error(`repairMemoryCoreCollectionViaResumableShadow: shadow '${shadowName}' contains ${extraIds.length} id(s) not present in source '${collectionName}' (first: '${extraIds[0]}') — refusing ambiguous resume.`);
    }

    const skipIds     = shadowIds.filter(id => sourceSet.has(id));
    let   loadedCount = skipIds.length;

    await writeStateFn({
        statePath,
        state: {
            ...baseState,
            phase: 'memory-core-repair-shadow-loading',
            shadowName,
            loadedCount
        }
    });

    const {unrecoverable, counts} = await extractFn({
        collection,
        allIds,
        missingVectorIds,
        embedFn,
        skipIds,
        collectData: false,
        onDataBatch: async (batchData, event = {}) => {
            await addDataFn({
                collection   : shadowCollection,
                data         : batchData,
                writeProgress: () => {},
                log          : () => {}
            });

            loadedCount += batchData.ids.length;

            await writeStateFn({
                statePath,
                state: {
                    ...baseState,
                    phase : 'memory-core-repair-shadow-loading',
                    shadowName,
                    loadedCount,
                    counts: event.counts
                }
            });
        },
        onProgress: event => log(formatMemoryCoreRepairProgress({collectionName, event}))
    });

    if (unrecoverable.length > 0) {
        const recoveredIds = await listIdsFn({collection: shadowCollection});

        if (recoveredIds.length > 0) {
            await writeStateFn({
                statePath,
                state: {
                    ...baseState,
                    phase               : 'memory-core-repair-shadow-loaded',
                    partial             : true,
                    shadowName,
                    loadedCount,
                    recoveredCount      : recoveredIds.length,
                    unrecoverableCount  : unrecoverable.length,
                    unrecoverablePreview: unrecoverable.slice(0, 20),
                    unrecoverable,
                    counts
                }
            });

            log(`   🚚 '${collectionName}': partial shadow promotion starting for ${recoveredIds.length}/${sourceCount} recovered row(s); ${unrecoverable.length} unrecoverable row(s) stay in parked source...`);
            const promotion = await promoteLoadedFn({
                client,
                collectionName,
                shadowCollection,
                shadowName,
                sourceIds    : recoveredIds,
                embeddingFunction,
                statePath,
                stateBase,
                deleteParking: false,
                writeStateFn
            });
            log(`   ⚠️  '${collectionName}': partial shadow promotion complete; parked source retained as '${promotion.parkingName}'.`);

            return {
                collectionName,
                partialPromoted: true,
                promotion,
                unrecoverable,
                counts,
                shadowName,
                loadedCount,
                recoveredCount : recoveredIds.length,
                sourceCount
            }
        }

        await writeStateFn({
            statePath,
            state: {
                ...baseState,
                phase               : 'memory-core-repair-aborted',
                shadowName,
                loadedCount,
                unrecoverableCount  : unrecoverable.length,
                unrecoverablePreview: createUnrecoverablePreview(unrecoverable),
                counts
            }
        });

        return {
            collectionName,
            aborted: true,
            unrecoverable,
            counts,
            shadowName,
            loadedCount,
            sourceCount
        }
    }

    await writeStateFn({
        statePath,
        state: {
            ...baseState,
            phase: 'memory-core-repair-shadow-loaded',
            shadowName,
            loadedCount,
            counts
        }
    });

    log(`   🚚 '${collectionName}': shadow promotion starting for ${loadedCount} recovered row(s)...`);
    const promotion = await promoteLoadedFn({
        client,
        collectionName,
        shadowCollection,
        shadowName,
        sourceIds: allIds,
        embeddingFunction,
        statePath,
        stateBase,
        writeStateFn
    });
    log(`   ✅ '${collectionName}': shadow promotion complete.`);

    return {
        collectionName,
        promotion,
        counts,
        shadowName,
        loadedCount,
        sourceCount
    }
}

/**
 * @summary Repairs Memory Core collections' missing stored-embeddings via FULL (uncapped) enumeration,
 * then promotes the recovered data through the existing shadow-promotion path.
 *
 * MC cannot use the KB extract path — `collection.get({include:['embeddings']})` throws "Error finding id"
 * for the missing-vector rows. This orchestration instead, per MC collection:
 *   1. enumerates the FULL metadata-id vs vector-index-id drift (uncapped — `auditChromaVectorCoverage`
 *      with `includeFullIds`, NOT the sampled coverage audit);
 *   2. extracts intact rows with their stored vectors and RE-EMBEDS the missing-vector rows from their
 *      still-materializing documents (`extractMemoryCoreCollectionData`);
 *   3. streams recovered batches into a resumable shadow collection, then promotes that loaded shadow.
 *
 * Fail-loud: a collection with unrecoverable rows promotes recovered rows only when the shadow already
 * contains recoverable data, retains the parked source, and returns a non-clean partial result. It aborts
 * only when there is no recoverable shadow to promote. The seams (`auditFn` / `extractFn` /
 * `repairCollectionFn` / `clearStateFn` / `writeStateFn`) are injectable for unit isolation.
 *
 * State-marker lifecycle: the mutating repair writes durable per-phase markers, so a fully successful repair
 * CLEARS the marker (`clearStateFn`) before returning — else the next run aborts as DEFRAG_INCOMPLETE_STATE.
 * An aborted repair rewrites an explicit `memory-core-repair-aborted` marker (`writeStateFn`) with the active
 * shadow name. A partial-promoted repair rewrites `memory-core-repair-partial-promoted` with the retained
 * parking collection and full unrecoverable manifest.
 *
 * This function is INERT until wired behind the explicit `--allow-memory-core` opt-in; the default
 * `assertDefragTargetSupported` fail-closed stands until then.
 *
 * @param {Object} options
 * @param {Object} options.client Chroma client.
 * @param {String[]} options.collections MC collection names to repair.
 * @param {String} options.snapshotPath SQLite metadata snapshot path (the full-id enumeration source).
 * @param {String} options.persistDir HNSW persist dir (the vector-index-id source).
 * @param {Function} options.embedFn `documents -> embeddings` re-embedder (e.g. TextEmbeddingService.embedTexts).
 * @param {Object} options.embeddingFunction Chroma embedding function (dummy, for raw-vector moves).
 * @param {String} options.statePath Durable defrag-state marker path.
 * @param {Object} [options.stateBase={}] Stable fields written into every phase marker.
 * @param {Boolean} [options.dryRun=false] True extracts/re-embeds and reports counts without shadow promotion or state-marker writes.
 * @param {Function} [options.auditFn=auditChromaVectorCoverage] Enumeration seam (test injection).
 * @param {Function} [options.extractFn=extractMemoryCoreCollectionData] Extract + re-embed seam.
 * @param {Function} [options.repairCollectionFn=repairMemoryCoreCollectionViaResumableShadow] Mutating repair seam.
 * @param {Object|null} [options.resumeState=null] Resumable defrag state returned by `assertNoIncompleteDefragState`.
 * @param {Function} [options.clearStateFn=clearDefragState] Clears the durable marker on a fully successful repair.
 * @param {Function} [options.writeStateFn=writeDefragState] Rewrites explicit non-clean repair markers.
 * @param {Function} [options.log=console.log] Log sink.
 * @returns {Promise<{results: Object[]}>} Per collection: `{collectionName, promotion, counts}` on success,
 *   `{collectionName, dryRun: true, counts}` on clean dry-run,
 *   `{collectionName, partialPromoted: true, unrecoverable, counts}` when recovered rows were promoted but
 *   unrecoverable rows remain, or `{collectionName, aborted: true, unrecoverable, counts}` when fail-loud
 *   aborts the promotion/report.
 */
export async function repairMemoryCoreCollectionsViaFullEnumeration({
    client,
    collections,
    snapshotPath,
    persistDir,
    embedFn,
    embeddingFunction,
    statePath,
    stateBase = {},
    dryRun    = false,
    auditFn      = auditChromaVectorCoverage,
    extractFn    = extractMemoryCoreCollectionData,
    repairCollectionFn = repairMemoryCoreCollectionViaResumableShadow,
    resumeState  = null,
    clearStateFn = clearDefragState,
    writeStateFn = writeDefragState,
    log          = console.log
} = {}) {
    log(`   🔎 Enumerating Memory Core metadata/vector coverage for ${collections.length} collection(s)...`);
    const coverage = await auditFn({
        snapshotPath,
        persistDir,
        collectionNames: collections,
        includeFullIds : true
    });
    log(`   ✅ Coverage enumeration complete (${coverage.collections.length} coverage row(s)).`);
    const results = [];

    if (!dryRun && resumeState && (!resumeState.collectionName || !resumeState.shadowName)) {
        throw new Error(`repairMemoryCoreCollectionsViaFullEnumeration: resumable state phase '${resumeState.phase}' is missing collectionName or shadowName; manual recovery is required before rerun.`);
    }

    const resumeCollectionIndex = resumeState?.collectionName ? collections.indexOf(resumeState.collectionName) : -1;

    if (resumeState?.collectionName && resumeCollectionIndex === -1) {
        throw new Error(`repairMemoryCoreCollectionsViaFullEnumeration: resumable state targets '${resumeState.collectionName}', which is not in this run's collection list (${collections.join(', ')}).`);
    }

    for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex++) {
        const collectionName = collections[collectionIndex];

        if (!dryRun && resumeCollectionIndex > -1 && collectionIndex < resumeCollectionIndex) {
            log(`   ♻️  '${collectionName}': skipping collection before resumable state target '${resumeState.collectionName}'.`);
            continue;
        }

        const
            coverageRows = coverage.collections.filter(entry => entry.name === collectionName),
            collection   = await client.getCollection({name: collectionName, embeddingFunction});

        if (coverageRows.length === 0) {
            throw new Error(`repairMemoryCoreCollectionsViaFullEnumeration: no coverage row for '${collectionName}' — refusing to promote a collection the enumeration never saw.`);
        }

        const cov = selectMemoryCoreRepairCoverageRow({
            collectionName,
            coverageRows,
            liveCollectionId: collection.id
        });

        log(`   📦 '${collectionName}': metadata=${cov.metadataRowCount ?? cov.allIds?.length ?? 0}, vector=${cov.vectorIndexIdCount ?? cov.vectorIds?.length ?? 0}, missing=${cov.missingFromVectorCount ?? cov.missingVectorIds?.length ?? 0}, extra=${cov.extraInVectorCount ?? cov.extraVectorIds?.length ?? 0}`);

        const {allIds, missingVectorIds} = cov;

        if (dryRun) {
            const {unrecoverable, counts} = await extractFn({
                collection,
                allIds,
                missingVectorIds,
                embedFn,
                onProgress: event => log(formatMemoryCoreRepairProgress({collectionName, event}))
            });

            if (unrecoverable.length > 0) {
                log(`   ⚠️  '${collectionName}': DRY-RUN found ${unrecoverable.length} unrecoverable row(s) — no promotion attempted. Reasons: ${formatUnrecoverablePreview(unrecoverable)}. Counts: ${JSON.stringify(counts)}`);
                results.push({collectionName, dryRun: true, aborted: true, unrecoverable, counts});
                continue;
            }

            log(`   🧪 '${collectionName}': DRY-RUN extraction/re-embed succeeded; no promotion attempted. Counts: ${JSON.stringify(counts)}`);
            results.push({collectionName, dryRun: true, counts});
            continue;
        }

        const result = await repairCollectionFn({
            client,
            collectionName,
            collection,
            allIds,
            missingVectorIds,
            embedFn,
            embeddingFunction,
            statePath,
            stateBase,
            resumeState: resumeState?.collectionName === collectionName ? resumeState : null,
            extractFn,
            writeStateFn,
            log
        });

        if (result.aborted) {
            log(`   ⚠️  '${collectionName}': ${result.unrecoverable.length} unrecoverable row(s) — aborting before promotion, but keeping resumable shadow '${result.shadowName}'. Reasons: ${formatUnrecoverablePreview(result.unrecoverable)}. Counts: ${JSON.stringify(result.counts)}`);
            results.push(result);
            break;
        }

        if (result.partialPromoted) {
            log(`   ⚠️  '${collectionName}': partial repair promoted ${result.recoveredCount}/${result.sourceCount} recovered row(s); ${result.unrecoverable.length} unrecoverable row(s) remain in retained parking '${result.promotion?.parkingName}'. Counts: ${JSON.stringify(result.counts)}`);
        }

        results.push(result);
    }

    // State-marker lifecycle (mirrors the KB path's end-of-run clearDefragState): rewriteCollectionViaShadowPromotion
    // wrote durable per-phase markers, so a fully successful repair MUST clear the marker — else the next run aborts
    // as DEFRAG_INCOMPLETE_STATE. Aborted/partial repairs instead rewrite explicit non-clean markers, preserving
    // either the active shadow resume handle or the retained parking collection + unrecoverable manifest.
    if (statePath && !dryRun) {
        if (anyRepairNonClean(results)) {
            const activeNonClean            = results.find(result => result.aborted || result.partialPromoted),
                  unrecoverableByCollection = Object.fromEntries(
                      results
                          .filter(result => result.aborted || result.partialPromoted)
                          .map(result => [result.collectionName, result.unrecoverable || []])
                  );

            await writeStateFn({statePath, state: {
                ...stateBase,
                phase               : activeNonClean?.partialPromoted ? 'memory-core-repair-partial-promoted' : 'memory-core-repair-aborted',
                collectionName      : activeNonClean?.collectionName,
                shadowName          : activeNonClean?.shadowName,
                parkingName         : activeNonClean?.promotion?.parkingName,
                sourceCount         : activeNonClean?.sourceCount,
                loadedCount         : activeNonClean?.loadedCount,
                recoveredCount      : activeNonClean?.recoveredCount,
                unrecoverableCount  : activeNonClean?.unrecoverable?.length,
                unrecoverablePreview: createUnrecoverablePreview(activeNonClean?.unrecoverable),
                unrecoverable       : activeNonClean?.unrecoverable || [],
                unrecoverableByCollection,
                aborted             : results.filter(result => result.aborted).map(result => result.collectionName),
                partialPromoted     : results.filter(result => result.partialPromoted).map(result => result.collectionName),
                promoted            : results.filter(result => result.promotion).map(result => result.collectionName)
            }});
        } else {
            await clearStateFn({statePath});
        }
    }

    return {results};
}

/**
 * @summary Formats progress events from Memory Core repair extraction for operator terminals.
 * @param {Object} options
 * @param {String} options.collectionName Collection currently being repaired.
 * @param {Object} options.event Progress event emitted by `extractMemoryCoreCollectionData`.
 * @param {Date|String|Number} [options.now=new Date()] Timestamp source for log correlation.
 * @returns {String}
 */
export function formatMemoryCoreRepairProgress({collectionName, event, now = new Date()} = {}) {
    const counts    = event.counts || {},
          timestamp = new Date(now).toISOString();

    switch (event.phase) {
        case 'start':
            return `   [${timestamp}] ⏳ '${collectionName}': extraction starting (total=${event.total}, intact=${counts.intact || 0}, reEmbedded=${counts.reEmbedded || 0}, unrecoverable=${counts.unrecoverable || 0})`;
        case 'intact-extract':
            return `   [${timestamp}] ⏳ '${collectionName}': intact-vector extraction ${event.percent}% (${event.processed}/${event.total}; intact=${counts.intact || 0})`;
        case 'missing-reembed':
            return `   [${timestamp}] ⏳ '${collectionName}': missing-vector re-embed ${event.percent}% (${event.processed}/${event.total}; reEmbedded=${counts.reEmbedded || 0}, unrecoverable=${counts.unrecoverable || 0})`;
        case 'complete':
            return `   [${timestamp}] ✅ '${collectionName}': extraction complete; counts ${JSON.stringify(counts)}`;
        default:
            return `   [${timestamp}] ⏳ '${collectionName}': ${event.phase || 'progress'} ${event.percent ?? '?'}% (${event.processed ?? '?'}/${event.total ?? '?'})`;
    }
}

/**
 * @summary Normalizes structured and legacy unrecoverable entries for state/log consumers.
 * @param {String|Object} entry Unrecoverable row entry.
 * @returns {Object} Structured unrecoverable row entry.
 */
export function normalizeUnrecoverableEntry(entry) {
    if (entry && typeof entry === 'object') {
        const normalized = {
            id    : String(entry.id ?? ''),
            reason: entry.reason || 'unknown'
        };

        if (entry.message) {
            normalized.message = String(entry.message);
        }

        return normalized
    }

    return {
        id    : String(entry),
        reason: 'unknown'
    }
}

/**
 * @summary Creates the bounded structured preview stored in defrag abort state markers.
 * @param {Array<String|Object>} [entries=[]] Unrecoverable rows.
 * @param {Number} [limit=20] Maximum preview entries.
 * @returns {Object[]} Structured unrecoverable row entries.
 */
export function createUnrecoverablePreview(entries = [], limit = 20) {
    return entries.slice(0, limit).map(entry => normalizeUnrecoverableEntry(entry))
}

/**
 * @summary Formats a bounded operator-facing unrecoverable reason preview for terminal logs.
 * @param {Array<String|Object>} [entries=[]] Unrecoverable rows.
 * @param {Object} [options]
 * @param {Number} [options.limit=5] Maximum entries to include inline.
 * @returns {String}
 */
export function formatUnrecoverablePreview(entries = [], {limit = 5} = {}) {
    const preview = createUnrecoverablePreview(entries, limit);

    if (preview.length === 0) {
        return 'none'
    }

    const formatted = preview.map(entry => {
        const message = entry.message ? `: ${entry.message}` : '';
        return `${entry.id} (${entry.reason}${message})`
    });

    if (entries.length > preview.length) {
        formatted.push(`+${entries.length - preview.length} more`);
    }

    return formatted.join('; ')
}

/**
 * @summary True when any repair result is non-clean (aborted or partial-promoted).
 *
 * The CLI must exit non-zero for both classes: aborted means no promotion happened; partial-promoted means
 * recovered rows were promoted durably, but unrecoverable rows remain in a retained parked source. That
 * non-zero exit is the immune-system signal of record: the process supervisor observes the failed maintenance
 * run and escalates it to an operator page, while the retained parked source stays available for
 * unrecoverable-residue inspection.
 *
 * This is the single operator-facing fail-loud predicate; it subsumes the older aborted-only check, because an
 * aborted OR partial-promoted collection is never a clean repair. It mirrors the KB extractionErrors /
 * hasRestoreErrors discipline rather than reporting success on a non-clean repair.
 *
 * @param {Object[]} [results=[]] Per-collection results from `repairMemoryCoreCollectionsViaFullEnumeration`.
 * @returns {Boolean}
 */
export function anyRepairNonClean(results = []) {
    return results.some(result => result?.aborted === true || result?.partialPromoted === true);
}

/**
 * @summary Applies the AUTONOMOUS accepted-loss settlement over a non-clean repair result set and — when EVERY
 * non-clean collection self-settles — resolves the durable defrag state marker so the next maintenance pass is
 * not blocked as `DEFRAG_INCOMPLETE_STATE`. A clean process exit is not enough: the repair already wrote a
 * `memory-core-repair-partial-promoted` / `-aborted` marker, so a settled run must clear it or the next run aborts.
 *
 * Pure orchestration over injected I/O (`appendFn` / `clearFn`): runs `resolveAutonomousRepairExit`; if
 * `allSettled`, carries each collection's retained-parking context into the durable `auto-accepted-loss` audit
 * record (the audit log becomes the inspection surface that replaces the cleared marker), appends it, then clears
 * the marker. Zero operator-ack, no runtime escalate. Returns `{settled:false}` (no mutation) when any collection
 * is heal-path / systemic-fault, so the caller keeps the loud non-clean exit.
 *
 * @param {Object} options
 * @param {Object[]} options.results Per-collection repair results.
 * @param {String} options.statePath The defrag state-marker path (cleared on full settlement).
 * @param {String} options.auditDir The durable audit-log directory.
 * @param {Function} [options.normalizeResidue=normalizeUnrecoverableEntry]
 * @param {String} [options.provider='']
 * @param {Number|String} [options.contextBudget='']
 * @param {String} [options.strategyVersion=AiConfig.memoryRepair.strategyVersion]
 * @param {Function} [options.appendFn=appendAutoAcceptedLoss] Audit-append seam (test injection).
 * @param {Function} [options.writeAcceptedLossStateFn=writeAutoAcceptedLossState] Latest-state marker seam.
 * @param {Function} [options.clearFn=clearDefragState] Marker-clear seam (test injection).
 * @param {Function} [options.writeLog] Optional logger, called with the settled-collection count.
 * @param {Function} [options.now] Injectable timestamp factory for deterministic tests.
 * @returns {Promise<Object>} `{settled, perCollection}` — `settled` true iff every non-clean collection auto-settled and the marker was cleared.
 */
export async function applyAutonomousSettlement({
    results,
    statePath,
    auditDir,
    normalizeResidue = normalizeUnrecoverableEntry,
    provider         = '',
    contextBudget    = '',
    strategyVersion  = AiConfig.memoryRepair.strategyVersion,
    appendFn         = appendAutoAcceptedLoss,
    writeAcceptedLossStateFn = writeAutoAcceptedLossState,
    clearFn          = clearDefragState,
    now              = () => new Date().toISOString(),
    writeLog
} = {}) {
    const settleExit = resolveAutonomousRepairExit({results, normalizeResidue, provider, contextBudget, strategyVersion});

    if (!settleExit.allSettled) {
        return {settled: false, perCollection: settleExit.perCollection};
    }

    const settledCollections = [];

    for (const entry of settleExit.perCollection) {
        const result     = (Array.isArray(results) ? results : []).find(item => item?.collectionName === entry.collectionName),
              auditEntry = {...entry.auditRecord, collectionName: entry.collectionName, parkingName: result?.promotion?.parkingName ?? null};

        await appendFn(auditEntry, {dir: auditDir});

        settledCollections.push({
            collectionName: entry.collectionName,
            reasonCode    : entry.reasonCode,
            fingerprint   : auditEntry.fingerprint,
            acceptedIds   : auditEntry.acceptedIds,
            residueCount  : auditEntry.residueCount,
            collectionSize: auditEntry.collectionSize,
            parkingName   : auditEntry.parkingName
        });
    }

    await writeAcceptedLossStateFn({
        schemaVersion  : ACCEPTED_LOSS_STATE_SCHEMA_VERSION,
        type           : 'auto-accepted-loss-state',
        phase          : 'memory-core-repair-recovered-with-accepted-loss',
        settledAt      : now(),
        auditPath      : getAcceptedLossAuditFilePath(auditDir),
        defragStatePath: statePath,
        collectionCount: settledCollections.length,
        collections    : settledCollections
    }, {dir: auditDir});

    // Resolve the non-clean marker the repair wrote — the run is now genuinely settled across runs, not just for
    // this process's exit code.
    await clearFn({statePath});

    writeLog?.(settleExit.perCollection.length);

    return {settled: true, perCollection: settleExit.perCollection};
}

/**
 * Main execution function for the defragmentation process.
 *
 * It orchestrates the Snapshot -> Extract -> Shadow Load -> Promote -> Cleanup pipeline.
 *
 * Key details:
 * - Uses a dummy embedding function to bypass ChromaDB's validation when moving raw embeddings.
 * - Fails closed for Memory Core until safe multi-collection promotion exists.
 * - Implements batch processing for memory efficiency during the restore phase.
 * - Uses heuristics (UUIDv4 pattern matching) to identify orphaned directories safely.
 *
 * @async
 * @returns {Promise<void>}
 * @keywords chromadb, maintenance, defragmentation, memory-core, knowledge-base, optimization
 */
async function defragChromaDB() {
    program
        .name('defragChromaDB')
        .description('Defragment ChromaDB instances by rewriting data and cleaning orphaned files.')
        .requiredOption('-t, --target <name>', 'Database target (knowledge-base, memory-core)')
        .option('--allow-memory-core', 'Opt in to the Memory Core repair-defrag path (default: fails closed)')
        .option('--dry-run', 'For memory-core, run full enumeration/extraction report without shadow promotion')
        .parse(process.argv);

    const options    = program.opts();
    const targetName = options.target;

    console.log(`🧹 Starting Defragmentation for target: ${targetName}`);

    try {
        await loadTopLevelAiConfig();

        const config    = await loadConfig(targetName);
        const statePath = resolveDefragStatePath({targetName});

        assertDefragTargetSupported({targetName, allowMemoryCore: options.allowMemoryCore});
        const resumeState = await assertNoIncompleteDefragState({
            statePath,
            allowedPhases: targetName === 'memory-core' && options.allowMemoryCore ? [
                'memory-core-repair-shadow-loading',
                'memory-core-repair-shadow-loaded',
                'memory-core-repair-aborted'
            ] : []
        });

        const DB_PATH = config.path;

        if (!DB_PATH) {
            throw new Error(`Config for ${targetName} is missing a valid 'path' property.`);
        }

        console.log(`   📂 Database Path: ${DB_PATH}`);
        console.log(`   🔌 Host: ${config.host}:${config.port}`);
        console.log(`   📚 Collections: ${config.collections.join(', ')}`);

        // 0. Validation
        if (!await fs.pathExists(DB_PATH)) {
            console.error(`❌ Database path not found: ${DB_PATH}`);
            process.exit(1);
        }

        // 0.1 Initial Size Check
        const initialSize = await getDirSize(DB_PATH);
        console.log(`   📊 Initial Size: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);

        // 1. Pre-Nuke Snapshot (Defrag-Internal Safety)
        // Fast physical copy preserving exact HNSW index state. This is defrag-exclusive —
        // it is NOT the canonical backup. For portable JSONL snapshots see `ai/scripts/maintenance/backup.mjs`.
        // Peer architecture: neither script calls the other.
        const timestamp  = Date.now();
        const backupRoot = path.resolve(PROJECT_ROOT, 'dist', 'chromadb-backups', targetName);
        const backupName = `backup-${timestamp}`;
        const backupPath = path.join(backupRoot, backupName);

        console.log(`\n1️⃣  Creating pre-nuke snapshot at ${backupPath}...`);
        await fs.ensureDir(backupRoot);
        await fs.copy(DB_PATH, backupPath);
        console.log(`   ✅ Pre-nuke snapshot created (defrag-exclusive, not the canonical backup).`);

        // 1.1 Cleanup Old Backups
        await cleanOldBackups(backupRoot, resolveDefragSnapshotRetention());

        // 2. Connect
        console.log(`\n2️⃣  Connecting to ChromaDB...`);
        const client = new ChromaClient({
            host: config.host,
            port: config.port
        });

        // Dummy embedding function — single source of truth: Tier-1 AiConfig.dummyEmbeddingFunction.
        // Satisfies the Chroma client for raw embeddings without re-generating via a provider.
        const dummyEf = AiConfig.dummyEmbeddingFunction;

        // 2.5 Memory Core repair-defrag path (explicit --allow-memory-core opt-in).
        // MC cannot use the KB extract/promote below — its missing-vector rows throw on stored-embedding
        // export — so it runs the dedicated full-enumeration repair (extract intact + re-embed missing)
        // against the pre-nuke snapshot, then shadow-promotes the recovered data. The orchestration clears the
        // defrag state marker on clean success (or rewrites an explicit aborted marker on a partial repair)
        // before this branch returns ahead of the KB path.
        if (targetName === 'memory-core') {
            const dryRun = options.dryRun === true;

            console.log(dryRun
                ? `\n3️⃣  Memory Core repair-defrag DRY-RUN: full-enumeration extract + re-embed report (no shadow promotion)...`
                : `\n3️⃣  Memory Core repair-defrag: full-enumeration extract + re-embed + shadow-promote...`);
            const {default: TextEmbeddingService} = await import('../../services/memory-core/TextEmbeddingService.mjs');
            // Prevent oversized-document data loss: truncate each document to the embedding token budget so a
            // document that exceeds the provider context recovers with a (slightly lossy) vector instead of
            // falling out of recovery as unrecoverable. The safe-budget leaf is read at the use site.
            const embedBudgetTokens = AiConfig.localModels.embedding.safeProcessingLimitTokens;
            const {results}         = await repairMemoryCoreCollectionsViaFullEnumeration({
                client,
                collections      : config.collections,
                snapshotPath     : path.join(backupPath, 'chroma.sqlite3'),
                persistDir       : backupPath,
                embedFn          : docs => TextEmbeddingService.embedTexts(docs.map(doc => truncateToEmbedTokenBudget(doc, embedBudgetTokens)), config.embeddingProvider),
                embeddingFunction: dummyEf,
                statePath,
                stateBase        : {targetName},
                dryRun,
                resumeState
            });

            for (const result of results) {
                console.log(result.aborted
                    ? `   ⚠️  ${result.collectionName}: ${dryRun ? 'DRY-RUN WOULD ABORT' : 'ABORTED'} — ${result.unrecoverable.length} unrecoverable row(s); counts ${JSON.stringify(result.counts)}`
                    : result.partialPromoted
                        ? `   ⚠️  ${result.collectionName}: PARTIAL PROMOTED — ${result.recoveredCount}/${result.sourceCount} recovered row(s), ${result.unrecoverable.length} unrecoverable row(s), parked source retained at ${result.promotion?.parkingName}; counts ${JSON.stringify(result.counts)}`
                        : dryRun
                            ? `   🧪 ${result.collectionName}: dry-run report clean; no promotion; counts ${JSON.stringify(result.counts)}`
                            : `   ✅ ${result.collectionName}: repaired + promoted; counts ${JSON.stringify(result.counts)}`);
            }

            const finalSize = await getDirSize(DB_PATH);
            console.log(`   📊 Final Size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

            // Fail loud at the operator boundary: non-clean repair work is NOT a successful repair
            // (mirrors the KB extractionErrors / hasRestoreErrors -> process.exit(1) discipline below).
            if (anyRepairNonClean(results)) {
                // Autonomous accepted-loss settlement (zero operator-ack, no runtime escalate): when EVERY
                // non-clean collection's residue is bounded AND deterministically-terminal, self-settle it —
                // record a durable audit entry per collection AND clear the non-clean defrag marker (so the next
                // run is not blocked as DEFRAG_INCOMPLETE_STATE), then exit clean with no human. Transient residue
                // (heal-path → the data-recovery actuator) or a systemic-fault (mass terminal = a misconfigured
                // embedder, frozen) keeps the loud non-clean exit below.
                if (!dryRun) {
                    const settlement = await applyAutonomousSettlement({
                        results,
                        statePath,
                        auditDir     : path.dirname(statePath),
                        provider     : config.embeddingProvider,
                        contextBudget: embedBudgetTokens,
                        writeLog     : settledCount => console.log(`   ♻️  Autonomous accepted-loss: all ${settledCount} non-clean collection(s) held only bounded, deterministically-terminal residue — settled + recorded to ${path.join(path.dirname(statePath), 'auto-accepted-loss.jsonl')} and ${path.join(path.dirname(statePath), 'auto-accepted-loss-state.json')}, and the defrag marker cleared so the next run is unblocked. No operator page; zero ack.`)
                    });

                    if (settlement.settled) {
                        return;
                    }
                }

                const abortedNames  = results.filter(result => result.aborted).map(result => result.collectionName),
                      partialNames  = results.filter(result => result.partialPromoted).map(result => result.collectionName),
                      nonCleanNames = [...abortedNames, ...partialNames];
                console.error(dryRun
                    ? `❌ Memory Core repair dry-run found unrecoverable rows for ${abortedNames.join(', ')} — no promotion was attempted; resolve the unrecoverable rows before running the mutating repair. Counts and reasons logged above.`
                    : `❌ Memory Core repair non-clean for ${nonCleanNames.join(', ')} (aborted: ${abortedNames.join(', ') || 'none'}; partial-promoted: ${partialNames.join(', ') || 'none'}) — recovered rows are durable where partial-promoted, but this is NOT a successful repair. Resolve unrecoverable rows using the retained parking/source state. Counts and reasons logged above.`);
                process.exit(1);
            }
            return;
        }

        // 3. Extract All Data (Multi-Collection)
        console.log(`\n3️⃣  Fetching data from all collections...`);
        const buffer           = {};
        let   extractionErrors = false;

        for (const colName of config.collections) {
            console.log(`   Processing collection: ${colName}`);
            try {
                const collection = await client.getCollection({
                    name             : colName,
                    embeddingFunction: dummyEf
                });

                const count = await collection.count();
                console.log(`     Found ${count} items.`);

                const colData = {ids: [], embeddings: [], metadatas: [], documents: []};

                // 3.1 Fetch all IDs first (avoids HNSW index to prevent "Error finding id")
                const allIds = [];
                let   offset = 0;
                while (true) {
                    const batch = await collection.get({limit: 2000, offset, include: []});
                    if (batch.ids.length === 0) break;
                    allIds.push(...batch.ids);
                    offset += 2000;
                    if (batch.ids.length < 2000) break;
                }

                console.log(`     Fetched ${allIds.length} IDs. Now extracting data...`);

                // 3.2 Fetch full data in chunks, with graceful fallback for corrupted embeddings
                const chunkSize = 500;
                for (let i = 0; i < allIds.length; i += chunkSize) {
                    const chunk = allIds.slice(i, i + chunkSize);
                    process.stdout.write(`     Extracting data for IDs ${i} to ${i + chunk.length}... `);
                    try {
                        const batchData = await collection.get({
                            ids    : chunk,
                            include: ['embeddings', 'metadatas', 'documents']
                        });
                        colData.ids.push(...batchData.ids);
                        colData.embeddings.push(...batchData.embeddings);
                        colData.metadatas.push(...batchData.metadatas);
                        colData.documents.push(...batchData.documents);
                        console.log('ok');
                    } catch (e) {
                        console.log(`\n     ⚠️ Chunk failed (${e.message}). Falling back to item-by-item extraction...`);
                        let rescued = 0;
                        for (const id of chunk) {
                            try {
                                const singleData = await collection.get({
                                    ids    : [id],
                                    include: ['embeddings', 'metadatas', 'documents']
                                });
                                if (singleData.ids.length > 0) {
                                    colData.ids.push(...singleData.ids);
                                    colData.embeddings.push(...singleData.embeddings);
                                    colData.metadatas.push(...singleData.metadatas);
                                    colData.documents.push(...singleData.documents);
                                    rescued++;
                                }
                            } catch (err) {
                                // Silently skip corrupted ghost entries to avoid log spam
                            }
                        }
                        console.log(`     ✅ Rescued ${rescued} items. Skipped ${chunk.length - rescued} corrupted ghost entries.`);
                    }
                }

                buffer[colName] = colData;
            } catch (e) {
                console.warn(`     ⚠️ Could not fetch collection ${colName} (might not exist yet): ${e.message}`);
                extractionErrors = true;
                buffer[colName]  = null; // Mark as empty/missing
            }
        }

        if (extractionErrors) {
            console.error('❌ Critical errors during extraction. Aborting before destructive actions.');
            process.exit(1);
        }

        // 4. Shadow Load + Promote
        // Load a replacement collection first, then perform the bounded live->parking /
        // shadow->canonical rename pair. The canonical collection is never deleted up-front.
        console.log(`\n4️⃣  Rewriting Collections via Shadow Promotion...`);
        let hasRestoreErrors = false;

        for (const colName of config.collections) {
            try {
                const data = buffer[colName];
                if (!data || data.ids.length === 0) {
                    console.log(`   Skipping ${colName} (No data)`);
                    continue;
                }

                console.log(`   Rewriting ${colName}...`);
                const result = await rewriteCollectionViaShadowPromotion({
                    client,
                    collectionName   : colName,
                    data,
                    embeddingFunction: dummyEf,
                    statePath,
                    stateBase        : {
                        targetName,
                        dbPath      : DB_PATH,
                        snapshotPath: backupPath,
                        startedAt   : new Date(timestamp).toISOString()
                    }
                });

                console.log(`     Promoted ${result.shadowName} to ${colName}.`);
                if (result.parkingDeleted) {
                    console.log(`     Deleted parked pre-defrag collection ${result.parkingName}.`);
                } else {
                    console.warn(`     Parked pre-defrag collection remains for manual cleanup: ${result.parkingName}.`);
                }
            } catch (e) {
                console.error(`❌ Failed to restore ${colName}: ${e.message}`);
                hasRestoreErrors = true;
            }
        }

        if (hasRestoreErrors) {
            console.error('\n⚠️ Completed with errors in some collections.');
            process.exit(1);
        }

        await clearDefragState({statePath});

        // 5. Cleanup (Physical)
        // Keep-set is the authoritative live-SEGMENT-id registry, not the recreated
        // collection ids: on-disk UUID dirs are segment-named (disjoint from collection
        // ids), and the unified store shares one persist dir across subsystems, so a
        // collection-id / single-target keep-set deletes live data.
        console.log(`\n5️⃣  Cleaning up orphaned segment directories...`);
        const liveSegmentIds = resolveLiveSegmentIds({dbPath: DB_PATH});
        console.log(`   Live segments: ${liveSegmentIds.size}`);

        const {kept, removed} = await cleanOrphanedSegmentDirs({dbPath: DB_PATH, liveSegmentIds});
        console.log(`   Kept ${kept.length} live segment dirs; removed ${removed.length} orphans.`);

        // 6. Vacuum (SQLite)
        console.log(`\n6️⃣  Vacuuming SQLite Database...`);
        vacuumSqlite(DB_PATH);

        console.log(`\n🎉 Defragmentation Complete!`);

        // Final Size Check & Reporting
        const finalSize        = await getDirSize(DB_PATH);
        const reduction        = initialSize - finalSize;
        const reductionPercent = initialSize > 0 ? (reduction / initialSize) * 100 : 0;

        console.log(`   📉 Initial Size : ${(initialSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   📉 Final Size   : ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   🔥 Reduction    : ${(reduction / 1024 / 1024).toFixed(2)} MB (${reductionPercent.toFixed(1)}%)`);

    } catch (e) {
        console.error(`\n❌ Fatal Error: ${e.message}`);
        console.error(e.stack);
        process.exit(1);
    }
}

/**
 * Runs the standalone defrag CLI under the shared heavy-maintenance lease.
 *
 * The exported defrag implementation remains lease-free for tests and controlled
 * module callers. Only direct CLI execution acquires the cross-process lease, so a
 * manually started defrag is visible to the orchestrator before other heavy tasks run.
 *
 * @param {Object} options
 * @param {Function} [options.runDefrag=defragChromaDB] Defrag implementation seam.
 * @param {Function} [options.withLease=withHeavyMaintenanceLease] Lease wrapper seam.
 * @param {Object} [options.output=console] Terminal sink.
 * @param {Function} [options.exit=process.exit] Exit hook.
 * @returns {Promise<*>}
 */
export async function runDefragChromaDBCli({
    runDefrag = defragChromaDB,
    withLease = withHeavyMaintenanceLease,
    output    = console,
    exit      = code => process.exit(code)
} = {}) {
    let outcome;

    try {
        outcome = await withLease(
            () => runDefrag(),
            {
                leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
                owner       : 'defrag',
                reason      : 'manual-cli',
                staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
                metadata    : {script: 'ai/scripts/maintenance/defragChromaDB.mjs'}
            }
        );
    } catch (error) {
        output.error('❌ Defrag lease acquisition failed:', error);
        return exit(1)
    }

    if (outcome?.status === 'held') {
        const held = outcome.lease;
        output.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        output.log('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
        return exit(0)
    }

    return exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runDefragChromaDBCli();
}
