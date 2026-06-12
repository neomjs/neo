import {randomUUID}   from 'node:crypto';
import {test, expect} from '@playwright/test';
import {
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';
import {
    deleteKnowledgeBaseRecords,
    seedKnowledgeBaseRecords
} from './fixtures/kbTenantRecords.mjs';

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';

function sourcesFromQuery(result) {
    return (result.results || []).map(row => row.source);
}

function documentsById(result) {
    return new Map((result.documents || []).map(document => [document.id, document]));
}

function kbRecord({id, tenantId, source, name, content}) {
    return {
        id,
        content,
        metadata: {
            content,
            inheritanceChain: '[]',
            name,
            repoSlug: tenantId === 'neo-shared' ? 'neo' : 'tenant-app',
            source,
            sourcePath: source,
            tenantId,
            type: 'guide',
            visibility: tenantId === 'neo-shared' ? 'team' : 'private'
        }
    };
}

test.describe('Dockerized KB team/private retrieval integration (#11645)', () => {
    test('tenant clients see own private chunks plus neo-shared chunks only', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId       = `${Date.now()}-${randomUUID()}`;
        const aliceTenant = `kb-team-alice-${runId}`;
        const bobTenant   = `kb-team-bob-${runId}`;
        const own         = kbRecord({
            id      : `kb-team-own-${runId}`,
            tenantId: aliceTenant,
            source  : `integration/${runId}/alice/Own.md`,
            name    : 'AliceOwn',
            content : `ALICE_PRIVATE_VISIBLE_${runId}`
        });
        const foreign     = kbRecord({
            id      : `kb-team-foreign-${runId}`,
            tenantId: bobTenant,
            source  : `integration/${runId}/bob/Secret.md`,
            name    : 'BobSecret',
            content : `BOB_PRIVATE_HIDDEN_${runId}`
        });
        const shared      = kbRecord({
            id      : `kb-team-shared-${runId}`,
            tenantId: 'neo-shared',
            source  : `integration/${runId}/shared/Curated.md`,
            name    : 'SharedCurated',
            content : `NEO_SHARED_VISIBLE_${runId}`
        });
        const records     = [own, foreign, shared];
        const alice       = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-team-alice',
            identity  : aliceTenant
        });
        const bob         = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-team-bob',
            identity  : bobTenant
        });

        seedKnowledgeBaseRecords(records);

        try {
            const [aliceList, bobList] = await Promise.all([
                callJsonTool(alice, 'list_documents', {limit: 1000}),
                callJsonTool(bob,   'list_documents', {limit: 1000})
            ]);
            const aliceDocs = documentsById(aliceList);
            const bobDocs   = documentsById(bobList);

            expect(aliceDocs.has(own.id)).toBe(true);
            expect(aliceDocs.has(shared.id)).toBe(true);
            expect(aliceDocs.has(foreign.id)).toBe(false);
            expect(bobDocs.has(foreign.id)).toBe(true);
            expect(bobDocs.has(shared.id)).toBe(true);
            expect(bobDocs.has(own.id)).toBe(false);

            const [aliceOwnQuery, aliceSharedQuery, bobSharedQuery] = await Promise.all([
                callJsonTool(alice, 'query_documents', {query: own.content, limit: 10}),
                callJsonTool(alice, 'query_documents', {query: shared.content, limit: 10}),
                callJsonTool(bob,   'query_documents', {query: shared.content, limit: 10})
            ]);

            expect(sourcesFromQuery(aliceOwnQuery)).toContain(own.metadata.source);
            expect(sourcesFromQuery(aliceOwnQuery)).not.toContain(foreign.metadata.source);
            expect(sourcesFromQuery(aliceSharedQuery)).toContain(shared.metadata.source);
            expect(sourcesFromQuery(bobSharedQuery)).toContain(shared.metadata.source);
        } finally {
            await Promise.allSettled([
                alice.close(),
                bob.close()
            ]);
            deleteKnowledgeBaseRecords(records.map(record => record.id));
        }
    });
});
