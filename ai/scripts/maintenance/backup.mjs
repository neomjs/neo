import {execFile}      from 'child_process';
import fs              from 'fs-extra';
import path            from 'path';
import readline        from 'readline';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

// Neo namespace bootstrap (entry-point invariant) for the operator-runnable backup driver.
// `Neo` + `core/_export` populate
// `globalThis.Neo`; `InstanceManager` binds Neo.find/findFirst/get aliases +
// consumes pre-singleton `Neo.idMap`.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';
import AiConfig        from '../../config.mjs';
import kbConfig        from '../../mcp/server/knowledge-base/config.mjs';
import mcConfig        from '../../mcp/server/memory-core/config.mjs';

import {
    KB_DatabaseService,
    KB_LifecycleService,
    Memory_DatabaseService,
    Memory_LifecycleService
} from '../../services.mjs';

import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {resolveCloudOnlyDefault}        from '../../daemons/orchestrator/services/deploymentDurabilityPosture.mjs';
import {cleanStagingResidue}            from './backupStagingResidueCore.mjs';
import {HEAL_LEDGER_DIR_NAME}           from '../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {INCIDENT_LEDGER_BUNDLE_MEMBERS} from '../../services/memory-core/helpers/incidentLedgerBundle.mjs';
import {
    buildBackupReceipt,
    buildSyncChildEnv,
    redactAndBound,
    runOffHostSync,
    validateOffHostSyncConfig,
    writeBackupReceipt
} from './offHostSync.mjs';

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
 * ├── trajectories/       # RLAIF training trajectories JSONL
 * ├── mailbox/            # Mailbox sent-to-cull archive JSONL
 * └── ledgers/            # Incident ledgers: heal-attempts.json, heal-events.jsonl, recovery-runs/
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

// Marks that the pre-relocation in-tree backup root has already been reported once, so the notice
// does not repeat on every scheduled run after an operator has read it and made a decision.
const LEGACY_BACKUP_NOTICE_MARKER = '.legacy-backup-root-noticed';

const DEFAULT_CONCEPTS_DIR      = path.join(PROJECT_ROOT, '.neo-ai-data', 'concepts');
const DEFAULT_TRAJECTORIES_FILE = path.join(PROJECT_ROOT, '.neo-ai-data', 'datasets', 'rlaif', 'trajectories.jsonl');
const DEFAULT_SENT_TO_CULL_FILE = path.join(path.dirname(mcConfig.storagePaths.graph), 'sent-to-cull.jsonl');
export const LOCAL_AI_CONFIG_FILE = path.join(PROJECT_ROOT, 'ai', 'config.mjs');

/**
 * Stable terminal classification when a completed local bundle did not satisfy the deployment's
 * required off-host durability gate.
 * @type {String}
 */
export const REQUIRED_OFFHOST_BACKUP_ERROR_CODE = 'BACKUP_REQUIRED_OFFHOST_SYNC_UNMET';

/**
 * @summary Builds the status-only terminal error for a required off-host durability failure.
 * Receipt diagnostics retain the detailed/redacted child outcome; the thrown boundary exposes
 * neither config values, argv, stderr, paths, nor credentials.
 * @param {String} offHostSyncStatus
 * @returns {Error}
 */
function createRequiredOffHostBackupError(offHostSyncStatus) {
    const error = new Error(`Required off-host backup was not satisfied (status=${offHostSyncStatus}).`);

    error.code              = REQUIRED_OFFHOST_BACKUP_ERROR_CODE;
    error.offHostSyncStatus = offHostSyncStatus;

    return error
}

/**
 * @summary Writes the CLI terminal for a backup failure.
 * Required off-host refusals expose only their stable code/status; unrelated backup failures keep
 * the existing full Error diagnostic.
 * @param {Error} error
 * @param {Object} [logger=console]
 * @returns {void}
 */
