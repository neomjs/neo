/**
 * The ONE Fleet Manager MCP-server authority, shared across the Body and Brain. Durable keys,
 * operator labels, and defaults live here so the registry validates the same vocabulary the
 * Accounts surface renders. The persisted value is always a SPARSE override object: `null` means
 * every current catalog default applies.
 *
 * **Dependency-free by design** — this module is imported by both Node services and App-Worker
 * modules and MUST NOT pull in either a Node-only or framework dependency chain.
 * @summary Shared Body↔Brain MCP catalog plus sparse override projection and validation.
 */

/**
 * @type {ReadonlyArray<{key: String, label: String, core: Boolean, defaultEnabled: Boolean}>}
 */
export const MCP_SERVERS = Object.freeze([
    Object.freeze({key: 'memory-core',     label: 'Memory Core',     core: true,  defaultEnabled: true}),
    Object.freeze({key: 'knowledge-base',  label: 'Knowledge Base',  core: true,  defaultEnabled: true}),
    Object.freeze({key: 'neural-link',     label: 'Neural Link',     core: true,  defaultEnabled: true}),
    Object.freeze({key: 'github-workflow', label: 'GitHub workflow', core: false, defaultEnabled: false}),
    Object.freeze({key: 'gitlab-workflow', label: 'GitLab workflow', core: false, defaultEnabled: false})
]);

/**
 * @summary List every registered MCP server in display order. Every result is caller-owned.
 * @returns {Object[]} `[{key, label, core, defaultEnabled}]`
 */
export function listMcpServers() {
    return MCP_SERVERS.map(entry => ({...entry}))
}

/**
 * @summary Build the effective default matrix for the supplied catalog. The optional catalog seam
 * makes default-evolution behavior directly falsifiable without mutating the frozen authority.
 * @param {Object[]} [catalog=MCP_SERVERS]
 * @returns {Object} `{serverKey: Boolean}`
 */
export function defaultMcpMatrix(catalog=MCP_SERVERS) {
    return Object.fromEntries(catalog.map(entry => [entry.key, entry.defaultEnabled]))
}

/**
 * @summary Resolve sparse stored overrides over the live catalog defaults. Unknown stored keys are
 * ignored so retired servers cannot reappear in the projection; non-boolean legacy values fail
 * closed to `false` rather than truthy-coercing.
 * @param {Object|null} overrides Sparse persisted overrides; `null` follows every default.
 * @param {Object[]} [catalog=MCP_SERVERS]
 * @returns {Object} Effective `{serverKey: Boolean}` matrix for every registered server.
 */
export function resolveMcpMatrix(overrides, catalog=MCP_SERVERS) {
    const
        matrix = defaultMcpMatrix(catalog),
        keys   = new Set(catalog.map(entry => entry.key));

    Object.entries(overrides || {}).forEach(([key, enabled]) => {
        if (keys.has(key)) {
            matrix[key] = enabled === true
        }
    });

    return matrix
}

/**
 * @summary Validate one complete sparse-override intent and canonicalize it against the current
 * defaults. Only registered boolean entries may cross the wire. Values equal to their catalog
 * default disappear; an empty result becomes `null`, preserving future default evolution.
 * @param {Object|null} overrides Sparse overrides or an effective matrix to reduce.
 * @param {Object[]} [catalog=MCP_SERVERS]
 * @returns {Object|null} Canonical sparse overrides, in catalog order.
 */
export function normalizeMcpOverrides(overrides, catalog=MCP_SERVERS) {
    if (overrides === null) {
        return null
    }

    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        throw new TypeError('MCP overrides must be an object or null.')
    }

    const
        byKey   = new Map(catalog.map(entry => [entry.key, entry])),
        unknown = Object.keys(overrides).find(key => !byKey.has(key));

    if (unknown) {
        throw new TypeError(`Unknown MCP server '${unknown}'.`)
    }

    const nonBoolean = Object.entries(overrides).find(([, value]) => typeof value !== 'boolean');

    if (nonBoolean) {
        throw new TypeError(`MCP override '${nonBoolean[0]}' must be boolean.`)
    }

    const sparse = {};

    catalog.forEach(entry => {
        if (Object.hasOwn(overrides, entry.key) && overrides[entry.key] !== entry.defaultEnabled) {
            sparse[entry.key] = overrides[entry.key]
        }
    });

    return Object.keys(sparse).length ? sparse : null
}

export default {
    MCP_SERVERS,
    defaultMcpMatrix,
    listMcpServers,
    normalizeMcpOverrides,
    resolveMcpMatrix
};
