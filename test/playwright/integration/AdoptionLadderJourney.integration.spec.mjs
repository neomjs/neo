import {randomUUID}                                                       from 'node:crypto';
import {test, expect}                                                     from '@playwright/test';
import {callHealthcheck, callJsonTool, createIdentityClient, getReadiness} from './fixtures/mcpClient.mjs';

/**
 * #11725 Sub D — the incremental adoption-ladder journey proof (Discussion #11718 §8).
 *
 * The per-capability integration specs (`healthcheck`, `RemoteMcpTransport`,
 * `ai/kb-ingestion/multi-tenant`, `BackupRestoreWipe`) each prove ONE rung in isolation.
 * This spec proves the operator JOURNEY: the adoption-ladder milestones run as an ordered,
 * each-independently-verifiable sequence against the same Dockerized cloud-profile stack a
 * fresh operator deploys — the central #11720 mission proof ("a fresh agent/operator
 * completes the adoption ladder without tacit maintainer knowledge").
 *
 * Test-evidence lane (1) — CI-safe deterministic (per @neo-gpt's #11718 test-strategy
 * `DC_kwDODSospM4BA4Rx`): runs against `ai/deploy/docker-compose.test.yml` via the
 * integration `composeWebServer`; no heavyweight local-model inference. Lanes (2) the
 * heavyweight local/docker provider proof and (3) the manual real-world harness demo are
 * kept distinct and are not run here.
 *
 * Milestone assertions are deliberately PATH-LEVEL — each rung proves the deployed stack
 * is operationally reachable through the operator journey (connect + the core tool path
 * answers cleanly). Deep capability assertions (retrieval fidelity, tenant isolation,
 * reconciliation) remain owned by the per-capability specs above; duplicating them here
 * would couple the journey proof to embedding-fixture internals.
 *
 * First slice (`Refs #11725`): milestones 0-2 — the connectivity ladder. Milestones 3-7
 * (tenant ingestion, client-side parser, bulk/backfill path, optional server-side clone,
 * backup → redeploy → handoff) follow as the next slice.
 *
 * @see https://github.com/neomjs/neo/issues/11725
 */

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';
const MC_URL = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

test.describe('Adoption-ladder journey proof — #11725 Sub D (milestones 0-2)', () => {
    test.beforeEach(async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);
    });

    test('Milestone 0 — runnable remote-MCP healthcheck demo: KB and MC answer healthy over /mcp', async () => {
        const [kbHealth, mcHealth] = await Promise.all([
            callHealthcheck(KB_URL),
            callHealthcheck(MC_URL)
        ]);

        expect(kbHealth.status, 'KB healthcheck over /mcp').toBe('healthy');
        expect(mcHealth.status, 'MC healthcheck over /mcp').toBe('healthy');
    });

    test('Milestone 1 — Memory Core connection: the write + query paths answer over remote MCP', async () => {
        const sentinel = `journey-ladder-m1-${randomUUID()}`;
        const client   = await createIdentityClient({
            baseUrl   : MC_URL,
            identity  : 'journey-operator',
            clientName: 'neo-journey-mc'
        });

        try {
            const health = await callJsonTool(client, 'healthcheck');
            expect(health.status, 'MC healthcheck before the round-trip').toBe('healthy');

            const written = await callJsonTool(client, 'add_memory', {
                prompt  : `adoption-ladder milestone 1 — ${sentinel}`,
                thought : 'journey-proof write path reached over remote MCP',
                response: sentinel,
                agent   : 'journey-operator'
            });
            expect(written.id, 'add_memory returns a persisted memory id').toBeTruthy();

            // callJsonTool already asserts the tool did not return isError — reaching here
            // proves the query path answered cleanly for the same operator identity.
            const queried = await callJsonTool(client, 'query_raw_memories', {query: sentinel});
            expect(queried, 'query_raw_memories returns a structured payload').toBeDefined();
        } finally {
            await client.close();
        }
    });

    test('Milestone 2 — Knowledge Base connection: the Neo-shared corpus query path answers over remote MCP', async () => {
        const client = await createIdentityClient({
            baseUrl   : KB_URL,
            identity  : 'journey-operator',
            clientName: 'neo-journey-kb'
        });

        try {
            const health = await callJsonTool(client, 'healthcheck');
            expect(health.status, 'KB healthcheck before the query').toBe('healthy');
            expect(
                health.database.connection.collections.knowledgeBase.exists,
                'the knowledge-base collection exists on the deployed stack'
            ).toBe(true);

            const query = await callJsonTool(client, 'query_documents', {
                query: 'What is Neo.mjs?',
                limit: 2
            });

            // The deployed KB may or may not be pre-seeded with the Neo-shared corpus; the
            // journey rung proves the query PATH answers cleanly, so accept either a
            // structured result set or an explicit empty-corpus message.
            if (query.message) {
                expect(typeof query.message, 'an empty-corpus query returns a message string').toBe('string');
            } else {
                expect(Array.isArray(query.results), 'query_documents returns a results array').toBe(true);
            }
        } finally {
            await client.close();
        }
    });
});
