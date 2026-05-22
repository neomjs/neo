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
 * Ladder coverage (`Refs #11725`): milestones 0-5 run as LIVE rungs — the connectivity
 * ladder (0-2) plus tenant ingestion (3), the `parsed-chunk-v1` client-side-parser
 * transport gate (4), and the bulk/backfill volume gate (5). Milestones 6-7 are
 * documented-DEFERRED rungs, not fabricated assertions: server-side clone (6) is post-MVP
 * (#11731 exploration; ADR 0014 D3 keeps it out of the MVP profile) and the full
 * backup → redeploy → handoff round-trip (7) is owned by the per-capability backup specs
 * plus test-evidence lane (3) — a single Playwright spec cannot redeploy the
 * `composeWebServer` stack mid-run. Each deferred rung carries a precise `test.skip`
 * citation so the ladder reaches all 8 milestones without over-claiming.
 *
 * @see https://github.com/neomjs/neo/issues/11725
 */

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';
const MC_URL = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

/**
 * Builds a well-formed `parsed-chunk-v1` record — the shape a fresh operator's client-side
 * parser emits. Mirrors the golden `expected-chunks.jsonl` fixture field set so the deployed
 * Knowledge Base's Ajv `parsed-chunk-v1` validator accepts it verbatim.
 * @param {String} sentinel       A per-run unique marker.
 * @param {Object} [overrides={}] Fields to override (e.g. a contract-violating `schemaVersion`).
 * @returns {Object} A `parsed-chunk-v1` record.
 */
function journeyParsedChunk(sentinel, overrides = {}) {
    return {
        schemaVersion: '1.0.0',
        tenantId     : 'journey-operator',
        repoSlug     : 'journey-ladder',
        rootKind     : 'neo-workspace',
        sourcePath   : `journey/${sentinel}.mjs`,
        content      : `adoption-ladder journey chunk — ${sentinel}`,
        hashInputs   : ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
        parserId     : 'journey-fixture-parser',
        parserVersion: '1.0.0',
        kind         : 'module-context',
        name         : 'Journey.AdoptionLadder',
        className    : 'Journey.AdoptionLadder',
        ...overrides
    };
}

test.describe('Adoption-ladder journey proof — #11725 Sub D (milestones 0-7)', () => {
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

    test('Milestone 3 — tenant ingestion: the operator pushes parsed source content into their tenant over remote MCP', async () => {
        const sentinel = `journey-ladder-m3-${randomUUID()}`;
        const client   = await createIdentityClient({
            baseUrl   : KB_URL,
            identity  : 'journey-operator',
            clientName: 'neo-journey-kb-ingest'
        });

        try {
            const pushResult = await callJsonTool(client, 'ingest_source_files', {
                tenantId: 'journey-operator',
                repoSlug: 'journey-ladder',
                files   : [{parsedChunks: [journeyParsedChunk(sentinel)]}]
            });

            // Path-level: the tenant write path answered cleanly. Deep tenant-isolation and
            // retrieval-fidelity assertions stay owned by ai/kb-ingestion/multi-tenant.spec.
            expect(pushResult.errors, 'a well-formed parsed chunk ingests without errors').toEqual([]);
            expect(pushResult.ingested, 'ingest_source_files reports the chunk persisted').toBeGreaterThan(0);
        } finally {
            await client.close();
        }
    });

    test('Milestone 4 — client-side parser: the deployed KB enforces the parsed-chunk-v1 transport contract', async () => {
        const sentinel = `journey-ladder-m4-${randomUUID()}`;
        const client   = await createIdentityClient({
            baseUrl   : KB_URL,
            identity  : 'journey-operator',
            clientName: 'neo-journey-kb-parser'
        });

        try {
            // A remote operator cannot register a server-side parser — the only ingestion
            // path is client-side parsing into `parsed-chunk-v1` records. This rung proves
            // the deployed server enforces that transport contract: a contract-violating
            // chunk is rejected with structured, machine-readable feedback, not a crash.
            const rejected = await callJsonTool(client, 'ingest_source_files', {
                tenantId: 'journey-operator',
                repoSlug: 'journey-ladder',
                files   : [{parsedChunks: [journeyParsedChunk(sentinel, {schemaVersion: '0.9.0'})]}]
            });

            expect(Array.isArray(rejected.errors), 'the transport gate returns a structured errors array').toBe(true);
            expect(rejected.errors.length, 'the contract-violating chunk surfaces at least one error').toBeGreaterThan(0);
            expect(
                rejected.errors.every(error => typeof error.code === 'string'),
                'each transport-gate error carries a machine-readable code'
            ).toBe(true);
        } finally {
            await client.close();
        }
    });

    test('Milestone 5 — bulk/backfill: an over-threshold push is refused by the volume gate, not embedded inline', async () => {
        const sentinel = `journey-ladder-m5-${randomUUID()}`;
        const client   = await createIdentityClient({
            baseUrl   : KB_URL,
            identity  : 'journey-operator',
            clientName: 'neo-journey-kb-bulk'
        });

        // 60 raw files clear the deployed `mcpSyncMaxChunks` default (50). The volume gate
        // refuses up-front — before embedding — so this rung stays cheap.
        const oversizedBatch = Array.from({length: 60}, (_, index) => ({
            path   : `journey/bulk-${index}-${sentinel}.mjs`,
            content: `adoption-ladder bulk backfill chunk ${index} — ${sentinel}`
        }));

        try {
            const result    = await client.callTool({
                name     : 'ingest_source_files',
                arguments: {tenantId: 'journey-operator', repoSlug: 'journey-ladder', files: oversizedBatch}
            });
            const errorText = result.content?.find(item => item.type === 'text')?.text || '';

            // Path-level: the operator who exceeds the per-call limit is REFUSED up-front —
            // the deployed server returns a volume-gate tool error directing the operator to
            // split the batch, rather than embedding 60 chunks inline. Over remote MCP the
            // gate surfaces as an isError result (BaseServer wraps any `{error}` payload), so
            // the structured KB_INGEST_VOLUME_EXCEEDED contract (code / bulkPath) stays owned
            // by the in-process ai/kb-ingestion/multi-tenant.spec coverage.
            expect(result.isError, 'an over-threshold push is refused, not embedded inline').toBe(true);
            expect(errorText, 'the refusal identifies the work-volume gate').toContain('work volume exceeds');
            expect(errorText, 'the refusal echoes the rejected batch volume').toContain('Batch volume 60');
        } finally {
            await client.close();
        }
    });

    test('Milestone 6 — optional server-side clone: post-MVP, not in the deployed MVP profile', async () => {
        test.skip(true,
            'Server-side repo-clone ingestion is post-MVP — owned by #11731 (exploration) and ' +
            'kept out of the MVP cloud profile by ADR 0014 (D3). The MVP adoption ladder is ' +
            'push-ingestion: a fresh operator pushes parsed-chunk-v1 records through milestones ' +
            '3-5. This rung stays a deliberate no-op until #11731 adopts or rejects pull ' +
            'ingestion (see #11740 for the ADR-amendment escape hatch).'
        );
    });

    test('Milestone 7 — backup → redeploy → handoff: round-trip owned by the per-capability backup specs', async () => {
        test.skip(true,
            'The backup → wipe → restore round-trip is owned by KBBackupRestoreWipe.integration.spec.mjs ' +
            '(#11644) and BackupRestoreWipe.integration.spec.mjs. The full redeploy → handoff demo — ' +
            'stopping and recreating the container stack — is test-evidence lane (3), the manual ' +
            'real-world harness, explicitly out of the lane-(1) CI-safe scope per this spec header: a ' +
            'single Playwright spec running against an already-up composeWebServer cannot redeploy ' +
            'the stack mid-run without breaking sibling specs.'
        );
    });
});
