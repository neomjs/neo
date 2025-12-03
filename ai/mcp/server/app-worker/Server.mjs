import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Base from '../../../../src/core/Base.mjs';
import BridgeService from './services/BridgeService.mjs';
import { callTool, listTools } from '../knowledge-base/services/toolService.mjs'; // Reuse existing tool service logic
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @class Neo.ai.mcp.server.app_worker.Server
 * @extends Neo.core.Base
 */
class Server extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.app_worker.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.app_worker.Server'
    }

    /**
     * @member {McpServer|null} mcpServer=null
     */
    mcpServer = null

    /**
     * @member {StdioServerTransport|null} transport=null
     */
    transport = null

    async initAsync() {
        await super.initAsync();

        // 1. Initialize Bridge Service
        // Since it's a singleton, accessing the class triggers instantiation if needed, 
        // but we want to ensure it's started.
        // BridgeService is already started in its construct(), so just ensuring it's loaded is enough.
        console.error('[AppWorker MCP] Bridge Service initialized.');

        // 2. Initialize MCP Server
        this.mcpServer = new McpServer({
            name: 'neo-app-worker',
            version: '1.0.0'
        }, {
            capabilities: {
                tools: {}
            }
        });

        // 3. Load OpenAPI Spec
        const specPath = path.join(__dirname, 'openapi.yaml');
        const spec = yaml.load(fs.readFileSync(specPath, 'utf8'));

        // 4. Register Tools
        // We manually register tools for now to keep it simple, 
        // or we could reuse the dynamic registration if we had a generic one.
        // Let's manually map for clarity and speed.

        this.mcpServer.tool('bridgeReady', {}, async () => {
            const status = BridgeService.getStatus();
            return {
                content: [{ type: 'text', text: JSON.stringify(status) }]
            };
        });

        this.mcpServer.tool('bridgeEvaluate', {
            method: { type: 'string' },
            params: { type: 'array' } // Optional
        }, async ({ method, params }) => {
            try {
                const result = await BridgeService.evaluate({ method, params });
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }]
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        });

        // 5. Connect Transport
        this.transport = new StdioServerTransport();
        await this.mcpServer.connect(this.transport);

        console.error('[AppWorker MCP] Server started on stdio transport');
    }
}

export default Neo.setupClass(Server);
