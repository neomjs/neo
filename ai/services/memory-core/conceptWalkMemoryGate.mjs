import {resolveRowTimestamp} from './helpers/resolveRowTimestamp.mjs';

/**
 * @module ai/services/memory-core/conceptWalkMemoryGate
 * @summary The RLS re-authorization gate for concept-walk-reached memories — the security boundary of
 * the concept-anchored retrieval wrap (owning leaf: the GP-v2 consumer-1 retrieval enrichment).
 *
 * Why this exists (load-bearing): the flat `queryMemories` path scopes tenants at the DB layer — a
 * Chroma `where` clause (private → `{userId}`) plus an in-JS legacy/trust post-filter. The concept
 * walk does NOT go through that path: it reaches a memory by its graph node id and hydrates it with a
 * direct `collection.get({ids})`, which **bypasses the `where` clause entirely**. So a walk that
 * lands on another tenant's memory would surface it unless this gate re-applies the SAME
 * authorization the flat path enforces. This module IS that re-application — tombstone, tenant, and
 * trust, mirrored per-record — plus the fail-closed default on any read error. A bug here is a
 * cross-tenant recall leak, so it is a pure, fully-injectable unit (no singletons) precisely so it
 * can be exhaustively tested without a live store.
 *
 * The graph node id of a memory IS the Chroma memory id (`_projectMemoryToGraph` upserts the
 * `AGENT_MEMORY` node with `id: memoryId` and `semanticVectorId: memoryId`), so a walk hop's
 * `neighborId` hydrates directly. Non-memory neighbors (`FILE`/`CONCEPT`/`CLASS`) are rejected by
 * label BEFORE any store read.
 */

const AGENT_MEMORY_LABEL = 'AGENT_MEMORY';

/**
 * @summary Builds the `resolveCandidate` gate the retrieval wrap injects — hydrate + re-authorize a
 * single walk-reached node, or return null (the wrap counts nulls as `filteredOut`).
 *
 * The returned function mirrors the flat path's authorization exactly, per policy:
 * - **private** — the record's `userId` must equal the caller's (replicates the `where:{userId}` the
 *   direct `get` bypasses).
 * - **team** — deployment-wide read; every record in the collection is in-team (no userId gate).
 * - **legacy** — caller-owned OR shared-commons OR untagged (`!metaUserId`), mirroring the flat
 *   legacy post-filter.
 * Tombstoned (`archivedAt`) records are always dropped; `minTrustTier` is enforced when set; a read
 * error fails closed (null). Non-`AGENT_MEMORY` neighbors are rejected by label with no store read.
 *
 * @param {Object} options
 * @param {Object} options.collection The memory collection — needs `async get({ids, include})`.
 * @param {String|null} options.userId Normalized caller userId (null → unauthenticated single-tenant).
 * @param {String} options.policy `'private' | 'team' | 'legacy'`.
 * @param {String|null} [options.sessionId] Optional session pin — mirrors the flat query's `sessionId`
 *     `where` filter (which the direct `get` bypasses); a walk-reached record from another session is rejected.
 * @param {String|null} [options.minTrustTier] Optional minimum trust tier.
 * @param {String} options.sharedUserId The shared-commons sentinel userId.
 * @param {Function} options.resolveTrustTier `(metadata) => tier` — the flat path's tier resolver.
 * @param {Function} options.matchesMinTrustTier `(metadata, minTier) => Boolean` — the flat matcher.
 * @returns {Function} `async (nodeId, {neighborLabel}) => memoryCandidate | null`.
 */
export function buildMemoryResolveCandidate({
    collection,
    userId,
    policy,
    sessionId = null,
    minTrustTier = null,
    sharedUserId,
    resolveTrustTier,
    matchesMinTrustTier
}) {
    return async function resolveWalkMemory(nodeId, {neighborLabel} = {}) {
        // Only AGENT_MEMORY neighbors are retrievable memories — reject anything else with no read.
        if (neighborLabel !== AGENT_MEMORY_LABEL) {
            return null
        }

        let metadata = null;

        try {
            const got = await collection.get({ids: [nodeId], include: ['metadatas']});

            metadata = got?.metadatas?.[0] || null
        } catch {
            return null // fail-closed: a read error never surfaces an unverified record
        }

        if (!metadata || metadata.archivedAt) {
            return null // absent, or tombstoned (mirrors the flat path's unconditional archive drop)
        }

        // Session-scope re-application — when the caller pins a session the flat path filters to it via
        // the `where` clause the direct get bypassed; a walk-reached record from ANOTHER session must
        // not surface through the opt-in. Every pre-existing semantic-query constraint crosses this gate.
        if (sessionId && metadata.sessionId !== sessionId) {
            return null
        }

        // Tenant re-application — the direct get bypassed the flat path's `where`, so re-apply it here.
        const metaUserId = metadata.userId;
        let tenantMatch;

        if (policy === 'team') {
            tenantMatch = true
        } else if (policy === 'private') {
            tenantMatch = !userId || metaUserId === userId
        } else { // legacy: caller-owned OR shared-commons OR untagged
            tenantMatch = !userId || !metaUserId || metaUserId === userId || metaUserId === sharedUserId
        }

        if (!tenantMatch) {
            return null
        }

        if (minTrustTier && !matchesMinTrustTier(metadata, minTrustTier)) {
            return null
        }

        return {
            id       : nodeId,
            sessionId: metadata.sessionId,
            // Truthiness alone is not enough here: an unparseable-but-truthy stored value (e.g. a
            // corrupted string) passes a `? :` check and then throws inside this map, failing the
            // whole enriched call. Parseability is the real invariant.
            timestamp    : resolveRowTimestamp(metadata),
            prompt       : metadata.prompt,
            thought      : metadata.thought,
            response     : metadata.response,
            type         : metadata.type,
            agentIdentity: metadata.agentIdentity || null,
            trustTier    : resolveTrustTier(metadata)
        }
    }
}
