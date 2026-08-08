/**
 * The cockpit's harness-type render vocabulary — the Body-side TWIN of the Brain authority
 * (`ai/services/fleet/harnessTypes.mjs`). The same entries validate `defineAgent`/`configureAgent`
 * Brain-side and render every picker/label here, operable cold. ADDING A HARNESS IS ONE
 * REGISTRATION — in the authority module, mirrored here in the same commit;
 * `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs` deep-equals the entries and helper behavior,
 * so silent drift is red CI.
 *
 * `label` is the operator-facing product language (surfaces render it verbatim); `type` is the
 * durable key persisted on {@link AgentOS.model.AgentDefinition} records and understood by the
 * Brain-side fleet services. Entry order is the DISPLAY order (product decision: Codex first =
 * the add-form default); validation is order-blind.
 * @summary Operable-cold harness-type twin: durable keys + product labels.
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
