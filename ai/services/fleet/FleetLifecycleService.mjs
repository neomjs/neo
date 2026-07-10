import {execFile, spawn}         from 'child_process';
import fs                        from 'fs';
import path                      from 'path';
import AiConfig                  from '../../config.mjs';
import Base                      from '../../../src/core/Base.mjs';
import {deriveAgentInstanceHome} from './deriveAgentInstanceHome.mjs';
import {deriveHarnessLaunchSpec} from './deriveHarnessLaunchSpec.mjs';
import FleetRegistryService      from './FleetRegistryService.mjs';

// The forced-projection env var is a CROSS-PROCESS CONTRACT: the FM sets it on the spawned child env,
// and the Neural Link server's `resolveToolProjectionMode` reads this exact name as the fallback to
// `--tool-projection-mode`. Intentionally NOT a configurable field — an override would set a var the
// NL server never reads, silently dropping the forced read-only projection (fail-OPEN).
const TOOL_PROJECTION_MODE_ENV_VAR = 'NEO_NL_TOOL_PROJECTION_MODE';

// The agent-identity env var is a CROSS-PROCESS CONTRACT too: the MCP identity resolution chain
// (`RequestContextService`, `Orchestrator`, `KbAlertingService`, `assertExpectedIdentity`) reads this
// exact name, so the FM injects the fleet agent id under it — the spawned harness binds to the agent
// the FM defined, never to whichever ambient identity the FM process happens to carry. Intentionally
// NOT configurable — an override would set a var those consumers never read (fail-OPEN).
const AGENT_IDENTITY_ENV_VAR = 'NEO_AGENT_IDENTITY';

// The AiConfig `fleet.harnessBinaries` leaf key per harness family. An unknown family has no
// entry — `resolveLaunch` fails loud instead of guessing a command for it.
const HARNESS_BINARY_LEAF_KEYS = {
    'claude-code': 'claudeCode',
    'codex'      : 'codex'
};

// The ONLY ambient parent-env vars that cross into a spawned harness. The FM's own environment
// carries operator secrets (provider API keys, tokens, session vars) that must never leak into
// every peer: a tokenless instance silently inheriting the parent's `GH_TOKEN` would collapse the
// per-agent credential boundary. Benign process-runtime vars only; everything else a child needs
// arrives explicitly via the launch template or the reserved injections in `start`.
const AMBIENT_ENV_ALLOWLIST = Object.freeze([
    'HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'TMPDIR', 'USER'
]);

// Env keys that would mutate the merge target's prototype chain instead of (or in addition to)
// defining an own property — a registry-authored `{"__proto__": …}` must be rejected, never
// assigned. JSON.parse creates these as OWN keys, so they DO survive into Object.entries.
const PROTO_ENV_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

// Per-family auth-marker files inside an instance home: present ⇒ the home has completed its
// operator-owned per-home login; absent ⇒ `authRequired` surfaces `true` so the cockpit shows the
// onboarding step honestly. A HEURISTIC on documented CLI state layouts, not a credential read —
// the marker's presence is checked, never its content.
const HARNESS_AUTH_MARKERS = {
    'claude-code': '.credentials.json',
    'codex'      : 'auth.json'
};

