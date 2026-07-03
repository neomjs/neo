import Base                 from '../../../src/core/Base.mjs';
import FleetManager         from './FleetManager.mjs';
import FleetRegistryService from './FleetRegistryService.mjs';

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
     * @summary Set an agent's target repo / data-dir override on its definition (fleet authority — the
     * FM owns the registry, as with `defineAgent`). Non-destructive to the existing on-disk checkout;
     * provisioning honoring the override is a separate follow-up leaf.
     * @param {String} id Registry agent id.
     * @param {Object} repo `{repoUrl?, dataDir?}` — the override facets to record.
     * @returns {Object|null} the updated public definition, or `null` if the agent doesn't exist.
     */
    setRepo(id, repo) {
        return this.getManager().setRepo(id, repo);
    }

    /**
     * @summary The *observe* half of the MVP loop: the per-agent repo-provisioning state across the
     * whole fleet, at the resolved managed root. Read-only.
     * @returns {Object[]} one status entry per registered agent.
     */
    fleetStatus() {
        return this.getManager().fleetRepoStatus();
    }
}

export default Neo.setupClass(FleetControlBridge);
