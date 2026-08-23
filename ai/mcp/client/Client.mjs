import {Client as McpSdkClient}        from '@modelcontextprotocol/sdk/client/index.js';
import {SSEClientTransport}            from '@modelcontextprotocol/sdk/client/sse.js';
import {StdioClientTransport}          from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Base                            from '../../../src/core/Base.mjs';
import ClientConfig                    from './config.mjs';
import ToolService                     from '../ToolService.mjs';

/**
 * @summary A generic MCP Client that can connect to local or remote MCP servers.
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
         * Environment slot whose value becomes the Bearer credential for remote transports.
         * The resolved credential is injected only while constructing the transport and is never
         * written into the shared ClientConfig singleton.
         * @member {String|null} bearerTokenEnvVar=null
         */
        bearerTokenEnvVar: null,
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
         * Narrow entrypoint-injected connection object for one transient client instance.
         *
         * This narrow bootstrap boundary keeps credentials out of the shared reactive ClientConfig
         * Provider. `null` keeps the normal named config lookup path.
         * @member {Object|null} connectionConfig=null
         */
        connectionConfig: null,
        /**
         * The command to run (e.g. "node")
         * @member {String|null} command=null // Will be loaded from config
         */
        command: null,
        /**
         * Working directory for a stdio child process. Named built-ins may supply an explicit package
         * root; `null` preserves the SDK's inherited-cwd behavior for existing definitions.
         * @member {String|null} cwd=null
         */
        cwd: null,
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
         * Additional SDK transport options for HTTP/SSE transports.
         * @member {Object} transportOptions={}
         */
        transportOptions: {},
        /**
         * Transport type to use: 'stdio', 'sse', or 'streamable-http'.
         * @member {String} transportType='stdio'
         */
        transportType: 'stdio',
        /**
         * Remote MCP endpoint URL for HTTP/SSE transports.
         * @member {String|null} url=null
         */
        url: null,
        /**
         * The logical name of the MCP server to connect to (e.g., 'github-workflow').
         * This name looks up ClientConfig unless one transient `connectionConfig` was injected.
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
     * @summary Creates the SDK transport for the configured server connection.
     *
     * Local servers use stdio process spawning, while remote endpoints use the SDK's URL-based
     * SSE or Streamable HTTP transports with the configured transport options.
     * @returns {StdioClientTransport|SSEClientTransport|StreamableHTTPClientTransport}
     * @throws {Error} When the configured transport is unknown or incomplete.
     */
    createTransport() {
        const me            = this,
              transportType = me.normalizeTransportType(me.transportType);

        switch (transportType) {
        case 'stdio':
            if (!me.command || !me.args) {
                throw new Error('MCP Client: stdio transport requires server command and arguments. Ensure serverName is valid and config.mjs is properly configured.');
            }

            return new StdioClientTransport({
                command: me.command,
                args   : me.args,
                env    : me.env,
                cwd    : me.cwd ?? undefined
            });

        case 'sse':
            return new SSEClientTransport(
                me.createTransportUrl(transportType),
                me.createRemoteTransportOptions()
            );

        case 'streamable-http':
            return new StreamableHTTPClientTransport(
                me.createTransportUrl(transportType),
                me.createRemoteTransportOptions()
            );

        default:
            throw new Error(`MCP Client: Unsupported transport type '${me.transportType}' for '${me.serverName}'. Expected 'stdio', 'sse', or 'streamable-http'.`);
        }
    }

    /**
     * @summary Builds remote SDK options with a just-in-time Bearer credential when configured.
     *
     * Clones request options and headers before adding auth so one client connection cannot leak
     * its resolved secret into the shared config or another client instance. Two auth authorities
     * are rejected instead of silently choosing between a literal header and an environment slot.
     * @returns {Object}
     * @throws {Error} When the bearer slot is empty or a literal Authorization header conflicts.
     */
    createRemoteTransportOptions() {
        const
            me                  = this,
            {bearerTokenEnvVar} = me,
            transportOptions    = me.transportOptions;

        if (!bearerTokenEnvVar) return transportOptions;

        const
            requestInit = {...transportOptions.requestInit},
            headers     = new Headers(requestInit.headers);

        if (headers.has('Authorization')) {
            throw new Error(
                `MCP Client: '${me.serverName}' config cannot declare both bearerTokenEnvVar and an Authorization header.`
            );
        }

        const
            instanceToken = me.env[bearerTokenEnvVar],
            token         = (
                typeof instanceToken === 'string' && instanceToken.trim()
                    ? instanceToken
                    : process.env[bearerTokenEnvVar]
            )?.trim();

        if (!token) {
            throw new Error(
                `MCP Client: Bearer token environment variable '${bearerTokenEnvVar}' is missing or empty for '${me.serverName}'.`
            );
        }

        headers.set('Authorization', `Bearer ${token}`);

        return {
            ...transportOptions,
            requestInit: {
                ...requestInit,
                headers
            }
        };
    }

    /**
     * @summary Creates a URL object for remote MCP SDK transports.
     *
     * Accepts a configured string or pre-built URL instance and keeps the fail-fast error tied
     * to the normalized transport type that requested it.
     * @param {String} transportType The normalized transport type.
     * @returns {URL}
     * @throws {Error} When no remote URL is configured.
     */
    createTransportUrl(transportType) {
        const me  = this,
              url = me.url;

        if (!url) {
            throw new Error(`MCP Client: ${transportType} transport requires a remote url in ai/mcp/client/config.mjs`);
        }

        return url instanceof URL ? url : new URL(url);
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
        me.transport = me.createTransport();

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
     * Loads instance-injected connection details or the named ClientConfig entry.
     * @param {String} serverName The name of the server to load.
     * @protected
     */
    loadServerConfig(serverName) {
        const me = this;

        const serverConfig = me.connectionConfig ?? ClientConfig.mcpServers[serverName];
        if (!serverConfig) {
            throw new Error(`MCP Client: Server config not found for '${serverName}' in ai/mcp/client/config.mjs`);
        }
        me.command           = serverConfig.command           || null;
        me.cwd               = serverConfig.cwd               ?? null;
        me.args              = serverConfig.args              || null;
        me.bearerTokenEnvVar = serverConfig.bearerTokenEnvVar || null;
        me.openApiFilePath   = serverConfig.openApiFilePath   || null;
        me.requiredEnv       = serverConfig.requiredEnv       || [];
        me.transportOptions  = serverConfig.transportOptions  || {};
        me.transportType     = serverConfig.transportType || serverConfig.transport || 'stdio';
        me.url               = serverConfig.url               || null;
        // Note: env from config.mjs is not explicitly merged here. The entrypoint owns resolving
        // and passing the credential slot named by the selected server configuration.
    }

    /**
     * @summary Normalizes supported transport aliases to canonical config values.
     *
     * Preserves unknown values so `createTransport()` can produce the single authoritative
     * unsupported-transport error instead of silently coercing configuration typos.
     * @param {String} transportType The configured transport type or alias.
     * @returns {String}
     */
    normalizeTransportType(transportType = 'stdio') {
        switch (transportType) {
        case 'http':
        case 'streamableHttp':
        case 'streamable-http':
            return 'streamable-http';

        default:
            return transportType;
        }
    }
}

export default Neo.setupClass(Client);
