// The Arm-B Brain supervision module (the recorded topology of the hosting spike — see the
// falsifier-1 verdict on its ticket): the Electron main supervises system-Node children — the
// orchestrator daemon (which supervises the rest of the Agent OS through its own
// ProcessSupervisorService) and the fleet HTTP transport the Fleet Manager window consumes.
//
// Shell-ADR bindings implemented here:
//   §2.1.1  one lifecycle owner — the harness stops exactly the processes IT started
//   §2.1.3  injectable data-root — every mutable path arrives via env leaves, nothing hardcoded
//   §2.1.4  port discipline — smoke ports are runtime-allocated by this lifecycle owner
//   §2.1.5  teardown on quit — process-GROUP SIGINT, bounded grace, group SIGKILL; settle-or-reject
//
// ATTACH-OR-OWN (the dev-machine safety contract): the orchestrator daemon performs
// single-instance TAKEOVER — on boot it SIGTERMs any PID in its PID file — and its supervised
// children hold singleton ports it reaps foreign listeners from. A second organism beside a live
// canonical Brain is therefore never safe OR useful (the Fleet Manager should manage the REAL
// fleet). So the product boot ATTACHES when a Brain is already alive (supervising only the missing
// fleet transport) and OWNS the full organism only when nothing is up (a fresh machine — the
// packaged-app shape). Full isolation exists for the SMOKE profile only, where every mutable
// path/listener the spawned tree consumes is bound under one throwaway root and asserted through
// the config SSOT itself (resolveBrainPaths) before anything spawns.
//
// Teardown is process-GROUP-based: children spawn `detached` into their own group, so
// SIGINT/SIGKILL on `-pid` reaches every descendant — including grandchildren the orchestrator's
// supervisor tracks (Chroma, daemons) AND anything untracked. The orchestrator itself deliberately
// orphans its children on SIGTERM (its supervisor re-adopts them by PID file / singleton port on
// the next canonical restart — see ProcessSupervisorService.reconcileSingletonPort), which is
// exactly why parent-only teardown leaks: the group is the only boundary that owns the whole tree.

import {execFile, execFileSync, spawn} from 'node:child_process';
import {randomUUID}                    from 'node:crypto';
import fs                              from 'node:fs';
import net                             from 'node:net';
import path                            from 'node:path';

export const ORCHESTRATOR_ENTRY = 'ai/daemons/orchestrator/daemon.mjs';
export const FLEET_SERVER_ENTRY = 'ai/services/fleet/devFleetServer.mjs';

// The daemon logs this exact line when its poll loop is live (Orchestrator.start's last act) —
// the earliest honest "the supervisor supervises" observable. The PID file is NOT it: the daemon
// writes that before config load and before start(), so it only proves the process exists.
const ORCHESTRATOR_READY_MARKER = '[Orchestrator] Started.';

function nodeBin() {
    return process.env.NEO_HARNESS_NODE_BIN || 'node'
}

/**
 * @summary The Brain-boot default per launch context. A PACKAGED app is the product — a Finder
 * double-click supplies no environment, so the Brain boots by default with `NEO_HARNESS_BRAIN=0`
 * as the explicit opt-out. A CHECKOUT run stays opt-in (`=1`): dev machines carry a canonical
 * Brain, and the harness UI alone must never surprise-spawn a supervised organism beside it.
 * @param {Object} options
 * @param {Boolean} options.packaged `app.isPackaged` at the call site.
 * @param {Object} options.env The process env (injectable for tests).
 * @returns {Boolean}
 */
export function resolveBrainMode({packaged, env}) {
    return packaged ? env.NEO_HARNESS_BRAIN !== '0' : env.NEO_HARNESS_BRAIN === '1'
}

/**
 * @summary Allocates a free loopback TCP port via a zero-port listen. The classic race (another
 * process binding between close and child bind) is accepted: the child's own bind failure exits
 * it early, which the readiness contract converts into a deterministic boot rejection.
 * @returns {Promise<Number>}
 */
export function allocatePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address();
            server.close(() => resolve(port))
        })
    })
}

/**
 * @summary Resolves true when a loopback TCP port currently accepts a connection. `host` matters:
 * Chroma binds `localhost` (::1 on macOS) while the fleet transport binds `127.0.0.1` — probing
 * the wrong family reads a listening server as dead.
 * @param {Object} options
 * @param {Number|String} options.port
 * @param {String} [options.host='127.0.0.1']
 * @param {Number} [options.timeoutMs=1500]
 * @returns {Promise<Boolean>}
 */
