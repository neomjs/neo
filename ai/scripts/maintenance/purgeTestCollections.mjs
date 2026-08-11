/**
 * @plane in-plane
 */
import {program}                       from 'commander';
import {ChromaClient}                  from 'chromadb';
import fs                              from 'fs-extra';
import path                            from 'path';
import {fileURLToPath, pathToFileURL}  from 'url';
import Neo                             from '../../../src/Neo.mjs'; // side-effect: defines globalThis.Neo so the memory-core config module evaluates
import {
    CHROMA_TEST_DATABASE,
    dropChromaTestDatabase
}                                     from '../../services/shared/vector/chromaTestIsolation.mjs';

/**
 * @summary Purges leaked unit-test stores: orphaned `test-*` ChromaDB collections + leftover
 * `test-daemon-*` SQLite residue under the production data dir.
 *
 * ## Why this exists
 *
 * Unit tests name their Chroma collections `test-memory-<ts>-<rand>` / `test-session-<ts>-<rand>`
 * (memory-core `config.template.mjs` under `UNIT_TEST_MODE`) and clean them in `afterAll`. Interrupted
 * runs (`Ctrl-C`, CI cancel, bare-`npx` bypasses) skip that teardown, so the collections accumulate in
 * the shared `default_tenant`/`default_database` — thousands of orphans build up over time against only a
 * handful of real production collections. The SQLite-daemon spec has the same failure mode for its db +
 * daemon dir (now routed to `os.tmpdir()`, but earlier residue can remain).
 *
 * This is the on-demand reclaimer for that backlog. It is **dry-run by default** — pass `--apply` to delete.
 *
 * ## Safety model
 *
 * Deletion is a positive allowlist (`test-(memory|session)-*`) gated by a defense-in-depth denylist of the
 * real production collections. A collection is deleted only when it matches the test-name contract AND is
 * not a protected name — so no production collection can ever be reached, even on a pattern slip.
 *
 * Usage:
 *   node ai/scripts/maintenance/purgeTestCollections.mjs            # dry-run report
 *   node ai/scripts/maintenance/purgeTestCollections.mjs --apply    # actually delete
 *   node ai/scripts/maintenance/purgeTestCollections.mjs --apply --host 127.0.0.1 --port 8000
 *
 * @module ai.scripts.maintenance.purgeTestCollections
 * @see ai/scripts/maintenance/defragChromaDB.mjs   Peer maintenance script (HNSW defrag, not orphan purge)
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const MEMORY_CORE_CONFIG = path.resolve(__dirname, '../../mcp/server/memory-core/config.mjs');
export const DATA_DIR           = path.resolve(PROJECT_ROOT, '.neo-ai-data');

/**
 * Production collections that must NEVER be deleted, regardless of any pattern match
 * (defense-in-depth denylist behind the positive test-name allowlist).
 */
export const PROTECTED_COLLECTIONS = new Set([
    'neo-agent-memory', 'neo-agent-sessions', 'neo-knowledge-base', 'neo-native-graph'
]);

/**
 * Unit-test Chroma collection naming contract (memory-core `config.template.mjs` under
 * `UNIT_TEST_MODE`): `test-memory-<ts>-<rand>` / `test-session-<ts>-<rand>`. The purge targets exactly
 * this shape, so it can never match a production collection name.
 */
export const TEST_COLLECTION_PATTERN = /^test-(memory|session)-/;

/**
 * @summary Pure classifier: is `name` a deletable unit-test orphan collection?
 * A name is purgeable only when it matches the test-name contract AND is not a protected production name.
 * @param {String} name
 * @returns {Boolean}
 */
export function isPurgeableTestCollection(name) {
    return !PROTECTED_COLLECTIONS.has(name) && TEST_COLLECTION_PATTERN.test(name);
}

/**
 * @summary Splits a collection-name list into purgeable test orphans vs retained names.
 * @param {String[]} names
 * @returns {{purge: String[], keep: String[]}}
 */
export function partitionCollections(names) {
    const purge = [], keep = [];

    for (const name of names) {
        (isPurgeableTestCollection(name) ? purge : keep).push(name);
    }

    return {purge, keep};
}

