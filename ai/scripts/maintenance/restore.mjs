import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

// Bootstrap Neo namespace BEFORE importing services that depend on Neo.gatekeep
// (Compare.mjs:166). Without these two imports, ai/services.mjs → Compare.mjs
// triggers `ReferenceError: Neo is not defined`. Mirrors the AI unit-test pattern
// (e.g., restore-filters.spec.mjs).
import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

import kbConfig from '../../mcp/server/knowledge-base/config.mjs';
import mcConfig from '../../mcp/server/memory-core/config.mjs';
import AiConfig from '../../config.mjs';

import {classifyRowVector} from '../../services/memory-core/helpers/vectorWriteInvariant.mjs';
import {
    KB_DatabaseService,
    KB_LifecycleService,
    Memory_DatabaseService,
    Memory_LifecycleService,
    Memory_StorageRouter,
    Shared_DestructiveOperationGuard
} from '../../services.mjs';

/**
 * @module ai/scripts/maintenance/restore
 * @summary Canonical bundle-aware restore orchestrator for the Neo.mjs AI substrate.
 *
 * Inverts `ai/scripts/maintenance/backup.mjs`. Reads a timestamped atomic-bundle directory
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
 *   guard fires uniformly. The legacy `importBackupToSQLite.mjs` one-off, which
 *   did bypass the SDK, is retired alongside this script.
 * - **Pre-flight integrity validation BEFORE any write.** The bundle is fully validated —
 *   subdirs present, JSONL parseable, `bundle-meta.json` (if present) parsed — before any
 *   write touches a service. A torn / partial bundle fails fast.
 * - **Topology compatibility check.** The system natively assumes a `shared_topology`.
 *   If the bundle is explicitly marked as a legacy federated bundle (`chromaUnified: false`),
 *   the restore refuses unless the operator passes `--force-topology-mismatch`.
 *   Bundles without `bundle-meta.json` skip this check with a console warning.
 * - **Two-mode contract:**
 *     - `--mode merge` (default): idempotent. **Graph SQLite** uses `INSERT OR IGNORE` —
 *       backup-only IDs INSERT; live-existing IDs preserved (post-wipe re-ingestion stays
 *       authoritative). **Memory + summaries (Chroma)** preflight existing IDs in chunks
 *       via `collection.get({ids})` and `collection.add()` only the missing subset
 *       to mirror the graph-side semantic. **Flat substrates** skip-if-target-non-empty
 *       (preserves operator additions). No `--force` required.
 *       The graph-side preserve-live semantic used to be silently broken by
 *       `INSERT OR REPLACE`; the 2026-05-10 graph-wipe incident was the empirical anchor.
 *     - `--mode replace`: gated. Each embedded subsystem fires
 *       `assertDestructiveTargetAllowed()` before truncating + restoring. Flat substrates
 *       fire the guard against the target file/dir path before overwriting. Refuses if
 *       any target is non-empty without `--force`.
 *
 * - **Per-incident customization:**
 *     - `--filter-labels=<csv>` — drop graph nodes with these labels (orphan-edge guard
 *       drops edges whose endpoint was filtered). Example: `FILE,DIRECTORY,KB_GAP,TOOLING_GAP`.
 *     - `--filter-edge-types=<csv>` — drop graph edges with these types. Example:
 *       `CONTAINS,DISCOVERED_IN,EVALUATED_BY`.
 *     - `--only-substrate=<csv>` — restrict to listed substrates. Example: `graph` (skips
 *       kb/mc/concepts/trajectories/mailbox).
 *     - `--post-restore-hook=<name>` — invoke after restore. Currently: `filesystem-ingestor`
 *       (regenerates FILE/DIRECTORY/CONTAINS deterministically from current filesystem).
 *
 * ## Intentionally-out-of-scope
 *
 * - Wake-daemon operational state (`.neo-ai-data/wake-daemon/bridge.log`, `lastSyncId`,
 *   `inflight-*.txt`) — owned by the live-orchestration recovery track, not substrate restore.
 * - Physical Chroma data dir snapshots — those live at `dist/chromadb-backups/` under
 *   `defragChromaDB.mjs`'s peer-architecture lockdown.
 * - Cross-version schema migrations — `bundle-meta.neoVersion` and `gitSha` are surfaced
 *   in the run summary for operator visibility, but no automatic migration is attempted.
 *
 * @see ai/scripts/maintenance/backup.mjs
 * @see ai/mcp/server/shared/services/DestructiveOperationGuard.mjs
 * @see ai/scripts/maintenance/defragChromaDB.mjs
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

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
 * @param {String[]}[options.filterLabels=[]]              Per-incident customization: drop graph nodes with these labels. Orphan-edge guard auto-fires (drops edges whose endpoint was filtered). Empty list = no filter. Example today's-incident set: `['FILE', 'DIRECTORY', 'KB_GAP', 'TOOLING_GAP']` (FILE/DIRECTORY are regenerable via FileSystemIngestor; KB_GAP/TOOLING_GAP are operator-classified garbage from per-file hallucination).
 * @param {String[]}[options.filterEdgeTypes=[]]           Per-incident customization: drop graph edges with these types. Example today's-incident set: `['CONTAINS', 'DISCOVERED_IN', 'EVALUATED_BY']`.
 * @param {String[]}[options.onlySubstrate=null]           If provided, restore ONLY these substrates (subset of `['kb','mc','graph','concepts','trajectories','mailbox']`). Null = all (existing behavior).
 * @param {String}  [options.postRestoreHook=null]         Post-restore hook name. Currently supported: `'filesystem-ingestor'` (regenerates FILE/DIRECTORY/CONTAINS deterministically from current filesystem). Null = none.
 * @param {Object}  [options.logger=console]               Log sink; useful for tests.
 * @returns {Promise<{bundleRoot: String, mode: String, subsystems: Object, meta: Object|null, topology: Object, postRestoreHook: Object|null}>}
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
    filterLabels            = [],
    filterEdgeTypes         = [],
    onlySubstrate           = null,
    postRestoreHook         = null,
    expectedDimension       = AiConfig.vectorDimension,
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
    const meta = await validateBundle(resolvedRoot, layout, logger, expectedDimension);

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

    // Per-substrate gate: null `onlySubstrate` = all subsystems (existing behavior).
    // Non-null array restricts to listed names. Validates against the known substrate set
    // so typos fail fast instead of silently no-op'ing the entire restore.
    const ALL_SUBSTRATES = ['kb', 'mc', 'graph', 'concepts', 'trajectories', 'mailbox'];
    if (Array.isArray(onlySubstrate)) {
        const unknown = onlySubstrate.filter(s => !ALL_SUBSTRATES.includes(s));
        if (unknown.length > 0) {
            throw new Error(`Unknown substrate(s) in --only-substrate: ${unknown.join(', ')}. Valid: ${ALL_SUBSTRATES.join(', ')}.`);
        }
    }
    const shouldRestore = (substrate) => onlySubstrate === null || onlySubstrate.includes(substrate);

    logger.log('[4/6] Restoring embedded substrates (KB, MC memories+summaries, MC graph)...');

    if (shouldRestore('kb') && await fs.pathExists(layout.kb)) {
        subsystems.kb = await KB_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : layout.kb,
            mode,
            confirmation
        });
    }

    if (shouldRestore('mc') && await fs.pathExists(layout.mc)) {
        subsystems.mc = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : layout.mc,
            mode,
            confirmation
        });
    }

    if (shouldRestore('graph') && await fs.pathExists(layout.graph)) {
        // Apply per-incident filter: drop nodes/edges by label/type before SDK import.
        // Stream-filter into a temp dir matching the bundle layout. Idempotent on re-run.
        // Filter goes through the FK-safe Stage-1/2/3 algorithm (per @neo-gpt review).
        // Empty filter sets short-circuit to original layout.graph (no extra work / no live read).
        const filterStats  = {filteredNodes: 0, filteredEdges: 0, orphanEdges: 0, acceptedNodes: 0};
        const filterActive = filterLabels.length > 0 || filterEdgeTypes.length > 0;

        let graphInputDir = layout.graph;
        if (filterActive) {
            // Read-only snapshot of live node IDs (Stage-2 union with accepted-backup IDs).
            // WAL mode lets us read concurrently with the running MC daemon.
            const liveNodeIds = await collectLiveGraphNodeIds({dbPath: mcConfig.storagePaths.graph});
            graphInputDir = await prepareFilteredGraphDir({
                sourceDir: layout.graph,
                filterLabels,
                filterEdgeTypes,
                liveNodeIds,
                stats    : filterStats,
                logger
            });
        }

        subsystems.graph = await Memory_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : graphInputDir,
            mode,
            confirmation
        });

        if (filterActive) {
            subsystems.graph.filterStats = filterStats;
            logger.log(`[Restore][graph] filtered out ${filterStats.filteredNodes} nodes (labels: ${filterLabels.join(',') || '—'}) + ${filterStats.filteredEdges} edges (types: ${filterEdgeTypes.join(',') || '—'}) + ${filterStats.orphanEdges} orphan-endpoint edges before SDK import. Accepted backup nodes: ${filterStats.acceptedNodes}.`);
        }
    }

    logger.log('[5/6] Restoring flat substrates (concepts, trajectories, mailbox)...');

    if (shouldRestore('concepts')) {
        subsystems.concepts = await restoreFlatDir({
            sourceDir: layout.concepts,
            targetDir: conceptsTargetDir,
            mode,
            force,
            confirmation,
            subsystem: 'concepts',
            logger
        });
    }

    if (shouldRestore('trajectories')) {
        subsystems.trajectories = await restoreFlatFile({
            sourceDir : layout.trajectories,
            targetFile: trajectoriesTargetFile,
            mode,
            force,
            confirmation,
            subsystem : 'trajectories',
            logger
        });
    }

    if (shouldRestore('mailbox') && await fs.pathExists(layout.mailbox)) {
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

    // Post-restore hook dispatch. Currently supported:
    //   - 'filesystem-ingestor': regenerates FILE/DIRECTORY/CONTAINS substrate from
    //     current filesystem state. Idempotent + deterministic. Recommended after a
    //     graph restore that filtered out FILE/DIRECTORY (avoids stale-path nodes
    //     for files that no longer exist).
    let postRestoreHookResult = null;
    if (postRestoreHook) {
        postRestoreHookResult = await dispatchPostRestoreHook({hook: postRestoreHook, logger});
    }

    logger.log('[6/6] Restore complete.');
    if (meta) {
        logger.log(`Source bundle: bundleVersion=${meta.bundleVersion ?? '?'}, neoVersion=${meta.neoVersion ?? '?'}, gitSha=${meta.gitSha ?? '?'}, completedAt=${meta.completedAt ?? '?'}`);
    }

    return {bundleRoot: resolvedRoot, mode, subsystems, meta, topology, postRestoreHook: postRestoreHookResult}
}

/**
 * Validates the bundle directory layout and every JSONL row without writing any state.
 *
 * Required subdirs (`kb`, `mc`, `graph`, `concepts`, `trajectories`) MUST exist; missing
 * any one fails the bundle. Optional subdirs (`mailbox`) are tolerated
 * absent. Every JSONL file is fully streamed: each line is parsed, and each vector-collection
 * (kb/mc) row must carry a non-empty string `id` plus a valid expected-dimension vector —
 * a corrupt final row fails the bundle exactly like a corrupt first one. Streamed per-collection
 * row totals are compared against the declared `bundle-meta.json` counts below.
 * `bundle-meta.json` is parsed if present; absence triggers a console warning but does not
 * fail (legacy bundles).
 *
 * @param {String} bundleRoot
 * @param {Object} layout
 * @param {Object} logger
 * @returns {Promise<Object|null>} Parsed `bundle-meta.json` content (with any embedding advisories
 *     attached as `embeddingAdvisories`), or `null` for legacy bundles.
 */
