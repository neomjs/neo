import {test, expect}         from '@playwright/test';
import {Client}               from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path                   from 'node:path';
import {fileURLToPath}        from 'node:url';
import {callJsonTool, createIdentityClient, getReadiness} from './fixtures/mcpClient.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../..');
const SERVER_PATH = path.join(repoRoot, 'ai/mcp/server/knowledge-base/mcp-server.mjs');
const KB_URL      = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';

test.describe('KB Remote MCP Transport (#11644)', () => {
    test('validates KB remote transport with session persistence across multiple tools', async () => {
        const readiness = await getReadiness();
        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const client = await createIdentityClient({
            baseUrl   : KB_URL,
            clientName: 'neo-integration-kb-remote',
            identity  : 'kb-remote-user'
        });

        try {
            const health = await callJsonTool(client, 'healthcheck');
            expect(health.status).toBe('healthy');

            const documents = await callJsonTool(client, 'list_documents', {
                limit : 1,
                offset: 0
            });
            expect(documents).toBeDefined();

            const query = await callJsonTool(client, 'query_documents', {
                query: 'What is Neo.mjs?',
                limit: 2
            });
            expect(query).toBeDefined();
            if (query.message) {
                expect(typeof query.message).toBe('string');
            } else {
                expect(Array.isArray(query.results)).toBe(true);
            }
        } finally {
            await client.close();
        }
    });

    test('validates KB stdio transport tool surface', async () => {
        const transport = new StdioClientTransport({
            command: 'node',
            args   : [SERVER_PATH],
            env    : {
                ...process.env,
                NEO_AUTO_SYNC             : 'false',
                NEO_KB_AUTO_START_DATABASE: 'false',
                NEO_TRANSPORT             : 'stdio'
            }
        });

        const client = new Client({
            name   : 'neo-integration-kb-stdio',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        try {
            await client.connect(transport);

            const {tools} = await client.listTools();
            const names   = tools.map(tool => tool.name);

            expect(names).toContain('healthcheck');
            expect(names).toContain('query_documents');
            expect(names).toContain('list_documents');
        } finally {
            await transport.close();
        }
    });
});
