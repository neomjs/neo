import { Client as McpSdkClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport }     from '@modelcontextprotocol/sdk/client/stdio.js';
import Base                         from '../../../src/core/Base.mjs';

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
         * The command to run (e.g. "node")
         * @member {String} command='node'
         */
        command: 'node',
        /**
         * The arguments for the command (e.g. ["./path/to/server.mjs"])
         * @member {String[]} args=[]
         */
        args: [],
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

    /**
     * Connects to the MCP server.
     * @returns {Promise<void>}
     */
    async connect() {
        this.transport = new StdioClientTransport({
            command: this.command,
            args: this.args,
            env: this.env
        });

        this.client = new McpSdkClient({
            name: this.clientName,
            version: this.clientVersion
        }, {
            capabilities: {}
        });

        await this.client.connect(this.transport);
    }

    /**
     * Lists available tools from the server.
     * @returns {Promise<Object[]>}
     */
    async listTools() {
        if (!this.client) throw new Error("Client not connected");
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
        if (!this.client) throw new Error("Client not connected");
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
     * Cleanup when the instance is destroyed
     */
    destroy() {
        this.close().catch(err => console.error('Error closing transport during destroy:', err));
        super.destroy();
    }
}

export default Neo.setupClass(Client);