export async function validateBundle(bundleRoot, layout, logger = console, expectedDimension = AiConfig.vectorDimension) {
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

    // Full streaming structural + vector validation: every row of every JSONL is parsed, and every
    // vector collection (kb/mc) row must carry a non-empty string id plus a valid
    // expected-dimension vector BEFORE any mutation. Line-1 sampling cannot satisfy the gate — a
    // corrupt final row is the exact shape this closes. Streamed kb/mc totals feed the declared
    // count check below.
    const readline       = (await import('readline')).default;
    const allSubdirs     = [...REQUIRED_BUNDLE_SUBDIRS, ...OPTIONAL_BUNDLE_SUBDIRS];
    const streamedCounts = {kb: 0, mc: 0};
    for (const subdir of allSubdirs) {
        const dir = layout[subdir];
        if (!await fs.pathExists(dir)) continue;
        const entries    = await fs.readdir(dir);
        const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));
        for (const file of jsonlFiles) {
            const stream = fs.createReadStream(path.join(dir, file), {encoding: 'utf8'});
            const rl     = readline.createInterface({input: stream, crlfDelay: Infinity});
            let   lineNo = 0;
            for await (const line of rl) {
                if (!line.trim()) continue;
                lineNo++;

                let row;
                try {
                    row = JSON.parse(line);
                } catch (err) {
                    throw new Error(`Bundle JSONL parse error at ${subdir}/${file} (line ${lineNo}): ${err.message}`);
                }

                if (subdir === 'kb' || subdir === 'mc') {
                    streamedCounts[subdir]++;

                    if (typeof row?.id !== 'string' || row.id.length === 0) {
                        throw new Error(`Bundle vector invariant violation at ${subdir}/${file} (line ${lineNo}): missing-id`);
                    }

                    const reason = classifyRowVector(row, expectedDimension);
                    if (reason) {
                        throw new Error(`Bundle vector invariant violation at ${subdir}/${file} (line ${lineNo}): ${reason} (row id: ${row?.id ?? 'unknown'})`);
                    }
                }
            }
            rl.close();
            stream.destroy();
        }
    }

    const metaPath = path.join(bundleRoot, 'bundle-meta.json');
    let   meta     = null;

    if (await fs.pathExists(metaPath)) {
        try {
            meta = await fs.readJson(metaPath);
        } catch (err) {
            throw new Error(`Failed to parse bundle-meta.json: ${err.message}`);
        }
    } else {
        logger.warn?.('[Restore] bundle-meta.json absent; topology compatibility check will be skipped (legacy bundle).');
    }

    // Embedding compatibility preflight BEFORE any replace-mode truncate. Hard gates bind only to
    // evidence the bundle itself proves (schema shape, declared-vs-streamed counts, declared-vs-
    // expected dimension, per-row vectors). Provider/model identity is advisory: no write-time
    // vector provenance exists in the substrate, and admission never contacts a provider.
    validateEmbeddingContractSchema({expectedDimension, meta, streamedCounts});
    assessEmbeddingCompatibility({expectedDimension, logger, meta});

    return meta
}

