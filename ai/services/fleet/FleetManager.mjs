import path                             from 'path';
import {fileURLToPath}                  from 'url';
import Base                             from '../../../src/core/Base.mjs';
import FleetLifecycleService            from './FleetLifecycleService.mjs';
import {inspectFleetRepos}              from './inspectFleetRepos.mjs';
import {readFleetPresenceSnapshot}      from './fleetPresenceStateAdapter.mjs';
import {readFleetThrottleStateSnapshot} from './fleetThrottleStateAdapter.mjs';
import {readFleetWakeStateSnapshot}     from './fleetWakeStateAdapter.mjs';
import {startAgentProvisioned}          from './startAgentProvisioned.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename);

/**
 * @class Neo.ai.services.fleet.FleetManager
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The Brain-side (Node-only) Fleet Manager control-plane facade — the surface-independent service
 * layer that resolves the managed checkout root ONCE and exposes the operator operations turnkey, so
 * any surface (an MCP control-plane, the settings pane) sits *thinly* on top rather than re-resolving
 * `managedRoot` or re-wiring the registry / lifecycle singletons at each call site.
 *
 * It **composes** the merged Fleet Manager primitives without modifying them:
 * - `startAgent(id)` → {@link Neo.ai.services.fleet.startAgentProvisioned} (provision-then-start);
 * - `fleetRepoStatus()` → {@link Neo.ai.services.fleet.inspectFleetRepos} (fleet repo observability),
 *
 * each fed the resolved `managedRoot` + the lifecycle service — the registry is derived from the
 * lifecycle service (`getRegistry`), so there is one source of truth. `getManagedRoot` follows the
 * registry's `getDataDir` precedent: the `managedRoot` field, then the `NEO_FLEET_MANAGED_ROOT` env,
 * then a `__dirname`-relative default — no hidden fallback.
 *
 * The injectable seams (`lifecycleService`, `provisionAndStartFn`, `repoStatusFn` — default-real,
 * mirroring `FleetLifecycleService`'s `spawnFn` / `registry`) let the resolution + wiring be unit-proven
 * without standing up real fs / git / process spawn. The operator-facing **surface** (MCP control-plane
 * vs settings-pane wiring) is a separate leaf that consumes this facade — it is not part of it.
 */
class FleetManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.fleet.FleetManager'
         * @protected
         */
        className: 'Neo.ai.services.fleet.FleetManager',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The absolute fleet-managed checkout root. `null` ⇒ resolved (env, then a `__dirname`-relative
     * default) via {@link getManagedRoot}. Set a per-tenant / temp path to override. A **plain field**,
     * not reactive config — nothing observes/binds it, mirroring the sibling `FleetLifecycleService`'s
     * `credentialEnvVar` / `bridgeTokenEnvVar` tunables.
     * @member {String|null} managedRoot=null
     */
    managedRoot = null
    /**
     * Lifecycle collaborator. Defaults (via {@link getLifecycleService}) to the `FleetLifecycleService`
     * singleton; inject a stub for tests. A plain field — the sibling-precedent shape for an injectable
     * seam (`FleetLifecycleService.registry`), not reactive config.
     * @member {Object|null} lifecycleService=null
     */
    lifecycleService = null
    /**
     * Provision-then-start composer seam. Defaults (via {@link getProvisionAndStartFn}) to
     * `startAgentProvisioned`; inject a recording stub for tests. Plain field, mirroring
     * `FleetLifecycleService.spawnFn`.
     * @member {Function|null} provisionAndStartFn=null
     */
    provisionAndStartFn = null
    /**
     * Wake-state observation options for {@link fleetWakeStatus} — `{pidFilePath,
     * resolveSubscriptionState}` per the `fleetWakeStateAdapter` contract. `null` ⇒ every source is
     * honestly `unknown`: this service is not a config entrypoint — config resolution belongs to the
     * composing process entrypoint, which resolves the daemon PID path + the identity-bound
     * subscription read path and injects them here. Plain field, mirroring the sibling seams.
     * @member {Object|null} wakeStateOptions=null
     */
    wakeStateOptions = null
    /**
     * Fleet repo-status aggregator seam. Defaults (via {@link getRepoStatusFn}) to `inspectFleetRepos`;
     * inject a recording stub for tests. Plain field.
     * @member {Function|null} repoStatusFn=null
     */
    repoStatusFn = null
    /**
     * Throttle-state observation options for {@link fleetThrottleStatus} — `{resolveThrottleState}`
     * per the `fleetThrottleStateAdapter` contract. `null` ⇒ every row is honestly `unknown`: no
     * trustworthy throttle truth source exists in the platform yet (the adapter documents the
     * evaluated-and-rejected candidates); the future watchdog-signals producer injects its reader
     * here. Plain field, mirroring the sibling seams.
     * @member {Object|null} throttleStateOptions=null
     */
    throttleStateOptions = null
    /**
     * Presence observation options for {@link fleetPresenceStatus} — `{readPresence,
     * presenceIdentityFor}` per the `fleetPresenceStateAdapter` contract. `null` ⇒ every row is
     * honestly `unknown` under a degraded capability: the composing entrypoint injects the
     * identity-proven plane `who_is_online` reader in plane mode and leaves host mode unbound
     * until a host presence surface lands. Plain field, mirroring the sibling seams.
     * @member {Object|null} presenceStateOptions=null
     */
    presenceStateOptions = null

    /**
     * @summary Resolve (field > env > default) the absolute fleet-managed checkout root.
     * Mirrors `FleetRegistryService.getDataDir`: the `managedRoot` field, then the
     * `NEO_FLEET_MANAGED_ROOT` env, then a `__dirname`-relative `<repoRoot>/.neo-ai-data/fleet/repos`
     * default. No hidden fallback — an unset field + unset env yields exactly the default.
     * @returns {String}
     */
    getManagedRoot() {
        return this.managedRoot || process.env.NEO_FLEET_MANAGED_ROOT || path.resolve(__dirname, '../../../.neo-ai-data/fleet/repos');
    }

    /**
     * @returns {Object} the lifecycle collaborator (injected stub or the default singleton).
     * @protected
     */
    getLifecycleService() {
        return this.lifecycleService || FleetLifecycleService;
    }

    /**
     * @returns {Function} the provision-then-start composer (injected stub or `startAgentProvisioned`).
     * @protected
     */
    getProvisionAndStartFn() {
        return this.provisionAndStartFn || startAgentProvisioned;
    }

    /**
     * @returns {Function} the repo-status aggregator (injected stub or `inspectFleetRepos`).
     * @protected
     */
    getRepoStatusFn() {
        return this.repoStatusFn || inspectFleetRepos;
    }

    /**
     * @summary Turnkey provision-then-start: ensure the agent's repo (at the resolved managed root)
     * exists, then start its harness inside it. Delegates to `startAgentProvisioned` — fail-closed on a
     * provisioning failure (the harness is not spawned).
     * @param {String} agentId Registry agent id.
     * @returns {Promise<Object>} the agent's lifecycle status.
     */
    async startAgent(agentId) {
        return this.getProvisionAndStartFn()({
            lifecycleService: this.getLifecycleService(),
            managedRoot     : this.getManagedRoot(),
            agentId
        });
    }

    /**
     * @summary Turnkey fleet repo observability: the per-agent repo-provisioning state across the whole
     * fleet, at the resolved managed root. Delegates to `inspectFleetRepos` (read-only); the registry is
     * the lifecycle service's, so process + repo views key off one agent set.
     * @returns {Object[]} one status entry per registered agent (see `inspectFleetRepos`).
     */
    fleetRepoStatus() {
        return this.getRepoStatusFn()({
            registry   : this.getLifecycleService().getRegistry(),
            managedRoot: this.getManagedRoot()
        });
    }

    /**
     * @summary Turnkey fleet runtime observability: the per-agent process-runtime state across the whole
     * fleet — the live-process view complementing {@link fleetRepoStatus}'s repo view. Composes the
     * registry roster with the lifecycle service's per-agent {@link
     * Neo.ai.services.fleet.FleetLifecycleService#status} read, so every *registered* agent gets a row and
     * the cockpit renders the whole fleet, not only running processes. Read-only; never carries a secret
     * (`status` holds none — `stderrBytes` is a count). Lifecycle records expose running / stopped
     * directly; richer idle / wedged / rate-limited states need watchdog signals this service does not yet
     * surface (a separate watchdog-signals follow-up).
     *
     * **The row-per-agent guarantee is about row EXISTENCE, never about asserting a session state for
     * every agent**, and conflating the two publishes fiction. `status()` answers `stopped` for an agent
     * it holds no record of, which is a sound lifecycle default and an INVENTED VERDICT the moment it is
     * republished as fleet truth: never-launched is not stopped. A fleet running external-harness seats
     * it never launched once rendered every one of them `benched / offline` on exactly that confusion,
     * while the same rows carried `participationStatus: 'active'`.
     *
     * So a row with no backing process record reports `state: 'unmanaged'` with `confidence: 'none'` and
     * a reason naming the absence — **absence of signal, never a verdict** — and the state is never
     * invented. A record the fleet does own keeps `running` / `stopped` verbatim: that IS the
     * operator-benched fact, and it stays observable.
     *
     * **`running: false` on an unmanaged row is a KNOWN residual assertion, kept deliberately — not
     * inherited by oversight.** The sentence above is honest about `state` and `confidence` and only
     * approximately honest here: if never-launched is not stopped, then no-record is equally not
     * not-running, and an external-harness seat may well be running right now. It survives because
     * `running` is a Boolean with no room for *unknown*, so correcting it means widening a PUBLISHED
     * wire-method field to a tri-state — a contract change, not a fix, and out of scope for the defect
     * this method's split addresses. The cost is bounded and was measured rather than assumed: the only
     * consumer that reads the field is `ai/scripts/fleet/onboardPeer.mjs`, and `Boolean(null) === false`
     * means it would behave identically either way. Widen it when a consumer actually needs to
     * distinguish "not running" from "we do not know" — and delete this paragraph when you do.
     * @returns {Object[]} one `{agentId, state, running, confidence, source}` entry per registered agent;
     *     unmanaged rows additionally carry `reason`.
     */
    fleetRuntimeStatus() {
        const lifecycle = this.getLifecycleService();

        return lifecycle.getRegistry().listAgents().map(agent => {
            const status   = lifecycle.status(agent.id),
                  observed = status.state !== 'stopped' || status.pid != null || status.startedAt != null || status.exitCode != null;

            const row = {
                agentId   : agent.id,
                state     : observed ? status.state : 'unmanaged',
                running   : status.running,
                confidence: observed ? 'observed' : 'none',
                source    : 'fleet:runtimeStatus'
            };

            // The cause travels with the fact: downstream normalization keeps a producer's reason
            // verbatim and is forbidden from inventing one, so the honest "why" has to originate here.
            if (!observed) row.reason = 'no fleet process record: this agent runs outside fleet supervision';

            if (status.failureReason != null) row.failureReason = status.failureReason;

            return row;
        });
    }

    /**
     * @summary Turnkey wake-state observability: the per-agent wake axis of the S2 telltale taxonomy
     * (`on | off | suppressed | unknown`) across the registered roster — the third fleet view beside
     * {@link fleetRepoStatus} (repos) and {@link fleetRuntimeStatus} (processes).
     *
     * Delegates to `fleetWakeStateAdapter.readFleetWakeStateSnapshot` with the registry roster (one
     * row per REGISTERED agent, same one-agent-set rule as the sibling views) plus the injected
     * {@link #member-wakeStateOptions}. Observation truth only: subscription intent × daemon PID-file
     * liveness × the daemon-owned terminal delivery-failure receipts; the `setWakeEnabled` control
     * verb mutates state this view independently observes.
     * Fail-honest: with no injected options every row reads `unknown` under a `degraded/none`
     * capability — "we cannot see" stays distinguishable from "the fleet is off"; the state is never
     * invented.
     * @returns {Promise<{capability: Object, states: Object[]}>} Adapter snapshot: per-agent
     * `{agentId, wake, confidence, source}` rows (+ a reason/receipt on degraded delivery) and the
     * capability envelope.
     */
    fleetWakeStatus() {
        return readFleetWakeStateSnapshot({
            agents: this.getLifecycleService().getRegistry().listAgents(),
            ...(this.wakeStateOptions || {})
        });
    }

    /**
     * @summary Turnkey stop: gracefully stop an agent's harness process (`SIGTERM`, then `SIGKILL` after
     * the timeout) via the lifecycle collaborator. A thin delegation — stopping a process needs no
     * `managedRoot` / provisioning, so it forwards straight to `FleetLifecycleService.stop`, mirroring how
     * `fleetRepoStatus` forwards to its aggregator.
     * @param {String} agentId Registry agent id.
     * @returns {Promise<Object>} `{success, id, state, cleanupUnresolved}` from the lifecycle
     * service's `stop`.
     */
    stopAgent(agentId) {
        return this.getLifecycleService().stop(agentId);
    }

    /**
     * @summary Turnkey throttle-state observability: the per-agent throttle axis of the S2 telltale
     * taxonomy (`none | overage | rate-limited | unknown`) across the registered roster — a fleet
     * view beside {@link fleetRepoStatus} (repos) and {@link fleetRuntimeStatus} (processes).
     *
     * Delegates to `fleetThrottleStateAdapter.readFleetThrottleStateSnapshot` with the registry
     * roster (one row per REGISTERED agent, the sibling views' one-agent-set rule) plus the injected
     * {@link #member-throttleStateOptions}. Fail-honest: no trustworthy throttle truth source exists
     * in the platform yet (the adapter documents the evaluated candidates), so the default is every
     * row `unknown` under a `degraded/none` capability — "we cannot see" stays distinguishable from
     * "nothing is throttled"; the state is never invented.
     * @returns {Promise<{capability: Object, states: Object[]}>} Adapter snapshot: per-agent
     * `{agentId, throttle, confidence, source}` rows (+ `reason` on `unknown`) and the capability envelope.
     */
    fleetThrottleStatus() {
        return readFleetThrottleStateSnapshot({
            agents: this.getLifecycleService().getRegistry().listAgents(),
            ...(this.throttleStateOptions || {})
        });
    }

    /**
     * @summary Turnkey presence observability: the per-agent presence axis of the truth-preserving
     * presence contract across the registered roster — the THIRD independent signal
     * beside {@link fleetWakeStatus} (wake routes) and {@link fleetThrottleStatus} (throttle),
     * none inferring another.
     *
     * Delegates to `fleetPresenceStateAdapter.readFleetPresenceSnapshot` with the registry roster
     * (one row per REGISTERED agent, the sibling views' one-agent-set rule) plus the injected
     * {@link #member-presenceStateOptions}. Fail-honest: with no injected reader every row reads
     * `unknown` under a `degraded/none` capability — "we cannot see presence" stays distinguishable
     * from "the fleet is dark"; a band is never invented.
     * @returns {Promise<{capability: Object, states: Object[]}>} Adapter snapshot: per-agent
     * `{agentId, presence, lastSeenAt, confidence, source}` rows (+ `reason` on `unknown`) and the
     * capability envelope.
     */
    fleetPresenceStatus() {
        return readFleetPresenceSnapshot({
            agents: this.getLifecycleService().getRegistry().listAgents(),
            ...(this.presenceStateOptions || {})
        });
    }

    /**
     * @summary Turnkey restart: stop the agent, then start it again through the provisioned path
     * ({@link startAgent}) — so the restarted harness re-ensures its repo and runs inside ITS checkout,
     * not the Fleet Manager's own directory. Deliberately NOT a delegation to the lifecycle service's own
     * `restart`, which re-starts with no `cwd`: that would re-spawn a provisioned agent in the wrong
     * directory, and the checkout-path-keyed auto-memory would silently fork (the exact failure the
     * provisioned start path prevents). Restarting a non-running agent is just a provisioned start.
     * @param {String} agentId Registry agent id.
     * @returns {Promise<Object>} the agent's lifecycle status (see {@link startAgent}).
     */
    async restartAgent(agentId) {
        const stopped = await this.stopAgent(agentId);

        if (stopped.cleanupUnresolved) {
            throw new Error(`FleetManager.restartAgent: cleanup failed for agent '${agentId}'; refusing to spawn a replacement over ambiguous residual processes.`);
        }

        return this.startAgent(agentId);
    }

    /**
     * @summary Turnkey remove: take an agent out of the fleet — stop its process first (so removal never
     * leaves an orphaned, unmanageable live harness), then deregister its definition + stored PAT via the
     * registry. **Deliberately non-destructive to disk:** the agent's on-disk checkout and its
     * checkout-path-keyed auto-memory are left intact, because deleting the checkout would orphan that
     * auto-memory — the reconciliation (delete / archive / tombstone) is a Memory-Core policy that must
     * land WITH the deletion, not after it. So the destructive checkout cleanup stays coupled with that
     * reconciliation rather than orphaning here. Stopping a non-running agent is a safe no-op.
     * @param {String} agentId Registry agent id.
     * @returns {Promise<Object>} `{success, id}` from the registry's `removeAgent` (`success` ⇒ the agent
     * existed and was deregistered).
     */
    async removeAgent(agentId) {
        const stopped = await this.stopAgent(agentId);

        if (stopped.cleanupUnresolved) {
            throw new Error(`FleetManager.removeAgent: cleanup failed for agent '${agentId}'; refusing to deregister an agent with ambiguous residual processes.`);
        }

        return this.getLifecycleService().getRegistry().removeAgent(agentId);
    }

    /**
     * @summary Set the agent's working-repo coordinates on its registry definition — `metadata.repo =
     * {cloneUrl, repoSlug}`, the EXACT convention {@link Neo.ai.services.fleet.startAgentProvisioned}
     * already honors (it clones/reuses that repo and pins the harness `cwd` to the checkout). So this is
     * functional end-to-end: the next provisioned start launches the agent in the newly-set repo. Takes
     * a SINGLE payload object (`{id, …}`) — mirroring `defineAgent` and the app↔fleet wire's single-
     * `params` contract ({@link Neo.ai.services.fleet.dispatchFleetRequest}), so it is pane-reachable
     * over the wire. A thin fleet-authority delegation to the registry's partial update (the FM owns the
     * definition registry) — NOT a cross-agent control-plane op. **Non-destructive to disk**, mirroring
     * {@link removeAgent}: it does not move or delete the agent's EXISTING checkout or its
     * checkout-path-keyed auto-memory; the next provisioned start ensures the new checkout (clone-or-
     * reuse, never clobber), and reconciling a now-stale old checkout is a Memory-Core policy, not
     * orphaned here. Replaces `metadata.repo` wholesale (a repo is set as a unit); other metadata keys
     * survive the merge.
     * @param {Object}  payload
     * @param {String}  payload.id        Registry agent id.
     * @param {String} [payload.cloneUrl] The clone URL the provisioner clones from.
     * @param {String} [payload.repoSlug] The repo slug (checkout-dir naming under the managed root).
     * @returns {Object|null} The updated public definition, or `null` if the agent doesn't exist.
     */
    setRepo({id, cloneUrl, repoSlug} = {}) {
        const repo = {};
        if (cloneUrl != null) repo.cloneUrl = cloneUrl;
        if (repoSlug != null) repo.repoSlug = repoSlug;

        return this.getLifecycleService().getRegistry().updateAgent(id, {metadata: {repo}});
    }

    /**
     * @summary Set the agent's profile-avatar reference on its registry definition
     * (`metadata.avatarUrl`) — a fleet-authority presentation-field control, like `setRepo`. Single
     * `{id, …}` payload (wire-compatible via {@link Neo.ai.services.fleet.dispatchFleetRequest}); a thin
     * delegation to the registry's partial update, so other metadata keys survive the merge. A display
     * reference only — not cross-agent-privileged, so fleet authority, not control-plane.
     * @param {Object}  payload
     * @param {String}  payload.id         Registry agent id.
     * @param {String} [payload.avatarUrl] The avatar image URL / reference to record.
     * @returns {Object|null} The updated public definition, or `null` if the agent doesn't exist.
     */
    setAvatar({id, avatarUrl} = {}) {
        const metadata = {};
        if (avatarUrl != null) metadata.avatarUrl = avatarUrl;

        return this.getLifecycleService().getRegistry().updateAgent(id, {metadata});
    }
}

export default Neo.setupClass(FleetManager);