export function probePort({port, host = '127.0.0.1', timeoutMs = 1500}) {
    return new Promise(resolve => {
        const
            socket = net.connect({host, port: Number(port)}),
            finish = result => { socket.destroy(); resolve(result) };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error',   () => finish(false))
    })
}

/**
 * @summary Resolves the Brain's mutable-path/port leaves THROUGH the config SSOT itself: a
 * one-shot system-Node child imports `ai/config.mjs` under the given env and prints the resolved
 * leaves. This is the executable isolation matrix — the smoke asserts what the spawned tree will
 * ACTUALLY consume (the config provider owns env resolution as the single source of truth;
 * re-deriving the mapping here would assert our guess, not the truth). A stale instance config
 * fails this probe with the
 * daemon's own `--migrate-config` guidance on stderr, before anything spawns.
 * @param {Object} options
 * @param {String} options.repoRoot
 * @param {Object} [options.env] Env fragment merged over process.env for the resolver child.
 * @param {Function} [options.execFileFn=execFile] Injection seam for tests.
 * @returns {Promise<Object>} `{chromaDataDir, chromaPort, dbPath, fleetInstanceRoot, orchestratorDataDir}`
 */
export function resolveBrainPaths({repoRoot, env = {}, execFileFn = execFile}) {
    const script = [
        // The daemon entrypoints' own bootstrap order: Neo namespace before any setupClass consumer.
        "import Neo from './src/Neo.mjs';",
        "import * as core from './src/core/_export.mjs';",
        "import InstanceManager from './src/manager/Instance.mjs';",
        "import AiConfig from './ai/config.mjs';",
        "process.stdout.write(JSON.stringify({",
        "    backupPath         : AiConfig.data.backupPath,",
        "    chromaDataDir      : AiConfig.engines.chroma.dataDir,",
        "    chromaPort         : AiConfig.engines.chroma.port,",
        "    dbPath             : AiConfig.orchestrator.dbPath,",
        "    fleetInstanceRoot  : AiConfig.fleet.instanceRoot,",
        "    orchestratorDataDir: AiConfig.orchestrator.dataDir",
        "}));"
    ].join('\n');

    return new Promise((resolve, reject) => {
        execFileFn(nodeBin(), ['--input-type=module', '-e', script], {
            cwd: repoRoot,
            env: {...process.env, ...env}
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`config resolver failed: ${String(stderr || error.message).slice(0, 800)}`));
                return
            }

            try {
                resolve(JSON.parse(stdout))
            } catch (parseError) {
                reject(new Error(`config resolver returned non-JSON: ${String(stdout).slice(0, 200)}`))
            }
        })
    })
}

/**
 * @summary Builds the SMOKE isolation profile: every mutable path the spawned tree consumes bound
 * under one throwaway root, every listener either gated OFF or moved to a runtime-allocated port.
 * The gates matter as much as the paths — supervised tasks reap foreign listeners on their
 * singleton ports (ProcessSupervisorService.reconcileSingletonPort), so an unshifted, ungated
 * port-bearing task aimed at a live machine is a kill vector, not just cross-talk. The WAL needs
 * no leaf here: `UNIT_TEST_MODE` derives a per-process tmp test WAL by construction.
 * @param {Object} options
 * @param {String} options.isolationRoot Directory that will own every mutable path.
 * @param {Number|String} options.chromaPort Runtime-allocated Chroma port.
 * @param {Number|String} options.fleetPort Runtime-allocated fleet transport port.
 * @returns {Object} env fragment to merge over process.env
 */
