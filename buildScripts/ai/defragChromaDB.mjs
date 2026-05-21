import {program}       from 'commander';
import {ChromaClient}  from 'chromadb';
import {execSync}      from 'child_process';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import Neo             from '../../src/Neo.mjs';
import AiConfig        from '../../ai/config.template.mjs';

/**
 * @summary A generic CLI tool to defragment ChromaDB instances (Knowledge Base & Memory Core).
 *
 * This script implements the "Nuke and Pave" strategy to eliminate HNSW index fragmentation and file bloat
 * within ChromaDB. It is designed to be target-agnostic, capable of processing different database instances
 * (e.g., Knowledge Base, Memory Core) by dynamically loading their specific configurations.
 *
 * ## Peer Architecture (#10129)
 *
 * This script and `buildScripts/ai/backup.mjs` are **peer scripts with orthogonal responsibilities**.
 * Defrag does NOT call the canonical backup orchestrator — it retains its own private pre-nuke
 * physical-copy snapshot (step 1 below). The rationale is captured in #10129 Phase 3:
 *
 * - `backup.mjs` captures current state as portable JSONL via the `ai/services.mjs` SDK boundary
 * - Defrag needs a *fast* pre-nuke snapshot that preserves exact HNSW index state, which a
 *   physical directory copy provides but a JSONL export does not
 * - Delegation between the two would re-create the discoverability failure this separation solves
 *
 * Operators who want compacted backups compose at the shell layer: `npm run ai:defrag-kb && npm run ai:backup`.
 *
 * ## The "Nuke and Pave" Strategy
 *
 * 1.  **Pre-Nuke Snapshot (Defrag-Internal Safety)**: Before any destructive operation, a full physical copy
 *     of the database folder is created via `fs.copy()`. This preserves exact HNSW index state for instant
 *     restore if the nuke-and-pave ETL fails mid-flight. Snapshots live at `dist/chromadb-backups/<target>/`
 *     and are explicitly NOT the canonical backup — that lives at `.neo-ai-data/backups/backup-<ts>/` via
 *     `buildScripts/ai/backup.mjs`. Automated retention: keep last 3, delete others older than 7 days.
 * 2.  **Extract (ETL)**: All data (IDs, embeddings, metadata, documents) is fetched from *all* target collections
 *     into an in-memory buffer.
 * 3.  **Nuke (Logical Reset)**: The collections are deleted via the API. This releases the logical references to the data,
 *     marking the underlying index files as obsolete.
 * 4.  **Load (Restoration)**: The collections are recreated, and the buffered data is re-inserted in batches.
 *     This forces ChromaDB to rebuild the HNSW indices from scratch, resulting in a compact, defragmented state.
 * 5.  **Cleanup (Physical)**: The filesystem is scanned for orphaned UUID directories (leftover from previous
 *     fragmented states) that do not match the active collection IDs. These orphans are physically deleted.
 *
 * Usage:
 * `node buildScripts/defragChromaDB.mjs --target knowledge-base`
 * `node buildScripts/defragChromaDB.mjs --target memory-core`
 *
 * @module buildScripts/defragChromaDB
 * @see buildScripts/ai/backup.mjs   Canonical JSONL bundle backup orchestrator (peer, not dependency)
 * @see Neo.ai.mcp.server.knowledge-base.Config
 * @see Neo.ai.mcp.server.memory-core.Config
 * @see https://github.com/neomjs/neo/issues/10129
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const LOCAL_AI_CONFIG_FILE = path.join(PROJECT_ROOT, 'ai', 'config.mjs');

// Configuration Mapping
// Maps CLI target names to their respective config files and adapts the config structure
// to a unified format used by this script.
const TARGETS = {
    'knowledge-base': {
        configPath: '../../ai/mcp/server/knowledge-base/config.mjs',
        adapt: (cfg) => ({
            host       : cfg.host,
            path       : cfg.path,
            port       : cfg.port,
            collections: [cfg.collectionName]
        })
    },
    'memory-core'   : {
        configPath: '../../ai/mcp/server/memory-core/config.mjs',
        adapt: (cfg) => ({
            host       : cfg.engines.chroma.host,
            path       : cfg.engines.chroma.dataDir,
            port       : cfg.engines.chroma.port,
            collections: [cfg.collections.memory, cfg.collections.session]
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
    return aiConfig.maintenance?.defrag?.snapshotRetention || {};
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
    let size    = 0;

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
 * Main execution function for the defragmentation process.
 *
 * It orchestrates the Backup -> Extract -> Nuke -> Load -> Cleanup pipeline.
 *
 * Key details:
 * - Uses a dummy embedding function to bypass ChromaDB's validation when moving raw embeddings.
 * - Handles multiple collections per target (essential for Memory Core).
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
        .parse(process.argv);

    const options    = program.opts();
    const targetName = options.target;

    console.log(`🧹 Starting Defragmentation for target: ${targetName}`);

    try {
        await loadTopLevelAiConfig();

        const config  = await loadConfig(targetName);
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
        // it is NOT the canonical backup. For portable JSONL snapshots see `buildScripts/ai/backup.mjs`.
        // Peer architecture per #10129: neither script calls the other.
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

        // Dummy embedding function required by Chroma client to handle raw embeddings
        // without attempting to re-generate them via an external provider.
        const dummyEf = {
            generate   : () => null,
            name       : 'dummy',
            getConfig  : () => ({}),
            constructor: {buildFromConfig: () => ({generate: () => null})}
        };

        // 3. Extract All Data (Multi-Collection)
        console.log(`\n3️⃣  Fetching data from all collections...`);
        const buffer         = {};
        let extractionErrors = false;

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
                let offset   = 0;
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

        // 4. Nuke (Logical Delete)
        // Deleting the collection via API releases the logical locks on the index files.
        console.log(`\n4️⃣  Resetting Collections...`);
        for (const colName of config.collections) {
            try {
                console.log(`   Deleting ${colName}...`);
                await client.deleteCollection({name: colName});
            } catch (e) {
                console.log(`   ℹ️  Delete failed (maybe didn't exist): ${e.message}`);
            }
        }

        // 5. Load (Restore)
        // Re-creating the collection triggers a clean build of the HNSW index.
        console.log(`\n5️⃣  Restoring Data...`);
        const newCollectionIds = [];
        let hasRestoreErrors   = false;

        for (const colName of config.collections) {
            try {
                const data = buffer[colName];
                if (!data || data.ids.length === 0) {
                    console.log(`   Skipping ${colName} (No data)`);
                    continue;
                }

                console.log(`   Recreating ${colName}...`);
                const newCollection = await client.createCollection({
                    name             : colName,
                    embeddingFunction: dummyEf,
                    metadata         : {"hnsw:space": "cosine"}
                });

                newCollectionIds.push(newCollection.id);
                console.log(`     New ID: ${newCollection.id}`);

                const total     = data.ids.length;
                const batchSize = 1000;

                for (let i = 0; i < total; i += batchSize) {
                    const end = Math.min(i + batchSize, total);
                    process.stdout.write(`     Upserting ${i} to ${end}... `);

                    // Document Sanitization: Ensure documents are always strings.
                    // ChromaDB can throw if a document is null or an object.
                    const batchDocs = data.documents.slice(i, end).map(d => {
                        if (d == null)             return '';
                        if (typeof d === 'object') return JSON.stringify(d);
                        return String(d);
                    });

                    await newCollection.add({
                        ids       : data.ids.slice(i, end),
                        embeddings: data.embeddings.slice(i, end),
                        metadatas : data.metadatas.slice(i, end),
                        documents : batchDocs
                    });
                    console.log('✅');
                }
            } catch (e) {
                console.error(`❌ Failed to restore ${colName}: ${e.message}`);
                hasRestoreErrors = true;
            }
        }

        // 6. Cleanup (Physical)
        // Scan the directory for UUID folders that are NOT in our list of active collection IDs.
        console.log(`\n6️⃣  Cleaning up orphaned index folders...`);
        console.log(`   Active IDs: ${newCollectionIds.join(', ')}`);

        const entries = await fs.readdir(DB_PATH, {withFileTypes: true});
        for (const entry of entries) {
            if (entry.isDirectory()) {
                // Heuristic: UUIDv4 Check (36 chars, contains hyphen)
                // This prevents accidental deletion of system folders (e.g., 'chroma.sqlite3' directory if it existed)
                if (entry.name.length === 36 && entry.name.includes('-')) {
                    if (!newCollectionIds.includes(entry.name)) {
                        const orphanPath = path.join(DB_PATH, entry.name);
                        console.log(`   🗑️  Deleting orphan: ${entry.name}`);
                        await fs.remove(orphanPath);
                    } else {
                        console.log(`   ✨ Keeping active: ${entry.name}`);
                    }
                }
            }
        }

        // 7. Vacuum (SQLite)
        console.log(`\n7️⃣  Vacuuming SQLite Database...`);
        vacuumSqlite(DB_PATH);

        console.log(`\n🎉 Defragmentation Complete!`);

        // Final Size Check & Reporting
        const finalSize        = await getDirSize(DB_PATH);
        const reduction        = initialSize - finalSize;
        const reductionPercent = initialSize > 0 ? (reduction / initialSize) * 100 : 0;

        console.log(`   📉 Initial Size : ${(initialSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   📉 Final Size   : ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   🔥 Reduction    : ${(reduction / 1024 / 1024).toFixed(2)} MB (${reductionPercent.toFixed(1)}%)`);

        // Exit with error code if any collection failed to restore
        if (hasRestoreErrors) {
            console.error('\n⚠️ Completed with errors in some collections.');
            process.exit(1);
        }

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
