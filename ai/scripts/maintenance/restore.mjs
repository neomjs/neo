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

import {classifyRowVector}                          from '../../services/memory-core/helpers/vectorWriteInvariant.mjs';
import {summarizeBundleIntegrity}                   from '../../services/memory-core/helpers/bundleIntegrity.mjs';
import {HEAL_LEDGER_DIR_NAME, HEAL_LEDGER_FILENAME} from '../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {INCIDENT_LEDGER_BUNDLE_MEMBERS}             from '../../services/memory-core/helpers/incidentLedgerBundle.mjs';
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
 *
 *       **Knowledge Base (Chroma)** is the fourth semantic, and it is NOT the Memory Core one
 *       above — do not read across. Its chunk id is a **content digest**
 *       (`KB DatabaseService.createContentHash` hashes content plus `extends`, `params`,
 *       `returns` and more), so id-equality means *byte-identical content*, not *same entity*,
 *       and no id-keyed strategy can distinguish "same chunk, changed content" from "different
 *       chunk". Merge therefore keys identity on a **natural key**
 *       (`{tenantId, repoSlug, source, name, type}`): a key present on both sides under
 *       differing ids means the bundle and live code no longer derive identity the same way,
 *       and the merge **refuses before any write** rather than upserting logical duplicates.
 *       An empty target skips the scan, because divergence is impossible there — the receipt
 *       says which. Giving this substrate the Memory Core's id-preflight would look like
 *       diligence and still insert every divergent row as a duplicate; the two ids mean
 *       opposite things, so symmetry between them is the trap.
 *       The graph-side preserve-live semantic used to be silently broken by
 *       `INSERT OR REPLACE`; the 2026-05-10 graph-wipe incident was the empirical anchor.
 *     - `--mode replace`: gated. Each embedded subsystem fires
 *       `assertDestructiveTargetAllowed()` before truncating + restoring. Flat substrates
 *       fire the guard against the target file/dir path before overwriting. Refuses if
 *       any target is non-empty without `--force`.
 *
 * - **Which operation is this? (`--preserve-read-state`, replace mode only.)** Two different
 *   operations share this one CLI, and they need opposite read-state policies:
 *     - **Disaster recovery** (default) — the bundle IS the new state. Reproduce it exactly;
 *       mailbox read receipts committed after the bundle was captured go with everything else.
 *     - **Operational re-seed** (`--preserve-read-state`) — the graph is being rebuilt from a
 *       lagged snapshot, **with writers quiesced first** (see the quiescence precondition below;
 *       this deliberately no longer claims "while seats keep working"). `DELIVERED_TO`
 *       `readAt`/`archivedAt` is
 *       runtime-only state that no synced bundle can carry, so without the flag an acknowledged
 *       `mark_read` is wiped after the tool already returned `status: 'read'` — an acknowledged
 *       write destroyed by a restore, which reads to the seat as its mailbox rolling backwards.
 *   Nothing is guessed from context — the operator states the intent, because only the operator
 *   knows which of the two runs this is.
 *
 * - **TWO npm FACES, and read this before adding a flag.** Because those are two operations rather
 *   than two settings, each has its own entry point, and the name **binds** the intent — it does not
 *   merely suggest it:
 *     - `npm run ai:restore -- <bundle> --mode replace --force` — disaster recovery. Every argument
 *       is the operator's; nothing is pinned.
 *     - `npm run ai:reseed  -- <bundle> --force` — the live operational re-seed. A **named operation**
 *       (`--operation reseed`, see `NAMED_OPERATIONS`) that PINS `mode: 'replace'`,
 *       `onlySubstrate: ['graph']` and `preserveReadState: true`, and **refuses** any argument that
 *       contradicts them. `--force` deliberately stays OUTSIDE it: the destructive acknowledgment
 *       must never ride along inside a convenience name.
 *   **Why pinned rather than pre-set, which is what this started as:** pre-set defaults lose to a
 *   later argument, so `ai:reseed -- <b> --mode merge` would have performed a MERGE under a name
 *   promising a replace, and the un-pinned `onlySubstrate` would have replaced **all six** substrates
 *   under a name advertising a safe live operation. A name an argument can redefine is a suggestion.
 *   Graph-only is not a narrowing for tidiness: `DELIVERED_TO` read-state lives in the graph, which
 *   is the whole reason preservation matters here.
 *   A safety property governs only where its consumer loads it — and mid-incident an operator's load
 *   path is muscle memory and shell completion, never flag documentation. Hence a name, not a note.
 *   **The drift this invites, and where to defend it:** a pass-through flag added later reaches both
 *   faces automatically (argument order is irrelevant). But a flag that interacts with a PINNED value
 *   must be added to that operation's `pins` here, or the operation will refuse it as a contradiction.
 *   This warning lives in the header rather than `package.json` because JSON cannot carry a comment,
 *   and because this file is what you are reading when you add the flag.
 *
 * - **QUIESCENCE PRECONDITION for `reseed` — a stated requirement, not an unhandled race.**
 *   `truncateDatabase()` captures the committed read receipts **inside** its truncate transaction,
 *   which closes the lost-acknowledged-write window that a separate SELECT-then-DELETE would open.
 *   But that transaction **ends before the import and re-apply run.** A `mark_read` acknowledged
 *   after the capture and before the re-apply completes is therefore **lost**, and nothing detects
 *   it. So: **stop the writers before re-seeding.** Preservation still matters under quiescence —
 *   the bundle is lagged, so receipts committed since it was captured must survive the rebuild;
 *   quiescing only removes the *concurrent* writer, not the stale-snapshot problem.
 *   A live-writer-safe variant needs a **writer fence** held across truncate→import→re-apply, which
 *   in SQLite means an exclusive lock for the whole import — i.e. enforced quiescence rather than
 *   avoided quiescence — plus a concurrent falsifier proving an ack inside the window survives.
 *   That is a separate design question and is deliberately NOT claimed here.
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
// `ledgers` is OPTIONAL, not required, and that is a compatibility decision rather than a hedge:
// every bundle written before incident ledgers were captured lacks the subfolder, and promoting it
// to required would make those bundles unrestorable — turning a durability improvement into a
// recovery regression for exactly the archives an operator reaches for first.
const OPTIONAL_BUNDLE_SUBDIRS = ['mailbox', 'ledgers'];

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
 * @param {String[]}[options.onlySubstrate=null]           If provided, restore ONLY these substrates (subset of `['kb','mc','graph','concepts','trajectories','mailbox','ledgers']`). Null = all (existing behavior).
 * @param {String}  [options.targetCollection=null]        **Disposable KB target.** Null (default) restores the KB substrate into the CANONICAL collection resolved from config — the production corpus. A name redirects it into a disposable collection instead, which is what makes a restore observable without writing to live data. The name is guarded: canonical collections are UNREACHABLE through it, with no confirmation token, because a bypass would rebuild the hazard the override removes. Redirects the `kb` substrate ONLY, so `parseArgs` requires `--only-substrate=kb` alongside it and refuses `--mode replace` (replace truncates the canonical collection). **Do not assume a wider capability than this line states** — assuming a target override already existed, when none did, is what made a restore defect unreproducible without writing to production.
 * @param {String}  [options.postRestoreHook=null]         Post-restore hook name. Currently supported: `'filesystem-ingestor'` (regenerates FILE/DIRECTORY/CONTAINS deterministically from current filesystem). Null = none.
 * @param {Boolean} [options.preserveReadState=false]      Selects the read-state policy for a `'replace'` graph restore, because the two operations that share this CLI need opposite ones. `false` (default) is DISASTER RECOVERY: the bundle is reproduced exactly, and mailbox read receipts committed after the bundle was captured are discarded with everything else. `true` is an OPERATIONAL RE-SEED: committed `DELIVERED_TO` `readAt`/`archivedAt` are captured inside the truncate transaction and re-applied wherever the bundle left them null, so acknowledged `mark_read` writes survive rebuilding the graph from a lagged snapshot. Only null-in-bundle rows are touched, so a fresher bundle is never regressed. No-op under `'merge'`, which never truncates. Forwarded as `preserveDeliveryReadState`.
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
    ledgerTargets,
    filterLabels            = [],
    filterEdgeTypes         = [],
    onlySubstrate           = null,
    postRestoreHook         = null,
    preserveReadState       = false,
    targetCollection        = null,
    expectedDimension       = AiConfig.vectorDimension,
    logger                  = console
} = {}) {
    if (!bundleRoot) {
        throw new Error('runRestore requires a `bundleRoot` argument (absolute path to a `backup-<ISO-ts>/` directory)');
    }
    if (mode !== 'merge' && mode !== 'replace') {
        throw new Error(`Unknown mode: ${mode}. Must be 'merge' or 'replace'.`);
    }
    // Say so rather than ignoring it. The flag expresses an intent about data safety, and a caller who
    // believes it is protecting read receipts should learn that merge never put them at risk — silently
    // accepting a safety-intent flag that does nothing is how a caller ends up trusting the wrong run.
    if (preserveReadState && mode === 'merge') {
        logger.warn?.('[Restore] --preserve-read-state has no effect under `--mode merge`: merge never truncates the graph, so DELIVERED_TO read receipts were never at risk. The flag applies to `--mode replace`.');
    }

    const resolvedRoot = path.resolve(bundleRoot);

    const layout = {
        ledgers     : path.join(resolvedRoot, 'ledgers'),
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

    // Resolved ONCE, above the replace preflight, so the occupancy check and the restore itself
    // cannot disagree about which paths are the targets — a preflight that guards different files
    // from the ones the run writes guards nothing.
    const resolvedLedgerTargets = ledgerTargets ?? {
        healAttemptsFile: AiConfig.orchestrator.recoveryActuator.healAttemptsPath,
        healEventsDir   : path.join(AiConfig.orchestrator.dataDir, HEAL_LEDGER_DIR_NAME),
        recoveryRunsDir : AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir
    };

    if (mode === 'replace' && !force) {
        const occupancy = await assessTargetOccupancy({
            conceptsTargetDir,
            ledgerTargets: resolvedLedgerTargets,
            sentToCullTargetFile,
            trajectoriesTargetFile
        });
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
    // Adding a `shouldRestore('x')` branch without registering `x` here makes the substrate
    // unreachable by `--only-substrate` AND rejects any operator who names it — the branch runs only
    // on the all-substrates path. Declaration and handling are one act.
    const ALL_SUBSTRATES = ['kb', 'mc', 'graph', 'concepts', 'trajectories', 'mailbox', 'ledgers'];
    if (Array.isArray(onlySubstrate)) {
        const unknown = onlySubstrate.filter(s => !ALL_SUBSTRATES.includes(s));
        if (unknown.length > 0) {
            throw new Error(`Unknown substrate(s) in --only-substrate: ${unknown.join(', ')}. Valid: ${ALL_SUBSTRATES.join(', ')}.`);
        }
    }
    const shouldRestore = (substrate) => onlySubstrate === null || onlySubstrate.includes(substrate);

    logger.log('[4/6] Restoring embedded substrates (KB, MC memories+summaries, MC graph)...');

    if (shouldRestore('kb') && await fs.pathExists(layout.kb)) {
        if (targetCollection !== null) {
            logger.log(`[4/6] KB target redirected to disposable collection '${targetCollection}' — the canonical collection is not written.`);
        }

        subsystems.kb = await KB_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : layout.kb,
            mode,
            confirmation,
            targetCollection
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

        // Forwarding this is the whole reason the SDK accepts a policy at all: a replace-mode import
        // truncates the graph, and `DELIVERED_TO` `readAt` is runtime-only state no synced bundle can
        // carry. Drop the forward and the SDK's preservation becomes unreachable from every real
        // invocation — the default then silently wipes `mark_read` writes already acknowledged as read.
        subsystems.graph = await Memory_DatabaseService.manageDatabaseBackup({
            action                   : 'import',
            file                     : graphInputDir,
            mode,
            confirmation,
            preserveDeliveryReadState: preserveReadState
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

    if (shouldRestore('ledgers') && await fs.pathExists(layout.ledgers)) {
        // The point of bundling the ledgers is that they come BACK. A volume replacement wipes the
        // orchestrator data directory; restore is what makes the incident record readable again, so
        // without this half the bundle would carry evidence nobody could retrieve.
        subsystems.ledgers = await restoreIncidentLedgers({
            confirmation,
            force,
            logger,
            mode,
            sourceDir: layout.ledgers,
            targets  : resolvedLedgerTargets
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
    if (meta && !meta.legacy) {
        logger.log(`Source bundle: bundleVersion=${meta.bundleVersion ?? '?'}, neoVersion=${meta.neoVersion ?? '?'}, gitSha=${meta.gitSha ?? '?'}, completedAt=${meta.completedAt ?? '?'}`);
    }

    return {bundleRoot: resolvedRoot, mode, subsystems, meta, topology, postRestoreHook: postRestoreHookResult}
}

/**
 * @summary An error the validator raised as a JUDGEMENT ABOUT BUNDLE CONTENT, as opposed to a
 * failure to observe the bundle at all.
 *
 * The distinction is an authorization boundary, not a tidiness one. `verifyLatestBackupRestorable`
 * walks backwards past a bundle it has proven unusable — and "proven unusable" is only true when the
 * validator actually reached the bytes and judged them. A permissions failure, a disappearing mount,
 * file-descriptor exhaustion, or a bug inside the validator all say *"I could not tell"*, and
 * treating that as *"this bundle is bad"* lets a newer, perfectly good recovery source be skipped
 * because it was merely unreadable — authorizing a deploy against stale history.
 *
 * Marker-based rather than message-based on purpose: matching English out of `error.message` stops
 * working the moment the prose is reworded, which is the same failure the machine-readable verdict
 * codes exist to prevent. It is also an ALLOWLIST — only errors the validator deliberately
 * constructs are continue-eligible, so any unrecognised throw (including one from a future code
 * path nobody has thought about yet) fails closed by construction rather than by enumeration.
 */
/**
 * @summary The only per-candidate verdicts that authorize {@link verifyLatestBackupRestorable} to
 * keep walking backwards.
 *
 * All three members are POSITIVE findings about a bundle the validator actually read: it held no
 * recoverable rows (`BUNDLE_EMPTY`), carried prior-state rows but failed the all-substrate recovery
 * contract (`BUNDLE_INCOMPLETE`), or was parsed far enough to be judged malformed
 * (`BUNDLE_INVALID`). Everything else — notably `BUNDLE_UNVERIFIABLE` — means the probe failed to
 * observe the candidate, which is not evidence about the candidate and must stop the walk.
 *
 * An allowlist rather than a denylist so a verdict code added later cannot silently become
 * continue-eligible; a new code fails closed until someone decides otherwise.
 * @type {Set<String>}
 */
export const CONTINUE_ELIGIBLE_BUNDLE_VERDICTS = new Set(['BUNDLE_EMPTY', 'BUNDLE_INCOMPLETE', 'BUNDLE_INVALID']);

export class BundleContentError extends Error {
    /**
     * @param {String} message
     */
    constructor(message) {
        super(message);
        this.name             = 'BundleContentError';
        this.bundleContentBad = true
    }
}

/**
 * @summary Constructs a content-judgement error. Use for every validator throw that expresses
 * "I read this bundle and it is malformed"; never for an IO or instrument failure.
 * @param {String} message
 * @returns {BundleContentError}
 */
function bundleContentError(message) {
    return new BundleContentError(message)
}

/**
 * @summary Reports absence that was PROVEN, never absence inferred from an error we could not read
 * past.
 *
 * `fs.pathExists` resolves `false` for *any* failure, so an `EACCES` on a parent directory is
 * indistinguishable from the path genuinely not being there. Every caller below turns that boolean
 * into a statement about bundle CONTENT — "required subdirectory missing", "no receipt, therefore a
 * legacy bundle" — which is how an unreadable bundle acquires a content verdict and, through
 * {@link CONTINUE_ELIGIBLE_BUNDLE_VERDICTS}, permission for the walk to skip it.
 *
 * Only `ENOENT` proves absence. Everything else propagates UNMARKED so `probeBundle` classifies it
 * as `BUNDLE_UNVERIFIABLE` — the same allowlist stance as the error classifier, for the same reason:
 * an unanticipated errno must land on the fail-closed side without anyone having enumerated it.
 *
 * @param {String} target Absolute path.
 * @returns {Promise<Boolean>} True only when the path is provably not there.
 * @throws {Error} The original syscall error when presence could not be determined.
 */
async function pathIsProvablyAbsent(target) {
    // A layout key that was never populated is an absent path, not an unreadable one — callers
    // legitimately pass partial layouts (the optional-subdir and ledger loops both do). `fs.pathExists`
    // absorbed this by resolving false; `fs.stat` raises a TypeError instead, so the tolerance has to
    // be restated rather than inherited. Preserves the prior verdict exactly: no path, nothing to read.
    if (!target) {
        return true
    }

    try {
        await fs.stat(target);
        return false
    } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
            return true
        }

        throw error
    }
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
 * @returns {Promise<Object>} Parsed `bundle-meta.json` content with `embeddingAdvisories`
 *     attached; for legacy bundles (no meta file) a synthetic `{legacy: true, embeddingAdvisories}`
 *     receipt — the structured unknown-provenance classification is never dropped.
 */
export async function validateBundle(bundleRoot, layout, logger = console, expectedDimension = AiConfig.vectorDimension) {
    if (await pathIsProvablyAbsent(bundleRoot)) {
        throw bundleContentError(`Bundle directory not found: ${bundleRoot}`);
    }

    const stat = await fs.stat(bundleRoot);
    if (!stat.isDirectory()) {
        throw bundleContentError(`Bundle path is not a directory: ${bundleRoot}`);
    }

    for (const subdir of REQUIRED_BUNDLE_SUBDIRS) {
        const dir = layout[subdir];
        if (await pathIsProvablyAbsent(dir)) {
            throw bundleContentError(`Required bundle subdirectory missing: ${subdir}/ (expected at ${dir})`);
        }
    }

    for (const subdir of OPTIONAL_BUNDLE_SUBDIRS) {
        const dir = layout[subdir];
        // Provably-absent only. An unreadable optional subdir must NOT be quietly "skipped" — the probe
        // would then attest a bundle whose member it never examined, which is the failure the ledger
        // members already taught us once.
        if (await pathIsProvablyAbsent(dir)) {
            logger.warn?.(`[Restore] Optional bundle subdirectory absent: ${subdir}/ (legacy bundle, skipping)`);
        }
    }

    // Full streaming structural + vector validation: every row of every JSONL is parsed, and every
    // vector-collection row must carry a non-empty string id plus a valid expected-dimension vector
    // BEFORE any mutation. Line-1 sampling cannot satisfy the gate — a corrupt final row is the
    // exact shape this closes. Streamed totals are keyed per actual vector collection (kb chunks,
    // Memory Core memories, summaries, temporal summaries) and feed the declared-count check below.
    const readline       = (await import('readline')).default;
    const allSubdirs     = [...REQUIRED_BUNDLE_SUBDIRS, ...OPTIONAL_BUNDLE_SUBDIRS];
    const streamedCounts = {};

    const collectionOf = (subdir, file) => {
        if (subdir === 'kb') return 'kb';
        if (subdir !== 'mc') return null;
        if (file.startsWith('memory-backup'))           return 'memories';
        if (file.startsWith('temporal-summary-backup')) return 'temporalSummaries';
        return 'summaries'
    };
    for (const subdir of allSubdirs) {
        const dir = layout[subdir];
        // Skipping on provable absence only. `pathExists` would also skip an unreadable directory, and
        // a skipped directory is one whose rows never get streamed — so the bundle could be declared
        // restorable on the strength of content nobody looked at.
        if (await pathIsProvablyAbsent(dir)) continue;
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
                    throw bundleContentError(`Bundle JSONL parse error at ${subdir}/${file} (line ${lineNo}): ${err.message}`);
                }

                const collection = collectionOf(subdir, file);

                if (collection) {
                    streamedCounts[collection] = (streamedCounts[collection] ?? 0) + 1;

                    if (typeof row?.id !== 'string' || row.id.length === 0) {
                        throw bundleContentError(`Bundle vector invariant violation at ${subdir}/${file} (line ${lineNo}): missing-id`);
                    }

                    const reason = classifyRowVector(row, expectedDimension);
                    if (reason) {
                        throw bundleContentError(`Bundle vector invariant violation at ${subdir}/${file} (line ${lineNo}): ${reason} (row id: ${row?.id ?? 'unknown'})`);
                    }
                }
            }
            rl.close();
            stream.destroy();
        }
    }

    const metaPath = path.join(bundleRoot, 'bundle-meta.json');
    let   meta     = null;

    if (!await pathIsProvablyAbsent(metaPath)) {
        // The read is OUTSIDE the try on purpose. `fs.readJson` both reads and parses, so wrapping it
        // whole made an `EACCES` on the receipt indistinguishable from malformed JSON — the exact
        // production path @neo-gpt reproduced, where an unreadable newest bundle was labelled
        // `BUNDLE_INVALID` and the walk continued to older history. IO failures now propagate unmarked.
        const rawMeta = await fs.readFile(metaPath, 'utf8');

        try {
            meta = JSON.parse(rawMeta)
        } catch (err) {
            throw bundleContentError(`Failed to parse bundle-meta.json: ${err.message}`);
        }
    } else {
        logger.warn?.('[Restore] bundle-meta.json absent; topology compatibility check will be skipped (legacy bundle).');
    }

    // Embedding compatibility preflight BEFORE any replace-mode truncate. Hard gates bind only to
    // evidence the bundle itself proves (schema shape, declared-vs-streamed counts, declared-vs-
    // expected dimension, per-row vectors). Provider/model identity is advisory: no write-time
    // vector provenance exists in the substrate, and admission never contacts a provider.
    // The two ledger members the top-level scan cannot reach: `heal-attempts.json` is not `.jsonl`, and
    // the recovery-run files are NESTED. Both were accepted malformed while the verdict still read
    // `RESTORABLE`. A probe may only attest what it has actually parsed.
    if (!await pathIsProvablyAbsent(layout.ledgers)) {
        const attemptsPath = path.join(layout.ledgers, INCIDENT_LEDGER_BUNDLE_MEMBERS.healAttempts);

        if (!await pathIsProvablyAbsent(attemptsPath)) {
            // Same split as the receipt above: the read must not be able to masquerade as a parse.
            const rawAttempts = await fs.readFile(attemptsPath, 'utf8');

            try {
                JSON.parse(rawAttempts)
            } catch (err) {
                throw bundleContentError(`Bundle JSON parse error at ledgers/${INCIDENT_LEDGER_BUNDLE_MEMBERS.healAttempts}: ${err.message}`);
            }
        }

        const runsDir = path.join(layout.ledgers, INCIDENT_LEDGER_BUNDLE_MEMBERS.recoveryRuns);

        if (!await pathIsProvablyAbsent(runsDir)) {
            for (const file of (await fs.readdir(runsDir)).filter(name => name.endsWith('.jsonl'))) {
                const stream = fs.createReadStream(path.join(runsDir, file), {encoding: 'utf8'}),
                      rl     = readline.createInterface({crlfDelay: Infinity, input: stream});
                let   lineNo = 0;

                for await (const line of rl) {
                    if (!line.trim()) continue;
                    lineNo++;

                    try {
                        JSON.parse(line)
                    } catch (err) {
                        throw bundleContentError(`Bundle JSONL parse error at ledgers/${INCIDENT_LEDGER_BUNDLE_MEMBERS.recoveryRuns}/${file} (line ${lineNo}): ${err.message}`);
                    }
                }
            }
        }
    }

    validateEmbeddingContractSchema({expectedDimension, meta, streamedCounts});
    const embeddingAdvisories = assessEmbeddingCompatibility({expectedDimension, logger, meta});

    // The advisory receipt rides the return even for legacy bundles (no meta file), so the
    // self-diagnostic probe and the later orchestrator always receive the structured unknown.
    if (meta) {
        meta.embeddingAdvisories = embeddingAdvisories;
        // Surfaced so a caller can decide NON-EMPTINESS from this same streaming pass instead of
        // re-reading metadata or writing a second predicate that could disagree with this one.
        meta.streamedCounts      = streamedCounts;
        return meta
    }

    return {embeddingAdvisories, legacy: true, streamedCounts}
}

/**
 * Validates the declared `meta.embedding` block against schema-v1 and against the bundle's own
 * streamed evidence. All checks here are hard gates: they compare the declaration with facts the
 * bundle carries (row totals, row dimension), never with an assumption about vector provenance.
 * Schema-v1 counts are authoritative per actual vector collection (`kb`, `memories`, `summaries`,
 * `temporalSummaries`, or any future included collection) and are never null: a new bundle must
 * attest exactly the rows it streams, in both directions.
 * @param {Object} options
 * @param {Number} options.expectedDimension Destination's expected vector dimension.
 * @param {Object|null} options.meta Parsed bundle-meta.json.
 * @param {Object} options.streamedCounts Per-collection row totals observed during the streaming pass.
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
        throw bundleContentError(`Bundle embedding contract violation: ${reason} (${detail})`)
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

    if (!declared.counts || typeof declared.counts !== 'object' || Array.isArray(declared.counts)) {
        fail('invalid-embedding-schema', 'counts must be an object keyed by vector collection');
    }

    for (const [collection, count] of Object.entries(declared.counts)) {
        if (!Number.isInteger(count) || count < 0) {
            fail('invalid-embedding-schema', `counts.${collection} must be a non-negative integer, got ${JSON.stringify(count)}`);
        }
        if (count !== (streamedCounts[collection] ?? 0)) {
            fail('count-contract-mismatch', `${collection} declares ${count} row(s) but the bundle streams ${streamedCounts[collection] ?? 0}`);
        }
    }

    for (const [collection, streamed] of Object.entries(streamedCounts)) {
        if (streamed > 0 && !(collection in declared.counts)) {
            fail('count-contract-mismatch', `bundle streams ${streamed} ${collection} row(s) but no count is declared for the collection`);
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
 * The baseline advisory is therefore ALWAYS `semantic-provenance-unverified` — including when the
 * bundle's declared consumer expectation matches the destination's active config, because a match
 * is expectation-consistency, not producer evidence. A divergence adds
 * `consumer-expectation-mismatch` on top of the baseline. The only row-verifiable semantic fact —
 * vector dimension — is enforced upstream as a hard gate; the classified residue is input for the
 * restore orchestrator's recovery receipt, which owns any re-embed/reconfigure decision.
 * Admission never contacts a provider and never re-embeds. Advisories are returned AND logged.
 * @param {Object} options
 * @param {Number} options.expectedDimension Destination's expected vector dimension.
 * @param {Object} [options.logger]
 * @param {Object|null} options.meta Parsed bundle-meta.json.
 * @returns {Object[]} The advisory list — always non-empty, since producer provenance is never
 *     verified by restore admission.
 */
export function assessEmbeddingCompatibility({expectedDimension, logger = console, meta}) {
    const
        advisories = [],
        declared   = meta?.embedding,
        consumer   = declared?.expectedConsumer;

    if (!declared) {
        advisories.push({reason: 'semantic-provenance-unverified', detail: 'no declared embedding contract (legacy bundle)'});
    } else if (!consumer) {
        advisories.push({reason: 'semantic-provenance-unverified', detail: 'embedding block declares no expectedConsumer'});
    } else {
        advisories.push({
            reason: 'semantic-provenance-unverified',
            detail: 'expectedConsumer is the backup host\'s active config at backup time — expectation context, not producer evidence'
        });

        const
            provider = AiConfig.embeddingProvider,
            model    = provider === 'ollama'
                ? AiConfig.ollama.embeddingModel
                : AiConfig.openAiCompatible.embeddingModel;

        if (consumer.provider !== provider || consumer.model !== model) {
            advisories.push({
                reason     : 'consumer-expectation-mismatch',
                bundle     : {model: consumer.model, provider: consumer.provider},
                destination: {model, provider}
            });
        }
    }

    for (const advisory of advisories) {
        logger.warn?.(`[Restore][embedding-advisory] reason=${advisory.reason} ${JSON.stringify(advisory)} — semantic-space classification is orchestrator-owned; restore admission proceeds on row-verifiable evidence only.`);
    }

    return advisories
}

/**
 * @summary Verifies the newest RESTORABLE backup bundle WITHOUT performing a restore.
 *
 * Backups are the recovery source of last resort, yet assumed-restorable-but-never-checked. This runs
 * the same pre-flight `validateBundle` gate the restore path uses (required subdirs present, JSONL
 * parseable, `bundle-meta.json` parseable) against `backup-<ISO-ts>/` directories under `backupRoot`
 * newest-first, returning a structured verdict. It performs NO writes and NO live-store import — a
 * read-only restorability probe. The alert-on-failure wiring is the escalation-mechanism piece (it
 * shares the AC1 sink decision, tracked on the parent backup-reliability ticket); this is the check
 * that produces the verdict that piece consumes.
 *
 * ## Why it does not stop at the newest bundle
 *
 * It used to inspect `bundleNames[0]` and nothing else, so ONE unusable newest bundle reported the
 * whole root unrecoverable. A run that died mid-write left a 0-byte bundle-shaped directory, this
 * probe read it, and a complete bundle carrying 94,325 recoverable rows sitting directly beside it
 * was never looked at — the deploy guard refused, and the repair was `rm -rf` on a directory inside
 * the backup root. Deleting evidence to unblock a guard is the operation this walk exists to stop
 * being necessary.
 *
 * The fallback is deliberately NOT silent. Every bundle passed over travels in `skipped` with its own
 * code and reason, and a warning names them, because a fallback that quietly succeeded would remove
 * the pressure to notice that bundles are being produced broken at all — the underlying capture
 * defect is a separate half of the same ticket.
 *
 * ## Why it stops for an unreadable candidate
 *
 * Walking backwards is only justified by a POSITIVE finding: the validator reached this bundle and
 * judged its content unusable (`BUNDLE_EMPTY` / `BUNDLE_INCOMPLETE` / `BUNDLE_INVALID` — see
 * {@link CONTINUE_ELIGIBLE_BUNDLE_VERDICTS}). A permissions failure, a vanished mount, fd
 * exhaustion, or a defect inside the validator all mean *"I could not tell"*, and an earlier
 * revision of this walk collapsed those into `BUNDLE_INVALID` and continued — so a newer, perfectly
 * good recovery source could be skipped merely because it was unreadable, authorizing a deploy
 * against staler history than actually exists. That is missing evidence being used as negative
 * evidence at a deployment authorization boundary. Such a candidate now returns
 * `BUNDLE_UNVERIFIABLE` immediately, carrying `unverifiable: true` and the syscall `errorCode` when
 * the platform supplied one, and older bundles are not considered.
 *
 * @param {Object}    options
 * @param {String}    options.backupRoot Absolute path to the `.neo-ai-data/backups` root.
 * @param {Object}   [options.logger=console] Log sink.
 * @param {Object}   [options.fsModule=fs] Filesystem seam (test injection).
 * @param {Function} [options.validateFn=validateBundle] Bundle validator seam (test injection).
 * @param {Number}   [options.maxBundlesExamined=AiConfig.maintenance.backup.restorabilityScanLimit]
 *     Cap on bundles validated. Read as a default parameter (evaluated per call, so an overlay change
 *     is honoured without a reload). Exhausting it warns which candidates went unexamined rather than
 *     reporting a clean "nothing restorable".
 * @returns {Promise<{restorable: Boolean, priorStateEvidence: Boolean, recoverySourceAuthorized: Boolean, code: String, bundleRoot: String|null, reason: String|null, checkedAt: String, rowTotal: Number|undefined, embeddingAdvisories: Object[], skipped: Object[], examined: Number}>}
 * `code` is the machine-readable verdict — `RESTORABLE`, `BUNDLE_ROOT_MISSING`, `NO_BUNDLES`,
 * `BUNDLE_EMPTY`, `BUNDLE_INCOMPLETE`, `BUNDLE_INVALID`, or `BUNDLE_UNVERIFIABLE`. `RESTORABLE`
 * asserts the bundle is structurally valid, non-empty, and complete across the canonical recovery
 * substrates. `priorStateEvidence` remains independently true for an incomplete non-empty bundle,
 * preserving the initialization interlock without authorizing recovery. `rowTotal` reports the
 * observed vector rows, and
 * `bundleRoot` names WHICH bundle earned the verdict — no longer necessarily the newest one present.
 * That strength lives here rather than in a caller so a shell gate consumes one authoritative verdict
 * instead of re-reading metadata and growing a second predicate able to disagree with this one.
 * `restorable` remains a compatibility alias of `recoverySourceAuthorized`; it must never be used
 * as prior-state evidence now that the two questions have separate fields.
 *
 * On failure the reported `code`/`bundleRoot`/`reason` describe the NEWEST bundle rather than an
 * invented aggregate, so a single-bundle root answers exactly as it did before this function learned
 * to look further back, and `redeployPreflight`'s refusal still prints the most recent cause.
 * `skipped` lists every rejected candidate newest-first; `examined` counts full validations spent.
 *
 * It exists so a caller gating on this probe branches on a value rather than
 * pattern-matching English out of `reason`, which would silently stop working the moment the prose
 * is reworded. `BUNDLE_ROOT_MISSING` and `NO_BUNDLES` are deliberately separate: the bundle root is
 * bind-mounted from a path relative to the compose project directory, so a run from a different host
 * checkout finds a directory that never existed — reporting "no bundle" for bundles sitting safely
 * in a prior checkout is the wrong answer to the operator's actual question.
 */
export async function verifyLatestBackupRestorable({
    backupRoot,
    logger             = console,
    fsModule           = fs,
    validateFn         = validateBundle,
    maxBundlesExamined = AiConfig.maintenance.backup.restorabilityScanLimit
} = {}) {
    if (!backupRoot) {
        throw new Error('verifyLatestBackupRestorable requires a `backupRoot` argument.');
    }

    // Guarding the class, not the one malformed value. A bound below 1 examines nothing, so the walk
    // would fall through to the no-candidate return with nothing recorded and raise an obscure
    // TypeError inside a deploy guard. A probe whose job is to be believed must fail loud about its
    // own arguments rather than crash describing something else.
    if (!Number.isInteger(maxBundlesExamined) || maxBundlesExamined < 1) {
        throw new Error(`verifyLatestBackupRestorable requires a positive integer \`maxBundlesExamined\`; received ${maxBundlesExamined}.`);
    }

    const checkedAt = new Date().toISOString();

    if (!await fsModule.pathExists(backupRoot)) {
        // Distinct from NO_BUNDLES on purpose. The cloud profile bind-mounts the bundle root from a
        // path RELATIVE to the compose project directory, so a deployment run from a different host
        // checkout addresses a directory that never existed rather than an empty one. Reporting "no
        // bundle" for bundles sitting safely in a prior checkout would answer about the wrong subject.
        return {
            restorable              : false,
            priorStateEvidence      : false,
            recoverySourceAuthorized: false,
            code                    : 'BUNDLE_ROOT_MISSING',
            bundleRoot              : null,
            reason                  : `backup root not found: ${backupRoot}`,
            checkedAt,
            skipped                 : [],
            examined                : 0
        };
    }

    // backup-<ISO-ts> names sort lexically by their ISO timestamp, so reverse-sort yields newest-first.
    const bundleNames = (await fsModule.readdir(backupRoot, {withFileTypes: true}))
        .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
        .map(entry => entry.name)
        .sort()
        .reverse();

    if (bundleNames.length === 0) {
        return {
            restorable              : false,
            priorStateEvidence      : false,
            recoverySourceAuthorized: false,
            code                    : 'NO_BUNDLES',
            bundleRoot              : null,
            reason                  : `no backup-* bundles under ${backupRoot}`,
            checkedAt,
            skipped                 : [],
            examined                : 0
        };
    }

    const skipped  = [];
    let   examined = 0,
          newest   = null;

    for (const bundleName of bundleNames) {
        if (examined >= maxBundlesExamined) {
            // A bound that is silent reads exactly like an exhaustive search that found nothing, which
            // is the same false-negative this function exists to stop being. Say what was not looked at.
            logger.warn?.(
                `[Restore] examined ${examined} candidate bundle(s) without finding a restorable one; ` +
                `${bundleNames.length - examined} older candidate(s) were NOT examined ` +
                '(maxBundlesExamined). Raise the bound to search further back.'
            );
            break
        }

        examined++;

        const verdict = await probeBundle({backupRoot, bundleName, logger, validateFn, checkedAt});

        if (verdict.recoverySourceAuthorized) {
            // Reporting rather than hiding. The operator's repair for the incident was `rm -rf` on the
            // unusable newest directory; a fallback that silently succeeded would have removed the
            // pressure to notice it at all, so every bundle passed over travels with the verdict.
            if (skipped.length > 0) {
                logger.warn?.(
                    `[Restore] verified ${verdict.bundleRoot} after passing over ${skipped.length} ` +
                    `unusable newer bundle(s): ${skipped.map(s => `${s.bundleName} (${s.code})`).join(', ')}`
                );
            }

            return {...verdict, skipped, examined}
        }

        // FAIL CLOSED on an unobservable candidate. Walking backwards is only justified when the
        // validator REACHED this bundle and judged its content bad; an EACCES, a disappearing mount,
        // fd exhaustion, or a bug in the validator all mean "I could not tell". Continuing there would
        // let a newer, perfectly good recovery source be skipped because it was merely unreadable, and
        // authorize a deploy against stale history — turning missing evidence into negative evidence
        // at the exact boundary the restore gate exists to protect. Reported by @neo-gpt on this PR,
        // reproduced with the validator seam before this branch existed.
        if (!CONTINUE_ELIGIBLE_BUNDLE_VERDICTS.has(verdict.code)) {
            logger.warn?.(
                `[Restore] STOPPING at ${bundleName}: its bundle verdict could not be established ` +
                `(${verdict.code}). Older bundles were NOT considered — an unreadable candidate is not ` +
                'a bad one, and skipping it would authorize recovery from staler history than exists. ' +
                `Reason: ${verdict.reason}`
            );

            return {...verdict, skipped, examined}
        }

        // The WHOLE verdict, not a projection of it. Rebuilding a reduced `{code, reason, bundleRoot}`
        // silently dropped `rowTotal` and `embeddingAdvisories` from every refusal — fields a caller
        // had before this function learned to walk. The failure shape must stay byte-identical to the
        // single-bundle one it replaces.
        newest ??= verdict;
        skipped.push({bundleName, code: verdict.code, reason: verdict.reason});
    }

    // No candidate survived. The verdict keeps the NEWEST bundle's own result rather than inventing an
    // aggregate one: consumers (`redeployPreflight.evaluateRedeployPreconditions`) branch on
    // `RESTORABLE` vs everything-else and log the code as the refusal cause, so the most recent
    // failure remains the most useful thing to print — and a single-bundle root reports exactly what
    // it reported before this function learned to look further back.
    return {...newest, skipped, examined}
}

/**
 * @summary Runs the full structural + non-emptiness probe against ONE bundle.
 *
 * Extracted verbatim from {@link verifyLatestBackupRestorable}'s former single-bundle body so the
 * walk gains a loop without the per-bundle contract changing. Every verdict this returns is one the
 * function already returned before it could look past the newest bundle.
 *
 * @param {Object}    options
 * @param {String}    options.backupRoot Absolute `.neo-ai-data/backups` root.
 * @param {String}    options.bundleName `backup-<ISO-ts>` directory name.
 * @param {Object}    options.logger Log sink.
 * @param {Function}  options.validateFn Bundle validator seam.
 * @param {String}    options.checkedAt Shared ISO timestamp for the whole walk.
 * @returns {Promise<Object>} `RESTORABLE`, `BUNDLE_EMPTY`, `BUNDLE_INCOMPLETE`, or `BUNDLE_INVALID`
 *     for this bundle alone.
 *     `collectionCounts` and `emptyCollections` are present on EVERY return, and are `null` on the
 *     paths where nothing could be measured (`BUNDLE_INVALID` / `BUNDLE_UNVERIFIABLE`). `null` and
 *     `[]` are different answers: `[]` means the collections were counted and none were empty,
 *     `null` means the question was never answered. Omitting them on the unmeasured paths made
 *     `result.emptyCollections?.length > 0` read false for a bundle nobody could read.
 */
async function probeBundle({backupRoot, bundleName, logger, validateFn, checkedAt}) {
    const bundleRoot = path.join(backupRoot, bundleName);
    // `ledgers` belongs in the probe's layout because the probe ATTESTS a restore that will write
    // them. Omitting it meant malformed ledger content passed unexamined while the verdict still said
    // `RESTORABLE` — the probe vouching for a member it never looked at.
    const layout = {
        kb          : path.join(bundleRoot, 'kb'),
        mc          : path.join(bundleRoot, 'mc'),
        graph       : path.join(bundleRoot, 'graph'),
        concepts    : path.join(bundleRoot, 'concepts'),
        trajectories: path.join(bundleRoot, 'trajectories'),
        mailbox     : path.join(bundleRoot, 'mailbox'),
        ledgers     : path.join(bundleRoot, 'ledgers')
    };

    try {
        const meta                     = await validateFn(bundleRoot, layout, logger),
              observedCollectionCounts = meta?.streamedCounts ?? {},
              declaredCollectionCounts = meta?.embedding?.counts,
              // Schema-v1 declared counts are validated against the streamed rows in BOTH
              // directions, and unlike the sparse observed map they retain zero-valued members.
              // They remain reporting evidence; substrate authorization comes from the existing
              // bundle-integrity SSOT below.
              collectionCounts         = declaredCollectionCounts
                  ? {...declaredCollectionCounts}
                  : observedCollectionCounts,
              rowTotal                  = Object.values(observedCollectionCounts)
                  .reduce((sum, count) => sum + count, 0),
              emptyCollections          = declaredCollectionCounts
                  ? Object.entries(collectionCounts)
                      .filter(([, count]) => !(count > 0))
                      .map(([collection]) => collection)
                      .sort()
                  : null,
              integrity                 = summarizeBundleIntegrity(meta?.integrity),
              emptySubsystems           = integrity.emptySubsystems,
              integrityRowsPresent      = Array.isArray(meta?.integrity)
                  && meta.integrity.some(entry => entry?.sourceCount > 0 || entry?.bundleCount > 0),
              priorStateEvidence        = rowTotal > 0 || integrityRowsPresent,
              // Legacy bundles predate `bundle-meta.integrity`; preserve their established
              // non-empty compatibility contract. Every current bundle must earn authorization
              // through the shared all-substrate survivability rule.
              recoverySourceAuthorized  = priorStateEvidence
                  && (meta?.legacy === true || integrity.restorable === true);

        if (!priorStateEvidence) {
            return {
                restorable              : false,
                priorStateEvidence,
                recoverySourceAuthorized: false,
                code                    : 'BUNDLE_EMPTY',
                bundleRoot,
                reason                  : `bundle parses but carries zero recoverable rows: ${bundleRoot}`,
                checkedAt,
                collectionCounts,
                emptyCollections,
                emptySubsystems,
                rowTotal,
                embeddingAdvisories     : meta?.embeddingAdvisories ?? []
            }
        }

        if (!recoverySourceAuthorized) {
            return {
                restorable: false,
                priorStateEvidence,
                recoverySourceAuthorized,
                code      : 'BUNDLE_INCOMPLETE',
                bundleRoot,
                reason    : emptySubsystems.length > 0
                    ? `bundle has empty recovery subsystem(s): ${emptySubsystems.join(', ')} (${bundleRoot})`
                    : `bundle carries prior-state rows but recovery-source completeness could not be established: ${bundleRoot}`,
                checkedAt,
                collectionCounts,
                emptyCollections,
                emptySubsystems,
                rowTotal,
                embeddingAdvisories    : meta?.embeddingAdvisories ?? []
            }
        }

        return {
            restorable         : true,
            priorStateEvidence,
            recoverySourceAuthorized,
            code               : 'RESTORABLE',
            bundleRoot,
            reason             : null,
            checkedAt,
            collectionCounts,
            emptyCollections,
            emptySubsystems,
            rowTotal,
            embeddingAdvisories: meta?.embeddingAdvisories ?? []
        };
    } catch (error) {
        // Two different answers, and only one of them is a judgement about the bundle.
        //
        // `BUNDLE_INVALID` means the validator read this bundle and found its content malformed —
        // a fact about the artifact, and the only failure that entitles the caller to look further
        // back. `BUNDLE_UNVERIFIABLE` means the validator could not establish anything: permissions,
        // a vanished mount, fd exhaustion, or a defect in the validator itself.
        //
        // The test is the marker the validator sets on errors it deliberately constructs, never the
        // message text — prose reworks silently, which is exactly why the verdict codes exist. And it
        // is an ALLOWLIST, so an unrecognised throw from any future code path lands on the
        // fail-closed side without anyone remembering to enumerate it.
        const contentJudged = error instanceof BundleContentError || error?.bundleContentBad === true,
              reason        = contentJudged
                  ? error.message
                  : `bundle verdict could not be established: ${error?.message ?? String(error)}`;

        return {
            restorable              : false,
            priorStateEvidence      : false,
            recoverySourceAuthorized: false,
            code                    : contentJudged ? 'BUNDLE_INVALID' : 'BUNDLE_UNVERIFIABLE',
            bundleRoot,
            reason,
            checkedAt,
            // NOT measured, and said so rather than omitted. Leaving these off this path made absence
            // indistinguishable from "measured, none empty" for any consumer that optional-chains:
            // `result.emptyCollections?.length > 0` reads FALSE on a bundle nobody could read — falsely
            // reassuring, and on the fail-closed path where that costs most.
            //
            // `null` is the third state, distinct from `[]`. Empty array means measured and none were
            // empty; `null` means the question was never answered. A consumer that treats them alike is
            // making the same mistake this whole verdict exists to remove.
            collectionCounts   : null,
            emptyCollections   : null,
            emptySubsystems    : null,
            embeddingAdvisories: error.embeddingAdvisories ?? [],
            // Structured, so a consumer distinguishes the two states without matching English.
            // `errorCode` carries the syscall errno when the platform supplied one (EACCES, EMFILE…).
            ...(contentJudged ? {} : {unverifiable: true, errorCode: error?.code ?? null})
        }
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
async function assessTargetOccupancy({trajectoriesTargetFile, sentToCullTargetFile, conceptsTargetDir, ledgerTargets}) {
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

    // The incident ledgers are replace targets too, and were initially omitted here. The omission was
    // invisible because `assertDestructiveTargetAllowed` still fired on them — but that guard
    // classifies target LOCATION and confirmation; it does not enforce `--force`. So a populated
    // ledger on a disposable path could be overwritten with `force: false`, contrary to this
    // function's whole purpose. A test asserting "the guard was called" proved the wrong
    // proposition; what has to hold is that the run REFUSES.
    if (ledgerTargets) {
        for (const [subsystem, target] of [
            ['ledgers.healAttempts', ledgerTargets.healAttemptsFile],
            ['ledgers.healEvents',   ledgerTargets.healEventsDir],
            ['ledgers.recoveryRuns', ledgerTargets.recoveryRunsDir]
        ]) {
            if (!target || !await fs.pathExists(target)) {
                results.push({subsystem, nonEmpty: false, size: 0});
                continue
            }

            const stat = await fs.stat(target);

            if (stat.isDirectory()) {
                const entries = (await fs.readdir(target)).filter(name => name.endsWith('.jsonl'));

                results.push({subsystem, nonEmpty: entries.length > 0, size: entries.length})
            } else {
                results.push({subsystem, nonEmpty: stat.size > 0, size: stat.size})
            }
        }
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
/**
 * Restores the three incident ledgers from the bundle's `ledgers/` subfolder.
 *
 * Bundling the ledgers is only half the guarantee — a volume replacement wipes the orchestrator data
 * directory, so restore is what makes the incident record readable again. Without this the bundle
 * would carry evidence nobody could retrieve.
 *
 * Singletons are addressed by their EXACT filename rather than by "the first `.jsonl` in the
 * folder", which is what `restoreFlatFile` does and which would silently pick the wrong file once a
 * second ledger lands beside them. `heal-attempts.json` is not `.jsonl` at all, so neither existing
 * flat helper reaches it.
 *
 * @param {Object} options
 * @param {String} options.sourceDir Absolute `ledgers/` path inside the bundle.
 * @param {Object} options.targets Resolved `{healAttemptsFile, healEventsDir, recoveryRunsDir}`.
 * @returns {Promise<{healAttempts: Object, healEvents: Object, recoveryRuns: Object, mode: String}>}
 */
async function restoreIncidentLedgers({sourceDir, targets, mode, force, confirmation, logger}) {
    /**
     * Authorizes one named ledger WITHOUT mutating anything, returning the plan its mutation phase
     * will execute.
     *
     * Split from the copy on purpose. The three ledgers previously ran through `Promise.all` while
     * each did guard-check-THEN-mutate, so a guard that refused SLOWLY on one ledger let a sibling
     * whose guard resolved quickly complete its overwrite before `runRestore` rejected. The run
     * reported failure having already destroyed data — worse than either outcome alone, because an
     * operator seeing a refusal reasonably concludes nothing happened.
     *
     * @param {String} fileName
     * @param {String} targetFile
     * @param {String} subsystem
     * @returns {Promise<Object>}
     */
    const planNamed = async (fileName, targetFile, subsystem) => {
        const source = path.join(sourceDir, fileName);

        if (!await fs.pathExists(source)) {
            return {outcome: {copied: false, mode, note: `source absent: ${fileName}`}}
        }

        if (mode === 'replace') {
            await Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed({
                confirmation,
                mode     : 'replace',
                operation: `restore.${subsystem}.replace`,
                source   : {path: source},
                subsystem,
                target   : {path: targetFile, repoRoot: PROJECT_ROOT}
            });
        } else if (!force && await fs.pathExists(targetFile)) {
            logger.log?.(`[Restore][${subsystem}] preserved existing ${fileName} (merge mode without --force)`);
            return {outcome: {copied: false, skipped: true, mode}}
        }

        return {apply: async () => {
            await fs.ensureDir(path.dirname(targetFile));
            await fs.copy(source, targetFile, {overwrite: true});

            return {copied: true, mode}
        }}
    };

    // PHASE 1 — authorize EVERY ledger before ANY of them mutates. Sequential, so the first refusal
    // returns while the filesystem is still untouched; concurrency here would reintroduce the exact
    // race this split exists to close.
    //
    // Looked up by the STABLE bundle member name and written to the RESOLVED host path. Searching by
    // `path.basename(target)` coupled the bundle's contents to the reading host's config: a relocated
    // `healAttemptsPath` made a perfectly good bundle read as `source absent`.
    const attemptsPlan = await planNamed(
              INCIDENT_LEDGER_BUNDLE_MEMBERS.healAttempts, targets.healAttemptsFile, 'ledgers.healAttempts'
          ),
          eventsPlan   = await planNamed(
              HEAL_LEDGER_FILENAME, path.join(targets.healEventsDir, HEAL_LEDGER_FILENAME), 'ledgers.healEvents'
          ),
          runsSource   = path.join(sourceDir, INCIDENT_LEDGER_BUNDLE_MEMBERS.recoveryRuns);

    // `restoreFlatDir` fires its own guard as step one, so its authorization is hoisted here and the
    // call below runs pre-authorized rather than re-asking mid-mutation.
    if (mode === 'replace' && await fs.pathExists(runsSource)) {
        await Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed({
            confirmation,
            mode     : 'replace',
            operation: 'restore.ledgers.recoveryRuns.replace',
            source   : {path: runsSource},
            subsystem: 'ledgers.recoveryRuns',
            target   : {path: targets.recoveryRunsDir, repoRoot: PROJECT_ROOT}
        });
    }

    // PHASE 2 — every authorization has passed; now mutate.
    const [healAttempts, healEvents, recoveryRuns] = await Promise.all([
        attemptsPlan.apply ? attemptsPlan.apply() : attemptsPlan.outcome,
        eventsPlan.apply   ? eventsPlan.apply()   : eventsPlan.outcome,
        restoreFlatDir({
            confirmation,
            force,
            logger,
            mode,
            preAuthorized: true,
            sourceDir    : runsSource,
            subsystem    : 'ledgers.recoveryRuns',
            targetDir    : targets.recoveryRunsDir
        })
    ]);

    return {healAttempts, healEvents, mode, recoveryRuns}
}

async function restoreFlatDir({sourceDir, targetDir, mode, force, confirmation, subsystem, logger, preAuthorized = false}) {
    if (!await fs.pathExists(sourceDir)) {
        return {copied: 0, skipped: 0, mode, note: `source absent: ${sourceDir}`}
    }

    const sourceEntries = await fs.readdir(sourceDir);
    const sourceFiles   = sourceEntries.filter(f => f.endsWith('.jsonl'));

    // `preAuthorized` exists for callers that must authorize a GROUP of targets before any member
    // mutates — asking again here would be redundant, not safer. It never skips the emptyDir below:
    // the authorization moved earlier, it did not disappear.
    if (mode === 'replace' && !preAuthorized) {
        await Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: `restore.${subsystem}.replace`,
            subsystem,
            mode     : 'replace',
            target   : {path: targetDir, repoRoot: PROJECT_ROOT},
            source   : {path: sourceDir},
            confirmation
        });
        await fs.emptyDir(targetDir);
    } else if (mode === 'replace') {
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
 * Named operations: an operator-facing intent with its defining arguments PINNED, not defaulted.
 *
 * `reseed` is the operational re-seed — the graph rebuilt from a lagged snapshot, **with writers
 * quiesced first** (see the quiescence precondition in the module header; the capture transaction
 * closes before the re-apply, so a concurrently-acked `mark_read` would be lost). It is graph-ONLY
 * on purpose: `DELIVERED_TO` read-state lives in the graph, and that is the entire reason
 * preservation matters, so replacing the other five substrates under this name would be a far larger
 * destructive footprint than the name implies.
 * Disaster recovery keeps the plain `ai:restore` surface with its exact-replacement default.
 * @type {Object}
 */
const NAMED_OPERATIONS = {
    reseed: {
        pins        : {mode: 'replace', onlySubstrate: ['graph'], preserveReadState: true},
        conflictHint: 'Use `npm run ai:restore` for a different mode or a wider substrate set.'
    }
};

/**
 * Parses CLI arguments for direct-invocation mode.
 *
 * Shape: `node ./ai/scripts/maintenance/restore.mjs <bundle-path> [--mode merge|replace] [--force] [--force-topology-mismatch]`
 *
 * Diagnostic shape: `<bundle-path> --mode merge --only-substrate=kb --target-collection=<disposable-name>`
 * — restores KB into a throwaway collection so a restore can be exercised without writing to the
 * live corpus. The three arguments are co-required by construction: the override refuses canonical
 * names, refuses `replace`, and refuses to run without the substrate restriction, so a
 * half-diagnostic run that quietly writes production is not expressible.
 *
 * @param {String[]} argv `process.argv.slice(2)`-style.
 * @returns {Object}
 */
export function parseArgs(argv) {
    const positional = [];
    // Track what the CALLER stated, separately from what an operation pins. Without this the
    // operation cannot tell "the operator asked for merge" from "nobody said anything", and a
    // named operation whose defining flags a later argument silently overrides is not an
    // operation — it is a suggestion. This started life as that suggestion.
    const stated                = {};
    let   operation             = null;
    let   mode                  = 'merge';
    let   force                 = false;
    let   forceTopologyMismatch = false;
    let   filterLabels          = [];
    let   filterEdgeTypes       = [];
    let   onlySubstrate         = null;
    let   postRestoreHook       = null;
    let   preserveReadState     = false;
    let   targetCollection      = null;

    const splitCsv = s => String(s).split(',').map(t => t.trim()).filter(Boolean);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--operation') {
            operation = argv[++i];
        } else if (arg.startsWith('--operation=')) {
            operation = arg.slice('--operation='.length);
        } else if (arg === '--mode') {
            mode = argv[++i]; stated.mode = mode;
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
            onlySubstrate = splitCsv(argv[++i]); stated.onlySubstrate = onlySubstrate;
        } else if (arg.startsWith('--only-substrate=')) {
            onlySubstrate = splitCsv(arg.slice('--only-substrate='.length)); stated.onlySubstrate = onlySubstrate;
        } else if (arg === '--post-restore-hook') {
            postRestoreHook = argv[++i];
        } else if (arg.startsWith('--post-restore-hook=')) {
            postRestoreHook = arg.slice('--post-restore-hook='.length);
        } else if (arg === '--preserve-read-state') {
            preserveReadState = true;
        } else if (arg === '--target-collection') {
            targetCollection = argv[++i];
        } else if (arg.startsWith('--target-collection=')) {
            targetCollection = arg.slice('--target-collection='.length);
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

    // `--target-collection` redirects the KB substrate ONLY — no other substrate has a
    // collection-target override. Left unrestricted, `restore.mjs <bundle> --target-collection=x`
    // would send KB somewhere disposable while MC, the graph, concepts and trajectories all
    // landed in PRODUCTION, under a flag whose whole purpose is to avoid touching production.
    // That is a worse failure than the missing capability this flag closes, because the operator
    // has been told the run is diagnostic. Requiring the substrate restriction makes the partial
    // redirect inexpressible rather than merely documented.
    if (targetCollection !== null) {
        if (targetCollection.startsWith('--') || targetCollection.trim() === '') {
            throw new Error('--target-collection requires a collection name.');
        }
        if (onlySubstrate === null || onlySubstrate.length !== 1 || onlySubstrate[0] !== 'kb') {
            throw new Error(
                `--target-collection only redirects the 'kb' substrate, so it requires ` +
                `--only-substrate=kb. Without that restriction the other substrates would still ` +
                `be restored into PRODUCTION while KB went to '${targetCollection}' — a partial ` +
                `redirect under a flag that implies the run touches nothing live.`
            );
        }
        // NOTE on what actually guards a NAMED OPERATION, because this check does not.
        //
        // This runs BEFORE `op.pins` is applied, so it reads the pre-pin default and cannot see a
        // pin about to set `mode: 'replace'`. `ai:reseed -- <bundle> --target-collection=x` is
        // nonetheless refused — by the substrate requirement above, since `reseed` pins
        // `onlySubstrate: ['graph']`, which fails the exact-match check or the pin-contradiction
        // refusal. Requiring `['kb']` EXACTLY rather than inclusively is what makes every named
        // operation structurally unreachable through this flag; found in review by @neo-opus-ada,
        // who went looking for the ordering hole and found the property that closes it instead.
        //
        // The bound: that holds only while no named operation pins `['kb']`. One pinning
        // `onlySubstrate: ['kb'], mode: 'replace'` would pass here and be caught solely by
        // `importDatabase`'s own refusal. Defence-in-depth holds, so this stays a note rather than
        // a reordering — but do not read this check as the thing protecting that case.
        if (stated.mode === 'replace' || mode === 'replace') {
            throw new Error(
                `--target-collection cannot be combined with --mode replace: replace truncates the ` +
                `CANONICAL collection, so the run would empty production while importing into ` +
                `'${targetCollection}'. A freshly created disposable collection is already empty.`
            );
        }
    }

    // A named operation PINS its defining arguments and refuses contradiction. It does not merely
    // pre-set defaults a later argument can overwrite: `npm run ai:reseed -- <b> --mode merge`
    // would otherwise perform a MERGE under a name that promises a replace, which is a worse lie
    // than having no name at all. `--force` is deliberately NOT pinned — the destructive
    // acknowledgment stays the operator's explicit act and never rides inside a convenience name.
    if (operation !== null) {
        const op = NAMED_OPERATIONS[operation];

        if (!op) {
            throw new Error(`Unknown operation: ${operation}. Valid: ${Object.keys(NAMED_OPERATIONS).join(', ')}.`);
        }

        for (const [key, pinned] of Object.entries(op.pins)) {
            const asked = stated[key];

            if (asked !== undefined && JSON.stringify(asked) !== JSON.stringify(pinned)) {
                throw new Error(
                    `--operation ${operation} pins ${key}=${JSON.stringify(pinned)}, but ${JSON.stringify(asked)} was requested. ` +
                    `${op.conflictHint} Refusing rather than silently redefining the operation.`
                );
            }
        }

        ({mode = mode, onlySubstrate = onlySubstrate, preserveReadState = preserveReadState} = {...op.pins});
    }

    return {bundleRoot: positional[0], mode, force, forceTopologyMismatch, filterLabels, filterEdgeTypes, onlySubstrate, postRestoreHook, preserveReadState, operation, targetCollection}
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
        console.error('       [--preserve-read-state]  replace mode: keep committed mailbox read receipts (operational re-seed);');
        console.error('                                omit for disaster recovery, where the bundle is reproduced exactly.');
        console.error('       [--operation reseed]     graph-only re-seed. PINS --mode replace, --only-substrate=graph and');
        console.error('                                --preserve-read-state, and REFUSES an argument that contradicts them.');
        console.error('                                QUIESCE WRITERS FIRST: the read-receipt capture closes before the');
        console.error('                                re-apply, so an ack landing in that window is lost. `npm run ai:reseed`.');
        console.error('Example (today\'s graph wipe restore):');
        console.error('  npm run ai:restore -- <bundle-path> --mode merge --only-substrate=graph \\');
        console.error('    --filter-labels=FILE,DIRECTORY,KB_GAP,TOOLING_GAP \\');
        console.error('    --filter-edge-types=CONTAINS,DISCOVERED_IN,EVALUATED_BY \\');
        console.error('    --post-restore-hook=filesystem-ingestor');
        process.exit(2);
    }
}