/**
 * @summary Resolves the Chroma host/port from the memory-core config, with a localhost fallback.
 * Runs WITHOUT `UNIT_TEST_MODE` so it targets the production endpoint where the orphans live.
 * @param {Object} [overrides] CLI `--host` / `--port` overrides (win when provided).
 * @returns {Promise<{host: String, port: Number}>}
 */
export async function resolveChromaEndpoint(overrides = {}) {
    let host = 'localhost', port = 8000;

    try {
        const module = await import(MEMORY_CORE_CONFIG);
        const chroma = module.default?.engines?.chroma;

        if (chroma?.host) host = chroma.host;
        if (chroma?.port) port = chroma.port;
    } catch (e) {
        console.warn(`   ⚠️  Could not load memory-core config (${e.message}); falling back to ${host}:${port}.`);
    }

    return {
        host: overrides.host || host,
        port: overrides.port ? Number(overrides.port) : port
    };
}

/**
 * @summary Lists every collection name in the connected Chroma store (paginated).
 * @param {Object} options
 * @param {Object} options.client A connected `ChromaClient` (or compatible seam).
 * @param {Number} [options.limit=1000]
 * @returns {Promise<String[]>}
 */
export async function listAllCollectionNames({client, limit = 1000}) {
    // chromadb emits a per-collection `console.warn` when a collection was created with an
    // embedding-function package not installed in this client. Harmless for listing/deleting names
    // (we never add/query), but it floods a store with thousands of collections — filter it out.
    const origWarn = console.warn;
    console.warn = (...args) => {
        if (String(args[0] ?? '').includes('dynamic_text_embedding_service')) return;
        origWarn(...args)
    };

    const names = [];
    let   offset = 0;

    try {
        do {
            const collections = await client.listCollections({limit, offset});
            names.push(...collections.map(collection => collection.name));

            if (collections.length < limit) {
                break;
            }

            offset += limit
        } while (true)
    } finally {
        console.warn = origWarn
    }

    return names;
}

/**
 * @summary Removes leaked unit-test daemon SQLite residue from the production data dir.
 * Pre-`os.tmpdir()`-isolation runs could leak `test-daemon-*.sqlite` (+ `-wal`/`-shm`) under
 * `<dataDir>/sqlite` and `wake-daemon-test-*` dirs under `<dataDir>`; this clears any that remain.
 * @param {Object} options
 * @param {String} options.dataDir
 * @param {Boolean} options.apply
 * @param {Object} [options.fsModule=fs]
 * @param {Function} [options.log=console.log]
 * @returns {Promise<String[]>} Paths that were (or in dry-run, would be) removed.
 */
export async function cleanDaemonSqliteResidue({dataDir, apply, fsModule = fs, log = console.log}) {
    const removed = [];

    const scan = async (dir, predicate) => {
        if (!await fsModule.pathExists(dir)) return;

        for (const name of await fsModule.readdir(dir)) {
            if (predicate(name)) {
                const target = path.join(dir, name);
                removed.push(target);
                log(`   🗑️  ${apply ? 'Removing' : '[dry-run] would remove'} ${target}`);
                if (apply) await fsModule.remove(target);
            }
        }
    };

    await scan(path.join(dataDir, 'sqlite'), name => name.startsWith('test-daemon-'));
    await scan(dataDir,                      name => name.startsWith('wake-daemon-test-'));

    return removed;
}

/**
 * @summary Drops the isolated unit-test Chroma database wholesale.
 *
 * Once `UNIT_TEST_MODE` routes test collections into their own database, the whole namespace is
 * droppable in a single call — the prevention-era cleanup that supersedes enumerating `test-*`
 * names. The underlying {@link dropChromaTestDatabase} refuses to touch `default_database`, so this
 * can never reach production. Dry-run by default; a non-existent test database is treated as benign.
 * @param {Object} options
 * @param {String} options.host
 * @param {Number} options.port
 * @param {Boolean} options.apply
 * @param {String} [options.database=CHROMA_TEST_DATABASE]
 * @param {Function} [options.dropFn=dropChromaTestDatabase] Injectable drop seam for unit tests.
 * @param {Function} [options.log=console.log]
 * @returns {Promise<Boolean>} True if the database was dropped (apply) or would be (dry-run); false on a drop error.
 */
