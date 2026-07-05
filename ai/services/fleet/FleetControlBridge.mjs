import Base                 from '../../../src/core/Base.mjs';
import FleetManager         from './FleetManager.mjs';
import FleetRegistryService from './FleetRegistryService.mjs';
import {
    createNotWiredCapability,
    FLEET_COCKPIT_SOURCES
} from '../../../src/ai/fleet/fleetCockpitStatus.mjs';

/**
 * @class Neo.ai.services.fleet.FleetControlBridge
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The single Body-reachable control surface of the Fleet Manager — the capability **allowlist** a
 * transport (the dev-server app↔fleet server, or the Electron shell's in-process object inject)
 * exposes to the `apps/agentos` settings pane. It composes the two Brain-side singletons into ONE
 * contract: the `define / list / get` half from {@link Neo.ai.services.fleet.FleetRegistryService}
 * and the `start / stop / restart / remove / status` lifecycle half from
 * {@link Neo.ai.services.fleet.FleetManager}. This is the middle of the operator loop
 * *define agents → start/stop → repos managed under the hood* that the Fleet Manager MVP still
 * lacked: the services self-wire and the pane exists, but nothing composed a single surface for a
 * transport to carry between them.
 *
 * **Why a dedicated surface, not "expose the singletons":** this bridge is the trust boundary
 * between the Body (browser-reachable) and the Brain (Node, secret-holding). It enumerates EXACTLY
 * the operations the pane may invoke and deliberately OMITS the Brain-internal secret paths —
 * `resolveCredential` (the only raw-PAT accessor), `mintBridgeToken`, `getSigningKey`. A transport
 * that serves ONLY this surface therefore cannot be tricked into decrypting a PAT even by a forged
 * request: the capability is simply not on the surface. The PAT rides IN through {@link #defineAgent}
 * (the registry stores it encrypted) and never comes back out — {@link FleetRegistryService}'s
 * two-hemisphere rule, preserved here by re-exposing only its `toPublic`-returning methods.
 *
 * **Transport-agnostic seam.** The same instance backs Option B (a dev-server app↔fleet transport,
 * the finish-now PoC path) and Option A (the Electron shell's in-process direct inject, the product
 * target). Neither transport reaches the singletons directly; both bind to this allowlist.
 *
 * **Consistency invariant.** In production the injectable `registry` / `manager` seams both resolve
 * to their singletons, and {@link FleetManager} keys its lifecycle off the same
 * `FleetRegistryService` singleton — so a `defineAgent` and a subsequent `startAgent` operate on ONE
 * agent set. Tests that inject stubs MUST inject a consistent pair.
 */
