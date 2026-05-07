import {test, expect}         from '@playwright/test';
import {createIdentityClient} from './fixtures/identityClient.mjs';

const READY_URL = process.env.NEO_INTEGRATION_READY_URL || 'http://127.0.0.1:13090/ready';
const MC_URL    = process.env.NEO_INTEGRATION_MC_URL    || 'http://127.0.0.1:13001';

async function getReadiness() {
    const response = await fetch(READY_URL);
    return response.json();
}

async function callJsonTool(client, name, args) {
    const result = await client.callTool({name, arguments: args});

    expect(result.isError).not.toBe(true);

    if (result.structuredContent) {
        return result.structuredContent;
    }

    const text = result.content?.find(item => item.type === 'text')?.text;
    expect(text, `MCP tool ${name} should return text content when structuredContent is absent`).toBeTruthy();

    return JSON.parse(text);
}

function memoryTexts(result) {
    return result.results.map(memory => [
        memory.prompt,
        memory.thought,
        memory.response
    ].join('\n')).join('\n');
}

test.describe('Dockerized MC cross-tenant isolation integration (#10895)', () => {
    test('alice and bob only retrieve their own tenant-tagged memories', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId         = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const sessionId     = `integration-tenant-${runId}`;
        const aliceSentinel = `alice-visible-${runId}`;
        const bobSentinel   = `bob-visible-${runId}`;
        const alice         = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-tenant-alice',
            identity  : 'alice'
        });
        const bob           = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-tenant-bob',
            identity  : 'bob'
        });

        try {
            await callJsonTool(alice, 'add_memory', {
                amountToolCalls: 0,
                agent          : 'alice',
                model          : 'integration',
                prompt         : `alice prompt ${aliceSentinel}`,
                response       : `alice response ${aliceSentinel}`,
                sessionId,
                thought        : `alice thought ${aliceSentinel}`,
                toolsUsed      : []
            });
            await callJsonTool(bob, 'add_memory', {
                amountToolCalls: 0,
                agent          : 'bob',
                model          : 'integration',
                prompt         : `bob prompt ${bobSentinel}`,
                response       : `bob response ${bobSentinel}`,
                sessionId,
                thought        : `bob thought ${bobSentinel}`,
                toolsUsed      : []
            });

            const aliceResults = await callJsonTool(alice, 'query_raw_memories', {
                nResults: 10,
                query   : aliceSentinel,
                sessionId
            });
            const bobResults = await callJsonTool(bob, 'query_raw_memories', {
                nResults: 10,
                query   : bobSentinel,
                sessionId
            });
            const aliceText = memoryTexts(aliceResults);
            const bobText   = memoryTexts(bobResults);

            expect(aliceText).toContain(aliceSentinel);
            expect(aliceText).not.toContain(bobSentinel);
            expect(bobText).toContain(bobSentinel);
            expect(bobText).not.toContain(aliceSentinel);
        } finally {
            await Promise.allSettled([
                callJsonTool(alice, 'purge_session', {sessionId}),
                callJsonTool(bob,   'purge_session', {sessionId})
            ]);
            await Promise.allSettled([
                alice.close(),
                bob.close()
            ]);
        }
    });
});
