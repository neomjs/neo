import {execFile, spawn} from 'child_process';
import fs                from 'fs';
import path              from 'path';
import AiConfig          from '../../config.mjs';
import Base              from '../../../src/core/Base.mjs';
import {
    MCP_SERVERS,
    REMOTE_MCP_CREDENTIAL_ENV_VAR
} from '../../../src/ai/fleet/mcpServers.mjs';
import {deriveAgentInstanceHome}                                    from './deriveAgentInstanceHome.mjs';
import {deriveHarnessLaunchSpec}                                    from './deriveHarnessLaunchSpec.mjs';
import FleetRegistryService                                         from './FleetRegistryService.mjs';
import {cleanupCodexDesktopCrashpad, probeCodexDesktopCapabilities} from './manageCodexDesktopRuntime.mjs';

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

const REMOTE_MCP_SERVER_KEYS = new Set(['memory-core', 'knowledge-base']);

/**
 * @summary Parse Codex's normalized MCP list while tolerating its benign launcher warning outside
 * the JSON payload. Only one outer JSON array is accepted; callers never surface its raw content.
 * @param {String|Buffer} output
 * @returns {Object[]}
 * @private
 */
function parseCodexMcpList(output) {
    const
        source = String(output),
        start  = source.indexOf('['),
        end    = source.lastIndexOf(']');

    if (start === -1 || end < start) {
        throw new SyntaxError('Codex MCP list did not contain a JSON array.')
    }

    const rows = JSON.parse(source.slice(start, end + 1));

    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new TypeError('Codex MCP list JSON must be an array of objects.')
    }

    return rows
}

