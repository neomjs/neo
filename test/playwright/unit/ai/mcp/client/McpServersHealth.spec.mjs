import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'McpServersHealthTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Client         from '../../../../../../ai/mcp/client/Client.mjs';

const SERVERS = [
    'github-workflow',
    'file-system',
    'knowledge-base',
    'memory-core',
    'neural-link'
];

test.describe('Neo.ai.mcp.client.Client MCP Servers Health', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket D: MCP server bootstrap requires env vars/substrate');

    // 60 seconds timeout per test to allow server spawn, initialize, and healthcheck (especially if downloading DB or something)
    test.setTimeout(60000);

    for (const serverName of SERVERS) {
        test(`Server '${serverName}' should boot, negotiate JSON-RPC, and respond to healthcheck`, async () => {
            let mcpClient = Neo.create(Client, {
                clientName: 'Neo.ai.MCP.Playwright',
                serverName,
                env       : process.env
            });

            try {
                // Initialize the connection
                await mcpClient.ready();
                expect(mcpClient.connected).toBe(true);

                // Ensure tools are successfully requested and mapped
                const tools = await mcpClient.listTools();
                expect(tools.length).toBeGreaterThan(0);

                const camelCaseTools = Object.keys(mcpClient.tools);

                // Invoke healthcheck if available
                if (camelCaseTools.includes('healthcheck')) {
                    const healthResult = await mcpClient.tools.healthcheck({});
                    expect(healthResult.isError).toBeFalsy();

                    const content = healthResult.content[0].text;
                    const parsed = JSON.parse(content);

                    // State should be healthy or degraded (missing API keys), but not unhealthy
                    expect(['healthy', 'degraded']).toContain(parsed.status);
                } else {
                    // All core Agent OS servers must implement the healthcheck protocol
                    throw new Error(`Server '${serverName}' does not implement the required 'healthcheck' tool.`);
                }
            } finally {
                if (mcpClient) {
                    await mcpClient.close();
                }
            }
        });
    }
});