export function buildBrainProfile({isolationRoot, chromaPort, fleetPort}) {
    return {
        // Mutable paths → instance-scoped leaves. NEO_BACKUP_PATH matters even with the sync lanes
        // gated: the SCHEDULED task family (backup et al) is interval-driven with no enable gates,
        // and a fresh state file makes it due immediately — the write target must be ours.
        NEO_AI_DB_PATH          : path.join(isolationRoot, 'sqlite', 'memory-core-graph.sqlite'),
        NEO_AI_ORCHESTRATOR_DIR : path.join(isolationRoot, 'orchestrator'),
        NEO_BACKUP_PATH         : path.join(isolationRoot, 'backups'),
        NEO_CHROMA_DATA_DIR_TEST: path.join(isolationRoot, 'chroma'),
        NEO_FLEET_INSTANCE_ROOT : path.join(isolationRoot, 'fleet', 'instances'),
        NEO_REM_RUN_STATE_DIR   : path.join(isolationRoot, 'rem-runs'),
        UNIT_TEST_MODE          : '1',

        // Listeners the smoke exercises → runtime-allocated ports
        NEO_CHROMA_PORT_TEST: String(chromaPort),
        NEO_FLEET_PORT      : String(fleetPort),

        // Every other port-bearing or shared-state lane → OFF. The smoke proves the harness can
        // OWN the organism's lifecycle; it must not double-run swarm lanes or reap live listeners.
        NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED                 : '0',
        NEO_ORCHESTRATOR_DEV_SERVER_ENABLED                 : '0',
        NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED               : '0',
        NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_ENABLED       : '0',
        NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED: '0',
        NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED        : '0',
        NEO_ORCHESTRATOR_KB_SYNC_ENABLED                    : '0',
        NEO_ORCHESTRATOR_LMS_ENABLED                        : '0',
        NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED             : '0',
        NEO_ORCHESTRATOR_MLX_ENABLED                        : '0',
        NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED                  : '0',
        NEO_ORCHESTRATOR_OLLAMA_ENABLED                     : '0',
        NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED           : '0',
        NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED            : '0'
    }
}

/**
 * @summary Resolves a path by FILESYSTEM IDENTITY: realpath of its deepest existing ancestor with
 * the not-yet-created tail re-appended. A lexical `startsWith` is an observation about strings; a
 * symlinked ancestor inside the root (e.g. `sqlite/` → an outside directory) satisfies it while
 * the data lands elsewhere. Isolation is an identity contract, so containment must resolve links.
 * @param {String} value
 * @returns {String}
 */
export function resolveRealPath(value) {
    let
        current = path.resolve(value),
        tail    = [];

    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);

        tail.unshift(path.basename(current));

        if (parent === current) {
            break
        }

        current = parent
    }

    try {
        current = fs.realpathSync(current)
    } catch (error) {
        // Keep the lexical resolution when even the existing ancestor cannot be resolved.
    }

    return path.join(current, ...tail)
}

/**
 * @summary THE packaged product profile — the one resource-closure contract for an installed
 * artifact, consumed identically by the product boot AND the packaged smoke (the smoke may shift
 * only COORDINATES — ports/data root — never this lane set, or it stops proving the artifact).
 *
 * Mutable paths move to the per-user data root (the organism ships in a read-only(ish) resources
 * dir). Lane gates encode what an INSTALLED organism can honestly run — each OFF names the
 * resource the artifact does not carry:
 * - devServer: no webpack/build tooling ships; `app://` serves the bundled source graph.
 * - kbSync / githubWorkflowSync / primaryDevSync / goldenPathRepoEnrichment: git-checkout
 *   semantics; the bundle carries the source graph but is not a repository.
 * - mlx / ollama / lms: external model servers belong to the MACHINE, not the artifact — a
 *   packaged supervisor must never adopt or reap a stranger's local AI runtimes.
 * - neuralLinkBridge: a default-on listener is its own product decision (the ADR E-map owns it).
 * - deploymentStateBridge: its snapshot path is still cwd-relative and would write into the
 *   resources dir.
 * ON by omission (the organism the artifact CAN run): Chroma, the embed + message daemons,
 * backups (target rides `NEO_BACKUP_PATH`), and local graph maintenance.
 * @param {Object} options
 * @param {String} options.dataRoot Writable per-user root (Electron `userData`-derived).
 * @returns {Object} env fragment to merge over process.env
 */
