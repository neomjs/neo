import {test, expect}         from '@playwright/test';
import {Client}               from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path                   from 'path';
import {fileURLToPath}        from 'url';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, '../../../ai/mcp/server/neural-link/mcp-stdio.mjs');

test.describe('Neural Link MCP', () => {
    let client;
    let transport;

    test.beforeAll(async () => {
        transport = new StdioClientTransport({
            command: 'node',
            args: [SERVER_PATH]
        });

        client = new Client({
            name: 'test-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await client.connect(transport);
    });

    test.afterAll(async () => {
        await transport.close();
    });

    test('Neural Link: End-to-End RPC', async () => {
        // We expect this to fail with "Session not found" because no browser is connected
        // But it proves the server is running and ConnectionService is initialized
        try {
            await client.callTool({
                name     : 'get_component_tree',
                arguments: {}
            });
        } catch (error) {
            // If the server crashes, we get "Connection closed"
            // If it works but logic fails (expected), we get "Session not found"
            if (error.message.includes('Connection closed')) {
                throw error;
            }
            expect(error.message).toContain('Session not found');
        }
    });
});