/**
 * Validates the declared `meta.embedding` block against schema-v1 and against the bundle's own
 * streamed evidence. All checks here are hard gates: they compare the declaration with facts the
 * bundle carries (row totals, row dimension), never with an assumption about vector provenance.
 * @param {Object} options
 * @param {Number} options.expectedDimension Destination's expected vector dimension.
 * @param {Object|null} options.meta Parsed bundle-meta.json.
 * @param {Object} options.streamedCounts `{kb, mc}` row totals observed during the streaming pass.
 * @returns {void}
 * @throws {Error} classified contract violation: `invalid-embedding-schema`,
 *     `unsupported-schema-version`, `dimension-contract-mismatch`, or `count-contract-mismatch`.
 */
export function validateEmbeddingContractSchema({expectedDimension, meta, streamedCounts}) {
    const declared = meta?.embedding;

    if (!declared) {
        return // legacy bundle — the advisory path classifies the unknown provenance
    }

    const fail = (reason, detail) => {
        throw new Error(`Bundle embedding contract violation: ${reason} (${detail})`)
    };

    if (declared.schemaVersion !== 1) {
        fail('unsupported-schema-version', `expected 1, got ${JSON.stringify(declared.schemaVersion)}`);
    }
    if (!Number.isInteger(declared.dimension) || declared.dimension <= 0) {
        fail('invalid-embedding-schema', `dimension must be a positive integer, got ${JSON.stringify(declared.dimension)}`);
    }
    if (declared.dimension !== expectedDimension) {
        fail('dimension-contract-mismatch', `bundle declares dimension ${declared.dimension}, destination expects ${expectedDimension}`);
    }

    for (const collection of ['kb', 'mc']) {
        const block = declared[collection];

        if (!block || typeof block !== 'object') {
            fail('invalid-embedding-schema', `missing per-collection block '${collection}'`);
        }
        if (block.count !== null && (!Number.isInteger(block.count) || block.count < 0)) {
            fail('invalid-embedding-schema', `${collection}.count must be null or a non-negative integer, got ${JSON.stringify(block.count)}`);
        }
        if (block.count !== null && block.count !== streamedCounts[collection]) {
            fail('count-contract-mismatch', `${collection} declares ${block.count} row(s) but the bundle streams ${streamedCounts[collection]}`);
        }
    }

    if (declared.expectedConsumer !== undefined) {
        const {model, provider} = declared.expectedConsumer ?? {};

        if (typeof provider !== 'string' || provider.length === 0 || typeof model !== 'string' || model.length === 0) {
            fail('invalid-embedding-schema', 'expectedConsumer requires non-empty provider and model strings');
        }
    }
}