export function buildPackagedBrainEnv({dataRoot}) {
    return {
        // Mutable paths → the per-user data root. The WAL + embed/message daemon state dirs are
        // cwd-relative by default, and cwd is the read-only(ish) organism dir when packaged.
        NEO_AI_DB_PATH             : path.join(dataRoot, 'sqlite', 'memory-core-graph.sqlite'),
        NEO_AI_ORCHESTRATOR_DIR    : path.join(dataRoot, 'orchestrator'),
        NEO_BACKUP_PATH            : path.join(dataRoot, 'backups'),
        NEO_CHROMA_DATA_DIR        : path.join(dataRoot, 'chroma', 'unified'),
        NEO_FLEET_INSTANCE_ROOT    : path.join(dataRoot, 'fleet', 'instances'),
        NEO_MEMORY_EMBED_DAEMON_DIR: path.join(dataRoot, 'embed-daemon'),
        NEO_MEMORY_WAL_DIR         : path.join(dataRoot, 'memory-wal'),
        NEO_MESSAGE_WAL_DAEMON_DIR : path.join(dataRoot, 'message-daemon'),
        NEO_REM_RUN_STATE_DIR      : path.join(dataRoot, 'rem-runs'),

        // The artifact's lane closure (reasons in the summary above)
        NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED                 : '0',
        NEO_ORCHESTRATOR_DEV_SERVER_ENABLED                 : '0',
        NEO_ORCHESTRATOR_GITHUB_WORKFLOW_SYNC_ENABLED       : '0',
        NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED: '0',
        NEO_ORCHESTRATOR_KB_SYNC_ENABLED                    : '0',
        NEO_ORCHESTRATOR_LMS_ENABLED                        : '0',
        NEO_ORCHESTRATOR_MLX_ENABLED                        : '0',
        NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED                  : '0',
        NEO_ORCHESTRATOR_OLLAMA_ENABLED                     : '0',
        NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED           : '0'
    }
}

/**
 * @summary Verifies the RESOLVED leaves against the isolation contract: every mutable path under
 * the isolation root BY FILESYSTEM IDENTITY (ancestor symlinks resolved on both sides), every
 * probed port the allocated one. Run against `resolveBrainPaths` output so the assertion covers
 * what the tree actually consumes, not what the profile intended.
 * @param {Object} options
 * @param {Object} options.resolved Output of {@link resolveBrainPaths} under the profile env.
 * @param {String} options.isolationRoot
 * @param {Number|String} options.chromaPort
 * @returns {String[]} Human-readable violations; empty = isolated.
 */
export function assertIsolatedProfile({resolved, isolationRoot, chromaPort}) {
    const
        violations = [],
        root       = resolveRealPath(isolationRoot) + path.sep,
        pathLeaves = ['backupPath', 'chromaDataDir', 'dbPath', 'fleetInstanceRoot', 'orchestratorDataDir'];

    for (const leafName of pathLeaves) {
        const value = resolved[leafName];

        if (typeof value !== 'string' || !resolveRealPath(value).startsWith(root)) {
            violations.push(`${leafName}=${value} escapes isolation root ${isolationRoot} (real path: ${typeof value === 'string' ? resolveRealPath(value) : value})`)
        }
    }

    if (Number(resolved.chromaPort) !== Number(chromaPort)) {
        violations.push(`chromaPort=${resolved.chromaPort} is not the allocated ${chromaPort}`)
    }

    return violations
}

/**
 * @summary Probes FLEET PROTOCOL IDENTITY on a port: one `POST /fleet {method:'listAgents'}`
 * round-trip answering `{ok:true}`. A listening socket is an observation about occupancy; only
 * the wire envelope proves the listener IS the fleet transport — a foreign server squatting the
 * port must read as "held but not serving", never as attach-ready.
 * @param {Object} options
 * @param {Number|String} options.port
 * @param {String} options.bearerToken Main-owned process bearer.
 * @param {Number} [options.timeoutMs=2500]
 * @param {Function} [options.fetchFn=fetch] Injection seam for tests.
 * @returns {Promise<Boolean>}
 */
export async function probeFleetServing({port, bearerToken, timeoutMs = 2500, fetchFn = fetch}) {
    try {
        const response = await fetchFn(`http://127.0.0.1:${port}/fleet`, {
            body   : JSON.stringify({method: 'listAgents', params: {}}),
            headers: {
                Authorization : `Bearer ${bearerToken}`,
                'content-type': 'application/json'
            },
            method : 'POST',
            signal : AbortSignal.timeout(timeoutMs)
        });

        return (await response.json())?.ok === true
    } catch (error) {
        return false
    }
}

