import fs               from 'fs-extra';
import path             from 'path';
import {fileURLToPath}  from 'url';

import kbConfig         from '../../ai/mcp/server/knowledge-base/config.mjs';
import mcConfig         from '../../ai/mcp/server/memory-core/config.mjs';

import {
    KB_DatabaseService,
    KB_LifecycleService,
    Memory_DatabaseService,
    Memory_LifecycleService,
    Memory_StorageRouter,
    Shared_DestructiveOperationGuard
} from '../../ai/services.mjs';

/**
 * @module buildScripts/ai/restore
 * @summary Canonical bundle-aware restore orchestrator for the Neo.mjs AI substrate.
 *
 * Inverts `buildScripts/ai/backup.mjs`. Reads a timestamped atomic-bundle directory
 * produced by `npm run ai:backup` and routes each subsystem through the canonical SDK
 * boundary in `ai/services.mjs`:
 *
 * ```
 * .neo-ai-data/backups/backup-<ISO-timestamp>/
 * ├── kb/                 → KB_DatabaseService.manageDatabaseBackup({action: 'import', ...})
 * ├── mc/                 → Memory_DatabaseService.manageDatabaseBackup({action: 'import', ...})
 * ├── graph/              → Memory_DatabaseService.manageDatabaseBackup({action: 'import', ...})
 * ├── concepts/           → flat-file restore to .neo-ai-data/concepts/
 * ├── trajectories/       → flat-file restore to .neo-ai-data/datasets/rlaif/trajectories.jsonl
 * └── mailbox/ (optional) → flat-file restore to <mc-graph-dir>/sent-to-cull.jsonl
 * ```
 *
 * ## Architectural guarantees
 *
 * - **Canonical SDK boundary only.** This script never reaches into `SQLiteVectorManager`,
 *   `ChromaManager`, or any other manager directly. All embedded-substrate writes go
 *   through `KB_DatabaseService` and `Memory_DatabaseService` so the destructive-operation
 *   guard (#10845) fires uniformly. The legacy `importBackupToSQLite.mjs` one-off, which
 *   did bypass the SDK, is retired alongside this script.
 * - **Pre-flight integrity validation BEFORE any write.** The bundle is fully validated —
 *   subdirs present, JSONL parseable, `bundle-meta.json` (if present) parsed — before any
 *   write touches a service. A torn / partial bundle fails fast.
 * - **Topology compatibility check.** The system natively assumes a `shared_topology`.
 *   If the bundle is explicitly marked as a legacy federated bundle (`chromaUnified: false`),
 *   the restore refuses unless the operator passes `--force-topology-mismatch`.
 *   Bundles without `bundle-meta.json` skip this check with a console warning.
 * - **Two-mode contract:**
 *     - `--mode merge` (default): idempotent. Embedded substrates upsert (no destructive
 *       wipe). Flat substrates skip-if-target-non-empty (preserves operator additions).
 *       No `--force` required.
 *     - `--mode replace`: gated. Each embedded subsystem fires
 *       `assertDestructiveTargetAllowed()` before truncating + restoring. Flat substrates
 *       fire the guard against the target file/dir path before overwriting. Refuses if
 *       any target is non-empty without `--force`.
 *
 * ## Intentionally-out-of-scope
 *
 * - Wake-daemon operational state (`bridge.log`, `lastSyncId`, `inflight-*.txt`) — owned
 *   by the live-orchestration recovery track, not substrate restore.
 * - Physical Chroma data dir snapshots — those live at `dist/chromadb-backups/` under
 *   `defragChromaDB.mjs`'s peer-architecture lockdown.
 * - Cross-version schema migrations — `bundle-meta.neoVersion` and `gitSha` are surfaced
 *   in the run summary for operator visibility, but no automatic migration is attempted.
 *
 * @see buildScripts/ai/backup.mjs
 * @see https://github.com/neomjs/neo/issues/10871
 * @see https://github.com/neomjs/neo/issues/10845
 * @see https://github.com/neomjs/neo/issues/10129
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_CONCEPTS_DIR      = path.join(PROJECT_ROOT, '.neo-ai-data', 'concepts');
const DEFAULT_TRAJECTORIES_FILE = path.join(PROJECT_ROOT, '.neo-ai-data', 'datasets', 'rlaif', 'trajectories.jsonl');
const DEFAULT_SENT_TO_CULL_FILE = path.join(path.dirname(mcConfig.storagePaths.graph), 'sent-to-cull.jsonl');

const REQUIRED_BUNDLE_SUBDIRS = ['kb', 'mc', 'graph', 'concepts', 'trajectories'];
const OPTIONAL_BUNDLE_SUBDIRS = ['mailbox'];

/**
 * Executes a full-substrate restore from a previously-produced bundle.
 *
 * @param {Object}   options
 * @param {String}   options.bundleRoot                    Absolute path to the bundle directory (`backup-<ISO-ts>/`).
 * @param {String}  [options.mode='merge']                 `'merge'` (idempotent) or `'replace'` (destructive, gated).
 * @param {Boolean} [options.force=false]                  Required when mode is `'replace'` AND any target is non-empty. Also bypasses the flat-file skip-if-non-empty rule.
 * @param {Boolean} [options.forceTopologyMismatch=false]  Bypass the topology compatibility refusal.
 * @param {String|Object} [options.confirmation]           Production confirmation token forwarded to the destructive-operation guard.
 * @param {String}  [options.conceptsTargetDir]            Override the default concepts target directory.
 * @param {String}  [options.trajectoriesTargetFile]       Override the default trajectories target file.
 * @param {String}  [options.sentToCullTargetFile]         Override the default sent-to-cull target file.
 * @param {Object}  [options.logger=console]               Log sink; useful for tests.
 * @returns {Promise<{bundleRoot: String, mode: String, subsystems: Object, meta: Object|null, topology: Object}>}
 */
