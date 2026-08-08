/**
 * The harness-type AUTHORITY (Brain-side) — the durable key set AND the product-language labels:
 * `FleetRegistryService` validates `defineAgent`/`configureAgent` input against these keys, and
 * `deriveHarnessLaunchSpec` binds its launch vocabulary to them. Adding a harness IS one
 * registration here, mirrored into the cockpit's operable-cold twin
 * (`apps/agentos/config/harnessTypes.mjs`) in the same commit —
 * `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs` deep-equals entries and helper behavior, so
 * a second DRIFTING list cannot exist. The Body never imports this module.
 *
 * Entry order is the DISPLAY order (product decision: Codex first = the add-form default);
 * validation is order-blind. Dependency-free by design — pure data + pure functions only.
 * @summary The harness-type authority: durable keys + product labels.
 */

/**
 * @type {ReadonlyArray<{type: String, label: String}>}
 */
export const HARNESS_TYPES = Object.freeze([
    Object.freeze({type: 'codex',          label: 'Codex'}),
    Object.freeze({type: 'codex-desktop',  label: 'Codex Desktop'}),
    Object.freeze({type: 'claude-code',    label: 'Claude Code'}),
    Object.freeze({type: 'claude-desktop', label: 'Claude'}),
    Object.freeze({type: 'opencode',       label: 'OpenCode'}),
    Object.freeze({type: 'kimi-code',      label: 'Kimi Code'}),
    Object.freeze({type: 'antigravity',    label: 'Antigravity'}),
    Object.freeze({type: 'native-neo',     label: 'Native'})
]);

/**
 * @summary List every registered harness type in display order. Caller-owned copies: mutating a
 * result never corrupts the registry (the frozen source is the second line of defense).
 * @returns {Object[]} `[{type, label}]`
 */
export function listHarnessTypes() {
    return HARNESS_TYPES.map(entry => ({...entry}))
}

/**
 * @summary Resolve one harness-type entry by its durable key — null for unregistered types
 * (consumers render fail-closed "Unknown harness", never a guess). Caller-owned copy.
 * @param {String} type
 * @returns {{type: String, label: String}|null}
 */
export function resolveHarnessType(type) {
    const entry = HARNESS_TYPES.find(item => item.type === type);

    return entry ? {...entry} : null
}

export default {HARNESS_TYPES, listHarnessTypes, resolveHarnessType};