/**
 * @summary Detects a live Brain on this machine WITHOUT spawning one: the orchestrator's own
 * PID-file + command-line liveness idiom (read from the RESOLVED dataDir leaf, so an env-shifted
 * setup is honored) plus fleet-transport PROTOCOL identity — `fleetServing` requires a real wire
 * envelope, while `fleetPortHeld` reports raw occupancy so a foreign listener fails the boot
 * closed instead of masquerading as an attach target. Drives the attach-or-own decision.
 * @param {Object} options
 * @param {String} options.orchestratorDataDir Resolved `AiConfig.orchestrator.dataDir`.
 * @param {Number|String} options.fleetPort Fleet transport port to probe.
 * @param {String} options.bearerToken Main-owned process bearer.
 * @param {Function} [options.killFn=process.kill] Injection seam for tests.
 * @param {Function} [options.commandFn] pid → command line. Injection seam for tests.
 * @param {Function} [options.probePortFn=probePort] Injection seam for tests.
 * @param {Function} [options.probeFleetFn=probeFleetServing] Injection seam for tests.
 * @returns {Promise<{orchestratorAlive: Boolean, orchestratorPid: Number|null, fleetServing: Boolean, fleetPortHeld: Boolean}>}
 */
export async function detectLiveBrain({
    orchestratorDataDir,
    fleetPort,
    bearerToken,
    killFn       = process.kill,
    commandFn    = null,
    probePortFn  = probePort,
    probeFleetFn = probeFleetServing
}) {
    const
        pidFile      = path.join(orchestratorDataDir, 'orchestrator-daemon.pid'),
        fleetServing = await probeFleetFn({bearerToken, port: fleetPort}),
        result       = {
            fleetPortHeld    : fleetServing || await probePortFn({port: fleetPort}),
            fleetServing,
            orchestratorAlive: false,
            orchestratorPid  : null
        };

    try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);

        if (Number.isInteger(pid) && pid > 0) {
            killFn(pid, 0);

            // Mirrors the daemon's own isOrchestratorDaemonCommand guard (not imported: that module
            // pulls the full Neo bootstrap into the Electron main, which the ABI verdict forbids).
            const command = commandFn
                ? commandFn(pid)
                : (await new Promise(resolve => {
                    execFile('ps', ['-p', String(pid), '-o', 'command='], (error, stdout) => resolve(error ? '' : stdout))
                })).trim();

            if (command.includes(ORCHESTRATOR_ENTRY)) {
                result.orchestratorAlive = true;
                result.orchestratorPid   = pid
            }
        }
    } catch (error) {
        // No PID file / stale pid — no live orchestrator; fall through to the probe result.
    }

    return result
}

function forwardLines(child, onLog) {
    if (!onLog) {
        return
    }

    const forward = chunk => String(chunk).split('\n').filter(Boolean).forEach(line => onLog(line));

    child.stdout.on('data', forward);
    child.stderr.on('data', forward)
}

/**
 * @summary Spawns one supervised system-Node child DETACHED into its own process group — the
 * teardown boundary that owns every descendant. System Node is deliberate (the Arm-B core): the
 * repo's native modules are built for the system ABI, and `ELECTRON_RUN_AS_NODE` children would
 * carry Electron's ABI back into the same conflict.
 * @param {Object} options
 * @param {String}   options.repoRoot Repo root (cwd for the child).
 * @param {String}   options.entry Entry script, repo-relative.
 * @param {Object}   [options.env] Env fragment merged over process.env.
 * @param {Function} [options.onLog] Receives trimmed child stdout/stderr lines.
 * @param {Function} [options.ownershipTokenFn=randomUUID] Per-spawn identity seam for tests.
 * @param {Function} [options.spawnFn=spawn] Injection seam for tests.
 * @returns {import('node:child_process').ChildProcess & {neoHarnessIdentity: Object}}
 */
