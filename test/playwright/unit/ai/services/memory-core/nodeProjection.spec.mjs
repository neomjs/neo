import {test, expect} from '@playwright/test';
import {projectNode}  from '../../../../../../ai/services/memory-core/nodeProjection.mjs';

/**
 * @summary The graph read verb's projection POLICY, witnessed hermetically — no service, no
 * database, no config import chain, NO CI-skip guard: these witnesses execute on every CI unit
 * run and on every local machine (deliberately outside the local namespace-collision class and
 * the SQLite-lifecycle skip bucket the heavyweight GraphService spec sits in).
 *
 * The policy under pin: lean = exactly the six hoisted fields; full = the SAME shape plus the
 * type's PUBLIC FACT SET — a field-level pick, never the raw bag. Row visibility is not field
 * authorization, twice over: the `MESSAGE` counterexample (shared row, mailbox-audience-gated
 * body) and the auto-provisioned `AgentIdentity` counterexample (globally visible row carrying
 * provider/auth/timing metadata no service signed off for generic reads).
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

    test('full on an allowlisted type is the lean SUPERSET plus the public fact set', () => {
        const
            lean = projectNode(identityNode),
            full = projectNode(identityNode, 'full');

        expect(full).toMatchObject(lean);
        expect(full.properties.participationStatus).toBe('active_full_member');
        expect(full.properties.modelFamily).toBe('kimi');
        expect(full.properties.trustTier).toBe('probation')
    });

    test('the MESSAGE falsifier, pinned: a shared-row MESSAGE never reveals bodyText through full', () => {
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

    test('the auto-provision falsifier, pinned: full is a FIELD-level pick — provider/auth/timing metadata never leaks', () => {
        // Auto-provisioned AgentIdentity rows are globally visible graph nodes whose bags carry
        // provider/auth/timing metadata (the Server auto-provision shape, verbatim fields). Even
        // an allowlisted TYPE must not answer its raw bag: only the public fact set crosses.
        const full = projectNode({
            id        : '@auto-provisioned',
            label     : 'AgentIdentity',
            properties: {
                accountType        : 'agent',
                participationStatus: 'active',
                trustTier          : 'internal_authored',
                authProvider       : 'gitlab',
                authSource         : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.internal.example',
                providerUserId     : '4242',
                providerUsername   : 'secret-principal',
                providerDisplayName: 'Secret Principal',
                autoProvisioned    : true,
                createdAt          : '2026-07-18T00:00:00.000Z',
                lastAuthenticatedAt: '2026-07-18T12:00:00.000Z'
            }
        }, 'full');

        // the public facts cross
        expect(full.properties.participationStatus).toBe('active');
        expect(full.properties.trustTier).toBe('internal_authored');
        expect(full.properties.accountType).toBe('agent');
        expect(full.properties.createdAt).toBe('2026-07-18T00:00:00.000Z');

        // the provider/auth/timing metadata does NOT — by field-level construction
        const serialized = JSON.stringify(full);
        for (const secret of ['authProvider', 'authSource', 'providerBaseUrl', 'providerUserId', 'providerUsername', 'providerDisplayName', 'autoProvisioned', 'lastAuthenticatedAt', 'gitlab.internal.example', 'secret-principal']) {
            expect(serialized, `${secret} must not cross the projection`).not.toContain(secret)
        }
    });

    test('non-allowlisted types answer lean through full — behavior sweep across the graph vocabulary', () => {
        for (const label of ['MESSAGE', 'SESSION', 'MEMORY', 'KnowledgeBaseTenantConfig', 'Concept']) {
            const full = projectNode({id: `${label}:x`, label, properties: {secret: 'no'}}, 'full');
            expect(full.properties, `${label} must answer lean`).toBeUndefined()
        }
    });

    test('an unknown projection value degrades to lean — never an accidental widening', () => {
        const projected = projectNode(identityNode, 'FULL');

        expect(projected.properties).toBeUndefined()
    });

    test('an allowlisted node with NO stored properties answers an empty fact set on full — honest, not fabricated', () => {
        const full = projectNode({id: '@bare', label: 'AgentIdentity', properties: undefined}, 'full');

        expect(full.properties).toEqual({});
        expect(full.name).toBeUndefined()
    })
});