class FleetControlBridge extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.fleet.FleetControlBridge'
         * @protected
         */
        className: 'Neo.ai.services.fleet.FleetControlBridge',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Registry collaborator — the `define / list / get` half. Defaults (via {@link getRegistry}) to
     * the `FleetRegistryService` singleton; inject a stub in tests. A **plain field**, mirroring the
     * sibling `FleetManager.lifecycleService` injectable-seam shape, not reactive config.
     * @member {Object|null} registry=null
     */
    registry = null
    /**
     * Lifecycle collaborator — the `start / stop / restart / remove / status` half. Defaults (via
     * {@link getManager}) to the `FleetManager` singleton; inject a stub in tests. A plain field.
     * @member {Object|null} manager=null
     */
    manager = null
    /**
     * Boot-identity **read-observe** source — an injected collaborator exposing `produceBootIdentityFact()`
     * (the orchestrator's `BootIdentityHealthService`). READ-OBSERVE ONLY: the fact it returns is advisory,
     * never a lifecycle-write / restart command — the R3 read-observe ÷ lifecycle-write seam. A plain injectable
     * field like `registry` / `manager` (no static default — the orchestrator wires the live instance); unwired
     * → an advisory-empty fact, never fabricated liveness.
     * @member {Object|null} bootIdentitySource=null
     */
    bootIdentitySource = null
    /**
     * Activity-feed **read-observe** source — an injected collaborator exposing
     * `readActivitySnapshot(params)` that returns the bounded `{capability, events}` cockpit activity
     * snapshot (the composed A2A + PR/lane adapters). The mailbox / PR read paths — and with them the
     * identity binding + read permissions — stay owned by the wiring, per the adapters' DI contract
     * (they consume an injected `listMessages`, never import the singleton). A plain injectable field
     * like `bootIdentitySource` (no static default — the orchestrator wires the live source); unwired
     * → an honest source-not-wired snapshot, never fabricated activity.
     * @member {Object|null} activitySource=null
     */
    activitySource = null

    /**
     * @returns {Object} the registry collaborator (injected stub or the default singleton).
     * @protected
     */
    getRegistry() {
        return this.registry || FleetRegistryService;
    }

    /**
     * @returns {Object} the lifecycle collaborator (injected stub or the default singleton).
     * @protected
     */
    getManager() {
        return this.manager || FleetManager;
    }

    // ---- capability allowlist (the ONLY pane-reachable operations) ----------

    /**
     * @summary Define (create or update) an agent. A supplied `credential` (PAT) is stored encrypted
     * Node-side by the registry and is **never** echoed back — the return is the public definition.
     * @param {Object}  definition
     * @param {String}  definition.githubUsername    The agent's GitHub username (required).
     * @param {String}  definition.harnessType       A supported harness type (required).
     * @param {String} [definition.credential]       The GitHub PAT — stored encrypted, never returned.
     * @param {String} [definition.id]               Stable id; defaults to `githubUsername`.
     * @param {Object} [definition.metadata]         Free-form non-secret metadata.
     * @param {String} [definition.modelProvider]    The agent's model-provider login; resolves via the AiConfig SSOT leaf when omitted.
     * @returns {Object} the public agent definition (no credential).
     */
    defineAgent(definition) {
        return this.getRegistry().defineAgent(definition);
    }

    /**
     * @summary List all agent definitions (no credentials) — the roster the pane renders.
     * @returns {Object[]}
     */
    listAgents() {
        return this.getRegistry().listAgents();
    }

    /**
     * @summary Get a single agent definition (no credential).
     * @param {String} id
     * @returns {Object|null}
     */
    getAgent(id) {
        return this.getRegistry().getAgent(id);
    }

    /**
     * @summary Start a defined agent — provision its repo under the resolved managed root, then spawn
     * its harness inside that checkout. The PAT is resolved + injected Node-side; it never crosses to
     * the pane. Fail-closed on a provisioning failure (the harness is not spawned).
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} the agent's lifecycle status.
     */
    startAgent(id) {
        return this.getManager().startAgent(id);
    }

    /**
     * @summary Stop a running agent's harness process (`SIGTERM`, then `SIGKILL` after the timeout).
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} `{success, id, state}`.
     */
    stopAgent(id) {
        return this.getManager().stopAgent(id);
    }

    /**
     * @summary Restart a running agent through the provisioned path (repo re-ensured, harness runs in
     * ITS checkout). Restarting a non-running agent is just a provisioned start.
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} the agent's lifecycle status.
     */
    restartAgent(id) {
        return this.getManager().restartAgent(id);
    }

    /**
     * @summary Remove an agent from the fleet — stop its process, then deregister its definition +
     * stored PAT. Deliberately non-destructive to the on-disk checkout (its checkout-path-keyed
     * auto-memory is reconciled by a separate Memory-Core policy, not orphaned here).
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} `{success, id}` (`success` ⇒ the agent existed and was deregistered).
     */
    removeAgent(id) {
        return this.getManager().removeAgent(id);
    }

    /**
     * @summary Set an agent's working-repo coordinates (`metadata.repo = {cloneUrl, repoSlug}`) on its
     * definition (fleet authority — the FM owns the registry, as with `defineAgent`). Functional
     * end-to-end: the provisioner already honors `metadata.repo`, so the next start launches the agent in
     * the set repo. A single-`params` payload, so it is pane-reachable over the wire. Non-destructive to
     * the existing on-disk checkout.
     * @param {Object} payload `{id, cloneUrl?, repoSlug?}` — the agent id + working-repo coordinates.
     * @returns {Object|null} the updated public definition, or `null` if the agent doesn't exist.
     */
    setRepo(payload) {
        return this.getManager().setRepo(payload);
    }

    /**
     * @summary Set an agent's profile-avatar reference (`metadata.avatarUrl`) on its definition (fleet
     * authority — the FM owns the registry, as with `defineAgent`). A single-`params` payload, so it is
     * pane-reachable over the wire. Non-destructive to other metadata.
     * @param {Object} payload `{id, avatarUrl?}` — the agent id + avatar reference.
     * @returns {Object|null} the updated public definition, or `null` if the agent doesn't exist.
     */
    setAvatar(payload) {
        return this.getManager().setAvatar(payload);
    }

    /**
     * @summary The *observe* half of the MVP loop: the per-agent repo-provisioning state across the
     * whole fleet, at the resolved managed root. Read-only.
     * @returns {Object[]} one status entry per registered agent.
     */
    fleetStatus() {
        return this.getManager().fleetRepoStatus();
    }

    /**
     * @summary The live-process half of the *observe* MVP loop: per-agent process-runtime state across
     * the whole fleet (running / stopped), complementing {@link #fleetStatus}'s repo view.
     * Read-only; carries no secret (the lifecycle status holds none). Richer idle / wedged / rate-limited
     * states are a watchdog-gated follow-up — this returns what the lifecycle records observe, never
     * an invented state.
     * @returns {Object[]} one `{agentId, state, running, confidence, source}` entry per registered agent.
     */
    fleetRuntimeStatus() {
        return this.getManager().fleetRuntimeStatus();
    }

    /**
     * @summary READ-OBSERVE: the advisory boot-identity fact of this Agent-OS process. Rides the authenticated
     * `registryBridge` as a **read** verb — it carries NO lifecycle-write / restart authority (the R3
     * read-observe ÷ lifecycle-write seam). An unwired {@link #bootIdentitySource} yields an advisory-`unknown`
     * fact, never a fabricated liveness.
     * @returns {Promise<Object>|Object} `{fact, classification, advisory:true, reason}` — advisory, no command.
     */
    getBootIdentity() {
        return this.bootIdentitySource
            ? this.bootIdentitySource.produceBootIdentityFact()
            : {fact: null, classification: 'unknown', advisory: true, reason: 'no-boot-identity-source'};
    }

    /**
     * @summary READ-OBSERVE: the bounded fleet activity snapshot (A2A + PR/lane) as cockpit events —
     * the real-time feed the FM cockpit's ActivityStream binds to. Rides the authenticated
     * `registryBridge` as a **read** verb; it carries NO lifecycle-write / restart authority (the R3
     * read-observe ÷ lifecycle-write seam). An unwired {@link #activitySource} yields an honest
     * source-not-wired snapshot (degraded capability + empty events), never fabricated activity —
     * mirroring {@link #getBootIdentity}'s advisory-empty degrade, so the cockpit renders a
     * "feed not wired" state rather than a silent freeze or invented traffic.
     * @param {Object} [params] Optional bounds forwarded to the source (`{limit, since, until}`).
     * @returns {Promise<Object>|Object} `{capability, events}` — the bounded cockpit activity snapshot.
     */
    fleetActivity(params) {
        return this.activitySource
            ? this.activitySource.readActivitySnapshot(params)
            : {
                capability: createNotWiredCapability(FLEET_COCKPIT_SOURCES.activity, 'fleet activity source not wired'),
                events    : []
            };
    }
}

export default Neo.setupClass(FleetControlBridge);
