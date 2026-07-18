import {test, expect}                       from '@playwright/test';
import {FULL_PROJECTION_TYPES, projectNode} from '../../../../../../ai/services/memory-core/nodeProjection.mjs';

/**
 * @summary The graph read verb's projection POLICY, witnessed hermetically — no service, no
 * database, no config import chain, NO CI-skip guard: these witnesses execute on every CI unit
 * run and on every local machine (deliberately outside the local namespace-collision class and
 * the SQLite-lifecycle skip bucket the heavyweight GraphService spec sits in).
 *
 * The policy under pin: lean = exactly the six hoisted fields; full = the SAME shape plus the
 * complete `properties` bag for ALLOWLISTED types only — because graph-row RLS is row
 * participation, not field authorization (the `MESSAGE` counterexample: a shared row whose
 * `bodyText` is mailbox-audience-gated must never leak through a generic graph read).
 */
test.describe('memory-core nodeProjection — the lean/full policy (#15430)', () => {
    const identityNode = {
        id        : '@projection-witness',
        label     : 'AgentIdentity',
        properties: {name: 'Witness', participationStatus: 'active_full_member', modelFamily: 'kimi', trustTier: 'probation'}
    };

    test('lean (the default) is exactly the six hoisted fields — never a properties key', () => {
        const lean = projectNode(identityNode);

        expect(Object.keys(lean).sort()).toEqual(['description', 'id', 'name', 'semanticVectorId', 'state', 'type']);
        expect(lean.properties).toBeUndefined();
        expect(lean.name).toBe('Witness');
        expect(lean.type).toBe('AgentIdentity')
    });

    test('full on an allowlisted type is the lean SUPERSET plus the complete properties bag', () => {
        const
            lean = projectNode(identityNode),
            full = projectNode(identityNode, 'full');

        expect(full).toMatchObject(lean);
        expect(full.properties.participationStatus).toBe('active_full_member');
        expect(full.properties.modelFamily).toBe('kimi');
        expect(full.properties.trustTier).toBe('probation')
    });

    test('the reviewer falsifier, pinned: a shared-row MESSAGE never reveals bodyText through full', () => {
        // MESSAGE rows are deliberately RLS-moot (sharedEntity: true — every requester sees the
        // row) while the BODY is guarded by the mailbox audience edges. Row visibility is not
        // field authorization: the full projection answers the LEAN shape for this type.
        const full = projectNode({
            id        : 'MESSAGE:projection-guard',
            label     : 'MESSAGE',
            properties: {name: 'audience-gated message', bodyText: 'SECRET-BODY-NEVER-THROUGH-GET-NODE', sharedEntity: true}
        }, 'full');

        expect(full.properties).toBeUndefined();
        expect(Object.keys(full).sort()).toEqual(['description', 'id', 'name', 'semanticVectorId', 'state', 'type']);
        expect(JSON.stringify(full)).not.toContain('SECRET-BODY-NEVER-THROUGH-GET-NODE')
    });

    test('the allowlist is the single authority: only AgentIdentity is currently full-projectable', () => {
        expect([...FULL_PROJECTION_TYPES]).toEqual(['AgentIdentity']);

        for (const label of ['MESSAGE', 'SESSION', 'MEMORY', 'KnowledgeBaseTenantConfig', 'Concept']) {
            const full = projectNode({id: `${label}:x`, label, properties: {secret: 'no'}}, 'full');
            expect(full.properties, `${label} must answer lean`).toBeUndefined()
        }
    });

    test('an unknown projection value degrades to lean — never an accidental widening', () => {
        const projected = projectNode(identityNode, 'FULL');

        expect(projected.properties).toBeUndefined()
    });

    test('an allowlisted node with NO stored properties answers an empty bag on full — honest, not fabricated', () => {
        const full = projectNode({id: '@bare', label: 'AgentIdentity', properties: undefined}, 'full');

        expect(full.properties).toEqual({});
        expect(full.name).toBeUndefined()
    })
});