export function startBrainChild({
    repoRoot,
    entry,
    env = {},
    onLog,
    ownershipTokenFn = randomUUID,
    spawnFn = spawn
}) {
    // The supervised tree resolves bare tool commands (the orchestrator's `chroma` task) via PATH.
    // npm-run contexts prepend the repo's node_modules/.bin by accident of cwd; a packaged shell
    // has no npm in the chain at all — so the lifecycle owner guarantees the resolution explicitly.
    // The packaged organism additionally carries a `shims/` dir (a `node` shim routing shebang
    // children onto the bundled Electron runtime — a stranger's machine has no Node); absent in
    // checkout mode, so the prepend is conditional.
    const
        absoluteRepoRoot = path.resolve(repoRoot),
        absoluteEntry    = path.resolve(absoluteRepoRoot, entry),
        relativeEntry    = path.relative(absoluteRepoRoot, absoluteEntry),
        shimsPath        = path.join(absoluteRepoRoot, 'shims'),
        binPaths         = [
            ...(fs.existsSync(shimsPath) ? [shimsPath] : []),
            path.join(absoluteRepoRoot, 'node_modules', '.bin')
        ],
        ownershipToken   = ownershipTokenFn();

    if (relativeEntry === '..' || relativeEntry.startsWith(`..${path.sep}`) || path.isAbsolute(relativeEntry)) {
        throw new TypeError('entry must resolve inside repoRoot')
    }

    if (typeof ownershipToken !== 'string' || ownershipToken.length === 0 || /\s/.test(ownershipToken)) {
        throw new TypeError('ownershipTokenFn must return a non-empty token without whitespace')
    }

    const child = spawnFn(nodeBin(), [absoluteEntry, `--neo-harness-owner=${ownershipToken}`], {
        cwd     : absoluteRepoRoot,
        detached: true,
        env     : {...process.env, ...env, PATH: `${binPaths.join(path.delimiter)}${path.delimiter}${process.env.PATH ?? ''}`},
        stdio   : ['ignore', 'pipe', 'pipe']
    });

    // The parent persists this pair only for smoke crash recovery. The absolute entry distinguishes
    // checkouts; the argv token distinguishes this exact process instance from every later spawn.
    child.neoHarnessIdentity = Object.freeze({entry: absoluteEntry, ownershipToken});

    forwardLines(child, onLog);
    return child
}

/**
 * @summary The boot-promise contract: resolves when the child's stdout carries the given readiness
 * marker; REJECTS deterministically on spawn error, early exit, or timeout — a PID's existence is
 * never presented as readiness.
 * @param {Object} options
 * @param {import('node:child_process').ChildProcess} options.child
 * @param {String} options.marker Stdout substring that constitutes readiness.
 * @param {String} options.label For error messages.
 * @param {Number} [options.timeoutMs=30000]
 * @returns {Promise<void>}
 */
export function awaitReadyMarker({child, marker, label, timeoutMs = 30000}) {
    return new Promise((resolve, reject) => {
        let buffered = '';

        const finish = (error) => {
            clearTimeout(timer);
            child.stdout.off('data', onData);
            child.off('exit', onExit);
            child.off('error', onError);
            error ? reject(error) : resolve()
        };

        const onData = chunk => {
            buffered = (buffered + String(chunk)).slice(-4096);

            if (buffered.includes(marker)) {
                finish()
            }
        };

        const onExit  = (code, signal) => finish(new Error(`${label} exited before ready (code=${code} signal=${signal})`));
        const onError = error => finish(new Error(`${label} failed to spawn: ${error.message}`));
        const timer   = setTimeout(() => finish(new Error(`${label} not ready within ${timeoutMs}ms`)), timeoutMs);

        if (child.exitCode !== null) {
            finish(new Error(`${label} exited before ready (code=${child.exitCode})`));
            return
        }

        child.stdout.on('data', onData);
        child.once('exit', onExit);
        child.once('error', onError)
    })
}

/**
 * @summary Awaits the orchestrator's genuine readiness: its own "poll loop live" log marker.
 * @param {Object} options
 * @param {import('node:child_process').ChildProcess} options.child
 * @param {Number} [options.timeoutMs=30000]
 * @returns {Promise<void>}
 */
export function awaitOrchestratorReady({child, timeoutMs = 30000}) {
    return awaitReadyMarker({child, label: 'orchestrator', marker: ORCHESTRATOR_READY_MARKER, timeoutMs})
}

/**
 * @summary Awaits the fleet transport's genuine readiness: a REAL wire verb round-trip
 * (`POST /fleet {method:'listAgents'}`) answering `{ok:true}` — the same surface the Fleet
 * Manager window consumes. Rejects on child exit/spawn error or timeout.
 * @param {Object} options
 * @param {import('node:child_process').ChildProcess} options.child
 * @param {Number|String} options.port
 * @param {String} options.bearerToken Main-owned process bearer.
 * @param {Number} [options.timeoutMs=15000]
 * @param {Function} [options.fetchFn=fetch] Injection seam for tests.
 * @returns {Promise<void>}
 */