export async function runRestore({
    bundleRoot,
    mode                    = 'merge',
    force                   = false,
    forceTopologyMismatch   = false,
    confirmation,
    conceptsTargetDir       = DEFAULT_CONCEPTS_DIR,
    trajectoriesTargetFile  = DEFAULT_TRAJECTORIES_FILE,
    sentToCullTargetFile    = DEFAULT_SENT_TO_CULL_FILE,
    logger                  = console
} = {}) {
    if (!bundleRoot) {
        throw new Error('runRestore requires a `bundleRoot` argument (absolute path to a `backup-<ISO-ts>/` directory)');
    }
    if (mode !== 'merge' && mode !== 'replace') {
        throw new Error(`Unknown mode: ${mode}. Must be 'merge' or 'replace'.`);
    }

    const resolvedRoot = path.resolve(bundleRoot);

    const layout = {
        kb          : path.join(resolvedRoot, 'kb'),
        mc          : path.join(resolvedRoot, 'mc'),
        graph       : path.join(resolvedRoot, 'graph'),
        concepts    : path.join(resolvedRoot, 'concepts'),
        trajectories: path.join(resolvedRoot, 'trajectories'),
        mailbox     : path.join(resolvedRoot, 'mailbox')
    };

    logger.log(`[1/6] Validating bundle integrity at ${resolvedRoot}...`);
    const meta = await validateBundle(resolvedRoot, layout, logger);

    logger.log('[2/6] Checking topology compatibility...');
    const topology = await checkTopology({meta, forceTopologyMismatch, logger});

    logger.log('[3/6] Booting services...');
    await Promise.all([
        KB_LifecycleService.ready(),
        Memory_LifecycleService.ready()
    ]);

    if (mode === 'replace' && !force) {
        const occupancy = await assessTargetOccupancy({trajectoriesTargetFile, sentToCullTargetFile, conceptsTargetDir});
        const populated = occupancy.filter(o => o.nonEmpty).map(o => `${o.subsystem}=${o.size}`);
        if (populated.length > 0) {
            throw new Error(
                `Refusing replace mode without --force: targets are non-empty (${populated.join(', ')}). ` +
                `Pass --force to acknowledge data will be overwritten.`
            );
        }
    }

    const subsystems = {};

    logger.log('[4/6] Restoring embedded substrates (KB, MC memories+summaries, MC graph)...');

    if (await fs.pathExists(layout.kb)) {
        subsystems.kb = await KB_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : layout.kb,
            mode,
            confirmation
        });
    }

    if (await fs.pathExists(layout.mc)) {
        subsystems.mc = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : layout.mc,
            mode,
            confirmation
        });
    }

    if (await fs.pathExists(layout.graph)) {
        subsystems.graph = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : layout.graph,
            mode,
            confirmation
        });
    }

    logger.log('[5/6] Restoring flat substrates (concepts, trajectories, mailbox)...');

    subsystems.concepts = await restoreFlatDir({
        sourceDir : layout.concepts,
        targetDir : conceptsTargetDir,
        mode,
        force,
        confirmation,
        subsystem : 'concepts',
        logger
    });

    subsystems.trajectories = await restoreFlatFile({
        sourceDir : layout.trajectories,
        targetFile: trajectoriesTargetFile,
        mode,
        force,
        confirmation,
        subsystem : 'trajectories',
        logger
    });

    if (await fs.pathExists(layout.mailbox)) {
        subsystems.mailbox = await restoreFlatFile({
            sourceDir : layout.mailbox,
            targetFile: sentToCullTargetFile,
            mode,
            force,
            confirmation,
            subsystem : 'mailbox',
            logger
        });
    }

    logger.log('[6/6] Restore complete.');
    if (meta) {
        logger.log(`Source bundle: bundleVersion=${meta.bundleVersion ?? '?'}, neoVersion=${meta.neoVersion ?? '?'}, gitSha=${meta.gitSha ?? '?'}, completedAt=${meta.completedAt ?? '?'}`);
    }

    return {bundleRoot: resolvedRoot, mode, subsystems, meta, topology}
}

