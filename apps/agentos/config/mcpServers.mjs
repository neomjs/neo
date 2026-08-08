/**
 * The cockpit's MCP-server render/form vocabulary — the Body-side TWIN of the Brain authority
 * (`ai/services/fleet/mcpServers.mjs`). It exists so the Accounts surface renders pickers, builds
 * preview matrices, and canonicalizes sparse overrides while OPERABLE COLD (no fleet server), and
 * so the App Worker never imports across the realm boundary: the engine tree carries no FM
 * vocabulary, and the Brain tree is never a browser import.
 *
 * **Parity is mechanically enforced, not conventional:** `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs`
 * deep-equals every constant and runs the shared helpers over drift-sensitive fixtures against the
 * authority — any divergence is red CI. ADDING OR CHANGING A SERVER IS ONE REGISTRATION in the
 * authority module, mirrored here in the same commit; the lint refuses anything else.
 *
 * `normalizeMcpTarget` and `REMOTE_MCP_CREDENTIAL_ENV_VAR` deliberately have NO twin: target
 * validation is registry-enforced only, and the credential env-var name is Brain deployment
 * vocabulary — the App Worker reads no process environment. The form ships the tiny intent and
 * the Brain is the gate.
 * @summary Operable-cold MCP catalog twin plus the shared sparse-override projection helpers.
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
 * Harness families whose installed configuration grammar can represent remote HTTP MCP servers.
 * Mirrors the authority's rationale: a harness whose artifact cannot encode a tenant choice is
 * never offered one — a product selection must not become a late boot failure.
 * @type {ReadonlyArray<String>}
 */
export const TENANT_MCP_HARNESS_TYPES = Object.freeze([
    'codex',
    'codex-desktop',
    'claude-code',
    'claude-desktop',
    'opencode',
    'kimi-code'
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

/**
 * @summary Whether a registered harness family can consume a connected tenant MCP target.
 * @param {String} harnessType
 * @returns {Boolean}
 */
export function supportsTenantMcpTarget(harnessType) {
    return TENANT_MCP_HARNESS_TYPES.includes(harnessType)
}