export async function dropTestDatabase({host, port, apply, database = CHROMA_TEST_DATABASE, dropFn = dropChromaTestDatabase, log = console.log}) {
    log(`\n🗄️  Test database "${database}": ${apply ? 'dropping wholesale' : '[dry-run] would drop wholesale'}.`);

    if (!apply) {
        return true;
    }

    try {
        await dropFn({host, port, database});
        log(`   ✅ Dropped "${database}".`);
        return true;
    } catch (e) {
        log(`   ⚠️  Could not drop "${database}" (already absent or unreachable): ${e.message}`);
        return false;
    }
}

/**
 * @summary Orchestrates the purge: list → partition → (dry-run report | delete) → residue cleanup → verify.
 * @returns {Promise<void>}
 */
async function purgeTestCollections() {
    program
        .name('purgeTestCollections')
        .description('Purge orphaned unit-test Chroma collections + leftover test-daemon SQLite residue.')
        .option('--apply', 'Actually delete. Without this flag the script is a dry-run report.', false)
        .option('--host <host>', 'Chroma host override (defaults to memory-core config).')
        .option('--port <port>', 'Chroma port override (defaults to memory-core config).')
        .option('--drop-test-db', `Also drop the isolated unit-test database "${CHROMA_TEST_DATABASE}" wholesale (prevention-era cleanup).`, false)
        .parse(process.argv);

    const options = program.opts(),
          apply   = options.apply;

    console.log(`🧹 Purge test collections — ${apply ? 'APPLY (destructive)' : 'DRY-RUN (no deletions)'}`);

    const {host, port} = await resolveChromaEndpoint(options);
    console.log(`   🔌 Chroma: ${host}:${port}`);

    const client = new ChromaClient({host, port, ssl: false});

    let names;
    try {
        names = await listAllCollectionNames({client});
    } catch (e) {
        console.error(`❌ Could not list collections (is the Chroma server running? \`npm run ai:server\`): ${e.message}`);
        process.exit(1);
    }

    const {purge, keep} = partitionCollections(names);

    console.log(`   📚 ${names.length} collections total → ${purge.length} test orphans, ${keep.length} retained.`);
    console.log(`   ✨ Retained: ${keep.join(', ') || '(none)'}`);

    let deleted = 0, failed = 0;

    if (purge.length > 0) {
        console.log(`\n${apply ? '🔥 Deleting' : '[dry-run] Would delete'} ${purge.length} test orphans:`);

        for (const name of purge) {
            if (!apply) continue;

            try {
                await client.deleteCollection({name});
                deleted++;
                if (deleted % 100 === 0) console.log(`   …deleted ${deleted}/${purge.length}`);
            } catch (e) {
                failed++;
                console.warn(`   ⚠️  Failed to delete ${name}: ${e.message}`);
            }
        }
    }

    console.log(`\n🧽 SQLite-daemon residue under ${DATA_DIR}:`);
    const residue = await cleanDaemonSqliteResidue({dataDir: DATA_DIR, apply});
    if (residue.length === 0) console.log('   ✅ none found.');

    if (options.dropTestDb) {
        await dropTestDatabase({host, port, apply});
    }

    if (!apply) {
        console.log(`\nℹ️  Dry-run complete. Re-run with --apply to delete ${purge.length} collections + ${residue.length} residue paths.`);
        return;
    }

    // Verify: re-list and report what remains.
    const after            = await listAllCollectionNames({client});
    const {purge: leftover} = partitionCollections(after);

    console.log(`\n🎉 Purge complete: deleted ${deleted} collections (${failed} failed); ${after.length} remain (${leftover.length} test orphans left).`);

    if (leftover.length > 0) {
        console.warn(`   ⚠️  ${leftover.length} test orphans remain — re-run to retry the failures.`);
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    purgeTestCollections().then(() => process.exit(0));
}