export function awaitFleetReady({child, port, bearerToken, timeoutMs = 15000, fetchFn = fetch}) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = error => {
            if (settled) {
                return
            }

            settled = true;
            clearTimeout(timer);
            clearInterval(poller);
            child.off('exit', onExit);
            child.off('error', onExit);
            error ? reject(error) : resolve()
        };

        const onExit = (codeOrError, signal) => finish(new Error(
            `fleet transport exited before ready (${codeOrError instanceof Error ? codeOrError.message : `code=${codeOrError} signal=${signal}`})`
        ));

        const probe = async () => {
            try {
                const response = await fetchFn(`http://127.0.0.1:${port}/fleet`, {
                    body   : JSON.stringify({method: 'listAgents', params: {}}),
                    headers: {
                        Authorization : `Bearer ${bearerToken}`,
                        'content-type': 'application/json'
                    },
                    method : 'POST'
                });

                const body = await response.json();

                if (body?.ok === true) {
                    finish()
                }
            } catch (error) {
                // Not listening yet — keep polling until the deadline.
            }
        };

        const timer  = setTimeout(() => finish(new Error(`fleet transport not ready within ${timeoutMs}ms`)), timeoutMs);
        const poller = setInterval(probe, 300);

        child.once('exit', onExit);
        child.once('error', onExit);
        probe()
    })
}

/**
 * @summary Polls a loopback port until it accepts a connection or the deadline passes. The smoke
 * uses it to let the supervised organism SETTLE (the isolated Chroma actually serving on the
 * allocated port — live evidence the data moved with the port) before quitting: group-SIGTERM
 * into a mid-startup child is the one path that legitimately needs force-escalation, and a
 * graceful-teardown gate must not measure that race.
 * @param {Object} options
 * @param {Number|String} options.port
 * @param {String} [options.host='127.0.0.1'] See {@link probePort} — bind-family matters.
 * @param {Number} [options.timeoutMs=30000]
 * @param {Number} [options.pollMs=300]
 * @param {Function} [options.probePortFn=probePort] Injection seam for tests.
 * @returns {Promise<Boolean>} true when the port started listening within the deadline.
 */
export async function awaitPortListening({port, host = '127.0.0.1', timeoutMs = 30000, pollMs = 300, probePortFn = probePort}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (await probePortFn({host, port})) {
            return true
        }

        await new Promise(resolve => setTimeout(resolve, pollMs))
    }

    return false
}

function groupAlive(pgid, killFn) {
    try {
        killFn(-pgid, 0);
        return true
    } catch (error) {
        return false
    }
}

/**
 * @summary Settle-or-reject FULL-TREE teardown of one detached child: SIGINT to the process
 * GROUP (every descendant gets it — the orchestrator's own children included), a bounded grace
 * poll for group-empty, SIGKILL escalation to the group, and a final group-empty verdict. The
 * promise always settles with what actually happened so a caller can gate an exit code on
 * `forced === false && groupEmpty === true`.
 *
 * SIGINT, not SIGTERM, is the graceful rung — measured, not assumed: the chromadb npm wrapper
 * ignores group-SIGTERM indefinitely (40s+) but exits cleanly on SIGINT within milliseconds
 * (terminal Ctrl-C semantics), and every supervised entry (orchestrator daemon, fleet server)
 * registers SIGINT and SIGTERM identically.
 * @param {import('node:child_process').ChildProcess|{pid: Number}} child
 * @param {Object} [options]
 * @param {Number} [options.graceMs=10000]
 * @param {Number} [options.pollMs=200]
 * @param {Function} [options.killFn=process.kill] Injection seam for tests.
 * @returns {Promise<{exited: Boolean, forced: Boolean, groupEmpty: Boolean}>}
 */
export async function stopBrainChild(child, {graceMs = 10000, pollMs = 200, killFn = process.kill} = {}) {
    const pgid = child.pid;

    if (!groupAlive(pgid, killFn)) {
        return {exited: true, forced: false, groupEmpty: true}
    }

    try {
        killFn(-pgid, 'SIGINT')
    } catch (error) {
        // Group vanished between the probe and the signal.
    }

    const deadline = Date.now() + graceMs;

    while (Date.now() < deadline) {
        if (!groupAlive(pgid, killFn)) {
            return {exited: true, forced: false, groupEmpty: true}
        }

        await new Promise(resolve => setTimeout(resolve, pollMs))
    }

    try {
        killFn(-pgid, 'SIGKILL')
    } catch (error) {}

    // SIGKILL is not interceptable; give the kernel a bounded beat to reap the group.
    const killDeadline = Date.now() + 2000;

    while (Date.now() < killDeadline && groupAlive(pgid, killFn)) {
        await new Promise(resolve => setTimeout(resolve, pollMs))
    }

    return {exited: true, forced: true, groupEmpty: !groupAlive(pgid, killFn)}
}