/**
 * Validates the bundle directory layout and JSONL parseability without writing any state.
 *
 * Required subdirs (`kb`, `mc`, `graph`, `concepts`, `trajectories`) MUST exist; missing
 * any one fails the bundle. Optional subdirs (`mailbox`, added in #10871 AC-A) are tolerated
 * absent. JSONL files in any subdir are sample-parsed (first non-empty line) — full-file
 * parsing is the SDK's responsibility downstream. `bundle-meta.json` is parsed if present;
 * absence triggers a console warning but does not fail (legacy bundles).
 *
 * @param {String} bundleRoot
 * @param {Object} layout
 * @param {Object} logger
 * @returns {Promise<Object|null>} Parsed `bundle-meta.json` content, or `null` for legacy bundles.
 */
export async function validateBundle(bundleRoot, layout, logger = console) {
    if (!await fs.pathExists(bundleRoot)) {
        throw new Error(`Bundle directory not found: ${bundleRoot}`);
    }

    const stat = await fs.stat(bundleRoot);
    if (!stat.isDirectory()) {
        throw new Error(`Bundle path is not a directory: ${bundleRoot}`);
    }

    for (const subdir of REQUIRED_BUNDLE_SUBDIRS) {
        const dir = layout[subdir];
        if (!await fs.pathExists(dir)) {
            throw new Error(`Required bundle subdirectory missing: ${subdir}/ (expected at ${dir})`);
        }
    }

    for (const subdir of OPTIONAL_BUNDLE_SUBDIRS) {
        const dir = layout[subdir];
        if (!await fs.pathExists(dir)) {
            logger.warn?.(`[Restore] Optional bundle subdirectory absent: ${subdir}/ (legacy bundle, skipping)`);
        }
    }

    const allSubdirs = [...REQUIRED_BUNDLE_SUBDIRS, ...OPTIONAL_BUNDLE_SUBDIRS];
    for (const subdir of allSubdirs) {
        const dir = layout[subdir];
        if (!await fs.pathExists(dir)) continue;
        const entries    = await fs.readdir(dir);
        const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));
        for (const file of jsonlFiles) {
            const content = await fs.readFile(path.join(dir, file), 'utf8');
            const firstLine = content.split('\n').find(line => line.trim());
            if (firstLine) {
                try {
                    JSON.parse(firstLine);
                } catch (err) {
                    throw new Error(`Bundle JSONL parse error at ${subdir}/${file} (line 1): ${err.message}`);
                }
            }
        }
    }

    const metaPath = path.join(bundleRoot, 'bundle-meta.json');
    if (await fs.pathExists(metaPath)) {
        try {
            return await fs.readJson(metaPath);
        } catch (err) {
            throw new Error(`Failed to parse bundle-meta.json: ${err.message}`);
        }
    }

    logger.warn?.('[Restore] bundle-meta.json absent; topology compatibility check will be skipped (legacy bundle).');
    return null
}

/**
 * Compares the bundle's `topology.shared_topology` to the live deployment (always true).
 * Mismatch is refused unless `forceTopologyMismatch` is set. Bundles without metadata
 * skip the check (legacy bundles).
 *
 * @param {Object}  options
 * @param {Object|null} options.meta
 * @param {Boolean} options.forceTopologyMismatch
 * @param {Object}  options.logger
 * @returns {Promise<{bundleSharedTopology: Boolean|null, currentSharedTopology: Boolean, match: Boolean, forced: Boolean}>}
 */
