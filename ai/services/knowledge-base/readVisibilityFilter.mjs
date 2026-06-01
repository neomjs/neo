import RequestContextService, {normalizeUserId} from '../../mcp/server/shared/services/RequestContextService.mjs';
import aiConfig                                   from '../../mcp/server/knowledge-base/config.mjs';

/**
 * @module ai/services/knowledge-base/readVisibilityFilter
 *
 * Single source of truth for the Knowledge Base **read-side** Chroma `where` clause. Every KB read
 * path (`QueryService.queryDocuments`, `DocumentService` getters) builds its filter here so the two
 * isolation layers can never drift apart between call sites:
 *
 * 1. **Tenant isolation:** a requester only sees its own tenant's chunks plus Neo's curated
 *    `neo-shared` corpus. The tenant is derived server-side from the authenticated context — never
 *    from a client-supplied argument, so a forged `tenantId` query parameter is ignored.
 * 2. **Per-chunk visibility:** a `visibility: 'private'` chunk is returned ONLY to its owner; `team`
 *    (and any non-private) chunks stay visible to every same-tenant requester.
 *
 * **Owner identity — and its current transport limit:** a private chunk's owner is the writer's
 * agent-identity node id (`getAgentIdentityNodeId()`, stamped by `VectorService`), matched against the
 * requester's. Matching on the agent identity rather than the tenant is what would distinguish users
 * inside a *shared* tenant (the cloud `defaultTenantId` tier). BUT that identity is populated only in
 * stdio / env / gh-cli contexts; the OIDC/proxy transport a cloud deployment uses resolves a `userId`
 * but **no** agent-identity node id. So in an OIDC deployment owner-scoped read-back is currently
 * inert: a `private` chunk has no resolvable owner on read and fails safe — hidden from everyone,
 * including its writer. Restoring owner read-back there requires keying ownership on a
 * transport-populated identity (`userId`); that is the tracked owner-key follow-up.
 *
 * **Fail-safe:** a private chunk whose owner is absent matches no requester and stays hidden; and when
 * the requester has no agent identity at all, the ownership branch is dropped entirely, so they see
 * only non-private content. This null-owner policy intentionally **diverges** from Memory Core's RLS
 * predicate (`GraphService.isRlsVisible`): the non-null-owner match is similar in shape, but Memory
 * Core treats a null owner as visible whereas this fails closed.
 *
 * **Offline / single-tenant:** with no authenticated request context (stdio single-tenant, offline
 * daemon) there is no tenant and no visibility filter — byte-equivalent with the pre-isolation
 * behavior. The caller omits `where` entirely in that case.
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
