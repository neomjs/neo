import {test, expect} from '@playwright/test';
import {callJsonTool, createIdentityClient, getReadiness} from './fixtures/mcpClient.mjs';

const KB_OIDC_URL = process.env.NEO_INTEGRATION_KB_OIDC_URL || 'http://127.0.0.1:13003';

test.describe('KB OIDC Authentication Fixture (#11644)', () => {
    test.beforeEach(async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
    });

    test('rejects connection without token when OIDC is configured', async () => {
        const error = await createIdentityClient({
            baseUrl    : KB_OIDC_URL,
            identity   : null,
            bearerToken: null
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|Missing Authorization header/i);
    });

    test('rejects connection with spoofed proxy header when OIDC is configured', async () => {
        const error = await createIdentityClient({
            baseUrl    : KB_OIDC_URL,
            identity   : 'spoofed-user',
            bearerToken: null
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|Missing Authorization header/i);
    });

    test('rejects connection with invalid bearer token', async () => {
        const error = await createIdentityClient({
            baseUrl    : KB_OIDC_URL,
            bearerToken: 'invalid-token'
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|invalid_token/i);
    });

    test('rejects connection with wrong audience token', async () => {
        const error = await createIdentityClient({
            baseUrl    : KB_OIDC_URL,
            bearerToken: 'wrong-audience-token'
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|invalid_token/i);
    });

    test('accepts connection with valid token', async () => {
        const client = await createIdentityClient({
            baseUrl    : KB_OIDC_URL,
            bearerToken: 'valid-test-token'
        });

        try {
            const health = await callJsonTool(client, 'healthcheck');

            expect(health.status).toBe('healthy');
            expect(health.database.connection.connected).toBe(true);
        } finally {
            await client.close();
        }
    });

    test('accepts connection with valid token when preferred_username is missing', async () => {
        const client = await createIdentityClient({
            baseUrl    : KB_OIDC_URL,
            bearerToken: 'valid-test-token-no-username'
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