/**
 * Classifies the bundle's semantic-space provenance as structured advisories — never as a hard
 * gate. A config snapshot (backup-time or destination-time) is NOT write-time vector provenance:
 * no persisted record of which provider/model embedded the stored rows exists in the substrate.
 * The only row-verifiable semantic fact — vector dimension — is enforced upstream as a hard gate;
 * provider/model divergence is classified here for the restore orchestrator's recovery receipt,
 * which owns any re-embed/reconfigure decision. Admission never contacts a provider and never
 * re-embeds. Advisories are attached to `meta.embeddingAdvisories` AND logged.
 * @param {Object} options
 * @param {Number} options.expectedDimension Destination's expected vector dimension.
 * @param {Object} [options.logger]
 * @param {Object|null} options.meta Parsed bundle-meta.json.
 * @returns {Object[]} The advisory list (empty when the bundle carries no embedding block to classify).
 */
export function assessEmbeddingCompatibility({expectedDimension, logger = console, meta}) {
    const declared = meta?.embedding;

    if (!declared) {
        logger.warn?.(`[Restore][embedding-advisory] reason=semantic-provenance-unverified — no declared embedding contract (legacy bundle); validating rows against the destination's expected dimension ${expectedDimension} only.`);
        return []
    }

    const
        advisories = [],
        consumer   = declared.expectedConsumer,
        provider   = AiConfig.embeddingProvider,
        model      = provider === 'ollama'
            ? AiConfig.ollama.embeddingModel
            : AiConfig.openAiCompatible.embeddingModel;

    if (!consumer) {
        advisories.push({reason: 'semantic-provenance-unverified', detail: 'embedding block declares no expectedConsumer'});
    } else if (consumer.provider !== provider || consumer.model !== model) {
        advisories.push({
            reason     : 'consumer-expectation-mismatch',
            bundle     : {model: consumer.model, provider: consumer.provider},
            destination: {model, provider}
        });
    }

    for (const advisory of advisories) {
        logger.warn?.(`[Restore][embedding-advisory] reason=${advisory.reason} ${JSON.stringify(advisory)} — semantic-space classification is orchestrator-owned; restore admission proceeds on row-verifiable evidence only.`);
    }

    meta.embeddingAdvisories = advisories;
    return advisories
}

