import {test, expect}                from '@playwright/test';
import {buildMemoryResolveCandidate} from '../../../../../../ai/services/memory-core/conceptWalkMemoryGate.mjs';

/**
 * The gate is the RLS re-authorization boundary for concept-walk-reached memories: a direct
 * `collection.get(id)` bypasses the flat path's tenant `where` clause, so the gate must re-apply
 * tombstone + tenant + trust per record, or a walk leaks another tenant's memory. Pure + injectable,
 * so the security contract is exhaustively unit-tested with a mock collection (no live store).
 */

const SHARED = '__shared__';
const RANK   = {unclassified: 0, external: 1, 'peer-trusted': 5, self: 6};

function makeCollection(records, {throwOnGet = false} = {}) {
    const state = {getCalls: 0};

    return {
        state,
        async get({ids}) {
            state.getCalls++;
            if (throwOnGet) throw new Error('read failure');
            return {metadatas: [records[ids[0]] ?? null]}
        }
    }
}

function build({collection, userId = 'u1', policy = 'private', sessionId = null, minTrustTier = null}) {
    return buildMemoryResolveCandidate({
        collection,
        userId,
        policy,
        sessionId,
        minTrustTier,
        sharedUserId       : SHARED,
        resolveTrustTier   : m => m.trustTier || 'unclassified',
        matchesMinTrustTier: (m, min) => (RANK[m.trustTier] ?? 0) >= (RANK[min] ?? 0)
    })
}

test.describe('Neo.ai.services.memory-core.conceptWalkMemoryGate (#14504)', () => {

    test('a non-AGENT_MEMORY neighbor is rejected by label with NO store read', async () => {
        const col = makeCollection({}),
              g   = build({collection: col, policy: 'team'});

        expect(await g('FILE:x', {neighborLabel: 'FILE'})).toBeNull();
        expect(await g('CONCEPT:y', {neighborLabel: 'CONCEPT'})).toBeNull();
        expect(await g('n', {})).toBeNull();                 // missing label → rejected
        expect(col.state.getCalls).toBe(0);                  // never touched the store
    });

    test('private: the owner hydrates, a cross-tenant record is blocked', async () => {
        const col = makeCollection({
                  m1: {userId: 'u1', sessionId: 's', timestamp: '2026-01-01T00:00:00.000Z', prompt: 'p', trustTier: 'peer-trusted'},
                  m2: {userId: 'u2', sessionId: 's'}
              }),
              g   = build({collection: col, userId: 'u1', policy: 'private'});

        const mine = await g('m1', {neighborLabel: 'AGENT_MEMORY'});

        expect(mine.id).toBe('m1');
        expect(mine.trustTier).toBe('peer-trusted');
        expect(await g('m2', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();   // cross-tenant blocked
    });

    test('a sessionId pin rejects a walk-reached record from another session (the isolation defect)', async () => {
        const col = makeCollection({
                  inSession : {userId: 'u1', sessionId: 's-current', prompt: 'here'},
                  offSession: {userId: 'u1', sessionId: 's-other'}            // same tenant, DIFFERENT session
              }),
              g   = build({collection: col, userId: 'u1', policy: 'private', sessionId: 's-current'});

        expect((await g('inSession', {neighborLabel: 'AGENT_MEMORY'})).id).toBe('inSession');
        expect(await g('offSession', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();   // cross-session blocked

        // no session pin → both sessions are in scope (mirrors the flat path's absent `where` filter)
        const gUnpinned = build({collection: col, userId: 'u1', policy: 'private'});
        expect((await gUnpinned('offSession', {neighborLabel: 'AGENT_MEMORY'})).id).toBe('offSession')
    });

    test('team: a record from any tenant hydrates (deployment-wide read)', async () => {
        const col = makeCollection({m2: {userId: 'u2', sessionId: 's'}}),
              g   = build({collection: col, userId: 'u1', policy: 'team'});

        expect((await g('m2', {neighborLabel: 'AGENT_MEMORY'})).id).toBe('m2');
    });

    test('legacy: owned OR shared-commons OR untagged hydrate; a foreign-tagged record is blocked', async () => {
        const col = makeCollection({
                  own     : {userId: 'u1'},
                  shared  : {userId: SHARED},
                  untagged: {},
                  foreign : {userId: 'u2'}
              }),
              g   = build({collection: col, userId: 'u1', policy: 'legacy'});

        expect(await g('own', {neighborLabel: 'AGENT_MEMORY'})).not.toBeNull();
        expect(await g('shared', {neighborLabel: 'AGENT_MEMORY'})).not.toBeNull();
        expect(await g('untagged', {neighborLabel: 'AGENT_MEMORY'})).not.toBeNull();
        expect(await g('foreign', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();
    });

    test('a tombstoned (archivedAt) record is never recalled, even for the owner', async () => {
        const col = makeCollection({m1: {userId: 'u1', archivedAt: '2026-02-02T00:00:00.000Z'}}),
              g   = build({collection: col, userId: 'u1', policy: 'private'});

        expect(await g('m1', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();
    });

    test('minTrustTier gates a below-threshold record', async () => {
        const col = makeCollection({
                  lo: {userId: 'u1', trustTier: 'external'},
                  hi: {userId: 'u1', trustTier: 'peer-trusted'}
              }),
              g   = build({collection: col, userId: 'u1', policy: 'private', minTrustTier: 'peer-trusted'});

        expect(await g('lo', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();
        expect((await g('hi', {neighborLabel: 'AGENT_MEMORY'})).id).toBe('hi');
    });

    test('a store read error fails closed (null), never a throw', async () => {
        const col = makeCollection({m1: {userId: 'u1'}}, {throwOnGet: true}),
              g   = build({collection: col, userId: 'u1', policy: 'private'});

        expect(await g('m1', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();
    });

    test('an absent record resolves to null', async () => {
        const col = makeCollection({}),
              g   = build({collection: col, userId: 'u1', policy: 'private'});

        expect(await g('nope', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();
    });

    test('a hydrated candidate carries the flat memory shape', async () => {
        const col = makeCollection({
                  m1: {
                      userId       : 'u1', sessionId: 's9', timestamp: '2026-03-03T00:00:00.000Z',
                      prompt       : 'P', thought: 'T', response: 'R', type: 'agent-interaction',
                      agentIdentity: '@neo-opus-vega', trustTier: 'self'
                  }
              }),
              g   = build({collection: col, userId: 'u1', policy: 'private'});

        expect(await g('m1', {neighborLabel: 'AGENT_MEMORY'})).toEqual({
            id           : 'm1',
            sessionId    : 's9',
            timestamp    : '2026-03-03T00:00:00.000Z',
            prompt       : 'P',
            thought      : 'T',
            response     : 'R',
            type         : 'agent-interaction',
            agentIdentity: '@neo-opus-vega',
            trustTier    : 'self'
        });
    });
});
