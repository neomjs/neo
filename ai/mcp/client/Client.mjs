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
         * Path to a custom client configuration file.
         * @member {String|null} configFile=null
         */
        configFile: null,
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

        // 1. Load custom configuration if provided
        if (this.configFile) {
            try {
                await ClientConfig.load(this.configFile);
            } catch (error) {
                console.error('Failed to load configuration:', error);
                throw error;
            }
        }

        // 2. Load initial server config based on the default or provided serverName
        this.loadServerConfig(this.serverName);

        // 3. Connect the client and create tool proxies
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
        const tools = await this.listTools();
        this.tools = {};
        tools.forEach(tool => {
            this.toolSchemas[tool.name] = tool.inputSchema;
            const camelCaseName = Neo.snakeToCamel(tool.name);
            // console.log(`[MCP Client] Creating tool proxy: ${tool.name} -> ${camelCaseName}`); // Debug log (Commented out for production)
            this.tools[camelCaseName] = async (args) => {
                return this.callTool(tool.name, args);
            };
        });
    }

    /**
     * Map of tool schemas keyed by tool name.
     * @member {Object} toolSchemas={}
     * @protected
     */
    toolSchemas = {}

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

        const schema = this.toolSchemas[name];
        if (schema) {
            this.validateSchema(args, schema, name);
        }

        return await this.client.callTool({
            name,
            arguments: args
        });
    }

    /**
     * Validates a value against a JSON Schema subset (Draft 7).
     * Supports: type (string, number, integer, boolean, object, array), required, properties, items, enum.
     * @param {*} value
     * @param {Object} schema
     * @param {String} [path='root']
     * @returns {Boolean} true if valid
     * @throws {Error} if invalid
     */
    validateSchema(value, schema, path = 'args') {
        if (!schema) return true;

        // Handle types
        if (schema.type) {
            const type = schema.type;
            const valueType = Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value);

            // JSON Schema 'integer' check
            if (type === 'integer') {
                if (typeof value !== 'number' || !Number.isInteger(value)) {
                    throw new Error(`Validation Error at ${path}: Expected integer, got ${valueType} (${value})`);
                }
            } else if (type === 'number') {
                if (typeof value !== 'number') {
                    throw new Error(`Validation Error at ${path}: Expected number, got ${valueType}`);
                }
            } else if (type === 'string') {
                if (typeof value !== 'string') {
                    throw new Error(`Validation Error at ${path}: Expected string, got ${valueType}`);
                }
            } else if (type === 'boolean') {
                if (typeof value !== 'boolean') {
                    throw new Error(`Validation Error at ${path}: Expected boolean, got ${valueType}`);
                }
            } else if (type === 'object') {
                if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                    throw new Error(`Validation Error at ${path}: Expected object, got ${valueType}`);
                }
            } else if (type === 'array') {
                if (!Array.isArray(value)) {
                    throw new Error(`Validation Error at ${path}: Expected array, got ${valueType}`);
                }
            }
        }

        // Handle Objects
        if (schema.type === 'object') {
            // Required fields
            if (schema.required) {
                schema.required.forEach(field => {
                    if (value[field] === undefined) {
                        throw new Error(`Validation Error at ${path}: Missing required property '${field}'`);
                    }
                });
            }

            // Properties
            if (schema.properties) {
                // We only validate defined properties. Additional properties are not checked by default here
                // unless strict validation is required, but standard usage often implies partial checks.
                // However, for tool args, we usually want to validate what's passed.
                Object.keys(value).forEach(key => {
                    if (schema.properties[key]) {
                        this.validateSchema(value[key], schema.properties[key], `${path}.${key}`);
                    }
                });
            }
        }

        // Handle Arrays
        if (schema.type === 'array' && schema.items) {
            value.forEach((item, index) => {
                this.validateSchema(item, schema.items, `${path}[${index}]`);
            });
        }

        // Handle Enum
        if (schema.enum) {
            if (!schema.enum.includes(value)) {
                throw new Error(`Validation Error at ${path}: Value '${value}' is not allowed. Allowed values: ${schema.enum.join(', ')}`);
            }
        }

        return true;
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
        this.close().catch(err => console.error('MCP Client: Error closing transport during destroy:', err));
        super.destroy();
    }
}

export default Neo.setupClass(Client);
