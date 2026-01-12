import {program}       from 'commander';
import {ChromaClient}  from 'chromadb';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../src/Neo.mjs';

/**
 * @summary A generic CLI tool to defragment ChromaDB instances (Knowledge Base & Memory Core).
 *
 * This script implements the "Nuke and Pave" strategy to eliminate HNSW index fragmentation and file bloat
 * within ChromaDB. It is designed to be target-agnostic, capable of processing different database instances
 * (e.g., Knowledge Base, Memory Core) by dynamically loading their specific configurations.
 *
 * The "Nuke and Pave" Strategy:
 * 1.  **Backup (Safety First)**: Before any destructive operation, a full physical backup of the database folder is created.
 *     Backups are stored in `dist/chromadb-backups/<target>/` to avoid project root pollution.
 *     Automated retention policy: Deletes backups older than 7 days, but always keeps the last 3.
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
 * @see Neo.ai.mcp.server.knowledge-base.Config
 * @see Neo.ai.mcp.server.memory-core.Config
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Configuration Mapping
// Maps CLI target names to their respective config files and adapts the config structure
// to a unified format used by this script.
const TARGETS = {
    'knowledge-base': {
        configPath: '../ai/mcp/server/knowledge-base/config.mjs',
        adapt: (cfg) => ({
            host       : cfg.host,
            path       : cfg.path,
            port       : cfg.port,
            collections: [cfg.collectionName]
        })
    },
    'memory-core': {
        configPath: '../ai/mcp/server/memory-core/config.mjs',
        adapt: (cfg) => ({
            host       : cfg.memoryDb.host,
            path       : cfg.memoryDb.path,
            port       : cfg.memoryDb.port,
            collections: [cfg.memoryDb.collectionName, cfg.sessionDb.collectionName]
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
 * Manages backup retention.
 * Policy: Keep last 3 backups, delete others if older than 7 days.
 *
 * @param {String} backupDir - The directory containing backups.
 */
async function cleanOldBackups(backupDir) {
    try {
        if (!await fs.pathExists(backupDir)) return;

        const entries = await fs.readdir(backupDir, { withFileTypes: true });
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

        // Always keep the newest 3
        const toCheck = backups.slice(3);
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        for (const backup of toCheck) {
            if (backup.time < weekAgo) {
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
    const files = await fs.readdir(dir, { withFileTypes: true });
    let size = 0;

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

        // 1. Backup (Mandatory & Centralized)
        // We never run destructive operations without a fallback.
        // Backups are stored in `dist/chromadb-backups/<target>/backup-<timestamp>`
        const timestamp  = Date.now();
        const backupRoot = path.resolve(PROJECT_ROOT, 'dist', 'chromadb-backups', targetName);
        const backupName = `backup-${timestamp}`;
        const backupPath = path.join(backupRoot, backupName);

        console.log(`\n1️⃣  Creating Backup at ${backupPath}...`);
        await fs.ensureDir(backupRoot);
        await fs.copy(DB_PATH, backupPath);
        console.log(`   ✅ Backup created.`);

        // 1.1 Cleanup Old Backups
        await cleanOldBackups(backupRoot);

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
        const buffer = {};
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
                let offset    = 0;
                let hasMore   = true;
                const limit   = 2000;

                while (hasMore) {
                    process.stdout.write(`     Fetching batch ${offset}... `);
                    const batch = await collection.get({
                        limit,
                        offset,
                        include: ['embeddings', 'metadatas', 'documents']
                    });

                    if (batch.ids.length === 0) {
                        hasMore = false;
                        console.log('Done.');
                    } else {
                        colData.ids.push(...batch.ids);
                        colData.embeddings.push(...batch.embeddings);
                        colData.metadatas.push(...batch.metadatas);
                        colData.documents.push(...batch.documents);
                        offset += limit;
                        if (batch.ids.length < limit) hasMore = false;
                        console.log('ok');
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
                await client.deleteCollection({ name: colName });
             } catch (e) {
                console.log(`   ℹ️  Delete failed (maybe didn't exist): ${e.message}`);
             }
        }

        // 5. Load (Restore)
        // Re-creating the collection triggers a clean build of the HNSW index.
        console.log(`\n5️⃣  Restoring Data...`);
        const newCollectionIds = [];
        let hasRestoreErrors = false;

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
                        if (d === null || d === undefined) return '';
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

        const entries = await fs.readdir(DB_PATH, { withFileTypes: true });
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

defragChromaDB().then(() => {
    process.exit(0);
});
