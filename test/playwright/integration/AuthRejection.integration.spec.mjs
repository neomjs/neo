import {test, expect} from '@playwright/test';
import {
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';

const MC_URL = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

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
            // The 401 rejection above (missing proxy identity) and this successful
            // identity-bearing healthcheck together prove the proxy-header auth path is active.
            // Auth-path observability is a runtime concern, no longer a static healthcheck field.
            const health = await callJsonTool(client, 'healthcheck');

            expect(health.status).toBe('healthy');
        } finally {
            await client.close();
        }
    });
});
