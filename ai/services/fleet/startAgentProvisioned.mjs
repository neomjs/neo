import {REMOTE_MCP_CREDENTIAL_ENV_VAR} from '../../../src/ai/fleet/mcpServers.mjs';
import {ensureAgentRepo}               from './ensureAgentRepo.mjs';
import {prepareManagedAgentWorkspace}  from './prepareManagedAgentWorkspace.mjs';

/**
 * @summary Start a Fleet Manager agent's harness *in its own provisioned repo* — the turnkey
 * "define → start" entry that makes the repo-provisioning chain live.
 *
 * `FleetLifecycleService.start` supervises a process but knows nothing about repos: it spawns the
 * harness in the Fleet Manager's own working directory. This composer closes that gap. Given an agent
 * whose definition carries its working-repo coordinates (`metadata.repo = {cloneUrl, repoSlug}`), it
 * first ensures the canonical checkout exists — clone-or-reuse, never clobber, via
 * {@link Neo.ai.services.fleet.ensureAgentRepo} — then hydrates the checkout + isolated harness home
 * through {@link Neo.ai.services.fleet.prepareManagedAgentWorkspace}, and only then starts the harness
 * with its `cwd` pinned to the prepared checkout. Fleet Manager auto-memory is checkout-path-keyed, so
 * the path is load-bearing: launching in the wrong or unprepared directory is a silent correctness
 * failure.
 *
 * **Fail-closed:** a provisioning OR preparation error propagates and the harness is NEVER spawned —
 * the Fleet Manager must not launch an agent into an unprovisioned, divergent, unsupported, or
 * identity-colliding directory/home.
 *
 * **Backward-compatible:** an agent without `metadata.repo` has no repo to provision, so it starts
 * exactly as before (inherited cwd). The opinionated provisioning + the `metadata.repo` convention live
 * here, NOT in the registry-owned supervisor — `start` only gained a generic optional `cwd`.
 *
 * Pure composition over injectable seams: `ensureRepo` (default {@link Neo.ai.services.fleet.ensureAgentRepo}),
 * `prepareWorkspace` (default {@link Neo.ai.services.fleet.prepareManagedAgentWorkspace}), and
 * `cloneRepo` (forwarded to provisioning) make the order/failure contract unit-testable without a git
 * binary or filesystem, mirroring the `spawnFn` / `cloneRepo` idioms across the Fleet services.
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
 * @param {Function} [options.prepareWorkspace] The post-provisioning workspace/home composer; defaults
 *                                              to {@link Neo.ai.services.fleet.prepareManagedAgentWorkspace}.
 * @param {Object}   [options.tenantService]     Remote tenant authority. Lazily imports the real
 *                                              singleton only for an opted-in remote seat.
 * @param {String}   [options.instanceRoot]     Explicit harness-home root; omitted ⇒ the lifecycle
 *                                              service's config-resolved `getInstanceRoot()` value.
 * @param {String}   [options.mainCheckout]     Installed canonical checkout override for preparation.
 * @param {String}   [options.nodePath]         Node executable override for generated MCP definitions.
 * @returns {Promise<Object>} the agent's lifecycle status (see `FleetLifecycleService.status`).
 * @throws {Error} when `lifecycleService` / `agentId` is missing, the agent is unknown, `managedRoot`
 *   is absent for a repo-bearing agent, a repo-bearing raw launch override would bypass curated
 *   preparation, or provisioning/preparation fails (re-thrown — no spawn).
 */
