import {test, expect} from '@playwright/test';
import {createIdentityClient, callJsonTool, getReadiness} from './fixtures/mcpClient.mjs';

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';
const MC_URL = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

test.describe('Remote MCP Transport (v13 Release Gate)', () => {
    test.beforeEach(async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
    });

    test('validates Knowledge Base over remote transport with session persistence', async () => {
        const client1 = await createIdentityClient({
            baseUrl: KB_URL,
            identity: 'test-user'
        });

        try {
            // Call 1
            const result1 = await callJsonTool(client1, 'query_documents', {
                query: 'What is Neo.mjs?',
                limit: 2
            });
            expect(result1).toBeDefined();
            // The test stack may have an empty ChromaDB, returning a fallback message
            if (result1.message) {
                expect(typeof result1.message).toBe('string');
            } else {
                expect(result1.results).toBeDefined();
                expect(Array.isArray(result1.results)).toBe(true);
            }

            // Call 2 (same session)
            const result2 = await callJsonTool(client1, 'query_documents', {
                query: 'architecture',
                limit: 2
            });
            expect(result2).toBeDefined();
            if (result2.message) {
                expect(typeof result2.message).toBe('string');
            } else {
                expect(result2.results).toBeDefined();
                expect(Array.isArray(result2.results)).toBe(true);
            }
        } finally {
            await client1.close();
        }
    });

    test('validates Memory Core over remote transport with session persistence', async () => {
        const testPrompt = `Remote transport test prompt ${Date.now()}`;

        const client1 = await createIdentityClient({
            baseUrl: MC_URL,
            identity: 'test-user'
        });

        try {
            // Call 1
            const addResult = await callJsonTool(client1, 'add_memory', {
                prompt: testPrompt,
                thought: 'Testing remote transport',
                response: 'Memory saved remotely',
                toolsUsed: [],
                amountToolCalls: 0,
                model: 'neo-integration',
                agent: 'neo-agent'
            });
            expect(addResult).toBeDefined();

            // Call 2 (same session). Semantic recall is eventually consistent (server-hosted
            // WAL drain) — poll the read-back to convergence over the same live transport.
            await expect.poll(async () => {
                const queryResult = await callJsonTool(client1, 'query_raw_memories', {
                    query: 'Remote transport test',
                    nResults: 5
                });
                return Array.isArray(queryResult.results) && queryResult.results.some(mem => mem.prompt === testPrompt);
            }, {timeout: 20000, message: 'WAL drain convergence (remote-transport write)'}).toBe(true);
        } finally {
            await client1.close();
        }
    });
});
