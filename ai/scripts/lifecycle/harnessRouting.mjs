/**
 * @summary Lightweight harness-routing primitives for wake/resume delivery.
 *
 * The AgentIdentity roster lives in `identityRoots.mjs`; lifecycle dispatchers should derive
 * routable identities from that registry instead of mirroring Neo's maintainer handles. Host-app
 * shortcut defaults live here as well so bridge wake delivery and fresh-session recovery consume
 * one fact table.
 *
 * @see ai/graph/identityRoots.mjs
 * @see ai/scripts/lifecycle/resumeHarness.mjs
 * @see ai/daemons/wake/daemon.mjs
 * @plane in-plane
 */
import {IDENTITIES}                   from '../../graph/identityRoots.mjs';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';
import {resolveResidentFamily}        from '../../services/graph/agentFamilyResolution.mjs';
import {applyHarnessMetadataDefaults} from '../../daemons/wake/hostHarnessMetadata.mjs';

export {applyHarnessMetadataDefaults, normalizeAgentIdentityNodeId};

const FAMILY_HARNESS_TARGETS = Object.freeze({
    claude: Object.freeze({
        adapter             : 'osascript',
        appName             : 'Claude',
        freshSessionShortcut: 'n'
    }),
    gemini: Object.freeze({
        adapter: 'antigravity-cli'
    }),
    gpt: Object.freeze({
        adapter: 'codex-app-server'
    })
});

/**
 * @summary Resolve the fresh-session harness target for an AgentIdentity.
 *
 * This intentionally derives from `modelFamily`, not `subscriptionTemplate`: same-app Claude
 * identities can be active before their mailbox wake route is individually addressable, but they
 * still share the Claude Desktop fresh-session recovery target.
 *
 * @param {String} identity Agent identity id or GitHub login.
 * @param {Object} [options]
 * @param {Object[]} [options.identities=IDENTITIES] Identity-root-shaped registry for tests.
 * @returns {Object|null} Harness target with app defaults applied, or `null` for unknown identities.
 */
export function resolveHarnessTargetForIdentity(identity, {identities = IDENTITIES} = {}) {
    const nodeId = normalizeAgentIdentityNodeId(identity);
    const entry  = identities.find(candidate => candidate.type === 'AgentIdentity' && candidate.id === nodeId);

    if (!entry) return null;

    // Era-chain-first: the hydration index is the family truth source; the flat `modelFamily`
    // fallback inside the resolver covers exactly the retirement witness populations (post-epoch
    // residents + injected test registries outside the static roster).
    const family = resolveResidentFamily(entry);
    const target = FAMILY_HARNESS_TARGETS[family];

    return target ? applyHarnessMetadataDefaults(target) : null;
}
