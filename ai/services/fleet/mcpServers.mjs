/**
 * The Fleet Manager MCP-server AUTHORITY (Brain-side): durable keys, operator labels, defaults,
 * and the sparse-override validation the registry enforces. The persisted value is always a
 * SPARSE override object: `null` means every current catalog default applies.
 *
 * **The Body never imports this module.** The cockpit's operable-cold render/form twin is
 * `apps/agentos/config/mcpServers.mjs` — same vocabulary and shared pure helpers, bound to this
 * authority by `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs` (drift = red CI). The
 * engine tree (`src/`) carries no FM vocabulary; the wire (FleetControlBridge) carries the live
 * catalog at runtime. Dependency-free by design — pure data + pure functions only.
 * @summary The FM MCP catalog authority plus sparse override projection and validation.
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
 * For Fleet-owned local/private endpoints, Claude Desktop uses Neo's local stdio↔Streamable-HTTP
 * bridge rather than a direct HTTP entry; account-level public connectors are outside this generated
 * artifact. Antigravity and Native stay local: presenting a tenant choice for a harness whose
 * artifact cannot encode it would turn a product selection into a late boot failure.
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
 * The fixed child-environment slot every remote MC/KB adapter references. Repository credentials
 * occupy a different authority and may never be substituted here.
 * @type {String}
 */
export const REMOTE_MCP_CREDENTIAL_ENV_VAR = 'NEO_MCP_REMOTE_TOKEN';

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
 * @summary Validate and canonicalize the deliberately tiny MCP target intent. The resident target
 * is represented as `null`; a connected tenant carries only its public id. URLs, transports,
 * headers, environment bags, commands, and credentials have no grammar here, so they cannot cross
 * the Body→Brain wire.
 * @param {Object|null} target
 * @returns {{kind: 'tenant', tenantId: String}|null}
 */
export function normalizeMcpTarget(target) {
    if (target === null) {
        return null
    }

    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new TypeError('MCP target must be an object or null.')
    }

    const
        {kind}  = target,
        allowed = kind === 'tenant'
            ? new Set(['kind', 'tenantId'])
            : new Set(['kind']),
        unknown = Object.keys(target).find(key => !allowed.has(key));

    if (unknown) {
        throw new TypeError(`Unsupported MCP target field '${unknown}'.`)
    }

    if (kind === 'resident') {
        return null
    }

    if (kind !== 'tenant') {
        throw new TypeError(`Unsupported MCP target kind '${kind}'.`)
    }

    if (typeof target.tenantId !== 'string' || !target.tenantId.trim()) {
        throw new TypeError("Tenant MCP target requires a non-empty 'tenantId'.")
    }

    return {kind: 'tenant', tenantId: target.tenantId.trim()}
}

/**
 * @summary Whether a registered harness family can consume a connected tenant MCP target.
 * @param {String} harnessType
 * @returns {Boolean}
 */
export function supportsTenantMcpTarget(harnessType) {
    return TENANT_MCP_HARNESS_TYPES.includes(harnessType)
}

export default {
    MCP_SERVERS,
    TENANT_MCP_HARNESS_TYPES,
    REMOTE_MCP_CREDENTIAL_ENV_VAR,
    defaultMcpMatrix,
    listMcpServers,
    normalizeMcpOverrides,
    normalizeMcpTarget,
    resolveMcpMatrix,
    supportsTenantMcpTarget
};