/**
 * @summary Verifies the latest backup bundle is structurally restorable WITHOUT performing a restore.
 *
 * Backups are the recovery source of last resort, yet assumed-restorable-but-never-checked. This runs
 * the same pre-flight `validateBundle` gate the restore path uses (required subdirs present, JSONL
 * parseable, `bundle-meta.json` parseable) against the newest `backup-<ISO-ts>/` under `backupRoot`,
 * returning a structured verdict. It performs NO writes and NO live-store import — a read-only
 * restorability probe. The alert-on-failure wiring is the escalation-mechanism piece (it shares the
 * AC1 sink decision, tracked on the parent backup-reliability ticket); this is the check that produces
 * the verdict that piece consumes.
 *
 * @param {Object}    options
 * @param {String}    options.backupRoot Absolute path to the `.neo-ai-data/backups` root.
 * @param {Object}   [options.logger=console] Log sink.
 * @param {Object}   [options.fsModule=fs] Filesystem seam (test injection).
 * @param {Function} [options.validateFn=validateBundle] Bundle validator seam (test injection).
 * @returns {Promise<{restorable: Boolean, bundleRoot: String|null, reason: String|null, checkedAt: String}>}
 */
export async function verifyLatestBackupRestorable({
    backupRoot,
    logger     = console,
    fsModule   = fs,
    validateFn = validateBundle
} = {}) {
    if (!backupRoot) {
        throw new Error('verifyLatestBackupRestorable requires a `backupRoot` argument.');
    }

    const checkedAt = new Date().toISOString();

    if (!await fsModule.pathExists(backupRoot)) {
        return {restorable: false, bundleRoot: null, reason: `backup root not found: ${backupRoot}`, checkedAt};
    }

    // backup-<ISO-ts> names sort lexically by their ISO timestamp, so reverse-sort yields newest-first.
    const bundleNames = (await fsModule.readdir(backupRoot, {withFileTypes: true}))
        .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
        .map(entry => entry.name)
        .sort()
        .reverse();

    if (bundleNames.length === 0) {
        return {restorable: false, bundleRoot: null, reason: `no backup-* bundles under ${backupRoot}`, checkedAt};
    }

    const bundleRoot = path.join(backupRoot, bundleNames[0]);
    const layout     = {
        kb          : path.join(bundleRoot, 'kb'),
        mc          : path.join(bundleRoot, 'mc'),
        graph       : path.join(bundleRoot, 'graph'),
        concepts    : path.join(bundleRoot, 'concepts'),
        trajectories: path.join(bundleRoot, 'trajectories'),
        mailbox     : path.join(bundleRoot, 'mailbox')
    };

    try {
        await validateFn(bundleRoot, layout, logger);
        return {restorable: true, bundleRoot, reason: null, checkedAt};
    } catch (error) {
        return {restorable: false, bundleRoot, reason: error.message, checkedAt};
    }
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
    // The restore path is permanently in unified mode.
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
 * Pre-import filter for graph JSONL bundles. Three-stage FK-safe shape:
 *
 * **Stage 1** — Read ALL bundle JSONL files, classify each node as accepted (passed
 * labelSet) or dropped (matched labelSet). Build `acceptedBackupNodeIds` set.
 *
 * **Stage 2** — Compute `validEndpointIds = acceptedBackupNodeIds ∪ liveNodeIds`. An edge
 * may safely INSERT only if both endpoints exist in this union (live row OR will-be-inserted
 * backup row). Otherwise the edge would FK-violate against `Edges.source/target → Nodes(id)`
 * post-`INSERT OR IGNORE`.
 *
 * **Stage 3** — Write filtered output to temp dir. For each backup record:
 *   - Node: drop if label in `filterLabels` (counter: `filteredNodes`); else keep.
 *   - Edge: drop if type in `filterEdgeTypes` (counter: `filteredEdges`); drop if either
 *     endpoint not in `validEndpointIds` (counter: `orphanEdges`); else keep.
 *
 * Stream-based I/O — constant memory regardless of bundle size. Per-run temp dirs use
 * timestamped names; OS or caller cleans up. Does NOT mutate source bundle.
 *
 * Empty filter sets + empty live snapshot still go through the union check (all backup
 * edges must reference accepted backup nodes); caller gates on filter-presence to skip
 * entirely if filtering isn't required.
 *
 * @param {Object}   options
 * @param {String}   options.sourceDir       Bundle's `graph/` directory containing JSONL files.
 * @param {String[]} options.filterLabels    Node labels to drop.
 * @param {String[]} options.filterEdgeTypes Edge types to drop.
 * @param {Set}      options.liveNodeIds     Set of node IDs currently in the live graph SQLite for FK-safe edge filtering.
 * @param {Object}   options.stats           Mutable counters: `{filteredNodes, filteredEdges, orphanEdges, acceptedNodes}`.
 * @param {Object}   [options.logger=console]
 * @returns {Promise<String>} Path to temp dir with filtered JSONL files.
 */
export async function prepareFilteredGraphDir({sourceDir, filterLabels, filterEdgeTypes, liveNodeIds, stats, logger = console}) {
    const os       = (await import('os')).default;
    const readline = (await import('readline')).default;
    const labelSet = new Set(filterLabels);
    const typeSet  = new Set(filterEdgeTypes);

    const tempDir = path.join(os.tmpdir(), `neo-restore-graph-${Date.now()}`);
    await fs.ensureDir(tempDir);

    const sourceFiles = (await fs.readdir(sourceDir)).filter(f => f.endsWith('.jsonl'));
    if (sourceFiles.length === 0) return sourceDir; // empty bundle, fall through unchanged

    // ───── Stage 1: cross-bundle node classification ─────
    // Walk EVERY JSONL file before filtering edges so that union check sees nodes from
    // sibling files (e.g., bundle splits node export and edge export). Per-file
    // classification (the previous shape) would FK-violate on cross-file edges.
    const acceptedBackupNodeIds = new Set();
    for (const fileName of sourceFiles) {
        const rl = readline.createInterface({input: fs.createReadStream(path.join(sourceDir, fileName)), crlfDelay: Infinity});
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const r = JSON.parse(line);
                if (r.type === 'node' && r.data?.id && !labelSet.has(r.data?.label)) {
                    acceptedBackupNodeIds.add(r.data.id);
                }
            } catch (e) { /* skip malformed lines */ }
        }
    }
    stats.acceptedNodes = acceptedBackupNodeIds.size;

    // ───── Stage 2: compute valid endpoint set ─────
    // Edge may insert only if both endpoints exist in (accepted backup ∪ live). Pre-
    // computing the union keeps Stage 3 to a hot-path Set lookup per endpoint.
    const validEndpointIds = new Set(liveNodeIds);
    for (const id of acceptedBackupNodeIds) validEndpointIds.add(id);

    // ───── Stage 3: write filtered output ─────
    for (const fileName of sourceFiles) {
        const inPath  = path.join(sourceDir, fileName);
        const outPath = path.join(tempDir, fileName);
        const rl      = readline.createInterface({input: fs.createReadStream(inPath), crlfDelay: Infinity});
        const out     = fs.createWriteStream(outPath);
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const r = JSON.parse(line);
                if (r.type === 'node') {
                    if (labelSet.has(r.data?.label)) { stats.filteredNodes++; continue; }
                } else if (r.type === 'edge') {
                    if (typeSet.has(r.data?.type)) { stats.filteredEdges++; continue; }
                    if (!validEndpointIds.has(r.data?.source) || !validEndpointIds.has(r.data?.target)) {
                        stats.orphanEdges++;
                        continue;
                    }
                }
                out.write(line + '\n');
            } catch (e) { /* skip malformed lines */ }
        }
        await new Promise(resolve => out.end(resolve));
    }

    logger.log?.(`[Restore][graph] pre-import filter: ${stats.acceptedNodes} accepted backup nodes, ${liveNodeIds.size} live nodes; writing filtered JSONL to ${tempDir}`);
    return tempDir;
}

