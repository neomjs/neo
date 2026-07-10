import {spawn}                   from 'child_process';
import path                      from 'path';
import {fileURLToPath}           from 'url';
import Base                      from '../../../src/core/Base.mjs';
import {deriveAgentInstanceHome} from './deriveAgentInstanceHome.mjs';
import {deriveHarnessLaunchSpec} from './deriveHarnessLaunchSpec.mjs';
import FleetRegistryService      from './FleetRegistryService.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename);

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

// Per-family harness binary env overrides + defaults — the env/default halves of the
// `getHarnessBinaryPath` field → env → default resolution (the `FleetManager.getManagedRoot`
// precedent, per family). The codex default is the ChatGPT-app-bundled CLI — an ALPHA channel that
// self-updates with its app (V-B-A'd locally: `codex-cli 0.144.0-alpha.4`) — a deliberate,
// version-guarded operator-convenience fallback, NOT a stability guarantee: production fleets pin
// via the env var or the `harnessBinaryPaths` field. The claude-code default is the PATH-resolved
// `claude` binary. An unknown family has no entry — `resolveLaunch` fails loud instead of guessing.
const HARNESS_BINARY_ENV_VARS = {
    'claude-code': 'NEO_FLEET_CLAUDE_CODE_BIN',
    'codex'      : 'NEO_FLEET_CODEX_BIN'
};
const HARNESS_BINARY_DEFAULTS = {
    'claude-code': 'claude',
    'codex'      : '/Applications/ChatGPT.app/Contents/Resources/codex'
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
 * - **Raw launch (SECURITY STOP-LINE — Brain/operator-only COMPATIBILITY path):** an explicit
 *   `metadata.launch = {command, args, env}` is honored as-is. It executes an ARBITRARY command in
 *   a credential-bearing child (the PAT + Bridge token ride that env), so it must NEVER become the
 *   Body-reachable normal form — a pane-supplied command string would be remote code execution with
 *   credentials attached.
 *
 * **`metadata.launch.env` contract surface:** an optional plain Object of string values, merged onto
 * the fresh `{...process.env}` child-env copy BEFORE the reserved injections below — so the reserved
 * keys always win — and a `launch.env` key naming a reserved slot (`credentialEnvVar`,
 * `bridgeTokenEnvVar`, `NEO_NL_TOOL_PROJECTION_MODE`, `NEO_AGENT_IDENTITY`) is rejected fail-fast,
 * naming the colliding key. Template-derived launches use the same merge path for their isolation
 * var (`CODEX_HOME` / `CLAUDE_CONFIG_DIR`).
 *
 * **Credential security boundary** (inherited from the registry's two-hemisphere rule): the PAT is
 * injected into the spawned **child's environment only** — copied onto a fresh `{...process.env}`
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
     * resolved (env, then a `__dirname`-relative default) via {@link getInstanceRoot} — the
     * `FleetManager.getManagedRoot` precedent. Set a per-tenant / temp path to override.
     * @member {String|null} instanceRoot=null
     */
    instanceRoot = null

    /**
     * Per-harness-family binary-path overrides, keyed by `harnessType` (e.g. `{codex: '/opt/codex'}`).
     * `null` / missing key ⇒ resolved (per-family env, then the per-family default) via
     * {@link getHarnessBinaryPath}.
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

        const {command, args, env: launchEnv} = this.resolveLaunch(agent);

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

        // Secret handling: copy the parent env (never mutate process.env), merge the agent's launch
        // env (its isolated harness home — `CODEX_HOME` / `CLAUDE_CONFIG_DIR` — plus any compat-path
        // extras) BEFORE the reserved injections so the reserved keys always win, then inject the
        // PAT — if any — under credentialEnvVar. Absent credential → start without it (a tokenless
        // agent is valid).
        const env = {...process.env, ...launchEnv},
              pat = this.getRegistry().resolveCredential(id);
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

        // The child's working directory: the agent's provisioned repo checkout when the caller supplies
        // it (the Fleet Manager turnkey path via startAgentProvisioned). Omitted ⇒ inherit this process's
        // cwd — but an FM-spawned harness is meant to operate on ITS repo, not the Fleet Manager's dir.
        const spawnOptions = {stdio: ['ignore', 'ignore', 'pipe'], env};
        if (opts.cwd != null) spawnOptions.cwd = opts.cwd;

        let child;
        try {
            child = this.getSpawnFn()(command, args, spawnOptions);
        } catch (error) {
            this.processes.set(id, {id, cwd: opts.cwd ?? null, state: 'failed', pid: null, startedAt: null, exitCode: null, exitedAt: new Date().toISOString(), error: error.message});
            throw error;
        }

        const record = {id, child, cwd: opts.cwd ?? null, pid: child.pid ?? null, state: 'running', startedAt: new Date().toISOString(), exitCode: null, signal: null, exitedAt: null, stderrBytes: 0};
        this.processes.set(id, record);

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
     * Status snapshot for one agent (never carries a secret — `stderrBytes` is a count, not content).
     * @param {String} id
     * @returns {Object} `{id, state, running, pid, startedAt, uptimeMs, exitCode, exitedAt, stderrBytes}`
     */
    status(id) {
        const record = this.processes.get(id);
        if (!record) return {id, state: 'stopped', running: false, pid: null, startedAt: null, uptimeMs: null, exitCode: null, exitedAt: null, stderrBytes: 0};

        return {
            id,
            state       : record.state,
            running     : record.state === 'running',
            pid         : record.pid,
            startedAt   : record.startedAt,
            uptimeMs    : record.state === 'running' && record.startedAt ? Date.now() - Date.parse(record.startedAt) : null,
            exitCode    : record.exitCode,
            exitedAt    : record.exitedAt,
            stderrBytes : record.stderrBytes ?? 0
        };
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
                throw new Error(`FleetLifecycleService: agent '${agent.id}' (harnessType '${agent.harnessType}') has no launch spec and no built-in launch template. Set metadata.launch = {command, args} or use a templated harnessType.`);
            }
            return deriveHarnessLaunchSpec({
                harnessType : agent.harnessType,
                instanceHome: deriveAgentInstanceHome({instanceRoot: this.getInstanceRoot(), agentId: agent.id, harnessType: agent.harnessType}),
                binaryPath
            });
        }

        if (!launch.command) {
            throw new Error(`FleetLifecycleService: agent '${agent.id}' (harnessType '${agent.harnessType}') has no launch spec. Set metadata.launch = {command, args}.`);
        }

        const env = launch.env ?? {};
        if (typeof env !== 'object' || Array.isArray(env)) {
            throw new Error(`FleetLifecycleService: agent '${agent.id}' has an invalid metadata.launch.env — expected a plain Object of string values.`);
        }
        for (const [key, value] of Object.entries(env)) {
            if (typeof value !== 'string') {
                throw new Error(`FleetLifecycleService: agent '${agent.id}' has an invalid metadata.launch.env — '${key}' must map to a String value.`);
            }
        }

        return {command: launch.command, args: Array.isArray(launch.args) ? launch.args : [], env};
    }

    /**
     * @summary Resolve (field > env > default) the absolute per-agent harness instance-home root.
     * Mirrors `FleetManager.getManagedRoot`: the `instanceRoot` field, then the
     * `NEO_FLEET_INSTANCE_ROOT` env, then a `__dirname`-relative
     * `<repoRoot>/.neo-ai-data/fleet/instances` default — the sibling of the managed checkouts root.
     * No hidden fallback — an unset field + unset env yields exactly the default.
     * @returns {String}
     */
    getInstanceRoot() {
        return this.instanceRoot || process.env.NEO_FLEET_INSTANCE_ROOT || path.resolve(__dirname, '../../../.neo-ai-data/fleet/instances');
    }

    /**
     * @summary Resolve (field > env > default) the harness binary path for one harness family —
     * the same three-layer shape as {@link getInstanceRoot}, per family: the `harnessBinaryPaths`
     * field entry, then the family env var (`NEO_FLEET_CODEX_BIN` / `NEO_FLEET_CLAUDE_CODE_BIN`),
     * then the family default. The codex default is the ChatGPT-app-bundled CLI — an alpha channel
     * that self-updates with its app, so production fleets pin via the env var or the field. An
     * untemplated family resolves `null` — {@link resolveLaunch} fails loud rather than guessing.
     * @param {String} harnessType
     * @returns {String|null}
     */
    getHarnessBinaryPath(harnessType) {
        return this.harnessBinaryPaths?.[harnessType] || process.env[HARNESS_BINARY_ENV_VARS[harnessType]] || HARNESS_BINARY_DEFAULTS[harnessType] || null;
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
