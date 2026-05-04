import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'McpServersIsolationTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

import Neo from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import Client from '../../../../../../ai/mcp/client/Client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const targetSpecPath = path.resolve(__dirname, '../../../../../../ai/mcp/server/knowledge-base/openapi.yaml');
const backupSpecPath = path.resolve(__dirname, '../../../../../../ai/mcp/server/knowledge-base/openapi.yaml.bak');

test.describe('Neo.ai.mcp.client.Client Server Isolation', () => {
    test.setTimeout(60000);

    test.beforeAll(() => {
        // We now inject the broken spec path via environment variable
        // to avoid race conditions with parallel tests reading the real openapi.yaml
        const malformedPath = path.resolve(__dirname, 'broken-openapi.yaml');
        fs.writeFileSync(malformedPath, 'this: is: [ malformed: yaml', 'utf8');
        process.env.TEST_CORRUPT_OPENAPI = malformedPath;
    });

    test.afterAll(() => {
        const malformedPath = path.resolve(__dirname, 'broken-openapi.yaml');
        if (fs.existsSync(malformedPath)) {
            fs.rmSync(malformedPath);
        }
        delete process.env.TEST_CORRUPT_OPENAPI;
    });

    test('Broken server (knowledge-base) should still boot in degraded mode', async () => {
        let mcpClient = Neo.create(Client, {
            clientName: 'Neo.ai.MCP.IsolationTest',
            serverName: 'knowledge-base',
            env       : process.env
        });

        try {
            // Should still connect because the server itself doesn't crash on boot now
            await mcpClient.ready();
            expect(mcpClient.connected).toBe(true);
            
            const tools = await mcpClient.listTools();
            // The server itself survived the boot and accepts connections!
            // However, because openapi.yaml is malformed, it cannot parse any tools.
            expect(tools.length).toBe(0);
        } finally {
            if (mcpClient) {
                await mcpClient.close();
            }
        }
    });

    test('Healthy server (memory-core) should boot completely unaffected by sibling failure', async () => {
        let mcpClient = Neo.create(Client, {
            clientName: 'Neo.ai.MCP.IsolationTest',
            serverName: 'memory-core',
            env       : process.env
        });

        try {
            await mcpClient.ready();
            expect(mcpClient.connected).toBe(true);
            
            const tools = await mcpClient.listTools();
            expect(tools.length).toBeGreaterThan(0);
        } finally {
            if (mcpClient) {
                await mcpClient.close();
            }
        }
    });
});