/**
 * Read live graph node IDs for FK-safe edge filtering.
 *
 * Read-only better-sqlite3 access against the live `memory-core-graph.sqlite`. WAL mode
 * is the default for the live DB so concurrent reads don't block the running MC daemon.
 *
 * @param {Object} options
 * @param {String} options.dbPath Absolute path to live SQLite (`mcConfig.storagePaths.graph`).
 * @returns {Promise<Set<String>>} Set of live node IDs.
 */
export async function collectLiveGraphNodeIds({dbPath}) {
    const Database = (await import('better-sqlite3')).default;
    const db       = new Database(dbPath, {readonly: true, fileMustExist: true});
    try {
        const rows = db.prepare('SELECT id FROM Nodes').all();
        return new Set(rows.map(r => r.id));
    } finally {
        db.close();
    }
}

/**
 * Post-restore hook dispatch. **Narrow allowlist**: only deterministic,
 * idempotent, recovery-safe hooks are accepted.
 *
 * **ALLOWED:**
 *   - `'filesystem-ingestor'`: regenerates FILE/DIRECTORY nodes + CONTAINS edges from
 *     current filesystem state via `FileSystemIngestor.syncWorkspaceToGraph()`.
 *     Idempotent + deterministic. Recommended after restoring a graph backup with
 *     FILE/DIRECTORY filtered out (avoids stale-path nodes for files that no longer
 *     exist post-refactor).
 *
 * **EXPLICITLY DISALLOWED (per peer-review):**
 *   - `'dream-service'`: performs higher-order graph mutation/inference via REM cycle.
 *     Can blur post-restore validation immediately after recovery. Not equivalent to
 *     idempotent filesystem regeneration; would need separate AC for safety boundary.
 *     Defer to a follow-up ticket if needed.
 *
 * Unknown / disallowed hook names throw an explicit error rather than no-op silently.
 *
 * @param {Object} options
 * @param {String} options.hook   Hook name (must be in allowlist).
 * @param {Object} [options.logger=console]
 * @returns {Promise<{hook: String, result: Object}>}
 */