export async function checkTopology({meta, forceTopologyMismatch, logger}) {
    // Post-#11011: We are permanently in unified mode.
    // If the bundle was taken under federated mode (chromaUnified=false), we should warn.
    const bundleChromaUnified  = meta?.topology?.chromaUnified;
    const bundleSharedTopology = meta?.topology?.shared_topology;
    
    // A bundle is legacy federated ONLY if it explicitly has chromaUnified: false
    const isLegacyFederated = bundleChromaUnified === false && bundleSharedTopology !== true;

    if (!isLegacyFederated) {
        return {bundleSharedTopology: bundleSharedTopology ?? bundleChromaUnified ?? true, currentSharedTopology: true, match: true, forced: false}
    }

    if (forceTopologyMismatch) {
        logger.warn?.(`[Restore] Topology mismatch (legacy federated bundle, current=shared_topology) — proceeding due to --force-topology-mismatch.`);
        return {bundleSharedTopology: false, currentSharedTopology: true, match: false, forced: true}
    }

    throw new Error(
        `Topology mismatch: bundle was taken under legacy federated mode, ` +
        `but current deployment is permanently unified. ` +
        `Pass --force-topology-mismatch to proceed (collection IDs may diverge across topologies).`
    )
}

/**
 * Counts records in each embedded subsystem and stats each flat-file target so callers can
 * decide whether `mode='replace' && !force` should be refused.
 *
 * @param {Object} options
 * @param {String} options.trajectoriesTargetFile
 * @param {String} options.sentToCullTargetFile
 * @param {String} options.conceptsTargetDir
 * @returns {Promise<Array<{subsystem: String, nonEmpty: Boolean, size: Number}>>}
 */
async function assessTargetOccupancy({trajectoriesTargetFile, sentToCullTargetFile, conceptsTargetDir}) {
    const results = [];

    try {
        const memColl = await Memory_StorageRouter.getMemoryCollection();
        const count   = await memColl.count();
        results.push({subsystem: 'mc.memories', nonEmpty: count > 0, size: count});
    } catch {
        results.push({subsystem: 'mc.memories', nonEmpty: false, size: 0});
    }

    try {
        const sumColl = await Memory_StorageRouter.getSummaryCollection();
        const count   = await sumColl.count();
        results.push({subsystem: 'mc.summaries', nonEmpty: count > 0, size: count});
    } catch {
        results.push({subsystem: 'mc.summaries', nonEmpty: false, size: 0});
    }

    if (await fs.pathExists(conceptsTargetDir)) {
        const entries = await fs.readdir(conceptsTargetDir);
        const files   = entries.filter(f => f.endsWith('.jsonl'));
        results.push({subsystem: 'concepts', nonEmpty: files.length > 0, size: files.length});
    } else {
        results.push({subsystem: 'concepts', nonEmpty: false, size: 0});
    }

    if (await fs.pathExists(trajectoriesTargetFile)) {
        const stat = await fs.stat(trajectoriesTargetFile);
        results.push({subsystem: 'trajectories', nonEmpty: stat.size > 0, size: stat.size});
    } else {
        results.push({subsystem: 'trajectories', nonEmpty: false, size: 0});
    }

    if (await fs.pathExists(sentToCullTargetFile)) {
        const stat = await fs.stat(sentToCullTargetFile);
        results.push({subsystem: 'mailbox', nonEmpty: stat.size > 0, size: stat.size});
    } else {
        results.push({subsystem: 'mailbox', nonEmpty: false, size: 0});
    }

    return results
}

/**
 * Restores a flat-JSONL directory subsystem (e.g. `concepts/`).
 *
 * - **`mode='merge'`** (default): copy each `*.jsonl` from `sourceDir` into `targetDir` IF the
 *   target file does not already exist. Existing files are preserved (operator additions).
 *   `force=true` overrides — copy unconditionally (overwrite).
 * - **`mode='replace'`**: fire `assertDestructiveTargetAllowed` against `targetDir`. Wipe
 *   `targetDir` content. Copy all `*.jsonl` from `sourceDir`.
 *
 * @param {Object} options
 * @returns {Promise<{copied: Number, skipped: Number, mode: String}>}
 */
