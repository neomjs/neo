import {program}                             from 'commander';
import {ChromaClient}                        from 'chromadb';
import {execSync}                            from 'child_process';
import crypto                                from 'crypto';
import fs                                    from 'fs-extra';
import path                                  from 'path';
import {fileURLToPath, pathToFileURL}        from 'url';
import Neo                                   from '../../../src/Neo.mjs';
import AiConfig                              from '../../config.mjs';
import {registerNeoChromaEmbeddingFunctions} from '../../services/shared/vector/chromaClientPrimitives.mjs';
import {auditChromaVectorCoverage}           from './checkChromaIntegrity.mjs';
import {extractMemoryCoreCollectionData}     from './repairMemoryCoreStoredEmbeddings.mjs';

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
 * Refuses to run over an incomplete previous promotion.
 *
 * @param {Object} options
 * @param {String} options.statePath State marker path.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<void>}
 */
export async function assertNoIncompleteDefragState({statePath, fsModule = fs} = {}) {
    if (!await fsModule.pathExists(statePath)) {
        return
    }

    const state = await fsModule.readJson(statePath);
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
 * @summary Repairs Memory Core collections' missing stored-embeddings via FULL (uncapped) enumeration,
 * then promotes the recovered data through the existing shadow-promotion path.
 *
 * MC cannot use the KB extract path — `collection.get({include:['embeddings']})` throws "Error finding id"
 * for the missing-vector rows. This orchestration instead, per MC collection:
 *   1. enumerates the FULL metadata-id vs vector-index-id drift (uncapped — `auditChromaVectorCoverage`
 *      with `includeFullIds`, NOT the sampled coverage audit);
 *   2. extracts intact rows with their stored vectors and RE-EMBEDS the missing-vector rows from their
 *      still-materializing documents (`extractMemoryCoreCollectionData`);
 *   3. promotes the recovered `{ids, embeddings, documents, metadatas}` through the shadow/parking promotion.
 *
 * Fail-loud: a collection with ANY unrecoverable row (document-less / metadata-absent) aborts its
 * own promotion with counts — never a silent partial promote. The seams (`auditFn` / `extractFn` /
 * `promoteFn` / `clearStateFn` / `writeStateFn`) are injectable for unit isolation.
 *
 * State-marker lifecycle: `promoteFn` writes durable per-phase markers, so a fully successful repair
 * CLEARS the marker (`clearStateFn`) before returning — else the next run aborts as DEFRAG_INCOMPLETE_STATE.
 * An aborted/partial repair instead rewrites an explicit `memory-core-repair-aborted` marker (`writeStateFn`)
 * so `assertNoIncompleteDefragState` blocks rerun with an accurate diagnostic, not a stale mid-phase marker.
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
 * @param {Function} [options.promoteFn=rewriteCollectionViaShadowPromotion] Shadow-promotion seam.
 * @param {Function} [options.clearStateFn=clearDefragState] Clears the durable marker on a fully successful repair.
 * @param {Function} [options.writeStateFn=writeDefragState] Rewrites the explicit aborted marker on a partial repair.
 * @param {Function} [options.log=console.log] Log sink.
 * @returns {Promise<{results: Object[]}>} Per collection: `{collectionName, promotion, counts}` on success,
 *   `{collectionName, dryRun: true, counts}` on clean dry-run, or
 *   `{collectionName, aborted: true, unrecoverable, counts}` when fail-loud aborts the promotion/report.
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
    promoteFn    = rewriteCollectionViaShadowPromotion,
    clearStateFn = clearDefragState,
    writeStateFn = writeDefragState,
    log          = console.log
} = {}) {
    const coverage = await auditFn({
        snapshotPath,
        persistDir,
        collectionNames: collections,
        includeFullIds : true
    });
    const results = [];

    for (const collectionName of collections) {
        const cov = coverage.collections.find(entry => entry.name === collectionName);
        if (!cov) {
            throw new Error(`repairMemoryCoreCollectionsViaFullEnumeration: no coverage row for '${collectionName}' — refusing to promote a collection the enumeration never saw.`);
        }

        const {allIds, missingVectorIds}    = cov,
              collection                    = await client.getCollection({name: collectionName, embeddingFunction}),
              {data, unrecoverable, counts} = await extractFn({collection, allIds, missingVectorIds, embedFn});

        if (dryRun) {
            if (unrecoverable.length > 0) {
                log(`   ⚠️  '${collectionName}': DRY-RUN found ${unrecoverable.length} unrecoverable row(s) (document-less / metadata-absent) — no promotion attempted. Counts: ${JSON.stringify(counts)}`);
                results.push({collectionName, dryRun: true, aborted: true, unrecoverable, counts});
                continue;
            }

            log(`   🧪 '${collectionName}': DRY-RUN extraction/re-embed succeeded; no promotion attempted. Counts: ${JSON.stringify(counts)}`);
            results.push({collectionName, dryRun: true, counts});
            continue;
        }

        // Fail-loud: never promote a collection that lost rows to unrecoverable extraction.
        if (unrecoverable.length > 0) {
            log(`   ⚠️  '${collectionName}': ${unrecoverable.length} unrecoverable row(s) (document-less / metadata-absent) — aborting its promotion, no silent drop. Counts: ${JSON.stringify(counts)}`);
            results.push({collectionName, aborted: true, unrecoverable, counts});
            continue;
        }

        const promotion = await promoteFn({client, collectionName, data, embeddingFunction, statePath, stateBase});
        results.push({collectionName, promotion, counts});
    }

    // State-marker lifecycle (mirrors the KB path's end-of-run clearDefragState): rewriteCollectionViaShadowPromotion
    // wrote durable per-phase markers, so a fully successful repair MUST clear the marker — else the next run aborts
    // as DEFRAG_INCOMPLETE_STATE. An aborted/partial repair instead rewrites an explicit aborted marker so
    // assertNoIncompleteDefragState blocks rerun with an accurate diagnostic, not a stale mid-phase marker.
    if (statePath && !dryRun) {
        if (anyRepairAborted(results)) {
            await writeStateFn({statePath, state: {
                ...stateBase,
                phase   : 'memory-core-repair-aborted',
                aborted : results.filter(result => result.aborted).map(result => result.collectionName),
                promoted: results.filter(result => result.promotion).map(result => result.collectionName)
            }});
        } else {
            await clearStateFn({statePath});
        }
    }

    return {results};
}

