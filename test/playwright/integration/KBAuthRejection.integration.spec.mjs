import {test, expect} from '@playwright/test';
import {
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';

test.describe('Dockerized KB proxy identity rejection integration (#11644)', () => {
    test('KB rejects missing proxy identity and accepts an identity-bearing client', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        let rejectionError;
        let unexpectedClient;

        try {
            unexpectedClient = await createIdentityClient({
                baseUrl   : KB_URL,
                clientName: 'neo-integration-kb-auth-rejection'
            });
        } catch (error) {
            rejectionError = error;
        } finally {
            await unexpectedClient?.close();
        }

        expect(rejectionError).toBeTruthy();
        expect(String(rejectionError?.message || rejectionError)).toMatch(/401|Unauthorized/i);

        const client = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-auth-positive',
            identity  : 'kb-auth-positive'
        });

        try {
            const health = await callJsonTool(client, 'healthcheck');

            expect(health.status).toBe('healthy');
            expect(health.database.connection.connected).toBe(true);
        } finally {
            await client.close();
        }
    });
});
