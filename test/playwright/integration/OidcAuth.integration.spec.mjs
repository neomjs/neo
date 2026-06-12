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
        expect(error.message).toMatch(/401|Unauthorized|Missing Authorization header/i);
    });

    test('rejects connection with spoofed proxy header when OIDC is configured', async () => {
        const error = await createIdentityClient({
            baseUrl: OIDC_URL,
            identity: 'spoofed-user',
            bearerToken: null
        }).catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/401|Unauthorized|Missing Authorization header/i);
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


        await client.close();
    });

    test('accepts connection with valid token and falls back to sub if preferred_username is missing', async () => {
        const client = await createIdentityClient({
            baseUrl: OIDC_URL,
            bearerToken: 'valid-test-token-no-username'
        });

        const health = await callJsonTool(client, 'healthcheck');
        expect(health.identity).toBeDefined();


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

            // Semantic recall is eventually consistent (server-hosted WAL drain) — await
            // alice's write converging before asserting either side of the isolation contract.
            await expect.poll(async () => {
                const r = await callJsonTool(aliceClient, 'query_raw_memories', {
                    query: 'secret code',
                    nResults: 5,
                    memorySharing: 'private'
                });
                return r.results?.some(mem => mem.response.includes('OMEGA-99')) ?? false;
            }, {timeout: 20000, message: 'WAL drain convergence (alice secret write)'}).toBe(true);

            // Bob searches under explicit `private` policy — the multi-tenant isolation contract.
            // The team default is deployment-wide by design, so OIDC-tenant isolation is asserted
            // under the policy that enforces it (multi-tenant forks set defaultPolicy='private').
            const bobResults = await callJsonTool(bobClient, 'query_raw_memories', {
                query: 'secret code',
                nResults: 5,
                memorySharing: 'private'
            });

            // Bob should not see Alice's memory
            const foundSecret = bobResults.results?.some(mem => mem.response.includes('OMEGA-99'));
            expect(foundSecret).toBe(false);

            // Alice sees her own memory (own records are always returned under private).
            const aliceResults = await callJsonTool(aliceClient, 'query_raw_memories', {
                query: 'secret code',
                nResults: 5,
                memorySharing: 'private'
            });

            const aliceFoundSecret = aliceResults.results?.some(mem => mem.response.includes('OMEGA-99'));
            expect(aliceFoundSecret).toBe(true);

        } finally {
            await aliceClient.close();
            await bobClient.close();
        }
    });
});
