/**
 * @module ai/daemons/orchestrator/daemon
 * @summary Thin Node-process boot wrapper for the Agent OS maintenance orchestrator.
 *
 * Process ownership stays here: PID-file directory creation, CLI entrypoint, and
 * fatal-start error isolation. Scheduling, child-task state, and per-task health
 * reporting live in `Neo.ai.daemons.Orchestrator`.
 *
 * @see ai/daemons/orchestrator/Orchestrator.mjs
 * @see learn/agentos/v13-path.md
 */
// dotenv: load local `.env` into `process.env` before ANY consumer reads env vars.
// Cloud deployment doesn't need it (env-only via docker-compose); local dev needs
// it for `.env` file load. Placement at the orchestrator entrypoint is deliberate
// so env-file loading stays entrypoint-local instead of becoming a global registry
// or shared substrate.
import 'dotenv/config';

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so consumed class files (Orchestrator, TaskStateService,
// ProcessSupervisorService, etc.) can call `Neo.setupClass()` at module-load.
// `InstanceManager` binds `Neo.find` / `Neo.findFirst` / `Neo.get` aliases, sets
// `Base.instanceManagerAvailable=true`, and consumes the pre-singleton `Neo.idMap`.
// All 3 MUST run before any class import that uses `Neo.setupClass()`.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import {fileURLToPath, pathToFileURL}                                    from 'url';
import fs                                                                from 'fs-extra';
import path                                                              from 'path';
import {execSync}                                                        from 'child_process';
import AiConfig                                                          from '../../config.mjs';
import Orchestrator, {rotateLogFileIfNewDay}                             from './Orchestrator.mjs';
import {acquireAuthorityLease, AUTHORITY_LEASE_TTL_MS}                   from './authorityLease.mjs';
import {assertAuthorityProfile, isTaskOwnedByProfile}                    from './taskAuthority.mjs';
import {assertConfigFresh}                                               from '../../scripts/setup/initServerConfigs.mjs';
import {DAEMON_EXIT_CRASH, DAEMON_EXIT_OK}                               from '../shared/daemonExit.mjs';
import Tier1ConfigBase, {PLANE_MEMBER_PATHS as TIER1_PLANE_MEMBER_PATHS} from '../../configBase.mjs';
import {
    assertPlaneCoherence,
    assertPlaneMemberCoherence,
    collectPlaneMembers,
    resolvePlaneDataRoot
} from '../../planeConfig.mjs';

const ORCHESTRATOR_DAEMON_PATH_TAIL = 'ai/daemons/orchestrator/daemon.mjs';

// The durable-root reference for the fail-closed plane check: THIS checkout's ANCHOR root. The
// anchor computation reads no env by construction, so it cannot drift with the process
// environment — which is what makes it usable as the fixed point a declared overlay must not
// resolve to, whether through env leakage or a symlink layer. Same reference BaseServer uses.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
export const LOCAL_AI_CONFIG_FILE = fileURLToPath(new URL('../../config.mjs', import.meta.url));

/**
 * @summary Resolves the orchestrator daemon's runtime data directory from the config provider.
 *
 * The provider owns the default AND the `NEO_AI_ORCHESTRATOR_DIR` env binding, so this
 * entrypoint reads the resolved leaf instead of re-deriving it from `process.env` with a
 * shadow default. Resolved lazily at each use site (all of which run after the boot-time
 * config-freshness guard) rather than via an eager module-level `path.join`: on a stale
 * config overlay the leaf is missing, and an eager join would crash module evaluation
 * before the guard can name the actionable `--migrate-config` fix.
 * @returns {String}
 */
function daemonDataDir() {
    return AiConfig.orchestrator.dataDir;
}

/**
 * @summary Resolves the daemon singleton PID-file path under {@link daemonDataDir}.
 * @returns {String}
 */
function pidFilePath() {
    return path.join(daemonDataDir(), 'orchestrator-daemon.pid');
}

/**
 * @summary Resolves the shared orchestrator log-file path under {@link daemonDataDir}.
 * @returns {String}
 */
function logFilePath() {
    return path.join(daemonDataDir(), 'orchestrator.log');
}

/**
 * @summary Checks whether a process command belongs to this daemon entry point.
 * Uses the orchestrator-specific path-tail to avoid sibling `daemon.mjs` collisions.
 * @param {String} cmd Process command line.
 * @returns {Boolean}
 */
export function isOrchestratorDaemonCommand(cmd) {
    return cmd.includes(ORCHESTRATOR_DAEMON_PATH_TAIL);
}

function writeLog(level, message) {
    const logFile = logFilePath();

    // Both this wrapper writer AND Orchestrator.writeLog append to the same orchestrator.log, so
    // BOTH must rotate-before-append: an unguarded append here would advance the file's mtime past
    // the day boundary and defeat the mtime-based daily rotation.
    rotateLogFileIfNewDay(logFile);

    const timestamp = new Date().toISOString();
    const line      = `[${timestamp}] [PID:${process.pid}] [${level}] ${message}`;

    try {
        fs.appendFileSync(logFile, line + '\n', 'utf8');
    } catch (e) {}

    if (level === 'ERROR') {
        console.error(line);
    } else {
        console.log(line);
    }
}

function processCommand(pid) {
    return execSync(`ps -p ${pid} -o command=`).toString().trim();
}

async function waitForExit(pid, timeoutMs) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            process.kill(pid, 0);
        } catch (e) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    return false;
}

