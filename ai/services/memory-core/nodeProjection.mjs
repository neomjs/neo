/**
 * @summary The graph read verb's node-projection POLICY, extracted pure — the lean/full contract
 * `GraphService.getNode` applies after its RLS visibility gate, testable hermetically (no service,
 * no database, no config import chain).
 *
 * Two projections, one authorization rule:
 * - **lean** (default): exactly the six hoisted identity fields — the token-economy contract
 *   roster-wide sweeps rely on.
 * - **full**: the SAME shape plus the type's **public fact set** — a FIELD-level pick, never the
 *   raw bag. Graph-row RLS answers "may this row participate in the caller's graph?"; it is NOT
 *   field authorization, and even an allowlisted TYPE holds heterogeneous fields: auto-provisioned
 *   `AgentIdentity` rows are globally visible yet carry provider/auth/timing metadata
 *   (`authProvider`, `providerBaseUrl`, `providerUserId`, `lastAuthenticatedAt`, …) that no owning
 *   service signed off for generic reads. The `MESSAGE` counterexample sits one level up: its row
 *   is deliberately RLS-moot (`sharedEntity: true`) while `bodyText` is mailbox-audience-gated.
 *   A type without a public fact set — or a fact outside it — answers the LEAN truth: fail-closed,
 *   mechanically detectable via the absent key.
 *
 * The policy authority is module-PRIVATE by design: exporting a mutable allowlist would itself be
 * a runtime bypass surface. Consumers get behavior; the fact sets change only by editing this
 * module with the owning service's field-authorization sign-off.
 * @module ai/services/memory-core/nodeProjection
 */

/**
 * The per-type PUBLIC fact sets exposable through the `full` projection — the single, private
 * policy authority. A field joins a list only with the type's owning service signing off that it
 * is safe for ANY caller who can see the row.
 * @type {Map<String, String[]>}
 * @private
 */
const PUBLIC_NODE_FIELDS = new Map([
    ['AgentIdentity', Object.freeze([
        'accountType', 'createdAt', 'displayName', 'githubLogin',
        'modelFamily', 'participationStatus', 'trustTier'
    ])]
]);

/**
 * @summary Project one visible node's fields per the requested projection.
 * @param {Object}      node
 * @param {String}      node.id         The node id.
 * @param {String}      node.label      The node's graph type (e.g. `AgentIdentity`, `MESSAGE`).
 * @param {Object|null} node.properties The node's stored properties bag (may be absent).
 * @param {'lean'|'full'} [projection='lean'] `'full'` adds the type's public fact set for allowlisted types.
 * @returns {Object} The projected node — six hoisted fields, plus a picked `properties` only when allowed.
 */
export function projectNode({id, label, properties}, projection = 'lean') {
    const result = {
        id,
        type            : label,
        name            : properties?.name,
        description     : properties?.description,
        semanticVectorId: properties?.semanticVectorId,
        state           : properties?.state
    };

    const publicFields = projection === 'full' ? PUBLIC_NODE_FIELDS.get(label) : null;

    if (publicFields) {
        result.properties = {};

        for (const field of publicFields) {
            if (properties && field in properties) {
                result.properties[field] = properties[field]
            }
        }
    }

    return result
}
