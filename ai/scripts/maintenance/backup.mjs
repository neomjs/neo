import {execFile}       from 'child_process';
import fs               from 'fs-extra';
import path             from 'path';
import {promisify}      from 'util';
import {fileURLToPath}  from 'url';

// Neo namespace bootstrap (entry-point invariant) for the operator-runnable backup driver.
// `Neo` + `core/_export` populate
// `globalThis.Neo`; `InstanceManager` binds Neo.find/findFirst/get aliases +
// consumes pre-singleton `Neo.idMap`.
import Neo              from '../../../src/Neo.mjs';
import * as core        from '../../../src/core/_export.mjs';
import InstanceManager  from '../../../src/manager/Instance.mjs';
import AiConfig         from '../../config.mjs';
import kbConfig         from '../../mcp/server/knowledge-base/config.mjs';
import mcConfig         from '../../mcp/server/memory-core/config.mjs';

import {
    KB_DatabaseService,
    KB_LifecycleService,
    Memory_DatabaseService,
    Memory_LifecycleService
} from '../../services.mjs';

import {withHeavyMaintenanceLease} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';

const execFileAsync = promisify(execFile);

/**
 * @module ai/scripts/maintenance/backup
 * @summary Canonical atomic-bundle backup orchestrator for the Neo.mjs AI substrate.
 *
 * Produces a timestamped, self-contained snapshot covering every persistent subsystem:
 *
 * ```
 * .neo-ai-data/backups/backup-<ISO-timestamp>/
 * ├── kb/                 # Knowledge Base ChromaDB as JSONL
 * ├── mc/                 # Memory Core memories + summaries as JSONL
 * ├── graph/              # Memory Core SQLite graph as JSONL
 * ├── concepts/           # Concept Ontology JSONL (nodes, edges)
 * └── trajectories/       # RLAIF training trajectories JSONL
 * ```
 *
 * This script does NOT defrag; it captures the current state whatever shape it is in.
 * `defragChromaDB.mjs` retains its private pre-nuke helper and does not call this
 * orchestrator. Operators who want compacted backups chain commands at the shell layer:
 * `npm run ai:defrag-kb && npm run ai:backup`.
 *
 * Persistent-substrate service calls route through `ai/services.mjs`, which applies Zod
 * validation at the SDK boundary via `makeSafe()`. MCP config singletons are imported
 * only for backup coordinates and retention defaults.
 *
 * ## Retention Policy
 *
 * Semantics mirror `defragChromaDB.cleanOldBackups` but applied to the unified bundle tree:
 * - Keep the newest `K` bundles unconditionally (default `K = 3`)
 * - Delete additional bundles older than `N` days (default `N = 30`)
 * - Sweep runs at the directory level on `.neo-ai-data/backups/` — one timestamp = one decision
 *   (no more correlating JSONL filenames across roots)
 *
 * ## Legacy Backup Migration
 *
 * Older backup layouts co-exist with the bundle tree and are **not touched** by this script:
 *
 * - Flat JSONL at `.neo-ai-data/backups/` root (`memory-backup-*.jsonl`, `summaries-backup-*.jsonl`,
 *   `graph-backup-*.jsonl`) — preserved as-is for archive / restore use. New bundles land in
 *   `backup-<ISO-ts>/` subfolders alongside them.
 * - Physical-copy directories at `dist/chromadb-backups/<target>/backup-<numeric-ts>/` — these
 *   remain **defrag-exclusive pre-nuke snapshots** under the defrag physical-copy
 *   contract. They are orthogonal to this script's output.
 *
 * Operators who want to reclaim space can manually delete the legacy flat files or run
 * `defragChromaDB.cleanOldBackups` against `dist/chromadb-backups/<target>/`. No automated
 * migration is provided — the archives are cheap and the manual decision is low-risk.
 *
 * ## Intentionally-Excluded Substrate
 *
 * The following `.neo-ai-data/` paths are **NOT** included in the bundle by design:
 *
 * - `.neo-ai-data/neo-sqlite/memory-core.sqlite` — retired combined vector+graph store.
 *   Current Memory Core persistence is split between
 *   `.neo-ai-data/sqlite/memory-core-graph.sqlite` for graph state and the
 *   `neo-agent-memory` / `neo-agent-sessions` collections inside the flat unified
 *   Chroma store. `defragSQLiteDB.mjs` targets a different filename
 *   (`knowledge-graph.sqlite`) and never touches this file. No production backup or
 *   restore path reads it.
 * - `.neo-ai-data/wake-daemon/{wake-daemon.log,inflight-*.txt,lastSyncId,heartbeat-*.log,sweep-errors.log}`
 *   — operational / process state owned by the wake daemon and heartbeat substrate; classified
 *   as live-orchestration recovery, not substrate backup. Distinct backup track if needed.
 * - The physical Chroma persist directory (`.neo-ai-data/chroma/unified/`) — the
 *   bundle captures logical collection state via JSONL exports, not the on-disk
 *   HNSW indexes. Restore re-ingests via the canonical `manageDatabaseImport` SDK
 *   path. Physical pre-nuke snapshots remain `defragChromaDB.mjs`-exclusive at
 *   `dist/chromadb-backups/`.
 *
 * @see ai/scripts/maintenance/defragChromaDB.mjs
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const DEFAULT_CONCEPTS_DIR      = path.join(PROJECT_ROOT, '.neo-ai-data', 'concepts');
const DEFAULT_TRAJECTORIES_FILE = path.join(PROJECT_ROOT, '.neo-ai-data', 'datasets', 'rlaif', 'trajectories.jsonl');
const DEFAULT_SENT_TO_CULL_FILE = path.join(path.dirname(mcConfig.storagePaths.graph), 'sent-to-cull.jsonl');
const DEFAULT_BACKUP_ROOT       = path.join(PROJECT_ROOT, '.neo-ai-data', 'backups');
export const LOCAL_AI_CONFIG_FILE = path.join(PROJECT_ROOT, 'ai', 'config.mjs');

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
 * Resolves atomic-bundle retention from Tier-1 AI config.
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Tier-1 AI config.
 * @returns {Object}
 */
