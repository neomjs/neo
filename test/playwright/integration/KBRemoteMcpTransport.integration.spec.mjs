import {test, expect} from '@playwright/test';
import {callJsonTool, createIdentityClient, getReadiness} from './fixtures/mcpClient.mjs';

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';

test.describe('KB Remote MCP Transport (#11644)', () => {
    test.beforeEach(async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);
    });

    test('validates KB remote transport with session persistence across multiple tools', async () => {
        const client = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-remote',
            identity  : 'kb-remote-user'
        });

        try {
            const health = await callJsonTool(client, 'healthcheck');
            expect(health.status).toBe('healthy');

            const documents = await callJsonTool(client, 'list_documents', {
                limit : 1,
                offset: 0
            });
            expect(documents).toBeDefined();

            const query = await callJsonTool(client, 'query_documents', {
                query: 'What is Neo.mjs?',
                limit: 2
            });
            expect(query).toBeDefined();
            if (query.message) {
                expect(typeof query.message).toBe('string');
            } else {
                expect(Array.isArray(query.results)).toBe(true);
            }
        } finally {
            await client.close();
        }
    });
});
