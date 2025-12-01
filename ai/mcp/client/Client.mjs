import {Client as McpSdkClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport}   from '@modelcontextprotocol/sdk/client/stdio.js';
import Base                     from '../../../src/core/Base.mjs';
import ClientConfig             from './config.mjs';
import ToolService              from '../ToolService.mjs';

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
         * The arguments for the command (e.g. ["./path/to/server.mjs"])
         * @member {String[]|null} args=null // Will be loaded from config
         */
        args: null,
        /**
         * The name of the client to announce to the server
         * @member {String} clientName='Neo.ai.Agent'
         */
        clientName: 'Neo.ai.Agent',
        /**
         * The version of the client to announce
         * @member {String} clientVersion='1.0.0'
         */
        clientVersion: '1.0.0',
        /**
         * The command to run (e.g. "node")
         * @member {String|null} command=null // Will be loaded from config
         */
        command: null,
        /**
         * Path to a custom client configuration file.
         * @member {String|null} configFile=null
         */
        configFile: null,
        /**
         * Environment variables to pass to the spawned process
         * @member {Object} env={}
         */
        env: {},
        /**
         * Path to the OpenAPI spec for this server (if available).
         * @member {String|null} openApiFilePath=null
         */
        openApiFilePath: null,
        /**
         * List of environment variable names required by the server.
         * @member {String[]} requiredEnv=[]
         */
        requiredEnv: [],
        /**
         * The logical name of the MCP server to connect to (e.g., 'github-workflow').
         * This name will be used to look up connection details from ClientConfig.
         * @member {String} serverName_='github-workflow'
         * @reactive
         */
        serverName_: 'github-workflow'
    }

    /**
     * The MCP SDK Client instance.
     * @member {McpSdkClient|null} client=null
     * @protected
     */
    client = null
    /**
     * Connection state of the client.
     * @member {Boolean} connected=false
     */
    connected = false
    /**
     * Map of tool schemas keyed by tool name (from listTools).
     * @member {Object} toolSchemas={}
     * @protected
     */
    toolSchemas = {}
    /**
     * The ToolService instance for validation and management.
     * @member {ToolService|null} toolService=null
     * @protected
     */
    toolService = null
    /**
     * The Transport instance.
     * @member {StdioClientTransport|null} transport=null
     * @protected
     */
    transport = null

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
     * Calls a tool on the server.
     * @param {String} name Tool name
     * @param {Object} args Tool arguments
     * @returns {Promise<Object>}
     */
    async callTool(name, args) {
        const me = this;

        if (!me.client || !me.connected) throw new Error("MCP Client: Client not connected");

        const schema = me.toolSchemas[name];

        // Use the instance-specific ToolService for validation
        me.toolService.validateToolInput(name, args, schema);

        return await me.client.callTool({
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
            this.connected = false;
        }
    }

    /**
     * Cleanup when the instance is destroyed
     */
    destroy() {
        this.close().catch(err => console.error('MCP Client: Error closing transport during destroy:', err));
        super.destroy();
    }

    async initAsync() {
        const me = this;

        await super.initAsync();

        // 1. Load custom configuration if provided
        if (me.configFile) {
            try {
                await ClientConfig.load(me.configFile);
            } catch (error) {
                console.error('Failed to load configuration:', error);
                throw error;
            }
        }

        // 2. Load initial server config based on the default or provided serverName
        me.loadServerConfig(me.serverName);

        // Validate required environment variables
        if (me.requiredEnv.length > 0) {
            const missingEnv = me.requiredEnv.filter(key => !me.env[key] && !process.env[key]);
            if (missingEnv.length > 0) {
                throw new Error(`MCP Client: Missing required environment variables for '${me.serverName}': ${missingEnv.join(', ')}`);
            }
        }

        // Initialize the ToolService for this client connection
        me.toolService = Neo.create(ToolService, {
            openApiFilePath: this.openApiFilePath
        });

        // 3. Connect the client and create tool proxies
        if (!me.command || !me.args) {
            throw new Error('MCP Client: Server command and arguments are not set. Ensure serverName is valid and config.mjs is properly configured.');
        }

        me.transport = new StdioClientTransport({
            command: me.command,
            args   : me.args,
            env    : me.env
        });

        me.client = new McpSdkClient({
            name   : me.clientName,
            version: me.clientVersion
        }, {
            capabilities: {}
        });

        await me.client.connect(me.transport);
        me.connected = true;

        // Fetch tools and create dynamic proxies
        const tools = await me.listTools();
        me.tools = {};
        tools.forEach(tool => {
            const camelCaseName = Neo.snakeToCamel(tool.name);
            // console.log(`[MCP Client] Creating tool proxy: ${tool.name} -> ${camelCaseName}`); // Debug log (Commented out for production)
            me.tools[camelCaseName] = async (args) => {
                return me.callTool(tool.name, args);
            };
        });
    }

    /**
     * Lists available tools from the server.
     * @returns {Promise<Object[]>}
     */
    async listTools() {
        const me = this;

        if (!me.client || !me.connected) throw new Error("MCP Client: Client not connected");
        const result = await me.client.listTools();
        // Store schemas in the toolService instance for fallback validation
        if (result.tools) {
            // Manually populate the fallback map if needed, but toolService.validateToolInput
            // takes the schema as an argument, so we just need to pass it during callTool.
            // However, we need to retrieve the schema map here to pass it later.
            // Or simpler: ToolService could have a method to register tools?
            // For now, let's just store the map locally or rely on finding it again.
            // Actually, `validateToolInput` takes `schema`. We need to store the map.
            me.toolSchemas = {};
            result.tools.forEach(t => me.toolSchemas[t.name] = t.inputSchema);
        }
        return result.tools;
    }

    /**
     * Loads the server connection details from the ClientConfig singleton.
     * @param {String} serverName The name of the server to load.
     * @protected
     */
    loadServerConfig(serverName) {
        const me = this;

        const serverConfig = ClientConfig.mcpServers[serverName];
        if (!serverConfig) {
            throw new Error(`MCP Client: Server config not found for '${serverName}' in ai/mcp/client/config.mjs`);
        }
        me.command         = serverConfig.command;
        me.args            = serverConfig.args;
        me.openApiFilePath = serverConfig.openApiFilePath || null;
        me.requiredEnv     = serverConfig.requiredEnv     || [];
        // Note: env from config.mjs is not explicitly merged here,
        // assuming agent will manage its own env (like GH_TOKEN) and pass it to client instance.
    }
}

export default Neo.setupClass(Client);
