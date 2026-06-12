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

function resultSources(result) {
    return (result.results || []).map(row => row.source);
}

function referenceSources(result) {
    return (result.references || []).map(row => row.source);
}

function documentIds(result) {
    return (result.documents || []).map(document => document.id);
}

function toolText(result) {
    return result.content?.map(item => item.text).join('\n') || '';
}

function kbRecord({id, tenantId, source, name, content}) {
    return {
        id,
        content,
        metadata: {
            content,
            inheritanceChain: '[]',
            name,
            repoSlug: 'tenant-app',
            source,
            sourcePath: source,
            tenantId,
            type: 'guide',
            visibility: 'private'
        }
    };
}

test.describe('Dockerized KB cross-tenant isolation integration (#11645)', () => {
    test('public KB facades do not expose another tenant private chunk', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId       = `${Date.now()}-${randomUUID()}`;
        const aliceTenant = `kb-isolation-alice-${runId}`;
        const bobTenant   = `kb-isolation-bob-${runId}`;
        const foreign     = kbRecord({
            id      : `kb-isolation-foreign-${runId}`,
            tenantId: bobTenant,
            source  : `integration/${runId}/bob/Secret.md`,
            name    : 'BobOnly',
            content : `BOB_ONLY_PRIVATE_${runId}`
        });
        const alice       = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-isolation-alice',
            identity  : aliceTenant
        });
        const bob         = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-isolation-bob',
            identity  : bobTenant
        });

        seedKnowledgeBaseRecords([foreign]);

        try {
            const bobVisible = await callJsonTool(bob, 'get_document_by_id', {id: foreign.id});
            expect(bobVisible.id).toBe(foreign.id);

            const forgedQuery = await callJsonTool(alice, 'query_documents', {
                query   : foreign.content,
                limit   : 10,
                tenantId: bobTenant
            });
            expect(resultSources(forgedQuery)).not.toContain(foreign.metadata.source);

            const ask = await callJsonTool(alice, 'ask_knowledge_base', {
                query   : foreign.content,
                limit   : 5,
                tenantId: bobTenant
            });
            expect(referenceSources(ask)).not.toContain(foreign.metadata.source);

            const list = await callJsonTool(alice, 'list_documents', {limit: 1000});
            expect(documentIds(list)).not.toContain(foreign.id);

            const hiddenDocument = await alice.callTool({
                name     : 'get_document_by_id',
                arguments: {id: foreign.id}
            });
            expect(hiddenDocument.isError).toBe(true);
            expect(hiddenDocument.content?.map(item => item.text).join('\n') || '')
                .toContain(`Document with id '${foreign.id}' not found.`);

            const hierarchyArgs = {root: 'Neo.component.Base'};
            const [aliceHierarchy, bobHierarchy] = await Promise.all([
                alice.callTool({name: 'get_class_hierarchy', arguments: hierarchyArgs}),
                bob.callTool({name: 'get_class_hierarchy',   arguments: hierarchyArgs})
            ]);
            expect(aliceHierarchy.isError).toBe(bobHierarchy.isError);
            expect(toolText(aliceHierarchy)).toBe(toolText(bobHierarchy));
        } finally {
            await Promise.allSettled([
                alice.close(),
                bob.close()
            ]);
            deleteKnowledgeBaseRecords([foreign.id]);
        }
    });
});