/**
 * @class Neo.ai.services.fleet.FleetLifecycleService
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * Brain-side (Node-only) process supervision for Fleet Manager agents. The second leaf of the
 * Fleet Manager MVP: where the registry *defines* an agent, this service *runs* it —
 * `start` / `stop` / `restart` / `status` / `listRunning` for the external harness process.
 *
 * It composes the registry: `start(id)` resolves the agent definition and (via the Brain-internal
 * `resolveCredential`) the PAT, then spawns the harness command. Launch resolution has two forms
 * (see {@link resolveLaunch}):
 * - **Curated intent (the normal form):** no `metadata.launch` + a templated `harnessType` ⇒ the
 *   spec is derived internally — {@link Neo.ai.services.fleet.deriveAgentInstanceHome} keys an
 *   isolated per-agent harness home (by agent **id**, never `githubUsername`) under the resolved
 *   {@link getInstanceRoot}, and {@link Neo.ai.services.fleet.deriveHarnessLaunchSpec} maps it onto
 *   the family template with the {@link getHarnessBinaryPath}-resolved binary. `harnessType` stays
 *   classification: the registry payload never carries a command.
 * - **Raw launch (SECURITY STOP-LINE — Brain/operator-only by CONSTRUCTION):** an explicit
 *   `metadata.launch = {command, args, env}` executes an ARBITRARY command in a credential-bearing
 *   child (the PAT + Bridge token ride that env). The wire cannot author it: the registry's
 *   `defineAgent` / `updateAgent` REJECT a `launch` key in metadata, so the only write path is the
 *   registry-internal `setLaunchOverride` — a method that exists on no bridge and no wire allowlist.
 *   Wire callers send curated `harnessType` intent, nothing more.
 *
 * **Supervision transport (the topology that keeps a CLI harness alive):** children spawn with
 * `stdio: ['pipe', 'ignore', 'pipe']` — stdin is a HELD-OPEN pipe, because both supported harness
 * CLIs exit immediately on an EOF'd/ignored stdin (probed on the exact binaries: codex `app-server`
 * and claude-code stream-json both stay alive on a held pipe and exit without it). The launch
 * templates pin the per-family long-lived mode args; stdout is discarded until a protocol consumer
 * lands; stderr is drained byte-counted as below.
 *
 * **Child env (minimal by construction):** the child receives ONLY the `AMBIENT_ENV_ALLOWLIST`
 * process-runtime vars — never a full parent-env copy, so ambient operator secrets cannot leak into
 * a peer — plus the launch spec's own env (its isolation home var), plus the reserved injections.
 * A `launch.env` key naming a reserved slot (`credentialEnvVar`, `bridgeTokenEnvVar`,
 * `NEO_NL_TOOL_PROJECTION_MODE`, `NEO_AGENT_IDENTITY`) or a prototype-mutating key
 * (`__proto__` / `constructor` / `prototype`) is rejected fail-fast, naming the offending key.
 *
 * **Credential security boundary** (inherited from the registry's two-hemisphere rule): the PAT is
 * injected into the spawned **child's environment only** — onto the minimal allowlisted env above
 * (the parent env is never mutated), under a configurable var (`credentialEnvVar`, default
 * `GH_TOKEN`). It is **never** placed in `argv` (visible in `ps`), never written to the tracked
 * process record, and never logged. A status read can never surface a secret because the records
 * hold none. The **Bridge session token** is a SECOND, distinct credential class, injected the same
 * way under its own var (`bridgeTokenEnvVar`) — minted per spawn, never co-mingled with the PAT.
 *
 * **Harness-auth provisioning at spawn:** every FM-spawned agent is an *embedded* agent, so `start`
 * provisions its harness-auth surfaces into the child env: (1) a freshly-minted Bridge token for the
 * agent↔Neural-Link-Bridge handshake, (2) the forced read-only Neural Link tool-projection
 * (`toolProjectionMode`, default `harness-embedded`) under the FIXED `NEO_NL_TOOL_PROJECTION_MODE` var
 * (a cross-process contract, intentionally NOT configurable — an override would set a var the NL server
 * never reads → fail-OPEN) — the NL server reads it as a fallback to its `--tool-projection-mode` flag,
 * and (3) the fleet agent id under the FIXED `NEO_AGENT_IDENTITY` var (the same cross-process-contract
 * rationale — the MCP identity resolution chain reads that exact name), so the child's identity binds
 * to the agent the FM defined by construction. Fail-closed: an FM-spawned agent never receives the
 * full developer tool surface, and `launch.env` can never pre-load a reserved slot.
 *
 * **Supervision idiom** mirrors `ai/daemons/orchestrator/services/ProcessSupervisorService` (the
 * injectable `spawnFn` test seam, env-merge, graceful `SIGTERM`→`SIGKILL` stop, and draining the
 * child's stderr — counting bytes only, never retaining the content — so a noisy harness cannot block on pipe backpressure) without reusing it:
 * that supervisor is coupled to the orchestrator's fixed task-definition / task-state model, a poor
 * fit for a dynamic registry-keyed fleet. Extracting a shared primitive would touch critical
 * orchestrator infra and is intentionally deferred.
 *
 * Scope: process supervision + harness-auth provisioning (Bridge token + forced NL projection, above).
 * Spawn-time *identity-env* + wake-subscription provisioning remains deferred — gated on cross-harness
 * session-id canonicalization, in a separate provisioning leaf.
 */
class FleetLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.fleet.FleetLifecycleService'
         * @protected
         */
        className: 'Neo.ai.services.fleet.FleetLifecycleService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    // The members below are PLAIN fields, not reactive `_` configs: they are injectable seams /
    // settings, not change-propagating state, and a singleton's reactive configs do not re-apply
    // synchronously when overwritten per test (verified failure). Plain assignment is immediate.

    /**
     * Child-env variable the resolved PAT is injected under. Configurable so a harness expecting a
     * different name (`GITHUB_TOKEN`, …) can be accommodated.
     * @member {String} credentialEnvVar='GH_TOKEN'
     */
    credentialEnvVar = 'GH_TOKEN'

    /**
     * Child-env variable the minted Bridge session token is injected under — a credential class
     * DISTINCT from the PAT, so never `credentialEnvVar`. The Bridge handshake reads it.
     * @member {String} bridgeTokenEnvVar='NEO_FLEET_BRIDGE_TOKEN'
     */
    bridgeTokenEnvVar = 'NEO_FLEET_BRIDGE_TOKEN'

    /**
     * The forced NL tool-projection mode injected into every FM-spawned (embedded) agent — the
     * fail-closed security ceiling. FM-spawned ⇒ embedded ⇒ forced, by construction.
     * @member {String} toolProjectionMode='harness-embedded'
     */
    toolProjectionMode = 'harness-embedded'

    /**
     * The absolute per-agent harness instance-home root — where the isolated harness config/state
     * homes (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`) of template-launched agents are derived. `null` ⇒
     * the AiConfig `fleet.instanceRoot` leaf (the config SSOT owning default + env binding).
     * The field is the explicit test / per-tenant override seam, never a default shadow.
     * @member {String|null} instanceRoot=null
     */
    instanceRoot = null

    /**
     * Per-harness-family binary-path overrides, keyed by `harnessType` (e.g. `{codex: '/opt/codex'}`).
     * `null` / missing key ⇒ the family's AiConfig `fleet.harnessBinaries.*` leaf (the config
     * SSOT). The field is the explicit test / per-tenant override seam, never a default shadow.
     * @member {Object|null} harnessBinaryPaths=null
     */
    harnessBinaryPaths = null

    /**
     * Grace period after `SIGTERM` before `stop` escalates to `SIGKILL`.
     * @member {Number} sigkillTimeoutMs=5000
     */
    sigkillTimeoutMs = 5000

    /**
     * Registry collaborator. Defaults (via {@link getRegistry}) to the `FleetRegistryService`
     * singleton; inject a stub in tests so lifecycle specs never touch the real credential store.
     * @member {Object|null} registry=null
     */
    registry = null

    /**
     * Process-spawn implementation. Defaults (via {@link getSpawnFn}) to `child_process.spawn`;
     * inject a stub in tests so specs never launch a real binary.
     * @member {Function|null} spawnFn=null
     */
    spawnFn = null

    /**
     * Supervised processes keyed by agent id. Records carry NO secret.
     * @member {Map<String,Object>} processes
     * @private
     */
    processes = new Map()

    // ---- public API ---------------------------------------------------------

    /**
     * Start an agent's harness process. Idempotent while running (returns current status).
     * @param {String}  id          Registry agent id.
     * @param {Object} [opts={}]    Spawn options.
     * @param {String} [opts.cwd]   The child's working directory — the agent's provisioned repo
     *                              checkout. Omitted ⇒ the child inherits this process's cwd (the
     *                              unchanged legacy behavior). The Fleet Manager turnkey path
     *                              ({@link Neo.ai.services.fleet.startAgentProvisioned}) supplies the
     *                              `ensureAgentRepo`-derived `repoPath` here, so an FM-spawned harness
     *                              runs inside ITS repo rather than the Fleet Manager's own directory.
     * @returns {Object} status (see {@link status}).
     */
    start(id, opts = {}) {
        if (this.isRunning(id)) return this.status(id);

        const agent = this.getRegistry().getAgent(id);
        if (!agent) throw new Error(`FleetLifecycleService.start: unknown agent '${id}'.`);

        const launch                          = this.resolveLaunch(agent),
              {command, args, env: launchEnv} = launch;

        // Env-key contract guard (fail-fast): each reserved class occupies a DISTINCT child-env slot.
        // The PAT + Bridge-token keys are configurable, so a misconfiguration that collides two (e.g.
        // bridgeTokenEnvVar === credentialEnvVar) would write one credential then overwrite it with the
        // other — collapsing the distinct-credential-class boundary (the Bridge token lands in the PAT
        // slot), or stomping the forced-projection / agent-identity vars. Reject BEFORE injecting any
        // secret; never spawn under a broken env contract.
        const envKeys = [this.credentialEnvVar, this.bridgeTokenEnvVar, TOOL_PROJECTION_MODE_ENV_VAR, AGENT_IDENTITY_ENV_VAR];
        if (envKeys.some(key => !key) || new Set(envKeys).size !== envKeys.length) {
            throw new Error(`FleetLifecycleService.start: env-key contract violated — credentialEnvVar, bridgeTokenEnvVar, the forced-projection var, and the agent-identity var must be non-empty and pairwise distinct (got ${JSON.stringify(envKeys)}).`);
        }

        // The launch env may not name a reserved slot: allowing it would either let registry-authored
        // data pre-load a secret / identity slot, or be silently clobbered by the reserved injections
        // below. Neither may happen silently — fail fast, naming the colliding key, BEFORE any secret
        // is minted or injected.
        for (const key of Object.keys(launchEnv)) {
            if (envKeys.includes(key)) {
                throw new Error(`FleetLifecycleService.start: launch env key '${key}' collides with a reserved env slot for agent '${id}' (reserved: ${JSON.stringify(envKeys)}).`);
            }
        }

        // Child env: the MINIMAL allowlisted base — never a full parent-env copy. A tokenless
        // instance must not silently inherit the parent's `GH_TOKEN` or provider secrets; only
        // benign process-runtime vars cross the boundary (see AMBIENT_ENV_ALLOWLIST). The launch
        // env (the isolation home var, plus any Brain-set compat extras) merges BEFORE the reserved
        // injections so the reserved keys always win, then the PAT — if any — lands under
        // credentialEnvVar. Absent credential → start without it (a tokenless agent is valid).
        const env = {};
        for (const key of AMBIENT_ENV_ALLOWLIST) {
            if (process.env[key] !== undefined) env[key] = process.env[key];
        }
        for (const [key, value] of Object.entries(launchEnv)) {
            env[key] = value;
        }

        const pat = this.getRegistry().resolveCredential(id);
        if (pat != null) env[this.credentialEnvVar] = pat;

        // Bridge token: a credential class DISTINCT from the PAT. Mint one + inject it under
        // bridgeTokenEnvVar (never credentialEnvVar). The raw token enters the child env only — the
        // tracked process record never carries it (mirrors the PAT secret posture); the Bridge
        // handshake verifies it and fails closed on absence/mismatch.
        env[this.bridgeTokenEnvVar] = this.getRegistry().mintBridgeToken(id).token;

        // Forced Neural Link tool-projection: an FM-spawned agent is embedded by definition, so its
        // NL server is pinned to the read-only projection (server-bound, fail-closed) — set by
        // construction for every spawn, never the full developer surface. The NL server reads this
        // FIXED env var (a cross-process contract, not configurable) as a fallback to its
        // --tool-projection-mode flag.
        env[TOOL_PROJECTION_MODE_ENV_VAR] = this.toolProjectionMode;

        // Agent identity: every FM-spawned harness carries its fleet agent id under the FIXED
        // NEO_AGENT_IDENTITY var (a cross-process contract — the MCP identity resolution chain reads
        // this exact name), so the child binds to the agent the FM defined — never to whichever
        // ambient identity the FM process happens to carry. Reserved class #4: launch.env can never
        // pre-load it (guard above).
        env[AGENT_IDENTITY_ENV_VAR] = id;

        // Executable preflight (fail-closed): a path-shaped command must exist BEFORE any secret is
        // minted or a spawn attempted — a typo'd/missing binary fails loud here, not as a child
        // 'error' event racing the first status read. Bare commands (e.g. `claude`) resolve via the
        // child's PATH; the spawn itself asserts their existence.
        if (command.includes('/') && !fs.existsSync(command)) {
            throw new Error(`FleetLifecycleService.start: harness binary not found at '${command}' for agent '${id}'. Pin the AiConfig fleet.harnessBinaries leaf or the harnessBinaryPaths field to a real executable.`);
        }

        // The child's working directory: the agent's provisioned repo checkout when the caller supplies
        // it (the Fleet Manager turnkey path via startAgentProvisioned). Omitted ⇒ inherit this process's
        // cwd — but an FM-spawned harness is meant to operate on ITS repo, not the Fleet Manager's dir.
        //
        // stdio topology is the LIVENESS contract: stdin MUST be a held-open pipe — both supported
        // harness CLIs treat ignored/EOF'd stdin as session-end and exit immediately (probed on the
        // exact binaries; see the class summary). stdout is discarded until a protocol consumer
        // lands; stderr is drained byte-counted below.
        const spawnOptions = {stdio: ['pipe', 'ignore', 'pipe'], env};
        if (opts.cwd != null) spawnOptions.cwd = opts.cwd;

        let child;
        try {
            child = this.getSpawnFn()(command, args, spawnOptions);
        } catch (error) {
            this.processes.set(id, {id, cwd: opts.cwd ?? null, state: 'failed', pid: null, startedAt: null, exitCode: null, exitedAt: new Date().toISOString(), error: error.message});
            throw error;
        }

        const record = {
            id, child,
            cwd        : opts.cwd ?? null,
            pid        : child.pid ?? null,
            state      : 'running',
            startedAt  : new Date().toISOString(),
            exitCode   : null,
            signal     : null,
            exitedAt   : null,
            stderrBytes: 0,
            // Curated-launch observability: the family + isolated home let `status` compute the live
            // per-home `authRequired` heuristic; null for raw-launch agents (unknown layout).
            harnessType  : launch.instanceHome ? agent.harnessType : null,
            instanceHome : launch.instanceHome ?? null,
            binaryVersion: null
        };
        this.processes.set(id, record);

        // Best-effort version surface (the pin/verify half of the executable preflight): capture
        // `<binary> --version` async onto the record — the status read surfaces what actually runs,
        // so an app-bundle alpha channel that self-updated is VISIBLE, not silently different.
        // Failure is non-fatal (version stays null); the probe never blocks the spawn path.
        try {
            execFile(command, ['--version'], {timeout: 3000}, (error, stdout) => {
                if (!error && stdout) record.binaryVersion = String(stdout).trim().split('\n')[0].slice(0, 80);
            });
        } catch (ignored) {}

        // Drain stderr so a noisy harness can't block on a full pipe buffer. Retain only a byte
        // COUNT, never the content: the child's stderr is untrusted and may echo the injected PAT,
        // and a status read must never surface a secret (we cannot enforce "the child won't log it").
        child.stderr?.on?.('data', chunk => {
            record.stderrBytes += chunk.length;
        });

        child.on?.('exit', (code, signal) => {
            record.state    = 'stopped';
            record.exitCode = code;
            record.signal   = signal;
            record.exitedAt = new Date().toISOString();
            record.child    = null;
        });
        child.on?.('error', error => {
            record.state    = 'failed';
            record.error    = error.message;
            record.exitedAt = new Date().toISOString();
            record.child    = null;
        });

        return this.status(id);
    }

    /**
     * Gracefully stop an agent's process: `SIGTERM`, then `SIGKILL` after `sigkillTimeoutMs`.
     * @param {String} id
     * @returns {Promise<Object>} `{success, id, state}`
     */
    stop(id) {
        const record = this.processes.get(id);
        if (!record || !record.child || record.state !== 'running') {
            return Promise.resolve({success: false, id, state: record?.state ?? 'stopped'});
        }

        const child = record.child;

        return new Promise(resolve => {
            let settled = false;

            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({success: true, id, state: 'stopped'});
            };

            const timer = setTimeout(() => {
                try { child.kill?.('SIGKILL'); } catch (e) {}
            }, this.sigkillTimeoutMs);
            timer.unref?.();

            child.once?.('exit', finish);
            child.once?.('error', finish);

            try {
                child.kill?.('SIGTERM');
            } catch (e) {
                finish();
            }
        });
    }

    /**
     * Stop (settling the pending stop) then start, **re-using the spawn `cwd`** the agent was started with
     * (read from the persisted process record) — so a provisioned agent restarts inside its own checkout,
     * not this process's directory, and its checkout-path-keyed auto-memory does not fork. `restart` of a
     * non-running agent is just `start` (at the recorded `cwd` when one exists).
     * @param {String} id
     * @returns {Promise<Object>} status
     */
    async restart(id) {
        const priorCwd = this.processes.get(id)?.cwd ?? null;
        await this.stop(id);
        return this.start(id, priorCwd != null ? {cwd: priorCwd} : {});
    }

    /**
     * Status snapshot for one agent (never carries a secret — `stderrBytes` is a count, not content;
     * `authRequired` checks a marker file's PRESENCE, never its content).
     * @param {String} id
     * @returns {Object} `{id, state, running, pid, startedAt, uptimeMs, exitCode, exitedAt,
     *     stderrBytes, authRequired, binaryVersion}` — `authRequired` is the LIVE per-home
     *     auth-marker heuristic for curated launches (`true` = the operator-owned per-home login has
     *     not happened yet; recomputed each read so a completed login flips it without a restart);
     *     `null` for raw-launch / untracked agents. `binaryVersion` is the best-effort
     *     `--version` capture of what actually ran (`null` until/unless the probe answered).
     */
    status(id) {
        const record = this.processes.get(id);
        if (!record) return {id, state: 'stopped', running: false, pid: null, startedAt: null, uptimeMs: null, exitCode: null, exitedAt: null, stderrBytes: 0, authRequired: null, binaryVersion: null};

        return {
            id,
            state        : record.state,
            running      : record.state === 'running',
            pid          : record.pid,
            startedAt    : record.startedAt,
            uptimeMs     : record.state === 'running' && record.startedAt ? Date.now() - Date.parse(record.startedAt) : null,
            exitCode     : record.exitCode,
            exitedAt     : record.exitedAt,
            stderrBytes  : record.stderrBytes ?? 0,
            authRequired : this.authRequiredForHome(record.harnessType, record.instanceHome),
            binaryVersion: record.binaryVersion ?? null
        };
    }

    /**
     * @summary The live per-home auth heuristic: `false` when the family's auth-marker file exists
     * inside the instance home (the operator-owned per-home login completed), `true` when the home
     * exists without it, `null` when the family/home is unknown (raw launches). Presence-only —
     * the marker's content is never read.
     * @param {String|null} harnessType
     * @param {String|null} instanceHome
     * @returns {Boolean|null}
     */
    authRequiredForHome(harnessType, instanceHome) {
        const marker = harnessType && HARNESS_AUTH_MARKERS[harnessType];
        if (!marker || !instanceHome) return null;

        return !fs.existsSync(path.join(instanceHome, marker));
    }

    /**
     * @returns {Object[]} status of every currently-running agent.
     */
    listRunning() {
        return [...this.processes.values()].filter(record => record.state === 'running').map(record => this.status(record.id));
    }

    /**
     * @param {String} id
     * @returns {Boolean} whether the agent's process is tracked as running.
     */
    isRunning(id) {
        return this.processes.get(id)?.state === 'running';
    }

    // ---- internals ----------------------------------------------------------

    /**
     * Resolve the launch spec for an agent — command + args + per-agent launch env.
     *
     * **Normal form — curated intent:** no `metadata.launch` + a templated `harnessType` ⇒ the spec
     * is derived internally: {@link Neo.ai.services.fleet.deriveAgentInstanceHome} keys an isolated
     * instance home (by agent **id**, never `githubUsername`) under {@link getInstanceRoot}, and
     * {@link Neo.ai.services.fleet.deriveHarnessLaunchSpec} maps it onto the family template with
     * the {@link getHarnessBinaryPath}-resolved binary. Nothing registry-authored is executed —
     * `harnessType` stays classification. An untemplated `harnessType` with no launch spec throws
     * (fail-closed; this service never guesses a brittle command).
     *
     * **SECURITY STOP-LINE — the raw-launch compatibility path:** an explicit `metadata.launch =
     * {command, args, env}` is honored as-is, but it executes an ARBITRARY command in a
     * credential-bearing child (the PAT + Bridge token ride that env). It is a Brain/operator-only
     * COMPATIBILITY surface and must NEVER become the Body-reachable normal form — a pane-supplied
     * command string would be remote code execution with credentials attached.
     *
     * The optional `launch.env` (a plain Object of string values) is shape-validated here; {@link
     * start} merges it onto the child env BEFORE the reserved injections (reserved keys always win)
     * and rejects any reserved-key collision fail-fast.
     * @param {Object} agent
     * @returns {{command: String, args: String[], env: Object}}
     * @private
     */
    resolveLaunch(agent) {
        const launch = agent.metadata?.launch;

        if (!launch) {
            // Curated-intent fallback: classification (harnessType) + the config-resolved instance
            // root / binary path decide the launch — the registry payload contributes no command.
            const binaryPath = this.getHarnessBinaryPath(agent.harnessType);
            if (!binaryPath) {
                throw new Error(`FleetLifecycleService: agent '${agent.id}' (harnessType '${agent.harnessType}') has no launch template. Use a templated harnessType, or have the Brain/operator set a launch override via FleetRegistryService.setLaunchOverride.`);
            }
            const instanceHome = deriveAgentInstanceHome({instanceRoot: this.getInstanceRoot(), agentId: agent.id, harnessType: agent.harnessType});
            return {
                ...deriveHarnessLaunchSpec({harnessType: agent.harnessType, instanceHome, binaryPath}),
                // carried for observability: `status` computes the live per-home authRequired from it
                instanceHome
            };
        }

        if (!launch.command) {
            throw new Error(`FleetLifecycleService: agent '${agent.id}' (harnessType '${agent.harnessType}') has no launch spec. Set metadata.launch = {command, args}.`);
        }

        const env = launch.env ?? {};
        if (typeof env !== 'object' || Array.isArray(env)) {
            throw new Error(`FleetLifecycleService: agent '${agent.id}' has an invalid metadata.launch.env — expected a plain Object of string values.`);
        }
        for (const [key, value] of Object.entries(env)) {
            if (PROTO_ENV_KEYS.includes(key)) {
                throw new Error(`FleetLifecycleService: agent '${agent.id}' has an invalid metadata.launch.env — prototype-mutating key '${key}' is rejected (JSON-parsed own keys survive into the merge; assigning them would mutate the prototype chain, never define an env var).`);
            }
            if (typeof value !== 'string') {
                throw new Error(`FleetLifecycleService: agent '${agent.id}' has an invalid metadata.launch.env — '${key}' must map to a String value.`);
            }
        }

        return {command: launch.command, args: Array.isArray(launch.args) ? launch.args : [], env, instanceHome: null};
    }

    /**
     * @summary Resolve the absolute per-agent harness instance-home root: the `instanceRoot` field
     * when explicitly injected (the test/tenant override seam), else the AiConfig
     * `fleet.instanceRoot` leaf — the SSOT that owns the default AND its env binding
     * (`NEO_FLEET_INSTANCE_ROOT`), per the config-is-SSOT contract: this service never re-derives from `process.env`
     * and holds no hidden default.
     * @returns {String}
     */
    getInstanceRoot() {
        return this.instanceRoot || AiConfig.fleet.instanceRoot;
    }

    /**
     * @summary Resolve the harness binary path for one harness family: the `harnessBinaryPaths`
     * field entry when explicitly injected (the test/tenant override seam), else the family's
     * AiConfig `fleet.harnessBinaries.*` leaf — the SSOT owning the default and its env binding
     * (`NEO_FLEET_CODEX_BIN` / `NEO_FLEET_CLAUDE_CODE_BIN`). The codex leaf default is the
     * ChatGPT-app-bundled CLI — an alpha channel that self-updates with its app, so production
     * fleets pin the leaf; `status().binaryVersion` surfaces what actually ran. An untemplated
     * family resolves `null` — {@link resolveLaunch} fails loud rather than guessing.
     * @param {String} harnessType
     * @returns {String|null}
     */
    getHarnessBinaryPath(harnessType) {
        const leafKey = HARNESS_BINARY_LEAF_KEYS[harnessType];

        return this.harnessBinaryPaths?.[harnessType] || (leafKey ? AiConfig.fleet.harnessBinaries[leafKey] : null);
    }

    /**
     * @returns {Object} the registry collaborator (injected stub or the default singleton).
     * @private
     */
    getRegistry() {
        return this.registry || FleetRegistryService;
    }

    /**
     * @returns {Function} the spawn implementation (injected stub or `child_process.spawn`).
     * @private
     */
    getSpawnFn() {
        return this.spawnFn || spawn;
    }
}

export default Neo.setupClass(FleetLifecycleService);
