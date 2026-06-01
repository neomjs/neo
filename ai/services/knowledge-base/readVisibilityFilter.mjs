import RequestContextService, {normalizeUserId} from '../../mcp/server/shared/services/RequestContextService.mjs';
import aiConfig                                   from '../../mcp/server/knowledge-base/config.mjs';

/**
 * @module ai/services/knowledge-base/readVisibilityFilter
 *
 * Single source of truth for the Knowledge Base **read-side** Chroma `where` clause. Every KB read
 * path (`QueryService.queryDocuments`, `DocumentService` getters) builds its filter here so the two
 * isolation layers can never drift apart between call sites:
 *
 * 1. **Tenant isolation (#11632):** a requester only sees its own tenant's chunks plus Neo's curated
 *    `neo-shared` corpus. The tenant is derived server-side from the authenticated context — never
 *    from a client-supplied argument, so a forged `tenantId` query parameter is ignored.
 * 2. **Per-chunk visibility (#12163):** a `visibility: 'private'` chunk is returned ONLY to its
 *    owner; `team` (and any non-private) chunks stay visible to every same-tenant requester. This
 *    mirrors Memory Core's read-side RLS predicate (`GraphService.isRlsVisible`).
 *
 * **Why ownership is matched on `originAgentIdentity`, not the tenant id:** `VectorService` stamps a
 * private chunk's owner as the writer's **agent-identity node id** (`getAgentIdentityNodeId()`), not
 * the tenant. In a *shared* tenant (e.g. the cloud `defaultTenantId` tier) many users resolve to one
 * tenant but keep distinct agent identities — so matching on the tenant would leak every private
 * chunk to every member. The ownership check therefore uses `getAgentIdentityNodeId()`.
 *
 * **Fail-safe:** a private chunk whose `originAgentIdentity` is absent matches no requester and stays
 * hidden; and when the requester has no agent identity at all, the ownership branch is dropped
 * entirely, so they see only non-private content.
 *
 * **Offline / single-tenant:** with no authenticated request context (stdio single-tenant, offline
 * daemon) there is no tenant and no visibility filter — byte-equivalent with the pre-#11632 / pre
 * -#12163 behavior. The caller omits `where` entirely in that case.
 */

/**
 * @summary Builds the combined tenant + visibility read `where` clause from the authenticated context.
 * @param {Object} [base={}] Pre-existing scalar conditions to AND in (e.g. a `{type}` filter).
 * @returns {Object|null} `{$and: [...]}` when a request context exists; the bare `base` (or `null`)
 *          when there is no context, signalling the caller to skip filtering.
 */
export function buildReadWhereClause(base = {}) {
    const requesterTenantId = normalizeUserId(RequestContextService.getUserId());

    // No authenticated context → no tenant + no visibility filter (pre-#11632 single-tenant parity).
    if (!requesterTenantId) {
        return Object.keys(base).length > 0 ? base : null;
    }

    const tenantClause = {tenantId: {$in: [requesterTenantId, aiConfig.defaultTenantId]}};

    const requesterAgentId = RequestContextService.getAgentIdentityNodeId();
    const visibilityClause = requesterAgentId
        ? {$or: [{visibility: {$ne: 'private'}}, {originAgentIdentity: requesterAgentId}]}
        : {visibility: {$ne: 'private'}};

    const conditions = Object.keys(base).length > 0
        ? [base, tenantClause, visibilityClause]
        : [tenantClause, visibilityClause];

    return {$and: conditions}
}