/**
 * @summary True when any repair result aborted (a collection with unrecoverable rows). The
 * operator-facing fail-loud predicate: an aborted collection is never a successful repair, so the
 * `--allow-memory-core` CLI path exits non-zero on it (mirrors the KB extractionErrors / hasRestoreErrors
 * discipline) rather than reporting success on a partial repair.
 *
 * @param {Object[]} [results=[]] Per-collection results from `repairMemoryCoreCollectionsViaFullEnumeration`.
 * @returns {Boolean}
 */
export function anyRepairAborted(results = []) {
    return results.some(result => result?.aborted === true);
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
        await assertNoIncompleteDefragState({statePath});

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
            const {results}                       = await repairMemoryCoreCollectionsViaFullEnumeration({
                client,
                collections      : config.collections,
                snapshotPath     : path.join(backupPath, 'chroma.sqlite3'),
                persistDir       : backupPath,
                embedFn          : docs => TextEmbeddingService.embedTexts(docs, config.embeddingProvider),
                embeddingFunction: dummyEf,
                statePath,
                stateBase        : {targetName},
                dryRun
            });

            for (const result of results) {
                console.log(result.aborted
                    ? `   ⚠️  ${result.collectionName}: ${dryRun ? 'DRY-RUN WOULD ABORT' : 'ABORTED'} — ${result.unrecoverable.length} unrecoverable row(s); counts ${JSON.stringify(result.counts)}`
                    : dryRun
                        ? `   🧪 ${result.collectionName}: dry-run report clean; no promotion; counts ${JSON.stringify(result.counts)}`
                        : `   ✅ ${result.collectionName}: repaired + promoted; counts ${JSON.stringify(result.counts)}`);
            }

            const finalSize = await getDirSize(DB_PATH);
            console.log(`   📊 Final Size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

            // Fail loud at the operator boundary: an aborted collection is NOT a successful repair
            // (mirrors the KB extractionErrors / hasRestoreErrors -> process.exit(1) discipline below).
            if (anyRepairAborted(results)) {
                const abortedNames = results.filter(result => result.aborted).map(result => result.collectionName);
                console.error(dryRun
                    ? `❌ Memory Core repair dry-run found unrecoverable rows for ${abortedNames.join(', ')} — no promotion was attempted; resolve the unrecoverable rows before running the mutating repair. Counts logged above.`
                    : `❌ Memory Core repair aborted for ${abortedNames.join(', ')} (unrecoverable rows) — NOT a successful repair; resolve the unrecoverable rows and re-run. Counts logged above.`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    defragChromaDB().then(() => {
        process.exit(0);
    });
}
