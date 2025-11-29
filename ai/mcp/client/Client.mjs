import { Client as McpSdkClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport }     from '@modelcontextprotocol/sdk/client/stdio.js';
import Base                         from '../../../src/core/Base.mjs';
import ClientConfig                 from './config.mjs'; // Import the new config singleton

/**
 * @summary A generic MCP Client that can connect to any local MCP server via Stdio.
 *
 * This class wraps the official MCP SDK Client in a Neo.mjs class structure.
 * It handles the connection lifecycle and tool discovery.
 *
 * @class Neo.ai.mcp.client.Client
 * @extends Neo.core.Base
 */
class Client extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.client.Client'
         * @protected
         */
        className: 'Neo.ai.mcp.client.Client',
        /**
         * The logical name of the MCP server to connect to (e.g., 'github-workflow').
         * This name will be used to look up connection details from ClientConfig.
         * @member {String} serverName_='github-workflow'
         * @reactive
         */
        serverName_: 'github-workflow', // New reactive config
        /**
         * The command to run (e.g. "node")
         * @member {String|null} command=null // Will be loaded from config
         */
        command: null,
        /**
         * The arguments for the command (e.g. ["./path/to/server.mjs"])
         * @member {String[]|null} args=null // Will be loaded from config
         */
        args: null,
        /**
         * Environment variables to pass to the spawned process
         * @member {Object} env={}
         */
        env: {},
        /**
         * The name of the client to announce to the server
         * @member {String} clientName='Neo.ai.Agent'
         */
        clientName: 'Neo.ai.Agent',
        /**
         * The version of the client to announce
         * @member {String} clientVersion='1.0.0'
         */
        clientVersion: '1.0.0'
    }

    /**
     * @protected
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetServerName(value, oldValue) {
        if (value) {
            this.loadServerConfig(value);
        }
    }

    /**
     * The MCP SDK Client instance.
     * @member {McpSdkClient|null} client=null
     * @protected
     */
    client = null

    /**
     * The Transport instance.
     * @member {StdioClientTransport|null} transport=null
     * @protected
     */
    transport = null

    async initAsync() {
        await super.initAsync();
        // Load initial server config based on the default or provided serverName
        this.loadServerConfig(this.serverName);
    }

    /**
     * Loads the server connection details from the ClientConfig singleton.
     * @param {String} serverName The name of the server to load.
     * @protected
     */
    loadServerConfig(serverName) {
        const serverConfig = ClientConfig.mcpServers[serverName];
        if (!serverConfig) {
            throw new Error(`MCP Client: Server config not found for '${serverName}' in ai/mcp/client/config.mjs`);
        }
        this.command = serverConfig.command;
        this.args = serverConfig.args;
        // Note: env from config.mjs is not explicitly merged here,
        // assuming agent will manage its own env (like GH_TOKEN) and pass it to client instance.
    }

    /**
     * Connects to the MCP server.
     * @returns {Promise<void>}
     */
    async connect() {
        if (!this.command || !this.args) {
            throw new Error('MCP Client: Server command and arguments are not set. Ensure serverName is valid and config.mjs is properly configured.');
        }

        this.transport = new StdioClientTransport({
            command: this.command, // Use config values
            args: this.args,       // Use config values
            env: this.env
        });

        this.client = new McpSdkClient({
            name: this.clientName,
            version: this.clientVersion
        }, {
            capabilities: {}
        });

        await this.client.connect(this.transport);

        // Fetch tools and create dynamic proxies
        const tools = await this.listTools(); // Using listTools from this class
        this.tools = {};
        tools.forEach(tool => {
            const camelCaseName = this.snakeToCamel(tool.name); // Use the new function
            console.log(`[MCP Client] Creating tool proxy: ${tool.name} -> ${camelCaseName}`); // Debug log
            this.tools[camelCaseName] = async (args) => {
                return this.callTool(tool.name, args);
            };
        });
    }

    /**
     * Lists available tools from the server.
     * @returns {Promise<Object[]>}
     */
    async listTools() {
        if (!this.client) throw new Error("MCP Client: Client not connected");
        const result = await this.client.listTools();
        return result.tools;
    }

    /**
     * Calls a tool on the server.
     * @param {String} name Tool name
     * @param {Object} args Tool arguments
     * @returns {Promise<Object>}
     */
    async callTool(name, args) {
        if (!this.client) throw new Error("MCP Client: Client not connected");
        return await this.client.callTool({
            name,
            arguments: args
        });
    }

    /**
     * Closes the connection.
     * @returns {Promise<void>}
     */
    async close() {
        if (this.transport) {
            await this.transport.close();
        }
    }

    /**
     * Converts snake_case strings into camelCase.
     * @param {String} s The snake_case string.
     * @returns {String} The camelCase string.
     * @protected
     */
    snakeToCamel(s) {
        return s.replace(/(_\w)/g, m => m[1].toUpperCase());
    }

    /**
     * Cleanup when the instance is destroyed
     */
    destroy() {
        this.close().catch(err => console.error('MCP Client: Error closing transport during destroy:', err));
        super.destroy();
    }
}

export default Neo.setupClass(Client);
