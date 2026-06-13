import {spawn}           from 'child_process';
import Base              from '../../../src/core/Base.mjs';
import FleetRegistryService from './FleetRegistryService.mjs';

// The forced-projection env var is a CROSS-PROCESS CONTRACT: the FM sets it on the spawned child env,
// and the Neural Link server's `resolveToolProjectionMode` reads this exact name as the fallback to
// `--tool-projection-mode`. Intentionally NOT a configurable field — an override would set a var the
// NL server never reads, silently dropping the forced read-only projection (fail-OPEN).
const TOOL_PROJECTION_MODE_ENV_VAR = 'NEO_NL_TOOL_PROJECTION_MODE';

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
 * `resolveCredential`) the PAT, then spawns the harness command. The launch command itself comes
 * from the agent's `metadata.launch = {command, args}` — `harnessType` is classification, not a
 * launcher, so this service never guesses a brittle per-type command.
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
 * agent↔Neural-Link-Bridge handshake, and (2) the forced read-only Neural Link tool-projection
 * (`toolProjectionMode`, default `harness-embedded`) under the FIXED `NEO_NL_TOOL_PROJECTION_MODE` var
 * (a cross-process contract, intentionally NOT configurable — an override would set a var the NL server
 * never reads → fail-OPEN) — the NL server reads it as a fallback to its `--tool-projection-mode` flag.
 * Fail-closed by construction: an FM-spawned agent never receives the full developer tool surface.
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
     * @param {String} id Registry agent id.
     * @returns {Object} status (see {@link status}).
     */
    start(id) {
        if (this.isRunning(id)) return this.status(id);

        const agent = this.getRegistry().getAgent(id);
        if (!agent) throw new Error(`FleetLifecycleService.start: unknown agent '${id}'.`);

        const {command, args} = this.resolveLaunch(agent);

        // Env-key contract guard (fail-fast): each credential class occupies a DISTINCT child-env slot.
        // The PAT + Bridge-token keys are configurable, so a misconfiguration that collides two (e.g.
        // bridgeTokenEnvVar === credentialEnvVar) would write one credential then overwrite it with the
        // other — collapsing the distinct-credential-class boundary (the Bridge token lands in the PAT
        // slot), or stomping the forced-projection var. Reject BEFORE injecting any secret; never spawn
        // under a broken env contract.
        const envKeys = [this.credentialEnvVar, this.bridgeTokenEnvVar, TOOL_PROJECTION_MODE_ENV_VAR];
        if (envKeys.some(key => !key) || new Set(envKeys).size !== envKeys.length) {
            throw new Error(`FleetLifecycleService.start: env-key contract violated — credentialEnvVar, bridgeTokenEnvVar, and the forced-projection var must be non-empty and pairwise distinct (got ${JSON.stringify(envKeys)}).`);
        }

        // Secret handling: copy the parent env (never mutate process.env), inject the PAT — if any —
        // under credentialEnvVar. Absent credential → start without it (a tokenless agent is valid).
        const env = {...process.env},
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

        let child;
        try {
            child = this.getSpawnFn()(command, args, {stdio: ['ignore', 'ignore', 'pipe'], env});
        } catch (error) {
            this.processes.set(id, {id, state: 'failed', pid: null, startedAt: null, exitCode: null, exitedAt: new Date().toISOString(), error: error.message});
            throw error;
        }

        const record = {id, child, pid: child.pid ?? null, state: 'running', startedAt: new Date().toISOString(), exitCode: null, signal: null, exitedAt: null, stderrBytes: 0};
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
     * Stop (settling the pending stop) then start. `restart` of a non-running agent is just `start`.
     * @param {String} id
     * @returns {Promise<Object>} status
     */
    async restart(id) {
        await this.stop(id);
        return this.start(id);
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
     * Resolve the launch command for an agent from its `metadata.launch`. `harnessType` classifies
     * an agent; it does not encode a launch command, so a launch spec is required here.
     * @param {Object} agent
     * @returns {{command: String, args: String[]}}
     * @private
     */
    resolveLaunch(agent) {
        const launch = agent.metadata?.launch;
        if (!launch?.command) {
            throw new Error(`FleetLifecycleService: agent '${agent.id}' (harnessType '${agent.harnessType}') has no launch spec. Set metadata.launch = {command, args}.`);
        }
        return {command: launch.command, args: Array.isArray(launch.args) ? launch.args : []};
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
