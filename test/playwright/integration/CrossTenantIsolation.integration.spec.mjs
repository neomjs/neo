import {randomUUID} from 'node:crypto';
import {test, expect} from '@playwright/test';
import {
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';

const MC_URL = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

function memoryTexts(result) {
    return result.results.map(memory => [
        memory.prompt,
        memory.thought,
        memory.response
    ].join('\n')).join('\n');
}

test.describe('Dockerized MC cross-tenant isolation integration (#10895)', () => {
    test('private isolates per-tenant; the team default reads deployment-wide (#12527)', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId         = `${Date.now()}-${randomUUID()}`;
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

            // Semantic recall is eventually consistent (server-hosted WAL drain) — await
            // convergence of BOTH writes before asserting the isolation contract below.
            await expect.poll(async () => {
                const [a, b] = await Promise.all([
                    callJsonTool(alice, 'query_raw_memories', {nResults: 10, query: aliceSentinel, sessionId, memorySharing: 'private'}),
                    callJsonTool(bob,   'query_raw_memories', {nResults: 10, query: bobSentinel,   sessionId, memorySharing: 'private'})
                ]);
                return memoryTexts(a).includes(aliceSentinel) && memoryTexts(b).includes(bobSentinel);
            }, {timeout: 20000, message: 'WAL drain convergence (alice + bob writes)'}).toBe(true);

            // Under explicit `private` policy the cross-tenant leak guard holds: each identity
            // retrieves only its own tenant-tagged memories — the isolation contract multi-tenant
            // SaaS forks rely on (see PR security posture).
            const alicePrivate = await callJsonTool(alice, 'query_raw_memories', {
                nResults     : 10,
                query        : aliceSentinel,
                sessionId,
                memorySharing: 'private'
            });
            const bobPrivate = await callJsonTool(bob, 'query_raw_memories', {
                nResults     : 10,
                query        : bobSentinel,
                sessionId,
                memorySharing: 'private'
            });
            const alicePrivateText = memoryTexts(alicePrivate);
            const bobPrivateText   = memoryTexts(bobPrivate);

            expect(alicePrivateText).toContain(aliceSentinel);
            expect(alicePrivateText).not.toContain(bobSentinel);
            expect(bobPrivateText).toContain(bobSentinel);
            expect(bobPrivateText).not.toContain(aliceSentinel);

            // Under the team DEFAULT (no override) raw memory is a deployment-wide commons: alice
            // reads bob's same-session record (transparent swarm introspection) — the operator
            // PRIO-1 behavior the default flip delivers.
            const aliceTeamView = await callJsonTool(alice, 'query_raw_memories', {
                nResults: 10,
                query   : bobSentinel,
                sessionId
            });
            expect(memoryTexts(aliceTeamView)).toContain(bobSentinel);
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