export function resolveBackupRetention({
    aiConfig = AiConfig
} = {}) {
    return aiConfig.maintenance.backup.retention;
}

/**
 * Executes a full-substrate backup.
 *
 * @param {Object}   options
 * @param {String}  [options.bundleRoot=null]            Absolute bundle path. If null, a timestamped dir under the default root is used.
 * @param {String}  [options.conceptsSourceDir]          Override for the Concept Ontology source directory.
 * @param {String}  [options.trajectoriesSourceFile]     Override for the RLAIF trajectories source file.
 * @param {Object}  [options.logger=console]             Log sink; useful for tests.
 * @returns {Promise<{bundleRoot: String, timestamp: String, subsystems: Object}>}
 */
export async function runBackup({
    bundleRoot             = null,
    conceptsSourceDir      = DEFAULT_CONCEPTS_DIR,
    trajectoriesSourceFile = DEFAULT_TRAJECTORIES_FILE,
    sentToCullSourceFile   = DEFAULT_SENT_TO_CULL_FILE,
    logger                 = console
} = {}) {
    const timestamp    = new Date().toISOString().replace(/:/g, '-');
    const resolvedRoot = bundleRoot ?? path.join(DEFAULT_BACKUP_ROOT, `backup-${timestamp}`);

    const layout = {
        kb          : path.join(resolvedRoot, 'kb'),
        mc          : path.join(resolvedRoot, 'mc'),
        graph       : path.join(resolvedRoot, 'graph'),
        concepts    : path.join(resolvedRoot, 'concepts'),
        trajectories: path.join(resolvedRoot, 'trajectories'),
        mailbox     : path.join(resolvedRoot, 'mailbox')
    };

    await Promise.all(Object.values(layout).map(dir => fs.ensureDir(dir)));

    await Promise.all([
        KB_LifecycleService.ready(),
        Memory_LifecycleService.ready()
    ]);

    const subsystems = {};

    logger.log('[1/7] Exporting Knowledge Base...');
    subsystems.kb = await KB_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        backupPath: layout.kb
    });

    logger.log('[2/7] Exporting Memory Core (memories + summaries)...');
    subsystems.mc = await Memory_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        include   : ['memories', 'summaries'],
        backupPath: layout.mc
    });

    logger.log('[3/7] Exporting Memory Core graph...');
    subsystems.graph = await Memory_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        include   : ['graph'],
        backupPath: layout.graph
    });

    logger.log('[4/7] Copying Concept Ontology...');
    subsystems.concepts = await copyJsonlSource(conceptsSourceDir, layout.concepts, logger);

    logger.log('[5/7] Copying RLAIF trajectories...');
    subsystems.trajectories = await copyJsonlSource(trajectoriesSourceFile, layout.trajectories, logger);

    logger.log('[6/7] Copying mailbox sent-to-cull archive...');
    subsystems.mailbox = await copyJsonlSource(sentToCullSourceFile, layout.mailbox, logger);

    logger.log('[7/7] Applying retention sweep...');
    await loadTopLevelAiConfig();
    // Retention comes from Tier-1 AI maintenance policy; missing keys fail loud
    // at the direct resolved-leaf read site.
    await cleanOldBackups(DEFAULT_BACKUP_ROOT, logger, resolveBackupRetention());

    logger.log('Verifying bundle integrity (row-count parity)...');
    const integrity = await verifyBundleIntegrity(layout, subsystems);
    const failedChecks = integrity.filter(check => check.status === 'fail');
    if (failedChecks.length > 0) {
        throw new Error(
            `Bundle integrity check failed for ${failedChecks.length} subsystem(s):\n` +
            failedChecks.map(c => `  - ${c.subsystem}: ${c.reason}`).join('\n')
        );
    }

    const completedAt = new Date().toISOString();
    const topology    = buildTopologyDescriptor();
    const versionInfo = await buildVersionDescriptor(PROJECT_ROOT, logger);
    const meta = {
        bundleVersion: 1,
        timestamp,
        completedAt,
        subsystems,
        integrity,
        topology,
        ...versionInfo
    };
    await fs.writeJson(path.join(resolvedRoot, 'bundle-meta.json'), meta, { spaces: 2 });

    logger.log(`✅ Backup complete: ${resolvedRoot}`);
    return {bundleRoot: resolvedRoot, timestamp, completedAt, subsystems, meta};
}