function removePidFile() {
    const pidFile = pidFilePath();

    try {
        if (fs.existsSync(pidFile) && parseInt(fs.readFileSync(pidFile, 'utf8'), 10) === process.pid) {
            fs.unlinkSync(pidFile);
        }
    } catch (e) {}
}

/**
 * @summary Reconciles the persisted daemon PID file and claims it for this process.
 *
 * A cloud container recreation may preserve a PID from the prior process epoch.
 * Dead or unrelated holders are safe to replace; only a live command belonging
 * to this daemon receives the graceful-termination path.
 *
 * @param {Object} [options]
 * @param {String} [options.pidFile=pidFilePath()] PID-file override for isolated recovery tests.
 * @returns {Promise<void>}
 */
export async function enforceSingleton({pidFile = pidFilePath()} = {}) {

    if (fs.existsSync(pidFile)) {
        try {
            const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
            if (!Number.isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
                let isAlive = false;

                try {
                    process.kill(oldPid, 0);
                    isAlive = true;
                } catch (e) {}

                if (isAlive) {
                    const cmd = processCommand(oldPid);

                    if (isOrchestratorDaemonCommand(cmd)) {
                        writeLog('INFO', `[Orchestrator] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                        process.kill(oldPid, 'SIGTERM');
                        if (!await waitForExit(oldPid, 5000)) {
                            throw new Error(`Existing orchestrator process ${oldPid} did not exit within 5000ms`);
                        }
                    } else {
                        writeLog('INFO', `[Orchestrator] Stale PID file found for PID ${oldPid}; proceeding.`);
                    }
                }
            }
        } catch (e) {
            writeLog('ERROR', `[Orchestrator] Failed singleton check: ${e.message}`);
        }
    }

    fs.writeFileSync(pidFile, process.pid.toString(), 'utf8');
}

/**
 * @summary Installs the shutdown handlers, and makes a crash exit non-zero.
 *
 * `cleanup` used to call a bare `process.exit()` — exit code **0** — from every caller including the
 * `uncaughtException` arm, so a crash was reported to the container runtime as SUCCESS. A restart
 * policy brings the daemon back either way, which is why this survived: the loss is not availability
 * but attribution. An external plane showed `restartCount: 12` with `exitCode: 0` and `error: null`,
 * next to a self-heal ledger with zero events, because nothing keyed on a non-zero exit ever fired.
 *
 * Every registration below passes its code EXPLICITLY, and that is load-bearing rather than stylistic:
 * `process.on('SIGINT', cleanup)` invokes the listener with the **signal name**, so a positional
 * `cleanup(code = 0)` would receive `'SIGTERM'` and hand a string to `process.exit`. Wrapping each
 * registration is what keeps the signal path at 0 while the crash path reports failure.
 *
 * A signal-initiated stop exits **0** deliberately — an operator stopping the daemon is success, and
 * flattening both paths to non-zero would make every graceful shutdown look like a crash.
 */
function setupCleanupHandlers() {
    const cleanup = (exitCode = DAEMON_EXIT_OK) => {
        Orchestrator.stop();
        removePidFile();
        process.exit(exitCode);
    };

    process.on('SIGINT',  () => cleanup(DAEMON_EXIT_OK));
    process.on('SIGTERM', () => cleanup(DAEMON_EXIT_OK));
    process.on('exit', removePidFile);
    process.on('uncaughtException', err => {
        writeLog('ERROR', `[Orchestrator] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup(DAEMON_EXIT_CRASH);
    });
}

/**
 * Loads the gitignored top-level AI config when present.
 * @param {Object} [options]
 * @param {String} [options.configPath=LOCAL_AI_CONFIG_FILE] Config path.
 * @param {Object} [options.aiConfig=AiConfig] Config singleton.
 * @param {Function} [options.existsSync=fs.existsSync] Existence seam.
 * @returns {Promise<Object>}
 */
export async function loadLocalAiConfig({
    configPath = LOCAL_AI_CONFIG_FILE,
    aiConfig   = AiConfig,
    existsSync = fs.existsSync
} = {}) {
    if (!existsSync(configPath)) {
        return {loaded: false, configPath};
    }

    await aiConfig.load(configPath);

    return {loaded: true, configPath};
}

/**
 * Asserts the orchestrator's plane before it schedules anything — the SAME F-invariant walk
 * `BaseServer` runs for kb/mc, extended to the third Tier-1 consumer.
 *
 * The orchestrator is the one Tier-1 consumer that had no plane assertion, and it is the worst
 * one to leave unasserted: it does not answer queries, it WRITES — backups, dream artifacts,
 * golden-path handoffs, recovery ledgers. A server booted onto the wrong plane returns wrong
 * answers and someone notices; a scheduler booted onto the wrong plane mutates the wrong durable
 * store on a timer, and the first evidence is data that should not be there.
 *
 * Two clauses, matching the server walk exactly:
 * 1. identity coherence — a non-canonical plane must not resolve the canonical durable root,
 *    symlink-transparently (identity without isolation).
 * 2. member coherence — a relocated root with members still on their build-time anchor defaults
 *    is a partially-moved plane; fail closed rather than split storage across two roots.
 *
 * @param {Object} [options]
 * @param {Object} [options.aiConfig=AiConfig] Config singleton (injectable for tests).
 * @param {String} [options.rootDir] Checkout root the canonical anchor derives from.
 * @returns {Object} Frozen observed `{planeId, dataRoot}`.
 */
export function assertOrchestratorPlane({aiConfig = AiConfig, rootDir = REPO_ROOT} = {}) {
    const {plane} = aiConfig;

    if (!plane) {
        throw new Error('[Orchestrator] booted without a resolved `plane` subtree — Tier-1 config not loaded?');
    }

    // Guards overlay-onto-durable mutation. It does NOT guard against serving the wrong store:
    // `canonicalDataRoot` is derived from this module's own location, so a daemon booted from the
    // wrong checkout computes a canonical that agrees with itself and passes. See the CANNOT-detect
    // section on `assertPlaneCoherence` — divergence needs a served-root fact from outside.
    const observed = assertPlaneCoherence({
        planeId          : plane.id,
        dataRoot         : plane.dataRoot,
        canonicalDataRoot: resolvePlaneDataRoot({rootDir})
    });

    const members = collectPlaneMembers({
        memberPaths   : TIER1_PLANE_MEMBER_PATHS,
        resolvedConfig: aiConfig,
        descriptorData: Tier1ConfigBase.config.data
    });

    if (members.length > 0) {
        assertPlaneMemberCoherence({dataRoot: plane.dataRoot, members});
    }

    return observed;
}

/**
 * @summary Resolves whether an orchestrator role owns graph-backed plane work.
 *
 * The data-integrity sweep is a canonical container-plane lane, so its authority
 * classification is the fail-closed proxy for whether this daemon may assert or
 * open the Docker-owned plane. Host-edge roles must remain graphless.
 *
 * @param {String} [authorityProfile=AiConfig.orchestrator.authorityProfile] Runtime role.
 * @returns {Boolean}
 */
export function requiresOrchestratorPlane(
    authorityProfile = AiConfig.orchestrator.authorityProfile
) {
    return isTaskOwnedByProfile({
        profile : authorityProfile,
        taskName: 'data-integrity-sweep'
    });
}

/**
 * Starts the singleton orchestrator daemon.
 *
 * Thin process-boot wrapper: PID singleton enforcement, signal handlers, env-file
 * loading, Neo namespace bootstrap (already done at module-top), local AI config
 * load, then delegation to `Orchestrator.start()`. Lane-internal config (intervals,
 * enable flags, mlx/lms server tuning) is read by the Orchestrator itself via
 * env-precedence getters that consult `AiConfig.orchestrator.X` directly — this
 * function does NOT pre-resolve those into a flat options bag.
 *
 * @param {Object} [options] Test-injection seams (scriptDir, dbPath, taskDefinitions, ...).
 * @returns {Promise<void>}
 */
/**
 * @summary Claims the authority lease, waiting out a self-succession refusal instead of exiting.
 *
 * A container restart meets its own predecessor's lease. The entrypoint is always pid 1 and the
 * hostname is the container id, so the recorded holder is byte-identical to the requester and the
 * lease is still inside its freshness window — the claim is refused, the boot throws, Docker restarts,
 * and the cycle repeats. Measured on the local plane at **720 restarts**: ExitCode 0, OOMKilled false,
 * 25% heap. A clean-exit loop with no resource signal, which is why it read as a mystery; the earlier
 * heap work fixed a real but different cause sitting underneath it.
 *
 * **Waiting is the corroboration, and it is why this belongs here rather than in the lease core.**
 * `fileLease.mjs` is explicit that identity cannot settle this — *"pid-equality cannot mean ours"*,
 * because numeric pids collide across namespaces — and `FileLeaseHeldError` says a consumer wanting
 * the dead-predecessor claim must corroborate it with something the error does not carry. Elapsed time
 * is that something: **a dead predecessor stops pulsing, so its lease goes stale; a live holder keeps
 * pulsing, so it stays fresh.** One TTL of patience separates them without relaxing the single-owner
 * invariant by a single condition. Relaxing the core instead — reclaiming on pid equality — would let a
 * container evict a live host holder, the exact duplicate the module exists to refuse.
 *
 * A second refusal after the wait means the holder kept its lease alive, so it IS a live duplicate:
 * that rethrows and the boot fails loud, unchanged.
 * @param {Object} options            Passed through to {@link acquireAuthorityLease}.
 * @param {String} options.dir        Lease directory.
 * @param {String} options.profile    Authority profile.
 * @param {Function} [options.sleep]  Injectable delay, for tests.
 * @param {Number} [options.ttlMs]    Freshness window; defaults to the authority lease TTL.
 * @returns {Promise<Object>} The acquired lease handle.
 */
export async function acquireAuthorityLeaseSurvivingSelfSuccession({
    dir,
    profile,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    ttlMs = AUTHORITY_LEASE_TTL_MS
}) {
    try {
        return acquireAuthorityLease({dir, profile, ttlMs})
    } catch (error) {
        // Only self-succession waits. Any other refusal is a genuine second claimant and must still
        // fail immediately — a blanket retry would convert every duplicate-start into a slow one.
        if (error.code !== 'FILE_LEASE_HELD' || !error.holderIdentityMatchesRequester) {
            throw error
        }

        const heldSince = Date.parse(error.holder?.lastPulse ?? error.holder?.startedAt),
              // Wait out the remaining freshness window rather than a flat TTL: a predecessor that died
              // most of a window ago should cost us the remainder, not a fresh 60s.
              remaining = Number.isFinite(heldSince)
                  ? Math.max(0, ttlMs - (Date.now() - heldSince)) + 1_000
                  : ttlMs + 1_000;

        console.warn(
            `[orchestrator] authority lease held by an identity indistinguishable from ours ` +
            `(${error.holder?.owner} pid ${error.holder?.pid}, since ${error.holder?.startedAt}). ` +
            `In a container this is our own predecessor: pid 1 and the hostname both survive a restart. ` +
            `Waiting ${Math.round(remaining / 1000)}s for the lease to go stale rather than exiting into ` +
            `a restart loop. If the holder is genuinely alive it will keep pulsing and this boot will then ` +
            `fail loud.`
        );

        await sleep(remaining);

        // Second attempt. A dead predecessor's lease is now stale and reclaimable; a live holder has
        // pulsed and this throws again — fail-closed, and the message names it as a real duplicate.
        //
        // `ttlMs` MUST reach both claims. Omitting it here left the retry on the 60s default while the wait
        // was computed from the injected window, so the dead-predecessor case still refused — and the
        // live-holder control passed VACUOUSLY, refusing because of the default TTL rather than because the
        // holder pulsed. One missing argument made the guard's own witness meaningless in both directions.
        return acquireAuthorityLease({dir, profile, ttlMs})
    }
}

export async function startOrchestrator(options = {}) {
    const dataDir = daemonDataDir();

    fs.ensureDirSync(dataDir);
    await loadLocalAiConfig();

    // The role authority lease is claimed AHEAD of the legacy PID singleton: a refused boot must
    // leave the incumbent unsignaled and the plane untouched — enforceSingleton() can SIGTERM
    // whatever holds the PID file, so nothing that might refuse may run after it.
    const authorityLease = await acquireAuthorityLeaseSurvivingSelfSuccession({
        dir    : dataDir,
        profile: AiConfig.orchestrator.authorityProfile
    });

    await enforceSingleton();
    setupCleanupHandlers();

    // AFTER the config load, BEFORE anything is scheduled: a plane-owning scheduler that has
    // already started its lanes has already written. Host-edge is intentionally graphless and
    // owns no Docker plane path, so applying the Tier-1 assertion there would reconnect it to
    // the retired checkout plane the split exists to leave behind.
    if (requiresOrchestratorPlane()) {
        assertOrchestratorPlane();
    }

    return Orchestrator.start({
        dataDir,
        primaryDevSyncRootsConfig: AiConfig.orchestrator.devSyncRoots,
        authorityLease,
        ...options
    });
}

/**
 * @summary THE orchestrator boot sequence — the single ordered gate every launcher passes through.
 *
 * Exported rather than inlined into the CLI guard because `hostEdge.mjs` is a second legitimate
 * entrypoint for the same daemon: two `import.meta.url` guards would mean two copies of this
 * order, and the order is the contract.
 *
 * **Ordering is the load-bearing property, not the checks themselves.** Everything here runs before
 * `startOrchestrator`, which opens with `fs.ensureDirSync(dataDir)` and `enforceSingleton()` — and
 * `enforceSingleton` SIGTERMs whatever live orchestrator holds the PID file. A role check placed
 * after it would let a launch that is about to refuse first reap the correct daemon: the
 * misconfigured process dies, and so does the one that was working. So a launch this function
 * rejects must write NOTHING — no state directory, no PID file, no log.
 *
 * Two gates, in order:
 * 1. **Config freshness** — a stale overlay missing a leaf its template added, named with the
 *    actionable `--migrate-config` fix rather than a cryptic downstream crash. `authorityProfile`
 *    carries no default, so an undeclared role surfaces here as a required-env finding.
 * 2. **Role validity** — membership in the frozen profile enum. Requiredness proves non-empty and
 *    typed; it cannot prove that `container-plain` is not a role.
 *
 * @returns {Promise<void>}
 */
export async function bootOrchestratorCli() {
    const {findings} = AiConfig.validateRequiredEnv({entrypoint: 'orchestrator-daemon'});

    await assertConfigFresh({requiredFindings: findings});

    assertAuthorityProfile(AiConfig.orchestrator.authorityProfile);

    return startOrchestrator();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    bootOrchestratorCli().catch(err => {
        console.error(`[Orchestrator] Failed to start: ${err && err.stack ? err.stack : err}`);
        process.exit(1);
    });
}
