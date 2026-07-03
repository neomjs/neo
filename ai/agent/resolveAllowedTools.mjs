/**
 * @summary Pure least-privilege filter for an agent profile's MCP tool surface — the capability-gating mechanism.
 *
 * `Agent.servers` selects MCP servers all-or-nothing: `Loop.initAsync` exposes every tool of every connected
 * client to the model. That is fine for a frontier model, but over-exposes a local lower-parameter worker (e.g.
 * a Gemma Librarian) to an API surface it cannot navigate safely — the risk of destructive CLI/GraphQL
 * loops. This function lets a profile additionally restrict a connected server to an explicit subset of its
 * tools (e.g. a worker limited to the `signal_state_transition` trap endpoint) without forking the server.
 *
 * Pure and side-effect-free so it is testable without standing up a live MCP client; the caller (the Loop's
 * tool-assembly) applies it per connected server. It is policy-agnostic: the tier→tool *matrix* (which tools a
 * model tier gets) is the caller's to define — this primitive only enforces whatever allowlist it is handed.
 *
 * Default is fail-open per server, so the mechanism is backward-compatible and opt-in:
 * - `allowedTools` null/undefined → no filtering anywhere (existing profiles keep their full surface).
 * - a server **absent** from a non-null `allowedTools` map → that server's full surface (only the servers you
 *   name are constrained, so forgetting one is not a silent capability loss).
 * - a server **present** in the map → only its listed tools (an explicit empty list `[]` denies all of them).
 *
 * @param {Object}        options
 * @param {Object[]}      options.tools              The full tool list from one server (each a `{name, ...}` schema).
 * @param {Object|null}   [options.allowedTools=null] Per-server allowlist `{[serverName]: String[]}`, or null for none.
 * @param {String}        options.serverName         The raw server name (matches the `Agent.servers` keys, e.g. 'github-workflow').
 * @returns {Object[]} The permitted subset of `tools` — a new array; the input is never mutated.
 */
export function resolveAllowedTools({tools, allowedTools = null, serverName}) {
    if (!allowedTools || !Object.hasOwn(allowedTools, serverName)) {
        return tools;
    }

    const allow = new Set(allowedTools[serverName]);

    return tools.filter(tool => allow.has(tool.name));
}
