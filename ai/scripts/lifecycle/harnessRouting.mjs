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
 * @see ai/daemons/bridge/daemon.mjs
 */
import {IDENTITIES} from '../../graph/identityRoots.mjs';

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

const APP_HARNESS_DEFAULTS = Object.freeze({
    Antigravity: Object.freeze({
        tabShortcut: 'shift+i'
    }),
    Claude: Object.freeze({
        tabShortcut      : '3',
        focusSeedSequence: 'r-undo'
    })
});

/**
 * @summary Normalize a GitHub-login-style identity into AgentIdentity node-id form.
 * @param {String} identity Raw identity from env/config/CLI.
 * @returns {String} Canonical AgentIdentity node id, or an empty string for empty input.
 */
export function normalizeAgentIdentityNodeId(identity) {
    const value = String(identity ?? '').trim();
    return value && !value.startsWith('@') ? `@${value}` : value;
}
/**
 * @summary Apply host-app default shortcuts while preserving explicit metadata.
 *
 * `undefined` means "use the known app default"; `null` remains a deliberate opt-out.
 *
 * @param {Object} metadata Harness target metadata.
 * @returns {Object} Copy of metadata with host-app defaults applied.
 */
export function applyHarnessMetadataDefaults(metadata = {}) {
    const result   = {...metadata};
    const defaults = APP_HARNESS_DEFAULTS[result.appName] || {};

    if (result.tabShortcut === undefined && Object.hasOwn(defaults, 'tabShortcut')) {
        result.tabShortcut = defaults.tabShortcut;
    }

    if (
        result.focusSeedSequence === undefined &&
        result.focusSeedKey === undefined &&
        Object.hasOwn(defaults, 'focusSeedSequence')
    ) {
        result.focusSeedSequence = defaults.focusSeedSequence;
    }

    return result;
}

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

    const family = entry.properties?.modelFamily || entry.properties?.family;
    const target = FAMILY_HARNESS_TARGETS[family];

    return target ? applyHarnessMetadataDefaults(target) : null;
}