/**
 * Verifies row-count parity between source collections and the JSONL files written into the
 * bundle. For subsystems whose `manageDatabaseBackup({action: 'export'})` SDK call returns a
 * numeric count (KB, MC memories+summaries, MC graph), this function counts non-empty lines
 * in the bundle's JSONL files and compares — mismatch indicates a partial/torn write that the
 * caller treats as a fail-the-bundle condition.
 *
 * For file-copy subsystems (concepts, trajectories, mailbox) the source side has no
 * authoritative count to compare against — `copyJsonlSource`'s reported `copied` field
 * already covers the file-presence check, so these are skipped with `status: 'skipped'`.
 *
 * @param {Object} layout     The bundle's per-subsystem destination directory map.
 * @param {Object} subsystems The runBackup `subsystems` map of SDK return values.
 * @returns {Promise<Array<{subsystem: String, status: String, sourceCount: Number, bundleCount: Number, reason: String}>>} `status` is `pass` / `fail` / `skipped`; count + reason fields present per status.
 */
export async function verifyBundleIntegrity(layout, subsystems) {
    const verifiable = ['kb', 'mc', 'graph'];
    const checks     = [];

    for (const subsystem of verifiable) {
        const raw         = subsystems[subsystem];
        const sourceCount = typeof raw === 'number' ? raw : raw?.count;

        if (typeof sourceCount !== 'number') {
            checks.push({subsystem, status: 'skipped', reason: 'no numeric source count returned by SDK'});
            continue;
        }

        const dir = layout[subsystem];

        if (!await fs.pathExists(dir)) {
            checks.push({subsystem, status: 'fail', sourceCount, bundleCount: 0, reason: `bundle directory missing: ${dir}`});
            continue;
        }

        const files = (await fs.readdir(dir)).filter(f => f.endsWith('.jsonl'));
        let bundleCount = 0;

        for (const file of files) {
            const content = await fs.readFile(path.join(dir, file), 'utf8');
            bundleCount += content.split('\n').filter(line => line.trim()).length;
        }

        if (bundleCount === sourceCount) {
            checks.push({subsystem, status: 'pass', sourceCount, bundleCount});
        } else {
            checks.push({
                subsystem,
                status: 'fail',
                sourceCount,
                bundleCount,
                reason: `row-count mismatch: source=${sourceCount}, bundle=${bundleCount} (delta ${bundleCount - sourceCount})`
            });
        }
    }

    return checks
}

