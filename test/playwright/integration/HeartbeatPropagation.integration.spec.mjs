import {test, expect} from '@playwright/test';
import {assertSustainedHealth} from './util/assertSustainedHealth.mjs';
import {callHealthcheck, getReadiness} from './fixtures/mcpClient.mjs';

const KB_URL    = process.env.NEO_INTEGRATION_KB_URL    || 'http://127.0.0.1:13000';
const MC_URL    = process.env.NEO_INTEGRATION_MC_URL    || 'http://127.0.0.1:13001';

test.describe('Heartbeat Propagation Integration (#10896 Lane B)', () => {
    test.setTimeout(120000); // Allow enough time for 30s window and startup

    test('Sustained healthcheck property assertions (30s window)', async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const checkProperties = (sample, previousSamples) => {
            expect(sample.status).toBe('healthy');
            expect(typeof sample.uptime).toBe('number');

            if (previousSamples.length > 1) {
                const prev = previousSamples[previousSamples.length - 2];
                // Monotonic uptime
                expect(sample.uptime).toBeGreaterThanOrEqual(prev.uptime);
            }

            // Provider stability
            if (sample.providers) {
                for (const provider of Object.values(sample.providers)) {
                    expect(provider.error, `Provider should not have an error`).toBeUndefined();
                }
            }

            // Credential persistence
            if (sample.providers?.summary?.credential) {
                expect(sample.providers.summary.credential.configured).toBe(true);
            }

            // Connection persistence
            if (sample.database?.connection) {
                expect(sample.database.connection.connected).toBe(true);
            }
        };

        await Promise.all([
            assertSustainedHealth({
                probe: () => callHealthcheck(KB_URL),
                onSample: checkProperties
            }),
            assertSustainedHealth({
                probe: () => callHealthcheck(MC_URL),
                onSample: checkProperties
            })
        ]);
    });
});