async function restoreFlatDir({sourceDir, targetDir, mode, force, confirmation, subsystem, logger}) {
    if (!await fs.pathExists(sourceDir)) {
        return {copied: 0, skipped: 0, mode, note: `source absent: ${sourceDir}`}
    }

    const sourceEntries = await fs.readdir(sourceDir);
    const sourceFiles   = sourceEntries.filter(f => f.endsWith('.jsonl'));

    if (mode === 'replace') {
        await Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: `restore.${subsystem}.replace`,
            subsystem,
            mode     : 'replace',
            target   : {path: targetDir, repoRoot: PROJECT_ROOT},
            source   : {path: sourceDir},
            confirmation
        });
        await fs.emptyDir(targetDir);
    } else {
        await fs.ensureDir(targetDir);
    }

    let copied  = 0;
    let skipped = 0;

    for (const file of sourceFiles) {
        const target = path.join(targetDir, file);

        if (mode === 'merge' && !force && await fs.pathExists(target)) {
            logger.log?.(`[Restore][${subsystem}] preserved existing ${file} (merge mode without --force)`);
            skipped++;
            continue;
        }

        await fs.copy(path.join(sourceDir, file), target, {overwrite: true});
        copied++;
    }

    return {copied, skipped, mode}
}

/**
 * Restores a flat-JSONL single-file subsystem (e.g. `trajectories.jsonl`, `sent-to-cull.jsonl`).
 *
 * The bundle stores these as a directory containing one `.jsonl` file (named per the source
 * basename). On restore the first matching `.jsonl` inside `sourceDir` is copied to
 * `targetFile`.
 *
 * - **`mode='merge'`**: skip if `targetFile` exists with content. `force=true` overrides.
 * - **`mode='replace'`**: fire guard against `targetFile`. Overwrite `targetFile` with bundle content.
 *
 * @param {Object} options
 * @returns {Promise<{copied: Boolean, skipped: Boolean, mode: String}>}
 */
async function restoreFlatFile({sourceDir, targetFile, mode, force, confirmation, subsystem, logger}) {
    if (!await fs.pathExists(sourceDir)) {
        return {copied: false, skipped: false, mode, note: `source absent: ${sourceDir}`}
    }

    const sourceEntries = await fs.readdir(sourceDir);
    const sourceFiles   = sourceEntries.filter(f => f.endsWith('.jsonl'));

    if (sourceFiles.length === 0) {
        return {copied: false, skipped: false, mode, note: `source contains no .jsonl files`}
    }

    const sourceFile = path.join(sourceDir, sourceFiles[0]);

    if (mode === 'replace') {
        await Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: `restore.${subsystem}.replace`,
            subsystem,
            mode     : 'replace',
            target   : {path: targetFile, repoRoot: PROJECT_ROOT},
            source   : {path: sourceFile},
            confirmation
        });
    } else if (await fs.pathExists(targetFile)) {
        const stat = await fs.stat(targetFile);
        if (stat.size > 0 && !force) {
            logger.log?.(`[Restore][${subsystem}] preserved existing ${path.basename(targetFile)} (merge mode without --force, ${stat.size} bytes)`);
            return {copied: false, skipped: true, mode}
        }
    }

    await fs.ensureDir(path.dirname(targetFile));
    await fs.copy(sourceFile, targetFile, {overwrite: true});

    return {copied: true, skipped: false, mode}
}

/**
 * Parses CLI arguments for direct-invocation mode.
 *
 * Shape: `node ./buildScripts/ai/restore.mjs <bundle-path> [--mode merge|replace] [--force] [--force-topology-mismatch]`
 *
 * @param {String[]} argv `process.argv.slice(2)`-style.
 * @returns {Object}
 */
export function parseArgs(argv) {
    const positional = [];
    let mode                    = 'merge';
    let force                   = false;
    let forceTopologyMismatch   = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--mode') {
            mode = argv[++i];
        } else if (arg === '--force') {
            force = true;
        } else if (arg === '--force-topology-mismatch') {
            forceTopologyMismatch = true;
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length === 0) {
        throw new Error('Missing required argument: <bundle-path>');
    }
    if (positional.length > 1) {
        throw new Error(`Unexpected positional arguments: ${positional.slice(1).join(' ')}`);
    }

    return {bundleRoot: positional[0], mode, force, forceTopologyMismatch}
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        const args = parseArgs(process.argv.slice(2));
        runRestore(args)
            .then(result => {
                console.log(JSON.stringify(result, null, 2));
                process.exit(0);
            })
            .catch(error => {
                console.error('❌ Restore failed:', error);
                process.exit(1);
            });
    } catch (error) {
        console.error(error.message);
        console.error('Usage: node ./buildScripts/ai/restore.mjs <bundle-path> [--mode merge|replace] [--force] [--force-topology-mismatch]');
        process.exit(2);
    }
}
