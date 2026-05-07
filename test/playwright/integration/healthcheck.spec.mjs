import {test, expect}                   from '@playwright/test';
import {Client}                         from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport}  from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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
        name   : 'neo-integration-healthcheck',
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
        expect(text, 'MCP healthcheck should return text content when structuredContent is absent').toBeTruthy();

        return JSON.parse(text);
    } finally {
        await client.close();
    }
}

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
        expect(mcHealth.database.topology.mode).toBe('unified');
        expect(mcHealth.database.topology.resolvedVia).toBe('engines.kb.chroma');
        expect(mcHealth.database.connection.collections.memories.exists).toBe(true);
        expect(mcHealth.database.connection.collections.summaries.exists).toBe(true);
        expect(mcHealth.providers.embedding.active).toBe('openAiCompatible');
        expect(mcHealth.providers.embedding.error).toBeUndefined();
        expect(mcHealth.providers.summary.active).toBe('openAiCompatible');
        expect(mcHealth.providers.summary.credential.configured).toBe(true);
    });
});