/**
 * Builds the topology descriptor block for `bundle-meta.json`. Captures the KB/MC coordinates
 * at backup time so a restore consumer can detect legacy federated bundles
 * (`bundle-meta.topology.chromaUnified === false`) and refuse to clobber a target whose
 * deployment shape diverged from the bundle source.
 *
 * Restore consumers use this descriptor to validate topology compatibility before
 * importing a bundle.
 *
 * @returns {{shared_topology: Boolean, kbChromaCoords: Object, mcChromaCoords: Object}}
 */
function buildTopologyDescriptor() {
    return {
        shared_topology: true,
        kbChromaCoords: {
            host: kbConfig.host    ?? null,
            port: kbConfig.port    ?? null,
            path: kbConfig.path    ?? null
        },
        mcChromaCoords: {
            host   : mcConfig.engines?.chroma?.host    ?? null,
            port   : mcConfig.engines?.chroma?.port    ?? null,
            dataDir: mcConfig.engines?.chroma?.dataDir ?? null
        }
    }
}

/**
 * Builds the version descriptor block for `bundle-meta.json`. Captures `neoVersion` from
 * `package.json` and `gitSha` from the working tree's HEAD so a restore consumer can flag
 * cross-version restores (e.g. backup taken under v12.0, restoring under v12.2 with schema
 * migrations applied).
 *
 * Both fields are best-effort — missing `git` binary or unreadable `package.json` degrades to
 * `null` rather than failing the bundle.
 *
 * @param {String} projectRoot Absolute repo root.
 * @param {Object} logger      Log sink for non-fatal warnings.
 * @returns {Promise<{neoVersion: String|null, gitSha: String|null}>}
 */
async function buildVersionDescriptor(projectRoot, logger) {
    let neoVersion = process.env.npm_package_version ?? null;

    if (!neoVersion) {
        try {
            const pkg = await fs.readJson(path.join(projectRoot, 'package.json'));
            neoVersion = pkg.version ?? null;
        } catch (err) {
            logger.warn?.(`[Backup] failed to read package.json for neoVersion: ${err.message}`);
        }
    }

    let gitSha = null;

    try {
        const {stdout} = await execFileAsync('git', ['rev-parse', 'HEAD'], {cwd: projectRoot});
        gitSha = stdout.trim() || null;
    } catch (err) {
        logger.warn?.(`[Backup] failed to capture gitSha: ${err.message}`);
    }

    return {neoVersion, gitSha}
}

/**
 * Applies retention policy to the backup root.
 *
 * Two-axis policy:
 *   - `keepMinimum` — newest N bundles retained unconditionally regardless of age
 *   - `maxDays`     — bundles older than this many days are eligible for deletion
 *
 * A bundle survives if EITHER axis protects it (i.e., it's in the keepMinimum-newest
 * window OR younger than maxDays). Both defaults match the original hardcoded
 * constants (`K=3, N_DAYS=30`) so omitting the `retention` argument preserves
 * existing behavior.
 *
 * @param {String} backupRoot
 * @param {Object} logger
 * @param {Object} [retention]
 * @param {Number} [retention.keepMinimum=3] Newest N bundles to retain unconditionally.
 * @param {Number} [retention.maxDays=30]    Bundles older than this in days are eligible for deletion.
 */
