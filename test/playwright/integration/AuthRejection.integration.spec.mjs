import {test, expect}         from '@playwright/test';
import {createIdentityClient} from './fixtures/identityClient.mjs';

const READY_URL = process.env.NEO_INTEGRATION_READY_URL || 'http://127.0.0.1:13090/ready';
const MC_URL    = process.env.NEO_INTEGRATION_MC_URL    || 'http://127.0.0.1:13001';

async function getReadiness() {
    const response = await fetch(READY_URL);
    return response.json();
}

async function readToolJson(result) {
    if (result.structuredContent) {
        return result.structuredContent;
    }

    const text = result.content?.find(item => item.type === 'text')?.text;
    expect(text, 'MCP tool should return text content when structuredContent is absent').toBeTruthy();

    return JSON.parse(text);
}

test.describe('Dockerized MC proxy identity rejection integration (#10895)', () => {
    test('MC rejects missing proxy identity and accepts an identity-bearing client', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        let rejectionError;
        let unexpectedClient;

        try {
            unexpectedClient = await createIdentityClient({
                baseUrl   : MC_URL,
                clientName: 'neo-integration-auth-rejection'
            });
        } catch (error) {
            rejectionError = error;
        } finally {
            await unexpectedClient?.close();
        }

        expect(rejectionError).toBeTruthy();
        expect(String(rejectionError?.message || rejectionError)).toMatch(/401|Unauthorized/i);

        const client = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-auth-positive',
            identity  : 'alice-auth-positive'
        });

        try {
            const health = await readToolJson(await client.callTool({name: 'healthcheck', arguments: {}}));

            expect(health.status).toBe('healthy');
            expect(health.providers.auth.configured).toBe('proxy-header');
            expect(health.providers.auth.proxyHeader.trusted).toBe(true);
        } finally {
            await client.close();
        }
    });
});
