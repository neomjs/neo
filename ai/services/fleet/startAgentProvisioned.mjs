import {ensureAgentRepo} from './ensureAgentRepo.mjs';

/**
 * @summary Start a Fleet Manager agent's harness *in its own provisioned repo* — the turnkey
 * "define → start" entry that makes the repo-provisioning chain live.
 *
 * `FleetLifecycleService.start` supervises a process but knows nothing about repos: it spawns the
 * harness in the Fleet Manager's own working directory. This composer closes that gap. Given an agent
 * whose definition carries its working-repo coordinates (`metadata.repo = {cloneUrl, repoSlug}`), it
 * first ensures the canonical checkout exists — clone-or-reuse, never clobber, via
 * {@link Neo.ai.services.fleet.ensureAgentRepo} — then starts the harness with its `cwd` pinned to that
 * checkout, so the harness operates on ITS repo. Fleet Manager auto-memory is checkout-path-keyed, so
 * the path is load-bearing: launching in the wrong directory is a silent correctness failure.
 *
 * **Fail-closed:** a provisioning error propagates and the harness is NEVER spawned — the Fleet Manager
 * must not launch an agent into an unprovisioned or conflicting directory.
 *
 * **Backward-compatible:** an agent without `metadata.repo` has no repo to provision, so it starts
 * exactly as before (inherited cwd). The opinionated provisioning + the `metadata.repo` convention live
 * here, NOT in the registry-owned supervisor — `start` only gained a generic optional `cwd`.
 *
 * Pure composition over injectable seams: `ensureRepo` (default {@link Neo.ai.services.fleet.ensureAgentRepo})
 * + `cloneRepo` (forwarded to it) make this unit-testable without a git binary or the filesystem,
 * mirroring the `spawnFn` / `cloneRepo` test idioms already used across the fleet services.
 *
 * @param {Object}    options
 * @param {Object}    options.lifecycleService The `FleetLifecycleService` (or a stub) that supervises
 *                                             the process — supplies `getRegistry()`, `isRunning(id)`,
 *                                             `status(id)`, and `start(id, {cwd})`.
 * @param {String}    options.agentId          The Fleet Manager agent id to start.
 * @param {String}   [options.managedRoot]     The absolute, trusted fleet-managed checkout root —
 *                                             required only when the agent carries `metadata.repo`.
 * @param {Function} [options.cloneRepo]       `(cloneUrl, repoPath) => Promise<void>` clone seam,
 *                                             forwarded to `ensureRepo`; defaults to a real `git clone`.
 * @param {Function} [options.ensureRepo]      The repo-provisioning composer; defaults to
 *                                             {@link Neo.ai.services.fleet.ensureAgentRepo}, injectable
 *                                             for tests.
 * @returns {Promise<Object>} the agent's lifecycle status (see `FleetLifecycleService.status`).
 * @throws {Error} when `lifecycleService` / `agentId` is missing, the agent is unknown, `managedRoot`
 *   is absent for a repo-bearing agent, or provisioning fails (re-thrown — the harness is not spawned).
 */
export async function startAgentProvisioned({lifecycleService, agentId, managedRoot, cloneRepo, ensureRepo = ensureAgentRepo} = {}) {
    if (!lifecycleService) throw new Error("startAgentProvisioned: 'lifecycleService' is required.");
    if (!agentId)          throw new Error("startAgentProvisioned: 'agentId' is required.");

    // Already running ⇒ short-circuit to the current status; do not re-provision. `start` is itself
    // idempotent while running, but provisioning ahead of it would be a pointless git inspection on an
    // agent that is already up.
    if (lifecycleService.isRunning(agentId)) return lifecycleService.status(agentId);

    const agent = lifecycleService.getRegistry().getAgent(agentId);
    if (!agent) throw new Error(`startAgentProvisioned: unknown agent '${agentId}'.`);

    const repo = agent.metadata?.repo;

    // No repo coordinates ⇒ nothing to provision; start in the inherited cwd (backward-compatible).
    if (!repo) return lifecycleService.start(agentId);

    if (!managedRoot) {
        throw new Error(`startAgentProvisioned: 'managedRoot' is required to provision the repo for agent '${agentId}'.`);
    }

    // Ensure the checkout exists (clone-or-reuse, never clobber). A throw here propagates: the harness
    // is never spawned into an unprovisioned / conflicting directory (fail-closed). Input validation
    // (managedRoot / agentId / repoSlug / a missing cloneUrl when a clone is needed) is inherited from
    // the provisioning chain's own contracts — not re-implemented here.
    const {repoPath} = await ensureRepo({
        managedRoot,
        agentId,
        repoSlug: repo.repoSlug,
        cloneUrl: repo.cloneUrl,
        cloneRepo
    });

    return lifecycleService.start(agentId, {cwd: repoPath});
}