export async function startAgentProvisioned({
    lifecycleService,
    agentId,
    managedRoot,
    cloneRepo,
    ensureRepo = ensureAgentRepo,
    prepareWorkspace = prepareManagedAgentWorkspace,
    tenantService = null,
    instanceRoot,
    mainCheckout,
    nodePath
} = {}) {
    if (!lifecycleService) throw new Error("startAgentProvisioned: 'lifecycleService' is required.");
    if (!agentId)          throw new Error("startAgentProvisioned: 'agentId' is required.");

    // Already running ⇒ short-circuit to the current status; do not re-provision. `start` is itself
    // idempotent while running, but provisioning ahead of it would be a pointless git inspection on an
    // agent that is already up.
    if (lifecycleService.isRunning(agentId)) return lifecycleService.status(agentId);

    const registry = lifecycleService.getRegistry(),
          agent    = registry.getDefinition?.(agentId) ?? registry.getAgent(agentId);
    if (!agent) throw new Error(`startAgentProvisioned: unknown agent '${agentId}'.`);

    const
        repo      = agent.metadata?.repo,
        transport = agent.mcpTransport;

    // No repo coordinates ⇒ nothing to provision; start in the inherited cwd (backward-compatible).
    if (!repo) {
        if (transport?.mode === 'remote-http') {
            throw new Error(`startAgentProvisioned: remote MCP agent '${agentId}' requires a managed repo.`)
        }

        return lifecycleService.start(agentId);
    }

    // The managed-workspace contract is coupled to Fleet's curated harness launch. A repo-bearing
    // raw override can execute an unrelated command and consumes no derived home/MCP artifacts, so
    // reporting it as prepared would be a false resident-ready claim. Reject before repo side effects.
    if (agent.metadata?.launch) {
        throw new Error(`startAgentProvisioned: repo-bearing agent '${agentId}' uses a raw metadata.launch override; curated managed-workspace preparation is required.`);
    }

    if (!managedRoot) {
        throw new Error(`startAgentProvisioned: 'managedRoot' is required to provision the repo for agent '${agentId}'.`);
    }

    let
        remotePlan                   = null,
        resolvedCredential,
        resolvedMcpCredential,
        remoteCapability;

    if (transport?.mode === 'remote-http') {
        const activeTenantService = tenantService ?? (await import('./FleetTenantService.mjs')).default;

        resolvedCredential = registry.resolveCredential(agentId);

        remotePlan = activeTenantService.resolveMcpResources(transport.tenantId);

        if (!remotePlan) {
            throw new Error(`startAgentProvisioned: remote MCP tenant '${transport.tenantId}' is unavailable for agent '${agentId}'.`)
        }

        resolvedMcpCredential = activeTenantService.resolveMcpCredential(transport.tenantId);

        if (!resolvedMcpCredential) {
            throw new Error(`startAgentProvisioned: remote MCP tenant '${transport.tenantId}' has no plane credential for agent '${agentId}'.`)
        }

        remoteCapability = await lifecycleService.assertRemoteMcpCapability(agent);

        const expectedIdentity = agent.id.startsWith('@') ? agent.id : `@${agent.id}`;
        const readiness        = await activeTenantService.probeSeatCredential({
            tenantId  : transport.tenantId,
            credential: resolvedMcpCredential,
            expectedIdentity
        });

        if (!readiness?.ok ||
            !readiness.resources?.['memory-core']?.ok ||
            readiness.resources['memory-core'].identity !== expectedIdentity ||
            !readiness.resources?.['knowledge-base']?.ok) {
            throw new Error(`startAgentProvisioned: remote MCP credential readiness failed for agent '${agentId}'.`)
        }
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

    // Preparation is a mandatory gate for repo-bearing agents. The lifecycle owns the resolved
    // instance-root SSOT; the explicit option is only a test/per-tenant seam. A preparation throw
    // propagates, so `start` is never called over divergent or unsupported resident state.
    const prepared = await prepareWorkspace({
        agent,
        repoPath,
        instanceRoot: instanceRoot ?? lifecycleService.getInstanceRoot?.(),
        mainCheckout,
        nodePath,
        mcpTransport: remotePlan && {
            mode            : 'remote-http',
            credentialEnvVar: REMOTE_MCP_CREDENTIAL_ENV_VAR,
            resources       : remotePlan.resources
        }
    });

    if (!prepared || prepared.repoPath !== repoPath) {
        throw new Error(`startAgentProvisioned: preparation did not return the canonical provisioned repoPath for agent '${agentId}'.`);
    }

    if (transport?.mode === 'remote-http') {
        await lifecycleService.inspectPreparedRemoteMcpAdapter({
            agent,
            binaryPath  : remoteCapability.binaryPath,
            repoPath    : prepared.repoPath,
            instanceHome: prepared.instanceHome,
            mcpMatrix   : prepared.mcpMatrix,
            mcpTransport: {
                mode     : 'remote-http',
                resources: remotePlan.resources
            }
        })
    }

    return lifecycleService.start(agentId, {
        cwd: prepared.repoPath,
        ...(transport?.mode === 'remote-http'
            ? {resolvedCredential, resolvedMcpCredential, remoteMcpCapability: remoteCapability}
            : {})
    });
}
