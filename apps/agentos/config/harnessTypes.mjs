/**
 * The Fleet Manager harness-type registry: one data-driven entry per supported harness, plus
 * resolvers with fail-closed unknown handling. Kept as its own module — pure data, no component
 * coupling — so ADDING A HARNESS IS ONE REGISTRATION: per-harness launch/config semantics live
 * BEHIND the type key (Brain-side, e.g. the fleet launch-spec derivation), never as forks inside
 * the surfaces that render or store the choice.
 *
 * `label` is the operator-facing product language (surfaces render it verbatim); `type` is the
 * durable key persisted on {@link AgentOS.model.AgentDefinition} records and understood by the
 * Brain-side fleet services.
 */

const HARNESS_TYPES = [
    {type: 'claude-desktop', label: 'Claude Desktop'},
    {type: 'codex',          label: 'Codex'},
    {type: 'antigravity',    label: 'Antigravity'},
    {type: 'native-neo',     label: 'Native'}
];

const BY_TYPE = new Map(HARNESS_TYPES.map(entry => [entry.type, entry]));

/**
 * @summary Every registered harness type, in display order. Frozen shape: consumers render, never mutate.
 * @returns {Object[]} `[{type, label}]`
 */
export function listHarnessTypes() {
    return HARNESS_TYPES.map(entry => ({...entry}))
}

/**
 * @summary Resolve one registered harness entry, or null — surfaces must fail closed on unknown
 * types (render an honest "unknown" state), never guess a launcher or a label.
 * @param {String} type The durable harness-type key.
 * @returns {Object|null} `{type, label}` or null for an unregistered type.
 */
export function resolveHarnessType(type) {
    const entry = BY_TYPE.get(type);

    return entry ? {...entry} : null
}

export default {listHarnessTypes, resolveHarnessType};
