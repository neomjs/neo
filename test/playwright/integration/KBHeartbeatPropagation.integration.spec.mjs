import {test, expect} from '@playwright/test';
import {assertSustainedHealth} from './util/assertSustainedHealth.mjs';
import {callHealthcheck, getReadiness} from './fixtures/mcpClient.mjs';

const KB_URL = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';

test.describe('KB Heartbeat Propagation Integration (#11644)', () => {
    test.setTimeout(120000);

    test('sustains KB healthcheck collection-state assertions', async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        await assertSustainedHealth({
            probe: () => callHealthcheck(KB_URL),
            onSample(sample, previousSamples) {
                expect(sample.status).toBe('healthy');
                expect(typeof sample.uptime).toBe('number');
                expect(sample.database.connection.connected).toBe(true);
                expect(sample.database.connection.collections.knowledgeBase.exists).toBe(true);

                if (previousSamples.length > 1) {
                    const prev = previousSamples[previousSamples.length - 2];
                    expect(sample.uptime).toBeGreaterThanOrEqual(prev.uptime);
                }
            }
        });
    });
});
