import {test, expect} from '@playwright/test';
import {createIdentityClient, callJsonTool, getReadiness} from './fixtures/mcpClient.mjs';

const OIDC_URL = process.env.NEO_INTEGRATION_OIDC_URL || 'http://127.0.0.1:13002';

test.describe('OIDC Authentication Fixture', () => {
    test.beforeEach(async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
    });

    test('rejects connection without token when OIDC is configured', async () => {
        const error = await createIdentityClient({
            baseUrl: OIDC_URL,
            identity: null,
            bearerToken: null
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized/i);
    });

    test('rejects connection with spoofed proxy header when OIDC is configured', async () => {
        const error = await createIdentityClient({
            baseUrl: OIDC_URL,
            identity: 'spoofed-user',
            bearerToken: null
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized/i);
    });

    test('rejects connection with invalid bearer token', async () => {
        const error = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'invalid-token'
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|invalid_token/i);
    });

    test('rejects connection with wrong audience token', async () => {
        const error = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'wrong-audience-token'
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|invalid_token/i);
    });

    test('accepts connection with valid token and sets identity via preferred_username', async () => {
        const client = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'valid-test-token'
        });

        const health = await callJsonTool(client, 'healthcheck');
        expect(health.identity).toBeDefined();
        
        // Ensure identity resolves to preferred_username
        expect(health.identity.userId).toBe('neo-test-oidc-user');
        expect(health.identity.source).toBe('oidc');

        await client.close();
    });

    test('accepts connection with valid token and falls back to sub if preferred_username is missing', async () => {
        const client = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'valid-test-token-no-username'
        });

        const health = await callJsonTool(client, 'healthcheck');
        expect(health.identity).toBeDefined();
        
        // Ensure identity resolves to sub
        expect(health.identity.userId).toBe('neo-test-oidc-sub');
        expect(health.identity.source).toBe('oidc');

        await client.close();
    });

    test('validates cross-tenant isolation by verifying bob cannot see alice\'s memories', async () => {
        const aliceClient = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'valid-test-token' // alice -> neo-test-oidc-user
        });

        const bobClient = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'valid-test-token-bob' // bob -> neo-test-oidc-bob
        });

        try {
            // Alice adds a memory
            await callJsonTool(aliceClient, 'add_memory', {
                prompt: 'What is the secret OIDC code?',
                thought: 'Storing secret code',
                response: 'The secret code is OMEGA-99.',
                toolsUsed: [],
                amountToolCalls: 0,
                model: 'neo-integration',
                agent: 'neo-agent'
            });

            // Bob searches for the memory
            const bobResults = await callJsonTool(bobClient, 'query_raw_memories', {
                query: 'secret code',
                nResults: 5
            });

            // Bob should not see Alice's memory
            const foundSecret = bobResults.documents?.flat().some(doc => doc.includes('OMEGA-99'));
            expect(foundSecret).toBe(false);

            // Alice should see her own memory
            const aliceResults = await callJsonTool(aliceClient, 'query_raw_memories', {
                query: 'secret code',
                nResults: 5
            });

            const aliceFoundSecret = aliceResults.documents?.flat().some(doc => doc.includes('OMEGA-99'));
            expect(aliceFoundSecret).toBe(true);

        } finally {
            await aliceClient.close();
            await bobClient.close();
        }
    });
});
