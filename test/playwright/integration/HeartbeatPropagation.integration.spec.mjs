import {test, expect} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertSustainedHealth} from './util/assertSustainedHealth.mjs';

const READY_URL = process.env.NEO_INTEGRATION_READY_URL || 'http://127.0.0.1:13090/ready';
const KB_URL    = process.env.NEO_INTEGRATION_KB_URL    || 'http://127.0.0.1:13000';
const MC_URL    = process.env.NEO_INTEGRATION_MC_URL    || 'http://127.0.0.1:13001';

async function getReadiness() {
    const response = await fetch(READY_URL);
    return response.json();
}

async function callHealthcheck(baseUrl) {
    const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl));
    const client    = new Client({
        name   : 'neo-integration-heartbeat',
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    await client.connect(transport);

    try {
        const result = await client.callTool({name: 'healthcheck', arguments: {}});
        expect(result.isError).not.toBe(true);

        if (result.structuredContent) {
            return result.structuredContent;
        }

        const text = result.content?.find(item => item.type === 'text')?.text;
        expect(text, 'MCP healthcheck should return text content').toBeTruthy();

        return JSON.parse(text);
    } finally {
        await client.close();
    }
}

test.describe('Heartbeat Propagation Integration (#10896 Lane B)', () => {
    test.setTimeout(120000); // Allow enough time for 30s window and startup

    test('Sustained healthcheck property assertions (30s window)', async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const checkProperties = (sample, previousSamples) => {
            if (previousSamples.length > 1) {
                const prev = previousSamples[previousSamples.length - 2];
                // Monotonic uptime
                expect(sample.uptime).toBeGreaterThan(prev.uptime);
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
