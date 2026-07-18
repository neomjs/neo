/**
 * @summary The graph read verb's node-projection POLICY, extracted pure — the lean/full contract
 * `GraphService.getNode` applies after its RLS visibility gate, testable hermetically (no service,
 * no database, no config import chain).
 *
 * Two projections, one authorization rule:
 * - **lean** (default): exactly the six hoisted identity fields — the token-economy contract
 *   roster-wide sweeps rely on.
 * - **full**: the SAME shape plus the node's complete `properties` bag — but ONLY for
 *   {@link FULL_PROJECTION_TYPES allowlisted} node types. Graph-row RLS answers "may this row
 *   participate in the caller's graph?"; it is NOT field authorization. A `MESSAGE` row is
 *   deliberately RLS-moot (`sharedEntity: true`) while its `bodyText` is guarded by the mailbox
 *   audience edges (`MailboxService.getMessage`) — an unallowlisted raw bag would bypass that
 *   contract. Non-allowlisted types answer the LEAN shape: fail-closed to the cheaper truth,
 *   mechanically detectable via the absent `properties` key.
 * @module ai/services/memory-core/nodeProjection
 */

/**
 * Node types whose complete `properties` bag may be exposed through the `full` projection.
 * A type joins this list only with its owning service's sign-off that every stored property is
 * safe for any caller who can see the row.
 * @type {Set<String>}
 */
export const FULL_PROJECTION_TYPES = new Set(['AgentIdentity']);

/**
 * @summary Project one visible node's fields per the requested projection.
 * @param {Object}      node
 * @param {String}      node.id         The node id.
 * @param {String}      node.label      The node's graph type (e.g. `AgentIdentity`, `MESSAGE`).
 * @param {Object|null} node.properties The node's stored properties bag (may be absent).
 * @param {'lean'|'full'} [projection='lean'] `'full'` adds the `properties` bag for allowlisted types.
 * @returns {Object} The projected node — six hoisted fields, plus `properties` only when allowed.
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

    if (projection === 'full' && FULL_PROJECTION_TYPES.has(label)) {
        result.properties = properties || {}
    }

    return result
}
