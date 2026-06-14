import path                    from 'path';
import {fileURLToPath}         from 'url';
import Base                    from '../../../src/core/Base.mjs';
import FleetLifecycleService   from './FleetLifecycleService.mjs';
import {inspectFleetRepos}     from './inspectFleetRepos.mjs';
import {startAgentProvisioned} from './startAgentProvisioned.mjs';

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
     * Fleet repo-status aggregator seam. Defaults (via {@link getRepoStatusFn}) to `inspectFleetRepos`;
     * inject a recording stub for tests. Plain field.
     * @member {Function|null} repoStatusFn=null
     */
    repoStatusFn = null

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
}

export default Neo.setupClass(FleetManager);
