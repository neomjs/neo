/**
 * @module ai/deploy/hostEdgeProfile
 * @summary THE host-edge posture contract — the one place the graphless machine-local
 * Orchestrator's deployment inputs are declared, consumed identically by the portable
 * `ai:host-edge` entrypoint and the macOS LaunchAgent that supervises it.
 *
 * **Why this module exists.** The thing that made an Orchestrator a *host-edge*
 * Orchestrator existed only inside `com.neomjs.agent-os-host-edge.plist`. `npm run ai:orchestrator`
 * and the plist invoke the identical entrypoint and differ ONLY by `EnvironmentVariables` — so the
 * role, the state root, and the lane closure were trapped inside a macOS supervision artifact.
 * A contributor on Linux got a runbook whose single instruction was `launchctl`; a contributor on
 * macOS who ran the npm script got a host process claiming the container's authority.
 *
 * Moving the posture here makes supervision optional and platform-specific while the runtime stays
 * portable: launchd supervises, this module declares, and the two cannot drift because the plist no
 * longer restates what it supervises.
 *
 * **Deployment inputs, not config policy.** (ticket-ref-ok: ADR 0019 §10.8 is the Accepted decision
 * this module implements.) It keeps provider/tenant choices, network
 * placement, and privileged capabilities as deployment inputs rather than leaves. This module is a
 * producer of those inputs — the same class of artifact as a Compose `environment:` block or the
 * plist's `EnvironmentVariables` dict, expressed portably. It therefore declares NO provider or
 * model selection: the local overlay's LM Studio host/model pinning is THIS machine's choice and
 * stays in the LaunchAgent, where a change to it stays a reviewed change.
 *
 * The shape deliberately mirrors `harness/brain.mjs`'s `buildPackagedBrainEnv` — the reviewed
 * precedent for "one env-fragment function is the product profile, consumed identically by the
 * real boot and by the proof".
 *
 * @see ai/daemons/orchestrator/hostEdge.mjs
 * @see ai/deploy/com.neomjs.agent-os-host-edge.plist
 * @see learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */
import os   from 'os';
import path from 'path';

/**
 * @summary Env key binding the orchestrator's runtime state root (`orchestrator.dataDir`).
 * Named here because it is the ONE posture coordinate a supervisor legitimately overrides — the
 * plist points it at the machine's Application Support root — so both the entrypoint and the
 * plist-drift proof need to refer to it without restating the string.
 * @type {String}
 */
export const HOST_EDGE_STATE_DIR_ENV = 'NEO_AI_ORCHESTRATOR_DIR';

/**
 * @summary Resolves the default host-edge state root: absolute, under the user's home, and outside
 * every checkout.
 *
 * The `orchestrator.dataDir` leaf default is plane-anchored (`planeMember: true`), which is correct
 * for the container that OWNS the plane and wrong for a graphless host process — it would put host
 * state inside the checkout plane the split exists to leave behind. Supplying the deployment value
 * here is the same act Compose performs with a volume mount.
 *
 * The macOS branch matches the runbook's `~/Library/Application Support/Neo/AgentOS` so an existing
 * supervised install and a bare `npm run ai:host-edge` address the same state; other platforms use
 * the `~/.neo-ai` convention the backup root already established.
 *
 * @param {Object} [options]
 * @param {String} [options.homeDir=os.homedir()] Home directory seam for tests.
 * @param {String} [options.platform=process.platform] Platform seam for tests.
 * @returns {String}
 */
export function resolveHostEdgeStateDir({homeDir = os.homedir(), platform = process.platform} = {}) {
    return platform === 'darwin'
        ? path.join(homeDir, 'Library', 'Application Support', 'Neo', 'AgentOS', 'host-edge')
        : path.join(homeDir, '.neo-ai', 'agent-os', 'host-edge');
}

/**
 * @summary Builds the complete host-edge posture as an env fragment.
 *
 * Three parts, and all three are required for the posture to be real:
 *
 * 1. **Role** — `host-edge`. Declared, never inherited: the leaf carries no default, so a launcher
 *    that omits this refuses rather than silently claiming the container's authority.
 * 2. **Placement** — `deploymentMode=local` plus a state root outside the checkout plane.
 * 3. **Lane closure** — every lane this role does not own turned OFF explicitly, and the one lane
 *    the topology elects for it turned ON. The authority filter would already drop a foreign lane,
 *    but an unstated flag leaves the operator reading a config default that the filter silently
 *    overrides; stating the closure makes the elected lane set legible in one place.
 *
 * LM Studio supervision is the host edge's one elected lane (ticket-ref-ok: ADR 0019 §10.7 elects it).
 * A contributor without
 * LM Studio installed sets `NEO_ORCHESTRATOR_LMS_ENABLED=false` — every key here yields to an
 * explicit environment value, so that is a one-variable opt-out with no fork of this profile.
 *
 * @param {Object} [options]
 * @param {String} [options.stateDir=resolveHostEdgeStateDir()] Runtime state root.
 * @returns {Object<String,String>} env fragment to apply over the process environment
 */
export function buildHostEdgeEnv({stateDir = resolveHostEdgeStateDir()} = {}) {
    return {
        // 1. Role + 2. placement
        NEO_AI_DEPLOYMENT_MODE               : 'local',
        NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'host-edge',
        [HOST_EDGE_STATE_DIR_ENV]            : stateDir,

        // 3. Lane closure — the one elected host-edge lane…
        NEO_ORCHESTRATOR_LMS_ENABLED            : 'true',

        // …and everything else off. Container-plane + shared-primitive lanes (Docker owns them).
        //
        // `KB_SYNC` and `TEMPORAL_SUMMARY` sit in THIS group rather than the host-edge-class one
        // below, and they stay listed. The closure declares what a GRAPHLESS process must not start
        // — a statement about CAPABILITY, not about ownership — which is why `CHROMA_DAEMON` has
        // always been here despite being container-plane too. A container-plane classification says
        // who SHOULD run a lane; it does not say this role safely CAN, and only the second question
        // is what this fragment answers.
        NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED   : 'false',
        NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED    : 'false',
        NEO_ORCHESTRATOR_KB_SYNC_ENABLED         : 'false',
        NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED  : 'false',
        NEO_ORCHESTRATOR_TEMPORAL_SUMMARY_ENABLED: 'false',

        // Host-edge-class lanes this topology does not elect for the host edge:
        NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED   : 'false',
        NEO_ORCHESTRATOR_DEV_SERVER_ENABLED      : 'false',
        NEO_ORCHESTRATOR_MLX_ENABLED             : 'false',
        NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED       : 'false',
        NEO_ORCHESTRATOR_OLLAMA_ENABLED          : 'false',
        NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED: 'false',
        NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED : 'false'
    }
}
