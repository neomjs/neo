/**
 * The Fleet Manager MCP-server catalog: one data-driven entry per attachable MCP server, plus the
 * per-agent matrix resolvers. Pure data, no component coupling — ADDING A SERVER IS ONE
 * REGISTRATION; the per-agent enable/disable matrix is DATA on the agent record
 * ({@link AgentOS.model.AgentDefinition} `mcpServers`), rendered as the agent's configuration card.
 *
 * The Neo core set (Memory Core · Knowledge Base · Neural Link) defaults ON — a fleet agent
 * without its memory, knowledge, and possession seams is not a fleet agent. Workflow servers
 * default OFF and opt in per agent. `label` is operator-facing product language.
 */

const MCP_SERVERS = [
    {key: 'memory-core',     label: 'Memory Core',     core: true,  defaultEnabled: true},
    {key: 'knowledge-base',  label: 'Knowledge Base',  core: true,  defaultEnabled: true},
    {key: 'neural-link',     label: 'Neural Link',     core: true,  defaultEnabled: true},
    {key: 'github-workflow', label: 'GitHub workflow', core: false, defaultEnabled: false},
    {key: 'gitlab-workflow', label: 'GitLab workflow', core: false, defaultEnabled: false}
];

const BY_KEY = new Map(MCP_SERVERS.map(entry => [entry.key, entry]));

/**
 * @summary Every registered MCP server, in display order. Frozen shape: consumers render, never mutate.
 * @returns {Object[]} `[{key, label, core, defaultEnabled}]`
 */
export function listMcpServers() {
    return MCP_SERVERS.map(entry => ({...entry}))
}

/**
 * @summary The default per-agent matrix — the registry's `defaultEnabled` per key. This is what a
 * record's `mcpServers: null` MEANS: defaults apply, derived from the ONE registry, never baked
 * into records (a catalog change must reach every default-following agent).
 * @returns {Object} `{serverKey: Boolean}`
 */
export function defaultMcpMatrix() {
    const matrix = {};

    MCP_SERVERS.forEach(entry => {
        matrix[entry.key] = entry.defaultEnabled
    });

    return matrix
}

/**
 * @summary Resolve one agent's effective matrix: the registry defaults with the record's explicit
 * per-key choices merged on top. Unknown keys inside the stored matrix are IGNORED (fail-closed:
 * a stale record never invents a server), and only registered keys come back — the result is
 * always renderable against the live catalog.
 * @param {Object|null} storedMatrix The record's `mcpServers` value (null = defaults apply).
 * @returns {Object} `{serverKey: Boolean}` for every registered server.
 */
export function resolveMcpMatrix(storedMatrix) {
    const matrix = defaultMcpMatrix();

    Object.entries(storedMatrix || {}).forEach(([key, enabled]) => {
        if (BY_KEY.has(key)) {
            matrix[key] = enabled === true
        }
    });

    return matrix
}

export default {defaultMcpMatrix, listMcpServers, resolveMcpMatrix};