export function reportBackupTerminalFailure(error, logger=console) {
    if (error?.code === REQUIRED_OFFHOST_BACKUP_ERROR_CODE) {
        logger.error(`❌ Backup failed: ${error.code} (status=${error.offHostSyncStatus}).`)
    } else {
        logger.error('❌ Backup failed:', error)
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
 * Builds the versioned embedding-space block declared in `bundle-meta.json`.
 *
 * Truth discipline: the block separates what the bundle can prove from what it cannot.
 * - `dimension` + `counts` are write-time facts: counts attest each actual vector collection (KB
 *   chunks, Memory Core memories, summaries) from the export receipts, and the exported rows
 *   themselves carry the dimension. Counts are never null — a new bundle attests exactly the rows
 *   it exported.
 * - `expectedConsumer` is the backup host's ACTIVE config at backup time. It is NOT write-time
 *   vector provenance: no persisted record of which provider/model embedded the stored rows exists
 *   in the substrate, so a config snapshot must never be presented as one. Restore admission treats
 *   it as advisory context for the orchestrator's semantic-space classification, never as a hard
 *   gate, and never contacts a provider to verify it.
 * @param {Object} options
 * @param {Object} options.subsystems runBackup's subsystem receipt map (kb carries a count; mc
 *   carries per-collection `memories`/`summaries` export receipts).
 * @returns {Object}
 */
export function buildEmbeddingContract({subsystems}) {
    const
        provider = AiConfig.embeddingProvider,
        model    = provider === 'ollama'
            ? AiConfig.ollama.embeddingModel
            : AiConfig.openAiCompatible.embeddingModel;

    const countOf = value => typeof value === 'number' ? value : value?.count ?? value?.exported ?? 0;

    return {
        counts: {
            kb       : countOf(subsystems.kb),
            memories : countOf(subsystems.mc?.memories),
            summaries: countOf(subsystems.mc?.summaries)
        },
        dimension       : AiConfig.vectorDimension,
        expectedConsumer: {model, provider},
        schemaVersion   : 1
    }
}

/**
 * @summary Rewrites JSON-safe export receipt paths from the private capture root to the final
 * published root without changing unrelated strings.
 * @param {*} value Receipt value to clone.
 * @param {String} stagingRoot Private same-parent capture root.
 * @param {String} publishedRoot Final caller-visible bundle root.
 * @returns {*} Cloned receipt value carrying only published bundle paths.
 */
function rebaseBundleReceiptPaths(value, stagingRoot, publishedRoot) {
    if (typeof value === 'string') {
        if (value === stagingRoot) {
            return publishedRoot
        }

        const stagingPrefix = stagingRoot.endsWith(path.sep) ? stagingRoot : `${stagingRoot}${path.sep}`;

        return value.startsWith(stagingPrefix)
            ? path.join(publishedRoot, value.slice(stagingPrefix.length))
            : value
    }

    if (Array.isArray(value)) {
        return value.map(item => rebaseBundleReceiptPaths(item, stagingRoot, publishedRoot))
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                rebaseBundleReceiptPaths(item, stagingRoot, publishedRoot)
            ])
        )
    }

    return value
}

/**
 * @summary Fails unless a publication destination is truly absent. `lstat` is intentional:
 * `pathExists` collapses access failures into false and follows away dangling symlinks, while only
 * `ENOENT` is evidence that rename will not target an existing filesystem entry.
 * @param {String} targetPath Final bundle path.
 * @param {String} message Stable refusal prefix.
 * @returns {Promise<void>}
 */
async function assertBackupDestinationAbsent(targetPath, message) {
    try {
        await fs.lstat(targetPath)
    } catch (error) {
        if (error.code === 'ENOENT') {
            return
        }

        throw error
    }

    throw new Error(`${message}: ${targetPath}`)
}

/**
 * Executes a full-substrate backup.
 *
 * Capture is assembled in a unique sibling directory outside the root-level `backup-*`
 * candidate namespace. The final path is published with a same-filesystem rename only after
 * every export, the integrity gate, and `bundle-meta.json` have completed. Caught failures remove
 * only this invocation's staging directory; abrupt process death can leave a self-identifying
 * `.backup-partial-*` directory that restore and retention discovery ignore by construction.
 *
 * @param {Object}   options
 * @param {String}  [options.bundleRoot=null]            Absolute bundle path. If null, a timestamped dir under the default root is used.
 * @param {String}  [options.conceptsSourceDir]          Override for the Concept Ontology source directory.
 * @param {String}  [options.trajectoriesSourceFile]     Override for the RLAIF trajectories source file.
 * @param {Object}  [options.ledgerSources]              Override for the incident-ledger source paths
 *                                                       (`{healAttemptsFile, healEventsDir, recoveryRunsDir}`).
 *                                                       Omitted in production — resolved from AiConfig at the use site.
 * @param {Function} [options.cleanOldBackupsImpl]       Retention cleaner seam; defaults to `cleanOldBackups`.
 * @param {Function} [options.cleanStagingResidueImpl]   Staging-residue sweep seam; defaults to `cleanStagingResidue`.
 * @param {Object}  [options.logger=console]             Log sink; useful for tests.
 * @returns {Promise<{bundleRoot: String, timestamp: String, subsystems: Object}>}
 */
