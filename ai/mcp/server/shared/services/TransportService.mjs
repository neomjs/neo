import Base from '../../../../../src/core/Base.mjs';

/**
 * @summary Service for managing the SSE transport for MCP servers.
 *
 * This service handles Express application setup, CORS configuration,
 * and the implementation of the Streamable HTTP transport handshake.
 *
 * @class Neo.ai.mcp.server.shared.services.TransportService
 * @extends Neo.core.Base
 * @singleton
 */
class TransportService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.TransportService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.TransportService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Map of active transport sessions.
     * @member {Map} transports
     * @protected
     */
    transports = new Map()

    /**
     * Setups the SSE transport for an MCP server.
     * @param {Object} options
     * @param {Object} options.server The Neo MCP Server instance
     * @param {Object} options.aiConfig The server configuration object
     * @param {Object} options.logger The logger instance
     * @param {String} options.resourceName The name of the server resource
     * @returns {Promise<void>}
     */
    async setup(options) {
        const {server, aiConfig, logger, resourceName} = options;

        const {createMcpExpressApp}           = await import('@modelcontextprotocol/sdk/server/express.js');
        const {StreamableHTTPServerTransport} = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
        const crypto                          = await import('crypto');
        const cors                            = await import('cors');
        const app                             = createMcpExpressApp();

        app.use(cors.default({
            origin        : '*',
            exposedHeaders: ['Mcp-Session-Id'],
        }));

        const getFullUrl = (host, port) => {
            if (host.includes('://')) {
                return new URL(host);
            }
            const protocol = (host === 'localhost' || host === '127.0.0.1') ? 'http' : 'https';
            return new URL(`${protocol}://${host}:${port}`);
        };

        const mcpServerUrl = getFullUrl(process.env.HOST || 'localhost', aiConfig.ssePort);

        // Optional OIDC/OAuth Authorization
        if (aiConfig.auth.host || aiConfig.auth.issuerUrl) {
            const {default: AuthService} = await import('./AuthService.mjs');
            await AuthService.setup({
                app,
                aiConfig,
                mcpServerUrl,
                logger,
                resourceName
            });
        }

        if (typeof aiConfig.authMiddleware === 'function') {
            app.use(aiConfig.authMiddleware);
        }

        app.all('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'];
            let transport;

            if (sessionId) {
                transport = this.transports.get(sessionId);
                if (!transport) {
                    res.status(404).json({ error: 'Session not found' });
                    return;
                }
            } else {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator  : ()   => crypto.randomUUID(),
                    onsessioninitialized: (id) => this.transports.set(id, transport),
                    onsessionclosed     : (id) => this.transports.delete(id)
                });

                await server.mcpServer.connect(transport);
            }

            await transport.handleRequest(req, res, req.body);
        });

        const port = aiConfig.ssePort || 3000;
        app.listen(port, () => {
            logger.info(`[${resourceName}] Server started on SSE transport (Port: ${port})`);
            logger.info(`[${resourceName}] Available tools loaded from OpenAPI spec`);
        });
    }
}

export default Neo.setupClass(TransportService);