/**
 * @summary Tears down every supervised child (fleet first — it consumes the orchestrator's
 * organism, so reverse-dependency order) and reports per-child.
 * @param {Object[]} children `{label, child}` entries.
 * @param {Object} [options] Passed through to {@link stopBrainChild}.
 * @returns {Promise<Object>} label → stop report
 */
export async function stopBrainTree(children, options = {}) {
    const report = {};

    for (const {label, child} of [...children].reverse()) {
        report[label] = await stopBrainChild(child, options)
    }

    return report
}

/**
 * @summary Persists the process groups of a SMOKE run with checkout + process-instance identity
 * so a crashed harness's next run can sweep only its own leftovers (the crash path bypasses
 * will-quit). A PGID or program name is not ownership evidence: the OS reuses ids and every clone
 * runs the same scripts. Product own-mode leftovers are deliberately NOT recorded: a still-live
 * default-paths Brain is attached to next boot.
 * @param {Object} options
 * @param {String} options.isolationRoot
 * @param {Object[]} options.children `{pgid, entry, ownershipToken}` per supervised group leader.
 */
export function writeRunState({isolationRoot, children}) {
    fs.mkdirSync(isolationRoot, {recursive: true});
    fs.writeFileSync(path.join(isolationRoot, 'run-state.json'), JSON.stringify({children}), 'utf8')
}

/**
 * @summary Clears the persisted run-state after a CLEAN teardown. Without this, the record
 * outlives the run and a later sweep would signal whatever now owns the recycled ids.
 * @param {Object} options
 * @param {String} options.isolationRoot
 */
export function clearRunState({isolationRoot}) {
    try {
        fs.unlinkSync(path.join(isolationRoot, 'run-state.json'))
    } catch (error) {
        // Nothing persisted — already clean.
    }
}

/**
 * @summary Sweeps a prior CRASHED smoke run's process groups only after re-proving both checkout
 * and process-instance identity: the current command must carry the recorded absolute entry and
 * per-spawn argv token. Missing/legacy identity and recycled groups fail closed without signaling.
 * The state file is cleared either way. No-op when no state exists.
 * @param {Object} options
 * @param {String} options.isolationRoot
 * @param {Function} [options.killFn=process.kill] Injection seam for tests.
 * @param {Function} [options.commandFn] pid → current command line ('' when gone). Injection seam for tests.
 * @returns {Number[]} pgids that were alive, identity-verified, and killed.
 */
export function sweepStaleRunState({isolationRoot, killFn = process.kill, commandFn = null}) {
    const
        runStateFile = path.join(isolationRoot, 'run-state.json'),
        readCommand  = commandFn ?? (pid => {
            try {
                return execFileSyncCommand(pid)
            } catch (error) {
                return ''
            }
        }),
        swept          = [];

    let children = [];

    try {
        const parsed = JSON.parse(fs.readFileSync(runStateFile, 'utf8'));

        children = Array.isArray(parsed?.children) ? parsed.children : []
    } catch (error) {
        clearRunState({isolationRoot});
        return swept
    }

    for (const record of children) {
        if (!record || typeof record !== 'object') {
            continue
        }

        const {pgid, entry, ownershipToken} = record;

        if (
            !Number.isInteger(pgid)
            || pgid <= 1
            || typeof entry !== 'string'
            || !path.isAbsolute(entry)
            || typeof ownershipToken !== 'string'
            || ownershipToken.length === 0
            || /\s/.test(ownershipToken)
            || !groupAlive(pgid, killFn)
        ) {
            continue
        }

        const command = readCommand(pgid);

        // BOTH adjacent argv observations are required. Absolute entry separates sibling
        // checkouts; the unique token separates later spawns. Boundary matching prevents a path
        // or token that merely contains the recorded value from authorizing destruction.
        if (!commandCarriesHarnessIdentity({command, entry, ownershipToken})) {
            continue
        }

        try {
            killFn(-pgid, 'SIGKILL');
            swept.push(pgid)
        } catch (error) {}
    }

    clearRunState({isolationRoot});
    return swept
}

function execFileSyncCommand(pid) {
    return execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command=']).toString().trim()
}

function commandCarriesHarnessIdentity({command, entry, ownershipToken}) {
    const
        escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        entryArg     = escapeRegExp(entry),
        ownerArg     = escapeRegExp(`--neo-harness-owner=${ownershipToken}`);

    return new RegExp(`(?:^|\\s)${entryArg}\\s+${ownerArg}(?:\\s|$)`).test(command)
}
