/**
 * The ONE harness-type authority — the durable key set AND the product-language labels, shared
 * across the hemispheres exactly like {@link module:src/ai/fleet/fleetWireMethods}: the Brain's
 * `FleetRegistryService` validates `defineAgent`/`configureAgent` input against these keys, and
 * the Body's account/configuration surfaces derive their pickers and card labels from the same
 * entries. Adding a harness IS one registration here — a second list anywhere is the drift this
 * module exists to prevent.
 *
 * **Dependency-free by design** — imported by both Node modules and App-Worker (browser) modules,
 * so it MUST NOT pull in any Node-only or framework chain.
 *
 * Entry order is the DISPLAY order (product decision: Codex first = the add-form default);
 * validation is order-blind.
 * @summary Shared Body↔Brain harness-type registry: durable keys + product labels.
 */

/**
 * @type {ReadonlyArray<{type: String, label: String}>}
 */
export const HARNESS_TYPES = Object.freeze([
    Object.freeze({type: 'codex',          label: 'Codex'}),
    Object.freeze({type: 'claude-code',    label: 'Claude Code'}),
    Object.freeze({type: 'claude-desktop', label: 'Claude'}),
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