export async function dispatchPostRestoreHook({hook, logger = console}) {
    if (hook === 'filesystem-ingestor') {
        logger.log(`[Restore] Triggering post-restore hook: filesystem-ingestor (regenerates FILE/DIRECTORY/CONTAINS)...`);
        const FileSystemIngestor = (await import('../../services/memory-core/FileSystemIngestor.mjs')).default;
        await FileSystemIngestor.syncWorkspaceToGraph();
        return {hook, result: {ok: true, message: 'FileSystemIngestor.syncWorkspaceToGraph() completed'}};
    }
    if (hook === 'dream-service') {
        throw new Error(`Post-restore hook 'dream-service' is intentionally not supported (per #11141 peer-review): REM cycle does graph mutation + inference and can blur recovery validation. File a follow-up ticket if needed.`);
    }
    throw new Error(`Unknown post-restore hook: ${hook}. Allowlist: filesystem-ingestor.`);
}

/**
 * Parses CLI arguments for direct-invocation mode.
 *
 * Shape: `node ./ai/scripts/maintenance/restore.mjs <bundle-path> [--mode merge|replace] [--force] [--force-topology-mismatch]`
 *
 * @param {String[]} argv `process.argv.slice(2)`-style.
 * @returns {Object}
 */
export function parseArgs(argv) {
    const positional            = [];
    let   mode                  = 'merge';
    let   force                 = false;
    let   forceTopologyMismatch = false;
    let   filterLabels          = [];
    let   filterEdgeTypes       = [];
    let   onlySubstrate         = null;
    let   postRestoreHook       = null;

    const splitCsv = s => String(s).split(',').map(t => t.trim()).filter(Boolean);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--mode') {
            mode = argv[++i];
        } else if (arg === '--force') {
            force = true;
        } else if (arg === '--force-topology-mismatch') {
            forceTopologyMismatch = true;
        } else if (arg === '--filter-labels') {
            filterLabels = splitCsv(argv[++i]);
        } else if (arg.startsWith('--filter-labels=')) {
            filterLabels = splitCsv(arg.slice('--filter-labels='.length));
        } else if (arg === '--filter-edge-types') {
            filterEdgeTypes = splitCsv(argv[++i]);
        } else if (arg.startsWith('--filter-edge-types=')) {
            filterEdgeTypes = splitCsv(arg.slice('--filter-edge-types='.length));
        } else if (arg === '--only-substrate') {
            onlySubstrate = splitCsv(argv[++i]);
        } else if (arg.startsWith('--only-substrate=')) {
            onlySubstrate = splitCsv(arg.slice('--only-substrate='.length));
        } else if (arg === '--post-restore-hook') {
            postRestoreHook = argv[++i];
        } else if (arg.startsWith('--post-restore-hook=')) {
            postRestoreHook = arg.slice('--post-restore-hook='.length);
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

    return {bundleRoot: positional[0], mode, force, forceTopologyMismatch, filterLabels, filterEdgeTypes, onlySubstrate, postRestoreHook}
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
        console.error('Usage: node ./ai/scripts/maintenance/restore.mjs <bundle-path> [--mode merge|replace] [--force] [--force-topology-mismatch]');
        console.error('       [--filter-labels=<csv>] [--filter-edge-types=<csv>] [--only-substrate=<csv>] [--post-restore-hook=<name>]');
        console.error('Example (today\'s graph wipe restore):');
        console.error('  npm run ai:restore -- <bundle-path> --mode merge --only-substrate=graph \\');
        console.error('    --filter-labels=FILE,DIRECTORY,KB_GAP,TOOLING_GAP \\');
        console.error('    --filter-edge-types=CONTAINS,DISCOVERED_IN,EVALUATED_BY \\');
        console.error('    --post-restore-hook=filesystem-ingestor');
        process.exit(2);
    }
}