export async function runBackup({
    bundleRoot             = null,
    conceptsSourceDir      = DEFAULT_CONCEPTS_DIR,
    trajectoriesSourceFile = DEFAULT_TRAJECTORIES_FILE,
    sentToCullSourceFile   = DEFAULT_SENT_TO_CULL_FILE,
    ledgerSources,
    cleanOldBackupsImpl      = cleanOldBackups,
    cleanStagingResidueImpl  = cleanStagingResidue,
    logger                   = console
} = {}) {
    const timestamp    = new Date().toISOString().replace(/:/g, '-');
    const resolvedRoot = bundleRoot ?? path.join(AiConfig.backupPath, `backup-${timestamp}`);
    const parentRoot   = path.dirname(resolvedRoot);

    await fs.ensureDir(parentRoot);
    await assertBackupDestinationAbsent(resolvedRoot, 'Backup destination already exists');

    // Keep a bounded, filesystem-safe hint of the intended final basename visible for diagnostics
    // while making the stage impossible to confuse with a root-level restore/retention candidate.
    // `mkdtemp` adds the per-run unique suffix, and sibling placement guarantees same-filesystem
    // rename without making a long-but-valid explicit destination exceed NAME_MAX.
    const stagingHint = path.basename(resolvedRoot)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 48) || 'bundle';
    const stagingRoot = await fs.mkdtemp(
        path.join(parentRoot, `.backup-partial-${stagingHint}-`)
    );

    let result;

    try {
        // `mkdtemp` deliberately defaults to 0700. The old directly-created final directory used
        // mkdir's 0777&umask semantics, so preserve that mode where the backing filesystem supports
        // POSIX chmod. ACL/SMB-backed mounts may reject chmod even though mkdir + rename are valid.
        if (process.platform !== 'win32') {
            try {
                await fs.chmod(stagingRoot, 0o777 & ~process.umask())
            } catch (error) {
                if (!['EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) {
                    throw error
                }
            }
        }

        // Reclaim staging residue BEFORE capture, not with the post-publication retention sweep.
        // Both are reclamation, but they answer different questions: retention prunes published
        // history once the new bundle is safely authoritative, while this bounds a namespace whose
        // growth is what makes the very next capture fail on a full volume. Doing it first is also
        // what gives the exclusion teeth — `stagingRoot` exists and is the newest entry right now,
        // so excluding it is a real operation rather than a no-op assertion made after the rename.
        // Non-fatal by construction: a residue sweep must never be able to fail a backup.
        try {
            await cleanStagingResidueImpl(parentRoot, logger, {
                excludePath : stagingRoot,
                keepPartials: AiConfig.maintenance.backup.retention.keepPartials
            })
        } catch (error) {
            logger.warn?.(`[Backup] staging-residue sweep failed; continuing with capture: ${error.message}`)
        }

        result = await captureBackup({
            conceptsSourceDir,
            ledgerSources,
            logger,
            publishedRoot: resolvedRoot,
            resolvedRoot : stagingRoot,
            sentToCullSourceFile,
            timestamp,
            trajectoriesSourceFile
        });

        // This catches an ordinary destination appearing during capture. Node has no portable
        // RENAME_NOREPLACE for directories, so the heavy-maintenance lease remains the cooperative
        // writer guarantee across this final check + rename boundary.
        await assertBackupDestinationAbsent(resolvedRoot, 'Backup destination appeared during capture');

        await fs.rename(stagingRoot, resolvedRoot)
    } catch (error) {
        try {
            await fs.remove(stagingRoot)
        } catch (cleanupError) {
            try {
                logger.warn?.(`[Backup] failed to remove staging directory after capture failure: ${cleanupError.message}`)
            } catch {
                // Preserve the capture failure: cleanup diagnostics are strictly secondary.
            }
        }

        throw error
    }

    const {retention, ...publishedResult} = result;

    // Retention is deliberately post-publication: pruning to the configured floor before the new
    // bundle is authoritative would leave one fewer recovery source if integrity/meta/rename later
    // failed. Cleanup failure cannot invalidate an already-complete published bundle.
    try {
        logger.log('[8/8] Applying retention sweep...')
    } catch {
        // Publication already succeeded; retention still runs when a diagnostic sink is closed.
    }

    try {
        await cleanOldBackupsImpl(AiConfig.backupPath, logger, retention)
    } catch (error) {
        try {
            logger.warn?.(`[Backup] retention sweep failed after publication: ${error.message}`)
        } catch {
            // A diagnostic sink cannot turn a completed, published bundle into a reported failure.
        }
    }

    try {
        logger.log(`✅ Backup complete: ${resolvedRoot}`)
    } catch {
        // Publication already succeeded. A closed terminal or custom diagnostic sink cannot turn
        // the completed bundle into a reported backup failure and a contradictory failed receipt.
    }

    return {...publishedResult, bundleRoot: resolvedRoot}
}