// The AiConfig `fleet.harnessBinaries` leaf key per harness family. An unknown family has no
// entry — `resolveLaunch` fails loud instead of guessing a command for it.
const HARNESS_BINARY_LEAF_KEYS = {
    'antigravity'   : 'antigravity',
    'claude-code'   : 'claudeCode',
    'claude-desktop': 'claudeDesktop',
    'codex'         : 'codex',
    'codex-desktop' : 'codexDesktop',
    'kimi-code'     : 'kimiCode',
    'opencode'      : 'openCode'
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
// the marker's presence is checked, never its content. The app-bundle GUI families
// (claude-desktop / antigravity) have NO documented marker — auth is the in-app sign-in inside a
// Chromium profile — so they carry no entry and `authRequiredForHome` answers `null` (honest
// unknown), never a guessed boolean.
const HARNESS_AUTH_MARKERS = {
    'claude-code': '.credentials.json',
    'codex'      : 'auth.json',
    // Codex Desktop authenticates through the bundled CLI against its typed nested authHome.
    'codex-desktop': 'auth.json'
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
 * **Supervision transport (the topology that keeps a harness alive):** children spawn with
 * `stdio: ['pipe', 'ignore', 'pipe']` — stdin is a HELD-OPEN pipe, because the CLI families exit
 * immediately on an EOF'd/ignored stdin (probed on the exact binaries: codex `app-server` and
 * claude-code stream-json both stay alive on a held pipe and exit without it); the app-bundle GUI
 * families (claude-desktop / antigravity) are stdin-indifferent — the held pipe is harmless there,
 * and pid/SIGTERM is the supervision handle (probed per family: dual-instance coexistence on
 * distinct `--user-data-dir` homes, SIGTERM-clean exit 0). The launch templates pin the
 * per-family long-lived mode args; stdout is discarded until a protocol consumer lands; stderr is
 * drained byte-counted as below.
 *
 * **Child env (minimal by construction):** the child receives ONLY the `AMBIENT_ENV_ALLOWLIST`
 * process-runtime vars — never a full parent-env copy, so ambient operator secrets cannot leak into
 * a peer — plus the launch spec's own env (its isolation home var), plus the reserved injections.
 * A `launch.env` key naming a reserved slot (`credentialEnvVar`, `NEO_MCP_REMOTE_TOKEN`,
 * `bridgeTokenEnvVar`, `NEO_NL_TOOL_PROJECTION_MODE`, `NEO_AGENT_IDENTITY`) or a prototype-mutating key
 * (`__proto__` / `constructor` / `prototype`) is rejected fail-fast, naming the offending key.
 *
 * **Credential security boundary** (inherited from the registry's two-hemisphere rule): the GitHub
 * repository PAT is
 * injected into the spawned **child's environment only** — onto the minimal allowlisted env above
 * (the parent env is never mutated), under a configurable var (`credentialEnvVar`, default
 * `GH_TOKEN`). It is **never** placed in `argv` (visible in `ps`), never written to the tracked
 * process record, and never logged. The already-probed remote MCP plane bearer is a SECOND credential
 * class, injected only when supplied under the fixed `NEO_MCP_REMOTE_TOKEN` slot; it is never substituted for
 * `GH_TOKEN`. A status read can never surface either secret because the records hold none. The
 * **Bridge session token** is a THIRD, distinct credential class, injected the same way under its
     * own var (`bridgeTokenEnvVar`) — minted per spawn, never co-mingled with either provider
     * credential.
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
     * Auxiliary-subprocess implementation for the version probe. Defaults (via
     * {@link getExecFileFn}) to `child_process.execFile`; inject a recorder in tests to assert the
     * probe's env boundary without executing a binary.
     * @member {Function|null} execFileFn=null
     */
    execFileFn = null

    /**
     * Installed-bundle capability probe for `codex-desktop`. Defaults to the read-only static
     * bundle inspector; injectable so lifecycle specs never depend on an installed GUI app.
     * @member {Function|null} codexDesktopCapabilityProbeFn=null
     */
    codexDesktopCapabilityProbeFn = null

    /**
     * Exact-profile Crashpad cleanup after a Codex Desktop main exit. Defaults to the bounded
     * process-ownership helper; injectable so unit specs never inspect or signal host processes.
     * @member {Function|null} codexDesktopCleanupFn=null
     */
    codexDesktopCleanupFn = null

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
     * @param {String|null} [opts.resolvedCredential] Already-resolved GitHub repository credential.
     * @param {String|null} [opts.resolvedMcpCredential] Already-probed remote MC/KB plane credential.
     * @param {Object} [opts.remoteMcpCapability] Exact capability proof returned by
     *     {@link assertRemoteMcpCapability}; binds the curated launch to the same resolved binary
     *     snapshot instead of re-reading a mutable AiConfig path after preparation.
     * @returns {Object} status (see {@link status}).
     */
    start(id, opts = {}) {
        if (this.isRunning(id)) return this.status(id);

        const priorRecord = this.processes.get(id);

        if (priorRecord?.state === 'stopping' || priorRecord?.cleanupUnresolved) {
            throw new Error(`FleetLifecycleService.start: refusing to spawn agent '${id}' while Codex Desktop helper ownership is ${priorRecord.state === 'stopping' ? 'still being finalized' : 'unresolved after a lifecycle failure'}.`);
        }

        // The RAW definition read (Brain-internal): the public getAgent projection deliberately
        // redacts metadata.launch, so the spawn path — the one consumer entitled to the launch
        // override — reads through the registry's definition surface instead.
        const agent = this.getRegistry().getDefinition(id);
        if (!agent) throw new Error(`FleetLifecycleService.start: unknown agent '${id}'.`);

        const launch                          = this.resolveLaunch(agent, opts),
              {command, args, env: launchEnv} = launch;

        // Env-key contract guard (fail-fast): each reserved class occupies a DISTINCT child-env slot.
        // The PAT + Bridge-token keys are configurable, so a misconfiguration that collides two (e.g.
        // bridgeTokenEnvVar === credentialEnvVar) would write one credential then overwrite it with the
        // other — collapsing the distinct-credential-class boundary (the Bridge token lands in the PAT
        // slot), or stomping the forced-projection / agent-identity vars. Reject BEFORE injecting any
        // secret; never spawn under a broken env contract.
        const envKeys = [
            this.credentialEnvVar,
            REMOTE_MCP_CREDENTIAL_ENV_VAR,
            this.bridgeTokenEnvVar,
            TOOL_PROJECTION_MODE_ENV_VAR,
            AGENT_IDENTITY_ENV_VAR
        ];
        if (envKeys.some(key => !key) || new Set(envKeys).size !== envKeys.length) {
            throw new Error(`FleetLifecycleService.start: env-key contract violated — credentialEnvVar, the fixed remote-MCP credential slot, bridgeTokenEnvVar, the forced-projection var, and the agent-identity var must be non-empty and pairwise distinct (got ${JSON.stringify(envKeys)}).`);
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

        // Executable preflight (fail-closed, BEFORE any secret is resolved or minted): the command
        // must resolve to an executable file exactly the way the spawn will resolve it — child cwd
        // for path-shaped/relative forms, the child's PATH for bare forms, executable permission
        // required (existence alone lets a mode-0644 candidate publish a running status, then flip
        // to failed on the child's asynchronous permission error — a transient false-running state
        // no supervisor may emit).
        const resolvedCommand = this.resolveExecutable(command, env.PATH, opts.cwd);
        if (!resolvedCommand) {
            throw new Error(`FleetLifecycleService.start: harness binary '${command}' not found or not executable for agent '${id}' (path-shaped commands resolve against the child cwd; bare commands against the child's PATH; executable permission required). Pin the AiConfig fleet.harnessBinaries leaf or the harnessBinaryPaths field to a real executable.`);
        }

        let
            authCommand            = launch.instanceHome && HARNESS_AUTH_MARKERS[agent.harnessType] ? resolvedCommand : null,
            codexDesktopCapability = null;

        if (agent.harnessType === 'codex-desktop' && launch.instanceHome) {
            const configuredAuthCommand = this.getHarnessBinaryPath('codex');

            authCommand = configuredAuthCommand && this.resolveExecutable(configuredAuthCommand, env.PATH, opts.cwd);

            if (!authCommand) {
                const reason = 'bundled Codex CLI auth command is unavailable';
                this.publishUnavailable({id, launch, resolvedCommand, cwd: opts.cwd, reason});
                throw new Error(`FleetLifecycleService.start: codex-desktop is unavailable for agent '${id}' — ${reason}.`);
            }

            try {
                codexDesktopCapability = this.getCodexDesktopCapabilityProbe()({binaryPath: resolvedCommand});
            } catch {
                codexDesktopCapability = {available: false, reason: 'installed-bundle capability probe failed'};
            }

            if (!codexDesktopCapability?.available || !path.isAbsolute(codexDesktopCapability.crashpadExecutable || '')) {
                const reason = codexDesktopCapability?.reason || 'exact packaged Crashpad helper proof is missing';
                this.publishUnavailable({id, launch, resolvedCommand, authCommand, cwd: opts.cwd, reason});
                throw new Error(`FleetLifecycleService.start: codex-desktop is unavailable for agent '${id}' — ${reason}.`);
            }
        }

        // The provisioned remote-seat path resolves and authenticates the PAT BEFORE any checkout
        // or config mutation, then hands that exact value through here. Own-property semantics are
        // load-bearing: an explicit `null` is an authenticated negative result and must not trigger
        // a second registry read that could observe a different credential.
        const pat = Object.hasOwn(opts, 'resolvedCredential')
            ? opts.resolvedCredential
            : this.getRegistry().resolveCredential(id);
        if (pat != null) env[this.credentialEnvVar] = pat;

        // Remote plane bearer: a second provider credential resolved + authenticated by
        // startAgentProvisioned through FleetTenantService. It has NO implicit fallback to the
        // repository PAT: provider equality is a deployment fact, never a Fleet assumption.
        const remoteMcpCredential = Object.hasOwn(opts, 'resolvedMcpCredential')
            ? opts.resolvedMcpCredential
            : null;
        if (remoteMcpCredential != null) env[REMOTE_MCP_CREDENTIAL_ENV_VAR] = remoteMcpCredential;

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
            child = this.getSpawnFn()(resolvedCommand, args, spawnOptions);
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
            harnessType       : launch.instanceHome ? agent.harnessType : null,
            instanceHome      : launch.instanceHome ?? null,
            authHome          : launch.authHome ?? (HARNESS_AUTH_MARKERS[agent.harnessType] ? launch.instanceHome : null),
            authCommand,
            electronProfile   : launch.electronProfile ?? null,
            crashpadExecutable: codexDesktopCapability?.crashpadExecutable ?? null,
            launchCommand     : launch.instanceHome ? resolvedCommand : null,
            binaryVersion     : null,
            failureReason     : null,
            cleanupUnresolved : false,
            finalizePromise   : null
        };
        this.processes.set(id, record);

        // Best-effort version surface (the pin/verify half of the executable preflight): capture
        // the template-owned version-probe argv async onto the record — the status read surfaces
        // what actually runs, so an app-bundle alpha channel that self-updated is VISIBLE, not
        // silently different. The argv is per-family template data: arg-isolated families carry
        // their `--user-data-dir` flag so the probe subprocess can never land inside another
        // profile's single-instance scope, and a family whose binary cannot answer a version ask
        // without booting the whole app derives `null` — the probe is SKIPPED and `binaryVersion`
        // stays honestly null (see deriveHarnessLaunchSpec). Raw launches keep the legacy bare
        // `--version`. Failure is non-fatal (version stays null); the probe never blocks the spawn
        // path. The probe runs under the SAME minimal env as the supervised child: every subprocess
        // this service creates shares one secret boundary — an auxiliary execFile inheriting the
        // full parent env would hand ambient provider secrets to the probed binary.
        const versionProbeArgs = launch.versionProbeArgs === undefined ? ['--version'] : launch.versionProbeArgs;

        if (versionProbeArgs) {
            try {
                this.getExecFileFn()(resolvedCommand, versionProbeArgs, {timeout: 3000, env}, (error, stdout) => {
                    if (!error && stdout) record.binaryVersion = String(stdout).trim().split('\n')[0].slice(0, 80);
                });
            } catch (ignored) {}
        }

        // Drain stderr so a noisy harness can't block on a full pipe buffer. Retain only a byte
        // COUNT, never the content: the child's stderr is untrusted and may echo the injected PAT,
        // and a status read must never surface a secret (we cannot enforce "the child won't log it").
        child.stderr?.on?.('data', chunk => {
            record.stderrBytes += chunk.length;
        });

        child.on?.('exit', (code, signal) => this.finalizeExitedProcess(record, {code, signal}));
        child.on?.('error', error => {
            record.state         = 'failed';
            record.error         = error.message;
            record.failureReason = 'tracked harness process emitted an error';
            record.exitedAt      = new Date().toISOString();

            if (record.electronProfile && record.pid != null) {
                // A successfully spawned Desktop main can emit `error` without proving process exit.
                // Keep the child handle + block replacement until stop drives the main to `exit` and
                // the profile finalizer proves zero helpers. Pre-spawn errors have no pid/profile
                // ownership and retain the legacy retryable failure path below.
                record.cleanupUnresolved = true;
            } else {
                record.child = null;
            }
        });

        return this.status(id);
    }

    /**
     * Gracefully stop an agent's process: `SIGTERM`, then `SIGKILL` after `sigkillTimeoutMs`.
     * @param {String} id
     * @returns {Promise<Object>} `{success, id, state, cleanupUnresolved}`; the final field is true
     * only when exact-profile Codex Desktop helper ownership remains unresolved.
     */
    stop(id) {
        const record = this.processes.get(id);

        if (record?.state === 'stopping' && record.finalizePromise) {
            return record.finalizePromise.then(() => ({
                success          : record.state === 'stopped',
                id,
                state            : record.state,
                cleanupUnresolved: Boolean(record.cleanupUnresolved)
            }));
        }

        if (record?.cleanupUnresolved && !record.child && record.electronProfile && record.crashpadExecutable) {
            record.finalizePromise = null;

            return this.finalizeCodexDesktopHelpers(record).then(() => ({
                success          : record.state === 'stopped',
                id,
                state            : record.state,
                cleanupUnresolved: Boolean(record.cleanupUnresolved)
            }));
        }

        if (!record || !record.child || (record.state !== 'running' && !record.cleanupUnresolved)) {
            return Promise.resolve({success: false, id, state: record?.state ?? 'stopped', cleanupUnresolved: Boolean(record?.cleanupUnresolved)});
        }

        const child = record.child;

        return new Promise(resolve => {
            let settled = false;

            const finish = async () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);

                // The tracked main's exit is only phase 1 for Codex Desktop. Its profile-owned
                // Crashpad helpers re-parent to PID 1 on current builds, so stop does not resolve
                // until the exact-profile finalizer proves zero residuals (or fails closed).
                await record.finalizePromise;

                resolve({success: record.state === 'stopped', id, state: record.state, cleanupUnresolved: Boolean(record.cleanupUnresolved)});
            };

            const timer = setTimeout(() => {
                try { child.kill?.('SIGKILL'); } catch (e) {}
            }, this.sigkillTimeoutMs);
            timer.unref?.();

            child.once?.('exit', () => { void finish() });
            child.once?.('error', () => { void finish() });

            try {
                child.kill?.('SIGTERM');
            } catch (e) {
                void finish();
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
        const stopped  = await this.stop(id);

        if (stopped.cleanupUnresolved) {
            throw new Error(`FleetLifecycleService.restart: cleanup failed for agent '${id}'; refusing to spawn a replacement over ambiguous residual processes.`);
        }

        return this.start(id, priorCwd != null ? {cwd: priorCwd} : {});
    }

    /**
     * Status snapshot for one agent (never carries a secret — `stderrBytes` is a count, not content;
     * `authRequired` checks a marker file's PRESENCE, never its content).
     * @param {String} id
     * @returns {Object} `{id, state, running, pid, startedAt, uptimeMs, exitCode, exitedAt,
     *     stderrBytes, authRequired, instanceHome, authHome, launchCommand, authCommand,
     *     binaryVersion, failureReason, cleanupUnresolved}` — `authRequired`
     *     is the LIVE per-home
     *     auth-marker heuristic for curated launches (`true` = the operator-owned per-home login has
     *     not happened yet; recomputed each read so a completed login flips it without a restart);
     *     `null` for raw-launch / untracked agents. `instanceHome` + `launchCommand` name the GUI or
     *     CLI launch vessel; marker families also expose the distinct `authHome` + `authCommand`
     *     pair consumed by the operator-owned login handoff. These absolute paths are intentionally
     *     safe for the dev-only unauthenticated loopback Fleet bridge: they expose no auth contents.
     *     `binaryVersion` is the best-effort `--version` capture of what actually ran (`null`
     *     until/unless the probe answered); `failureReason` is a bounded lifecycle-owned reason,
     *     never raw child output.
     */
    status(id) {
        const record = this.processes.get(id);
        if (!record) return {id, state: 'stopped', running: false, pid: null, startedAt: null, uptimeMs: null, exitCode: null, exitedAt: null, stderrBytes: 0, authRequired: null, instanceHome: null, authHome: null, launchCommand: null, authCommand: null, binaryVersion: null, failureReason: null, cleanupUnresolved: false};

        return {
            id,
            state            : record.state,
            running          : record.state === 'running',
            pid              : record.pid,
            startedAt        : record.startedAt,
            uptimeMs         : record.state === 'running' && record.startedAt ? Date.now() - Date.parse(record.startedAt) : null,
            exitCode         : record.exitCode,
            exitedAt         : record.exitedAt,
            stderrBytes      : record.stderrBytes ?? 0,
            authRequired     : this.authRequiredForHome(record.harnessType, record.authHome),
            instanceHome     : record.instanceHome ?? null,
            authHome         : record.authHome ?? null,
            launchCommand    : record.launchCommand ?? null,
            authCommand      : record.authCommand ?? null,
            binaryVersion    : record.binaryVersion ?? null,
            failureReason    : record.failureReason ?? null,
            cleanupUnresolved: Boolean(record.cleanupUnresolved)
        };
    }

    /**
     * @summary The live per-home auth heuristic: `false` when the family's auth-marker file exists
     * inside the auth home (the operator-owned per-home login completed), `true` when the home
     * exists without it, `null` when the family/home is unknown (raw launches). Presence-only —
     * the marker's content is never read.
     * @param {String|null} harnessType
     * @param {String|null} authHome
     * @returns {Boolean|null}
     */
    authRequiredForHome(harnessType, authHome) {
        const marker = harnessType && HARNESS_AUTH_MARKERS[harnessType];
        if (!marker || !authHome) return null;

        return !fs.existsSync(path.join(authHome, marker));
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
     * @summary Publish a safe, non-running `unavailable` record when Codex Desktop's installed
     * bundle cannot prove its private profile/project/updater contract. This happens before PAT
     * resolution, Bridge-token minting, or spawn; status can therefore distinguish unavailable
     * capability from an ordinary stopped agent without carrying a secret or raw environment.
     * @param {Object} options
     * @private
     */
    publishUnavailable({id, launch, resolvedCommand, authCommand = null, cwd = null, reason}) {
        this.processes.set(id, {
            id,
            child             : null,
            cwd               : cwd ?? null,
            pid               : null,
            state             : 'unavailable',
            startedAt         : null,
            exitCode          : null,
            signal            : null,
            exitedAt          : new Date().toISOString(),
            stderrBytes       : 0,
            harnessType       : null,
            instanceHome      : launch.instanceHome ?? null,
            authHome          : launch.authHome ?? null,
            authCommand,
            electronProfile   : launch.electronProfile ?? null,
            crashpadExecutable: null,
            launchCommand     : resolvedCommand ?? null,
            binaryVersion     : null,
            failureReason     : String(reason),
            cleanupUnresolved : false,
            finalizePromise   : null
        });
    }

    /**
     * @summary Finalize one tracked main-process exit. Ordinary harnesses stop immediately; Codex
     * Desktop enters `stopping` until its exact-profile packaged Crashpad helpers are terminated and
     * a re-scan proves zero. Ambiguous ownership becomes a durable `failed` status rather than a
     * broader kill or a false stopped claim.
     * @param {Object} record Tracked lifecycle record.
     * @param {Object} exit `{code, signal}` from the child.
     * @returns {Promise<void>}
     * @private
     */
    finalizeExitedProcess(record, {code, signal}) {
        if (record.finalizePromise) return record.finalizePromise;

        record.exitCode = code;
        record.signal   = signal;
        record.exitedAt = new Date().toISOString();
        record.child    = null;

        if (!record.electronProfile || !record.crashpadExecutable) {
            record.state           = 'stopped';
            record.finalizePromise = Promise.resolve();
            return record.finalizePromise;
        }

        return this.finalizeCodexDesktopHelpers(record);
    }

    /**
     * @summary Run or retry the helper-only finalization for a Desktop record whose main has exited.
     * A transient ambiguous scan remains a durable failed state, but a later `stop()` can re-run the
     * exact same profile/executable proof and clear `cleanupUnresolved` only after zero residuals.
     * @param {Object} record Tracked Codex Desktop lifecycle record.
     * @returns {Promise<void>}
     * @private
     */
    finalizeCodexDesktopHelpers(record) {
        record.state           = 'stopping';
        record.finalizePromise = Promise.resolve()
            .then(() => this.getCodexDesktopCleanup()({
                electronProfile   : record.electronProfile,
                crashpadExecutable: record.crashpadExecutable
            }))
            .then(() => {
                record.state             = 'stopped';
                record.failureReason     = null;
                record.cleanupUnresolved = false;
            })
            .catch(error => {
                record.state             = 'failed';
                record.failureReason     = `Codex Desktop helper cleanup failed: ${error?.message || 'unknown failure'}`;
                record.cleanupUnresolved = true;
            });

        return record.finalizePromise;
    }

    /** @returns {Function} installed-bundle capability probe. @private */
    getCodexDesktopCapabilityProbe() {
        return this.codexDesktopCapabilityProbeFn || probeCodexDesktopCapabilities;
    }

    /** @returns {Function} exact-profile post-exit cleanup. @private */
    getCodexDesktopCleanup() {
        return this.codexDesktopCleanupFn || cleanupCodexDesktopCrashpad;
    }

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
     * @param {Object} [opts] Start options; the final provisioned `cwd` is launch input for
     *                        `codex-desktop` and ignored by other curated families.
     * @returns {{command: String, args: String[], env: Object}}
     * @private
     */
    resolveLaunch(agent, opts = {}) {
        const launch = agent.metadata?.launch;

        if (!launch) {
            // Curated-intent fallback: classification (harnessType) + the config-resolved instance
            // root / binary path decide the launch — the registry payload contributes no command.
            const
                proof      = opts.remoteMcpCapability,
                binaryPath = proof === undefined
                    ? this.getHarnessBinaryPath(agent.harnessType)
                    : proof?.launchBinaryPath;

            if (proof !== undefined &&
                (proof?.harnessType !== agent.harnessType || !path.isAbsolute(binaryPath || ''))) {
                throw new Error(`FleetLifecycleService: agent '${agent.id}' received an invalid remote MCP capability proof for harnessType '${agent.harnessType}'.`)
            }
            if (!binaryPath) {
                throw new Error(`FleetLifecycleService: agent '${agent.id}' (harnessType '${agent.harnessType}') has no launch template. Use a templated harnessType, or have the Brain/operator set a launch override via FleetRegistryService.setLaunchOverride.`);
            }
            const instanceHome = deriveAgentInstanceHome({instanceRoot: this.getInstanceRoot(), agentId: agent.id, harnessType: agent.harnessType});
            return {
                ...deriveHarnessLaunchSpec({harnessType: agent.harnessType, instanceHome, binaryPath, cwd: opts.cwd}),
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
     * (`NEO_FLEET_CODEX_BIN` / `NEO_FLEET_CODEX_DESKTOP_BIN` / `NEO_FLEET_CLAUDE_CODE_BIN` /
     * `NEO_FLEET_CLAUDE_DESKTOP_BIN` / `NEO_FLEET_ANTIGRAVITY_BIN` /
     * `NEO_FLEET_KIMI_CODE_BIN` / `NEO_FLEET_OPENCODE_BIN`). The codex leaf default is the
     * ChatGPT-app-bundled CLI — an
     * alpha channel that self-updates with its app, so production fleets pin the leaf;
     * `status().binaryVersion` surfaces what actually ran. The app-bundle families default to
     * their macOS bundle MAIN binaries (directly spawnable — never an `open -n` launcher). An
     * untemplated family resolves `null` — {@link resolveLaunch} fails loud rather than guessing.
     * @param {String} harnessType
     * @returns {String|null}
     */
    getHarnessBinaryPath(harnessType) {
        const leafKey = HARNESS_BINARY_LEAF_KEYS[harnessType];

        return this.harnessBinaryPaths?.[harnessType] || (leafKey ? AiConfig.fleet.harnessBinaries[leafKey] : null);
    }

    /**
     * @summary Prove the installed harness can encode Fleet's remote MCP grammar before any repo or
     * home mutation. This is a blocking admission gate, not the later best-effort version surface:
     * each family is checked against the exact grammar Fleet will generate.
     * @param {Object} agent Raw agent definition.
     * @returns {Promise<Object>} Non-secret `{harnessType,binaryPath,launchBinaryPath}` proof. For
     *     Codex Desktop, `binaryPath` is the bundled Codex config consumer and
     *     `launchBinaryPath` is the desktop harness executable; other families use one path for both.
     */
    async assertRemoteMcpCapability(agent) {
        const
            {harnessType, id} = agent,
            binaryFamily      = harnessType === 'codex-desktop' ? 'codex' : harnessType,
            configured        = this.getHarnessBinaryPath(binaryFamily),
            binaryPath        = configured && this.resolveExecutable(configured, process.env.PATH),
            configuredLaunch  = this.getHarnessBinaryPath(harnessType),
            launchBinaryPath  = configuredLaunch && this.resolveExecutable(configuredLaunch, process.env.PATH);

        if (!binaryPath) {
            throw new Error(`FleetLifecycleService.assertRemoteMcpCapability: harness binary '${configured || binaryFamily}' is unavailable for agent '${id}'.`)
        }
        if (!launchBinaryPath) {
            throw new Error(`FleetLifecycleService.assertRemoteMcpCapability: launch binary '${configuredLaunch || harnessType}' is unavailable for agent '${id}'.`)
        }

        let args;
        let accepts;

        if (harnessType === 'codex' || harnessType === 'codex-desktop') {
            args    = ['mcp', 'add', '--help'];
            accepts = output => output.includes('--url') && output.includes('--bearer-token-env-var')
        } else if (harnessType === 'claude-code') {
            args    = ['mcp', 'add', '--help'];
            accepts = output => output.includes('--transport') && output.includes('--header')
        } else if (harnessType === 'kimi-code') {
            args    = ['--version'];
            accepts = output => /(?:^|\s)0\.29\.1(?:\s|$)/.test(output)
        } else if (harnessType === 'opencode') {
            args    = ['--version'];
            accepts = output => /(?:^|\s)1\.18\.5(?:\s|$)/.test(output)
        } else {
            throw new Error(`FleetLifecycleService.assertRemoteMcpCapability: harnessType '${harnessType}' has no remote MCP artifact grammar.`)
        }

        let output;

        try {
            output = await this.execForCapability(binaryPath, args)
        } catch {
            throw new Error(`FleetLifecycleService.assertRemoteMcpCapability: installed '${harnessType}' capability probe failed for agent '${id}'.`)
        }

        if (!accepts(output)) {
            throw new Error(`FleetLifecycleService.assertRemoteMcpCapability: installed '${harnessType}' does not expose Fleet's required remote MCP grammar for agent '${id}'.`)
        }

        return {harnessType, binaryPath, launchBinaryPath}
    }

    /**
     * @summary Ask an installed adapter to read the generated remote MCP projection before spawn.
     * Codex and Codex Desktop expose a secret-free normalized `mcp list --json` view, so this gate
     * proves the generated project config is trusted, parsed, and still maps only MC + KB to the
     * selected remote plane. The probe receives no repository or plane credential. Other adapter
     * families retain their exact version/grammar admission plus renderer fixtures until they expose
     * an equivalent non-mutating normalized read.
     * @param {Object} options
     * @param {Object} options.agent Raw agent definition.
     * @param {String} options.binaryPath Capability-proven installed adapter binary.
     * @param {String} options.repoPath Canonical prepared checkout path.
     * @param {String} options.instanceHome Canonical prepared harness instance home.
     * @param {Object} options.mcpMatrix Effective MCP enabled-state matrix.
     * @param {Object} options.mcpTransport Resolved non-secret remote transport plan.
     * @returns {Promise<Object>} Redacted `{harnessType, inspected, serverNames}` receipt.
     */
    async inspectPreparedRemoteMcpAdapter({
        agent,
        binaryPath,
        repoPath,
        instanceHome,
        mcpMatrix,
        mcpTransport
    } = {}) {
        const harnessType = agent?.harnessType;

        if (!['codex', 'codex-desktop'].includes(harnessType)) {
            return {harnessType, inspected: false, serverNames: []}
        }

        if (!path.isAbsolute(binaryPath || '') ||
            !path.isAbsolute(repoPath || '') ||
            !path.isAbsolute(instanceHome || '') ||
            !mcpMatrix ||
            typeof mcpMatrix !== 'object' ||
            !mcpTransport ||
            mcpTransport.mode !== 'remote-http' ||
            !mcpTransport.resources) {
            throw new Error(`FleetLifecycleService.inspectPreparedRemoteMcpAdapter: malformed prepared Codex inspection input for agent '${agent?.id || 'unknown'}'.`)
        }

        const codexHome = harnessType === 'codex-desktop'
            ? path.join(instanceHome, 'codex-home')
            : instanceHome;
        let rows;

        try {
            const output = await this.execForPreparedCodexInspection(binaryPath, {
                cwd: repoPath,
                codexHome
            });

            rows = parseCodexMcpList(output)
        } catch {
            throw new Error(`FleetLifecycleService.inspectPreparedRemoteMcpAdapter: installed '${harnessType}' could not consume the generated MCP projection for agent '${agent.id}'.`)
        }

        const
            expectedNames = MCP_SERVERS.map(({key}) => `neo-mjs-${key}`),
            neoRows       = rows.filter(row => typeof row?.name === 'string' && row.name.startsWith('neo-mjs-')),
            byName        = new Map(neoRows.map(row => [row.name, row]));

        if (neoRows.length !== expectedNames.length ||
            byName.size !== expectedNames.length ||
            expectedNames.some(name => !byName.has(name))) {
            throw new Error(`FleetLifecycleService.inspectPreparedRemoteMcpAdapter: installed '${harnessType}' did not expose the exact Fleet MCP server set for agent '${agent.id}'.`)
        }

        for (const {key} of MCP_SERVERS) {
            const
                name      = `neo-mjs-${key}`,
                row       = byName.get(name),
                transport = row.transport || {},
                enabled   = mcpMatrix[key] === true;

            if (row.enabled !== enabled) {
                throw new Error(`FleetLifecycleService.inspectPreparedRemoteMcpAdapter: installed '${harnessType}' reported the wrong enabled state for '${name}'.`)
            }

            if (REMOTE_MCP_SERVER_KEYS.has(key)) {
                const
                    resource         = mcpTransport.resources[key],
                    staticHeaders    = transport.http_headers,
                    envHeaderAliases = transport.env_http_headers;

                if (transport.type !== 'streamable_http' ||
                    transport.url !== resource?.url ||
                    transport.bearer_token_env_var !== REMOTE_MCP_CREDENTIAL_ENV_VAR ||
                    (staticHeaders && Object.keys(staticHeaders).length > 0) ||
                    (envHeaderAliases && Object.keys(envHeaderAliases).length > 0)) {
                    throw new Error(`FleetLifecycleService.inspectPreparedRemoteMcpAdapter: installed '${harnessType}' reported a non-canonical remote projection for '${name}'.`)
                }
            } else if (transport.type !== 'stdio') {
                throw new Error(`FleetLifecycleService.inspectPreparedRemoteMcpAdapter: installed '${harnessType}' moved local-only '${name}' off stdio.`)
            }
        }

        return {harnessType, inspected: true, serverNames: expectedNames}
    }

    /**
     * @summary Execute one bounded, secret-free installed-capability probe through the lifecycle's
     * injectable `execFile` seam.
     * @param {String} command
     * @param {String[]} args
     * @returns {Promise<String>} Combined stdout/stderr for grammar matching only.
     * @protected
     */
    execForCapability(command, args) {
        const env = {};

        for (const key of AMBIENT_ENV_ALLOWLIST) {
            if (process.env[key] !== undefined) env[key] = process.env[key];
        }

        return new Promise((resolve, reject) => {
            let   settled = false;
            const done    = (error, stdout='', stderr='') => {
                if (settled) return;
                settled = true;
                error ? reject(error) : resolve(`${stdout}${stderr}`)
            };

            try {
                const pending = this.getExecFileFn()(command, args, {timeout: 5000, env}, done);

                if (pending?.then) {
                    pending.then(result => {
                        if (typeof result === 'string' || Buffer.isBuffer(result)) {
                            done(null, result)
                        } else {
                            done(null, result?.stdout, result?.stderr)
                        }
                    }, done)
                }
            } catch (error) {
                done(error)
            }
        })
    }

    /**
     * @summary Execute Codex's non-mutating generated-config read with the exact prepared cwd/home.
     * The environment is the benign runtime allowlist plus `CODEX_HOME`; neither Fleet credential
     * slot is present, so parsing cannot become an authentication side channel.
     * @param {String} command
     * @param {Object} options
     * @param {String} options.cwd
     * @param {String} options.codexHome
     * @returns {Promise<String>} Combined stdout/stderr for bounded parsing only.
     * @protected
     */
    execForPreparedCodexInspection(command, {cwd, codexHome}) {
        const env = {CODEX_HOME: codexHome};

        for (const key of AMBIENT_ENV_ALLOWLIST) {
            if (process.env[key] !== undefined) env[key] = process.env[key];
        }

        return new Promise((resolve, reject) => {
            let   settled = false;
            const done    = (error, stdout='', stderr='') => {
                if (settled) return;
                settled = true;
                error ? reject(error) : resolve(`${stdout}${stderr}`)
            };

            try {
                const pending = this.getExecFileFn()(command, ['mcp', 'list', '--json'], {
                    cwd,
                    env,
                    timeout  : 5000,
                    maxBuffer: 1024 * 1024
                }, done);

                if (pending?.then) {
                    pending.then(result => {
                        if (typeof result === 'string' || Buffer.isBuffer(result)) {
                            done(null, result)
                        } else {
                            done(null, result?.stdout, result?.stderr)
                        }
                    }, done)
                }
            } catch (error) {
                done(error)
            }
        })
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

    /**
     * @returns {Function} the version-probe implementation (injected stub or `child_process.execFile`).
     * @private
     */
    getExecFileFn() {
        return this.execFileFn || execFile;
    }

    /**
     * @summary Synchronous, SPAWN-EQUIVALENT executable resolution for the preflight: it mirrors
     * the exact process-resolution boundary the spawn will hit. Path-shaped commands (absolute OR
     * relative like `./bin/h`) resolve against the CHILD's cwd — the spawn chdirs before exec, so
     * a relative command is the child's business, never the Fleet Manager process cwd. Bare
     * commands scan the CHILD's PATH (the allowlisted one), with relative PATH entries also
     * cwd-resolved. A candidate must be an EXECUTABLE FILE — mere existence is not executable
     * discovery: a mode-0644 file would pass an existence check, then die asynchronously on
     * permission denial AFTER a running status was published. Returns `null` when nothing
     * resolves, which the preflight converts into a synchronous, named failure.
     * @param {String} command    The launch command (absolute/relative path or bare binary name).
     * @param {String} [pathValue] The child env's PATH value.
     * @param {String} [cwd]       The child's working directory; defaults to this process's cwd.
     * @returns {String|null} The resolved executable path, or `null` when the command cannot resolve.
     * @private
     */
    resolveExecutable(command, pathValue, cwd) {
        const base = cwd ?? process.cwd();

        const isExecutableFile = candidate => {
            try {
                fs.accessSync(candidate, fs.constants.X_OK);
                return fs.statSync(candidate).isFile();
            } catch (ignored) {
                return false;
            }
        };

        if (command.includes('/')) {
            const candidate = path.resolve(base, command);
            return isExecutableFile(candidate) ? candidate : null;
        }

        for (const dir of String(pathValue || '').split(path.delimiter)) {
            if (dir) {
                const candidate = path.resolve(base, dir, command);
                if (isExecutableFile(candidate)) return candidate;
            }
        }

        return null;
    }
}

export default Neo.setupClass(FleetLifecycleService);
