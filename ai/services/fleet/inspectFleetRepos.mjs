import {deriveAgentRepoPath} from './deriveAgentRepoPath.mjs';
import {inspectAgentRepo}    from './inspectAgentRepo.mjs';

/**
 * @summary Observe the repo-provisioning state of the whole Fleet Manager fleet — the read-side mirror
 * of spawn-time provisioning, and the repo dimension of the MVP's "observe" pillar.
 *
 * `FleetLifecycleService` reports *process* state (`status` / `listRunning`); this reports *repo* state.
 * For every agent the registry knows, it derives the agent's stable checkout path and classifies what
 * is on disk (via {@link Neo.ai.services.fleet.inspectAgentRepo}) — absent / empty / a valid checkout /
 * an occupied conflict — so a settings pane or the operator can render fleet repo health in one read.
 * An agent that carries no working-repo coordinates yet is reported as `configured: false` (state
 * `'unconfigured'`, a sentinel distinct from `inspectAgentRepo`'s on-disk states), never silently
 * omitted: observability must surface the WHOLE fleet, since a dropped agent reads as "no such agent"
 * — a different, misleading fact.
 *
 * Read-only — it never provisions or mutates (provisioning is
 * {@link Neo.ai.services.fleet.startAgentProvisioned}). `inspect` is an injectable seam (default
 * {@link Neo.ai.services.fleet.inspectAgentRepo}) so the aggregation is unit-testable without the
 * filesystem, mirroring the fleet services' default-real + seam idiom. `managedRoot` is a parameter
 * (consistent with `ensureAgentRepo` / `startAgentProvisioned`), supplied by the caller from FM config.
 *
 * @param {Object}    options
 * @param {Object}    options.registry    The `FleetRegistryService` (or a stub) — supplies
 *                                         `listAgents()` (secret-stripped defs incl. `metadata.repo`).
 * @param {String}    options.managedRoot The absolute, trusted fleet-managed checkout root (the same
 *                                         root the provisioning chain derives paths under).
 * @param {Function} [options.inspect]    `({repoPath}) => {repoPath, exists, isCheckout, state,
 *                                         provisioningAction}` classifier; defaults to
 *                                         {@link Neo.ai.services.fleet.inspectAgentRepo}.
 * @returns {Object[]} one uniform entry per registered agent: `{agentId, configured, repoSlug,
 *   repoPath, exists, isCheckout, state, provisioningAction}`. A repo-configured agent carries the
 *   derived path + the `inspect` classification; an unconfigured agent carries
 *   `{configured: false, repoSlug: null, repoPath: null, exists: false, isCheckout: false,
 *   state: 'unconfigured', provisioningAction: null}`.
 * @throws {Error} when `registry` or `managedRoot` is missing.
 */
export function inspectFleetRepos({registry, managedRoot, inspect = inspectAgentRepo} = {}) {
    if (!registry)    throw new Error("inspectFleetRepos: 'registry' is required.");
    if (!managedRoot) throw new Error("inspectFleetRepos: 'managedRoot' is required.");

    return registry.listAgents().map(agent => {
        const repoSlug = agent.metadata?.repo?.repoSlug;

        // No working-repo coordinates ⇒ surface the agent as unconfigured rather than omit it, so the
        // fleet view stays complete. 'unconfigured' is deliberately distinct from inspectAgentRepo's
        // 'absent' (configured-but-not-yet-cloned) — "no repo wired" is a different fact from "wired,
        // not yet on disk".
        if (!repoSlug) {
            return {
                agentId           : agent.id,
                configured        : false,
                repoSlug          : null,
                repoPath          : null,
                exists            : false,
                isCheckout        : false,
                state             : 'unconfigured',
                provisioningAction: null
            };
        }

        const repoPath = deriveAgentRepoPath({managedRoot, agentId: agent.id, repoSlug});

        // inspect() returns {repoPath, exists, isCheckout, state, provisioningAction}; spreading it
        // yields the uniform per-agent shape alongside the configured marker + slug.
        return {agentId: agent.id, configured: true, repoSlug, ...inspect({repoPath})};
    });
}