/**
 * @summary Captures every bundle member and completion receipt into a private staging directory.
 * Publication is deliberately owned by `runBackup()` so this helper can never return a path that a
 * restore, retention, receipt, or off-host-sync consumer treats as authoritative.
 * @param {Object} options
 * @param {String} options.resolvedRoot Unique non-candidate staging root.
 * @param {String} options.publishedRoot Final caller-visible bundle root.
 * @param {String} options.timestamp Final bundle timestamp shared with the publication name.
 * @param {String} options.conceptsSourceDir Concept Ontology source directory.
 * @param {String} options.trajectoriesSourceFile RLAIF trajectories source file.
 * @param {String} options.sentToCullSourceFile Mailbox archive source file.
 * @param {Object} [options.ledgerSources] Incident-ledger source paths.
 * @param {Object} options.logger Log sink.
 * @returns {Promise<{timestamp: String, completedAt: String, subsystems: Object, meta: Object, retention: Object}>}
 */
async function captureBackup({
    resolvedRoot,
    publishedRoot,
    timestamp,
    conceptsSourceDir,
    trajectoriesSourceFile,
    sentToCullSourceFile,
    ledgerSources,
    logger
}) {
    // Resolved leaves read HERE rather than captured at module scope: `healAttemptsPath` and
    // `recoveryRunStateDir` are plane members and therefore env-relocatable per deployment, so a
    // module-scope capture would bundle whatever the path was at import time.
    const resolvedLedgerSources = ledgerSources ?? {
        healAttemptsFile: AiConfig.orchestrator.recoveryActuator.healAttemptsPath,
        healEventsDir   : path.join(AiConfig.orchestrator.dataDir, HEAL_LEDGER_DIR_NAME),
        recoveryRunsDir : AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir
    };

    const layout = {
        kb          : path.join(resolvedRoot, 'kb'),
        mc          : path.join(resolvedRoot, 'mc'),
        graph       : path.join(resolvedRoot, 'graph'),
        concepts    : path.join(resolvedRoot, 'concepts'),
        trajectories: path.join(resolvedRoot, 'trajectories'),
        mailbox     : path.join(resolvedRoot, 'mailbox'),
        // The incident ledgers. They live in the orchestrator data directory, which on the cloud
        // profile IS a named volume — so a volume replacement destroys the self-heal and recovery
        // record together with the data whose loss they exist to explain, and the bundle did not
        // cover them. Post-mortem capability co-located with its subject means the one class of
        // event it most needs to describe is the one it can never describe.
        ledgers     : path.join(resolvedRoot, 'ledgers')
    };

    await Promise.all(Object.values(layout).map(dir => fs.ensureDir(dir)));

    await Promise.all([
        KB_LifecycleService.ready(),
        Memory_LifecycleService.ready()
    ]);

    const subsystems = {};

    logger.log('[1/8] Exporting Knowledge Base...');
    subsystems.kb = await KB_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        backupPath: layout.kb
    });

    logger.log('[2/8] Exporting Memory Core (memories + summaries)...');
    subsystems.mc = await Memory_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        include   : ['memories', 'summaries'],
        backupPath: layout.mc
    });

    logger.log('[3/8] Exporting Memory Core graph...');
    subsystems.graph = await Memory_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        include   : ['graph'],
        backupPath: layout.graph
    });

    logger.log('[4/8] Copying Concept Ontology...');
    subsystems.concepts = await copyJsonlSource(conceptsSourceDir, layout.concepts, logger);

    logger.log('[5/8] Copying RLAIF trajectories...');
    subsystems.trajectories = await copyJsonlSource(trajectoriesSourceFile, layout.trajectories, logger);

    logger.log('[6/8] Copying mailbox sent-to-cull archive...');
    subsystems.mailbox = await copyJsonlSource(sentToCullSourceFile, layout.mailbox, logger);

    logger.log('[7/8] Copying incident ledgers (self-heal + recovery runs)...');
    subsystems.ledgers = await copyIncidentLedgers({
        destDir: layout.ledgers,
        logger,
        sources: resolvedLedgerSources
    });

    // Resolve retention while the bundle is still private so a missing policy fails before
    // publication. The actual sweep runs after rename: a failed capture must retain the full
    // previous recovery floor.
    await loadTopLevelAiConfig();
    const retention = resolveBackupRetention();

    logger.log('Verifying bundle integrity (row-count parity)...');
    const integrity    = await verifyBundleIntegrity(layout, subsystems);
    const failedChecks = integrity.filter(check => check.status === 'fail');
    if (failedChecks.length > 0) {
        throw new Error(
            `Bundle integrity check failed for ${failedChecks.length} subsystem(s):\n` +
            failedChecks.map(c => `  - ${c.subsystem}: ${c.reason}`).join('\n')
        );
    }

    const emptyChecks = integrity.filter(check => check.status === 'empty');
    if (emptyChecks.length > 0) {
        // Non-fatal (a fresh environment legitimately backs up empty subsystems), but loud: a zero-row
        // export from a normally-populated deployment is the gutted-store signature, and a backup of an
        // empty store is a false recovery source. The 'empty' status is carried in bundle-meta.integrity
        // for a downstream canary/alert to escalate on.
        logger.warn?.(
            `[Backup] ${emptyChecks.length} subsystem(s) exported ZERO rows — empty backup is not a usable ` +
            `recovery source: ${emptyChecks.map(c => c.subsystem).join(', ')}. Legitimate for a fresh ` +
            `environment; corruption-suspicious for a populated deployment.`
        );
    }

    const completedAt         = new Date().toISOString();
    const topology            = buildTopologyDescriptor();
    const versionInfo         = await buildVersionDescriptor(PROJECT_ROOT, logger);
    const publishedSubsystems = rebaseBundleReceiptPaths(subsystems, resolvedRoot, publishedRoot);
    const embedding           = buildEmbeddingContract({subsystems: publishedSubsystems});
    const meta                = {
        bundleVersion: 1,
        timestamp,
        completedAt,
        subsystems   : publishedSubsystems,
        integrity,
        topology,
        embedding,
        ...versionInfo
    };
    await fs.writeJson(path.join(resolvedRoot, 'bundle-meta.json'), meta, { spaces: 2 });

    return {timestamp, completedAt, subsystems: publishedSubsystems, meta, retention};
}

