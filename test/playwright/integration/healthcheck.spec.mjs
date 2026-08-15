import {test, expect}                  from '@playwright/test';
import {assertSustainedHealth}         from './util/assertSustainedHealth.mjs';
import {callHealthcheck, getReadiness} from './fixtures/mcpClient.mjs';

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';
const MC_URL = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

test.describe('Dockerized KB/MC MCP healthcheck integration (#10805 Lane A)', () => {
    test('KB and MC expose healthcheck tool payloads over /mcp', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const [kbHealth, mcHealth] = await Promise.all([
            callHealthcheck(KB_URL),
            callHealthcheck(MC_URL)
        ]);

        expect(kbHealth.status).toBe('healthy');
        expect(kbHealth.database.connection.connected).toBe(true);
        expect(kbHealth.database.connection.collections.knowledgeBase.exists).toBe(true);
        expect(kbHealth.features.embedding).toBe(true);

        expect(mcHealth.status).toBe('healthy');
        expect(mcHealth.database.connection.connected).toBe(true);
        expect(mcHealth.database.connection.collections.memories.exists).toBe(true);
        expect(mcHealth.database.connection.collections.summaries.exists).toBe(true);
        expect(mcHealth.providers.embedding.active).toBe('openAiCompatible');
        expect(mcHealth.providers.embedding.error).toBeUndefined();
        expect(mcHealth.providers.summary.active).toBe('openAiCompatible');
    });

    test('Sustained liveness composability check (Lane B helper) — 5s/1s', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        // This check's subject is COMPOSABILITY — that two helper invocations run concurrently under
        // Promise.all and both come back — not tail latency. Its 5s/1s window yields five samples,
        // which is below MIN_PERCENTILE_SAMPLES, so a p95 here would silently be the max: one slow
        // probe out of five reddens the merge queue under a budget that reads as tail-tolerant.
        //
        // So the latency assertion is a `maxMs` ceiling, named for the statistic five samples can
        // actually support. It is deliberately generous — it exists to catch a plane that has gone
        // pathologically slow, not to hold an SLO this test was never the right place to hold.
        const LIVENESS_CEILING_MS = 5000;

        await Promise.all([
            assertSustainedHealth({ probe: () => callHealthcheck(KB_URL), windowMs: 5000, intervalMs: 1000, p95Ms: null, maxMs: LIVENESS_CEILING_MS }),
            assertSustainedHealth({ probe: () => callHealthcheck(MC_URL), windowMs: 5000, intervalMs: 1000, p95Ms: null, maxMs: LIVENESS_CEILING_MS })
        ]);
    });
});