export async function cleanOldBackups(backupRoot, logger, retention = {}) {
    if (!await fs.pathExists(backupRoot)) return;

    const {keepMinimum = 3, maxDays = 30} = retention;

    const entries = await fs.readdir(backupRoot, { withFileTypes: true });

    const backups = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;

        const tsMatch = entry.name.match(/^backup-(.+)$/);
        if (!tsMatch) continue;

        const rawTs = tsMatch[1];
        const isoTime = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
        const date = new Date(isoTime);

        if (!isNaN(date.getTime())) {
            backups.push({
                name: entry.name,
                path: path.join(backupRoot, entry.name),
                date,
                time: date.getTime()
            });
        }
    }

    backups.sort((a, b) => b.time - a.time);

    const K = keepMinimum;
    const N_DAYS = maxDays;
    const now = Date.now();
    const thresholdMs = N_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    for (let i = K; i < backups.length; i++) {
        const backup = backups[i];
        const ageMs = now - backup.time;
        if (ageMs > thresholdMs) {
            try {
                logger.log(`[Retention] Deleting old backup: ${backup.name} (age: ${Math.round(ageMs / 86400000)} days)`);
                await fs.remove(backup.path);
                deletedCount++;
            } catch (err) {
                if (logger.error) {
                    logger.error(`[Retention] Failed to delete ${backup.name}: ${err.message}`);
                } else {
                    logger.log(`[Retention] Failed to delete ${backup.name}: ${err.message}`);
                }
            }
        }
    }

    if (deletedCount > 0) {
        logger.log(`[Retention] Removed ${deletedCount} old backup(s).`);
    }
}

/**
 * Copies JSONL data from a source (either a directory of JSONL files or a single JSONL file)
 * into the destination directory. Missing sources are reported via `note`, not fatal — concepts
 * and trajectories may legitimately not exist in fresh environments.
 *
 * **Empty-source observability:** when the source PATH exists but yields zero bytes of
 * bundle-able data (directory with no `.jsonl` files, OR a 0-byte file), the function
 * emits a warning via `logger.warn(...)` so silent-empty subsystems are visible during backup.
 * Source-absent (path does not exist) remains silent — fresh-environment fixtures legitimately
 * lack concepts/trajectories.
 *
 * @param {String} source         Absolute path to a JSONL file or a directory containing JSONL files.
 * @param {String} destDir        Absolute path to the target subfolder inside the bundle.
 * @param {Object} [logger=console] Log sink; receives `.warn(message)` calls for empty sources.
 * @returns {Promise<{copied: Number, note: String}>} `note` only present when the source is absent or empty.
 */
async function copyJsonlSource(source, destDir, logger=console) {
    if (!await fs.pathExists(source)) {
        return {copied: 0, note: `source not present: ${source}`};
    }

    const stat = await fs.stat(source);

    if (stat.isDirectory()) {
        const entries    = await fs.readdir(source);
        const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));

        if (jsonlFiles.length === 0) {
            logger.warn(`[Backup] source directory exists but contains no .jsonl files: ${source}`);
        }

        await Promise.all(jsonlFiles.map(f =>
            fs.copy(path.join(source, f), path.join(destDir, f))
        ));

        return {copied: jsonlFiles.length};
    }

    if (stat.size === 0) {
        logger.warn(`[Backup] source file is 0 bytes: ${source}`);
        await fs.copy(source, path.join(destDir, path.basename(source)));
        return {copied: 0, note: 'source file empty'};
    }

    await fs.copy(source, path.join(destDir, path.basename(source)));
    return {copied: 1};
}

// Auto-run under the shared heavy-maintenance lease so this CLI cannot collide with the
// orchestrator's heavy tasks or with another manual graph-heavy script. The exported
// `runBackup` function is left lease-free so test harnesses and other module-level
// callers retain full control of their own concurrency context.
if (import.meta.url === `file://${process.argv[1]}`) {
    withHeavyMaintenanceLease(
        () => runBackup(),
        {owner: 'backup', reason: 'manual-cli', metadata: {script: 'ai/scripts/maintenance/backup.mjs'}}
    )
        .then(outcome => {
            if (outcome.status === 'held') {
                const held = outcome.lease;
                console.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
                console.log('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
                process.exit(0);
            }
            console.log(JSON.stringify(outcome.result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Backup failed:', error);
            process.exit(1);
        });
}