/**
 * Counts non-empty (trimmed) lines in a JSONL file by streaming, so files larger than V8's
 * maximum string length (`0x1fffffe8`, ~512 MB) are counted without `ERR_STRING_TOO_LONG`.
 * Replaces a whole-file `fs.readFile(..., 'utf8').split('\n')`, which throws on the 1+ GB
 * Memory Core / Knowledge Base exports. Each JSONL record is exactly one line, so the
 * non-empty line count is the row count.
 *
 * @param {String} filePath Absolute path to the JSONL file.
 * @returns {Promise<Number>} Count of non-empty lines.
 */
export async function countNonEmptyJsonlLines(filePath) {
    const rl = readline.createInterface({
        input    : fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    let count = 0;

    for await (const line of rl) {
        if (line.trim()) {
            count++;
        }
    }

    return count
}

/**
 * Verifies row-count parity between source collections and the JSONL files written into the
 * bundle. For subsystems whose `manageDatabaseBackup({action: 'export'})` SDK call returns a
 * numeric count (KB, MC memories+summaries, MC graph), this function streams the bundle's JSONL
 * files to count non-empty lines (streaming so 1+ GB exports do not exceed V8's max string length)
 * and compares — mismatch indicates a partial/torn write that the
 * caller treats as a fail-the-bundle condition. Zero-zero parity (source and bundle both empty) is
 * reported as `empty`, not `pass`: a backup of an empty/gutted store is surfaced non-fatally because
 * it is not a usable recovery source (a fresh environment is legitimately empty; a populated
 * deployment reporting zero rows is the gutted-store signature). `runBackup` warns on `empty`
 * subsystems and persists the status into `bundle-meta.integrity` for a downstream canary/alert.
 *
 * For file-copy subsystems (concepts, trajectories, mailbox) the source side has no
 * authoritative count to compare against — `copyJsonlSource`'s reported `copied` field
 * already covers the file-presence check, so these are skipped with `status: 'skipped'`.
 *
 * @param {Object} layout     The bundle's per-subsystem destination directory map.
 * @param {Object} subsystems The runBackup `subsystems` map of SDK return values.
 * @returns {Promise<Array<{subsystem: String, status: String, sourceCount: Number, bundleCount: Number, reason: String}>>} `status` is `pass` (positive row-count parity) / `empty` (source and bundle both zero — non-fatal, not a usable recovery source) / `fail` (row-count mismatch) / `skipped` (non-numeric source count); count + reason fields present per status.
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

        const files       = (await fs.readdir(dir)).filter(f => f.endsWith('.jsonl'));
        let   bundleCount = 0;

        for (const file of files) {
            bundleCount += await countNonEmptyJsonlLines(path.join(dir, file));
        }

        if (bundleCount === sourceCount) {
            // Empty-parity is NOT a healthy pass: a backup whose source AND bundle are both empty is
            // not a usable recovery source. Legitimate for a fresh environment, but for a normally-
            // populated deployment a zero-row export is the gutted-store signature (the corruption a
            // backup is supposed to survive) — surface it as 'empty' (visible, non-fatal) rather than
            // a silent 'pass' so a downstream canary/alert can act on bundle-meta.integrity.
            const status = sourceCount === 0 ? 'empty' : 'pass';
            const entry  = {subsystem, status, sourceCount, bundleCount};

            if (status === 'empty') {
                entry.reason = 'source and bundle both report zero rows — empty backup is not a usable ' +
                    'recovery source (fresh-env legitimate; populated-deployment corruption-suspicious)';
            }

            checks.push(entry);
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
        kbChromaCoords : {
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

        const rawTs   = tsMatch[1];
        const isoTime = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
        const date    = new Date(isoTime);

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

    const K           = keepMinimum;
    const N_DAYS      = maxDays;
    const now         = Date.now();
    const thresholdMs = N_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    for (let i = K; i < backups.length; i++) {
        const backup = backups[i];
        const ageMs  = now - backup.time;
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
/**
 * Copies the three incident ledgers into the bundle's `ledgers/` subfolder.
 *
 * Why they are bundled rather than relocated: on the cloud profile the orchestrator data directory
 * IS a named volume, so a volume replacement destroys the self-heal and recovery record together
 * with the data whose loss they exist to explain. Relocating them to a surviving mount would decide
 * the data-plane placement election that a separate ticket owns, so survival is obtained here by
 * inclusion — the bundle already lands on a host bind-mount that a volume wipe does not touch.
 *
 * Each ledger is independently optional. A deployment that has never healed has no ledger, and that
 * is not a backup failure — `copyJsonlSource` reports absence via `note` without throwing. The
 * per-ledger breakdown is preserved in the returned shape so `bundle-meta.subsystems.ledgers` says
 * WHICH ledger was empty rather than collapsing three answers into one count.
 *
 * @param {Object} options
 * @param {String} options.destDir Absolute `ledgers/` path inside the bundle.
 * @param {Object} options.sources Resolved `{healAttemptsFile, healEventsDir, recoveryRunsDir}`.
 * @param {Object} [options.logger=console] Log sink.
 * @returns {Promise<{copied: Number, healAttempts: Object, healEvents: Object, recoveryRuns: Object}>}
 */
async function copyIncidentLedgers({destDir, sources, logger = console}) {
    // `recovery-runs` keeps its own subfolder because it is a directory of per-run files; flattening
    // it into `ledgers/` alongside the two singletons would make a run id collide with a ledger name.
    const recoveryRunsDest = path.join(destDir, INCIDENT_LEDGER_BUNDLE_MEMBERS.recoveryRuns);

    await fs.ensureDir(recoveryRunsDest);

    // Stored under the STABLE logical member name, never `path.basename(source)`. `healAttemptsPath`
    // is an env-relocatable full path, so a host pointing it at `custom-attempts.json` would have
    // written that name into the bundle while restore looked for the default — finding nothing and
    // reporting success having restored no incident record. A member name belongs to the bundle
    // FORMAT, not to the host that wrote it.
    const [healAttempts, healEvents, recoveryRuns] = await Promise.all([
        copyJsonlSource(sources.healAttemptsFile, destDir, logger, INCIDENT_LEDGER_BUNDLE_MEMBERS.healAttempts),
        copyJsonlSource(sources.healEventsDir, destDir, logger),
        copyJsonlSource(sources.recoveryRunsDir, recoveryRunsDest, logger)
    ]);

    return {
        copied: (healAttempts.copied ?? 0) + (healEvents.copied ?? 0) + (recoveryRuns.copied ?? 0),
        healAttempts,
        healEvents,
        recoveryRuns
    }
}

async function copyJsonlSource(source, destDir, logger=console, destFileName=null) {
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
        await fs.copy(source, path.join(destDir, destFileName ?? path.basename(source)));
        return {copied: 0, note: 'source file empty'};
    }

    await fs.copy(source, path.join(destDir, destFileName ?? path.basename(source)));
    return {copied: 1};
}

/**
 * @summary Emits a ONE-TIME notice when bundles are found at the pre-relocation, plane-anchored
 * backup root, so an operator can move them deliberately.
 *
 * Nothing is moved or deleted, and that restraint is the point: relocating tens of gigabytes
 * implicitly, during a config change, on a machine where those bundles may be the only surviving
 * copy, is a worse risk than leaving them somewhere a notice can point at. The marker file makes
 * this a notice rather than a recurring nag — an operator who has read it once and decided to keep
 * the legacy bundles where they are should not be told again on every scheduled run.
 *
 * Read-only with respect to the bundle contract: it never touches the local bundle, the receipt, or
 * the terminal, so it cannot turn a successful backup into a failed one.
 *
 * @param {Object}  options
 * @param {String}  options.currentRoot Resolved `AiConfig.backupPath` — where bundles land now.
 * @param {String}  options.legacyRoot The pre-relocation location (resolved plane root + `backups`).
 * @param {Object}  [options.logger=console]
 * @param {Object}  [options.fsImpl=fs] Injectable for tests.
 * @returns {Promise<Boolean>} True when a notice was emitted.
 */
export async function noticeLegacyBackupRoot({currentRoot, legacyRoot, logger = console, fsImpl = fs}) {
    if (!currentRoot || !legacyRoot || path.resolve(currentRoot) === path.resolve(legacyRoot)) {
        return false
    }

    const markerPath = path.join(currentRoot, LEGACY_BACKUP_NOTICE_MARKER);

    if (await fsImpl.pathExists(markerPath)) {
        return false
    }

    let legacyEntries;

    try {
        legacyEntries = await fsImpl.readdir(legacyRoot)
    } catch {
        // No legacy root at all is the common, healthy case — a fresh deployment. Absence is not
        // an error and must not surface as one.
        return false
    }

    if (!legacyEntries.some(name => name.startsWith('backup-'))) {
        return false
    }

    logger.warn?.(
        `[Backup] Bundles were found at the previous in-tree location: ${legacyRoot}\n` +
        `[Backup] New bundles now land at: ${currentRoot}\n` +
        '[Backup] Nothing was moved or deleted. That path sits inside the repository working tree, ' +
        'where `git clean -x`, a re-clone, or a moved worktree will remove it — move the bundles ' +
        'deliberately if you still need them.'
    );

    try {
        await fsImpl.ensureDir(currentRoot);
        await fsImpl.writeFile(markerPath, `legacy backup root noticed: ${legacyRoot}\n`)
    } catch (error) {
        // A marker we could not persist means the notice repeats next run. Strictly better than
        // letting a marker write fail a backup.
        logger.warn?.(`[Backup] could not persist the legacy-notice marker: ${error.message}`)
    }

    return true
}

/**
 * The lease-owning orchestration path: exported `runBackup()` stays the pure local
 * bundle/retention primitive; this wrapper owns the configured off-host sync step and the
 * deployment-global receipt. Direct module callers of `runBackup()` never fire the configured
 * command and never overwrite the global receipt.
 *
 * Lease semantics: the sync lifetime extends the exclusive-heavy backup lease; the lease remains
 * held through the bounded-size receipt fsync/rename and releases afterward (no exact wall-clock
 * bound — local filesystem completion is not a hard real-time guarantee). When the deployment
 * requires off-host durability, a non-success sync rejects only AFTER that truthful receipt attempt;
 * the completed local bundle remains `backup.status: 'success'`.
 *
 * @param {Object} [options]
 * @param {Function} [options.runBackupImpl=runBackup] Local bundle primitive.
 * @param {Function|null} [options.withLeaseImpl=null] Heavy-maintenance lease seam.
 * @param {String|null} [options.backupRoot=null] Receipt-root override.
 * @param {Object} [options.syncConfig] Off-host config override.
 * @param {Function} [options.runOffHostSyncImpl=runOffHostSync] Sync runner seam.
 * @param {Boolean} [options.offHostBackupRequired] Resolved requirement override; omitted reads
 * AiConfig through the canonical cloud-only resolver.
 * @returns {Promise<Object>} the lease outcome (same shape as `withHeavyMaintenanceLease`'s)
 */
export async function runBackupWithOffHostSync({
    runBackupImpl          = runBackup,
    withLeaseImpl          = null,
    backupRoot             = null,
    syncConfig             = undefined,
    runOffHostSyncImpl     = runOffHostSync,
    offHostBackupRequired  = undefined
} = {}) {
    // The sync + BOTH receipts live INSIDE the self-acquired lease: success receipts and the
    // truthful not-run failure receipt are persisted before the lease releases.
    return (withLeaseImpl ?? withHeavyMaintenanceLease)(async () => {
        const backupStartedAt = Date.now();

        // Validation precedes ANY subtree read: a malformed subtree never reaches the allowlist
        // consumer (and never throws at the consumer). `syncConfig` is the test seam for the
        // malformed-config branches; production callers leave it undefined to read the leaf.
        const
            validation  = validateOffHostSyncConfig(syncConfig === undefined ? AiConfig.maintenance.backup.offHostSync : syncConfig),
            allowlist   = validation.value?.envAllowlist ?? [],
            receiptPath = path.join(backupRoot ?? AiConfig.backupPath, 'last-backup-receipt.json'),
            required    = offHostBackupRequired === undefined
                ? resolveCloudOnlyDefault(
                    AiConfig.orchestrator.cloudOnly.offHostBackupRequired,
                    AiConfig.orchestrator.deploymentMode
                )
                : offHostBackupRequired;

        let result, backupError = null;

        try {
            result = await runBackupImpl()
        } catch (error) {
            backupError = error
        }

        if (backupError) {
            // Only a backup/lease failure reaches this branch: the truthful not-run receipt, written
            // while the lease is still held. A receipt write failure never masks the backup failure.
            await writeBackupReceipt({
                filePath: receiptPath,
                receipt : buildBackupReceipt({
                    backup: {
                        durationMs: Date.now() - backupStartedAt,
                        error     : redactAndBound(backupError?.stack ?? backupError?.message ?? String(backupError), buildSyncChildEnv(allowlist), undefined, allowlist),
                        status    : 'failed'
                    },
                    bundleCompletedAt: null,
                    bundleName       : null,
                    syncStatus       : 'not-run-backup-failed'
                })
            }).catch(receiptError => {
                console.warn(`[Backup] failed to write the failure receipt: ${receiptError.message}`)
            });

            throw backupError
        }

        const
            {bundleRoot, completedAt, meta} = result,
            bundleName                      = path.basename(bundleRoot),
            backupDurationMs                = Date.now() - backupStartedAt;

        let syncOutcome = null,
            syncStatus  = 'disabled';

        if (validation.error) {
            syncStatus = 'validation-failed';
            console.warn(required
                ? `[Backup] required offHostSync validation failed (${validation.errorCode}).`
                : `[Backup] offHostSync validation failed: ${validation.error} — skipping the off-host sync, the local bundle is unaffected.`);
        } else if (validation.enabled) {
            try {
                syncOutcome = await runOffHostSyncImpl({bundleDir: bundleRoot, bundleName, config: validation.value})
            } catch (syncError) {
                // An unexpected spawn/config error is a SYNC outcome — the completed local bundle
                // never becomes backup.status: 'failed' because the hook broke.
                syncOutcome = {
                    completionScope: 'direct-child',
                    descendants    : 'unknown',
                    durationMs     : null,
                    exitCode       : null,
                    signal         : null,
                    status         : 'failed',
                    stderrTail     : redactAndBound(syncError?.message ?? String(syncError), buildSyncChildEnv(allowlist), undefined, allowlist),
                    terminatedVia  : 'exit'
                }
            }

            if (syncOutcome.status !== 'success') {
                console.warn(required
                    ? `[Backup] required offHostSync ${syncOutcome.status}.`
                    : `[Backup] offHostSync ${syncOutcome.status} (terminatedVia=${syncOutcome.terminatedVia}): ${syncOutcome.stderrTail}`);
            }
        }

        try {
            await writeBackupReceipt({
                filePath: receiptPath,
                receipt : buildBackupReceipt({
                    backup: {
                        durationMs: backupDurationMs,
                        error     : null,
                        status    : 'success'
                    },
                    bundleCompletedAt: completedAt,
                    bundleName,
                    // The verdict travels with the receipt: `status: success` reports that the bundle
                    // completed, which stays true; without this a receipt-only consumer had no way
                    // to learn it exported nothing.
                    integrity  : meta?.integrity,
                    offHostSync: syncOutcome,
                    syncStatus
                })
            });
        } catch (receiptError) {
            // A receipt write failure degrades observability, never the successful backup's truth.
            console.warn(`[Backup] failed to write the receipt after a successful backup: ${receiptError.message}`)
        }

        const observedSyncStatus = syncOutcome?.status ?? syncStatus;

        if (required && observedSyncStatus !== 'success') {
            throw createRequiredOffHostBackupError(observedSyncStatus)
        }

        return result
    }, {
        leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
        owner       : 'backup',
        reason      : 'manual-cli',
        staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
        metadata    : {script: 'ai/scripts/maintenance/backup.mjs'}
    });
    // Held: no backup ran — no receipt. Completed: sync + receipt already ran inside the lease.
}

// Auto-run under the shared heavy-maintenance lease so this CLI cannot collide with the
// orchestrator's heavy tasks or with another manual graph-heavy script. The exported
// `runBackup` function is left lease-free so test harnesses and other module-level
// callers retain full control of their own concurrency context. The gitignored Tier-1
// overlay loads BEFORE any backupPath read (bundle, retention, receipt, snapshot-root).
if (import.meta.url === `file://${process.argv[1]}`) {
    await loadTopLevelAiConfig();

    // Operator-facing courtesy, deliberately at the CLI layer rather than inside the lease-owning
    // wrapper. The wrapper is a reusable programmatic surface whose behavioural contract is a
    // narrow matrix (receipt truth, then terminal decision); a filesystem side effect and a
    // console warning firing there would reach every programmatic caller and every test that
    // exercises that matrix. The relocation notice is for a human reading a CLI run, so it lives
    // where humans invoke it — and it never touches the backup terminal.
    await noticeLegacyBackupRoot({
        currentRoot: AiConfig.backupPath,
        legacyRoot : path.join(AiConfig.plane.dataRoot, 'backups')
    }).catch(noticeError => {
        console.warn(`[Backup] legacy-root notice failed: ${noticeError.message}`)
    });

    runBackupWithOffHostSync()
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
            reportBackupTerminalFailure(error);
            process.exit(1);
        });
}
