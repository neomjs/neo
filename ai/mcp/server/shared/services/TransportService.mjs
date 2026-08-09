import Base                  from '../../../../../src/core/Base.mjs';
import RequestContextService from './RequestContextService.mjs';

/**
 * @summary Orchestrates the Streamable HTTP transport layer and session lifecycle for MCP servers.
 *
 * This service manages the **Logical Transport Layer** using Express and the Streamable HTTP
 * transport. It provides a standardized environment for secure agent communication by
 * integrating the **AuthService** for OIDC/OAuth enforcement.
 *
 * Key Architectural Concepts:
 * - **Session Management:** Handles the lifecycle of stateful MCP sessions via `Mcp-Session-Id`.
 * - **Transport Abstraction:** Decouples the Express app and CORS configuration from the
 *   individual server logic (e.g. Knowledge Base, Memory Core).
 * - **Authenticated Context Consumption:** Delegates authentication installation to AuthService,
 *   then consumes the resulting `req.auth` without interpreting authentication configuration.
 * - **CORS Enforcement:** Ensures cross-origin compatibility for modern browser-based AI agents.
 * - **Request-Context Propagation:** Each `/mcp` request is wrapped in
 *   `RequestContextService.run({userId, username, sessionId}, ...)` before dispatching to the MCP
 *   transport. This bridges the gap between Express's per-request `req.auth` context and the
 *   service layer that runs inside `callTool(name, args)` — downstream services read the
 *   authenticated user's identity and `sessionId` via `RequestContextService` to tag ChromaDB
 *   writes and filter/isolate state per tenant.
 *
 * By extracting this logic, we maintain a lean root server while ensuring consistent
 * **Physical-to-Logical Mapping** for all Neo.mjs MCP servers.
 *
 * @class Neo.ai.mcp.server.shared.services.TransportService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.AuthService
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
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
     * Map of active McpServer instances keyed by session ID.
     * @member {Map} mcpServers
     * @protected
     */
    mcpServers = new Map()

    /**
     * Computes the Host-header allowlist for the SDK's DNS-rebinding protection
     * (`createMcpExpressApp({allowedHosts})`). Pure + side-effect-free so it is unit-testable
     * (an instance method on the singleton, callable as `TransportService.computeAllowedHosts(...)`)
     * without a live transport. The localhost set is ALWAYS included — the container healthcheck hits
     * `http://127.0.0.1:<port>`, so dropping it would fail the healthcheck (restart loop). The
     * public hostname is derived from `aiConfig.publicUrl` (the existing `NEO_PUBLIC_URL` leaf) and
     * augmented by the comma-separated `aiConfig.allowedHosts` (`NEO_MCP_ALLOWED_HOSTS`) for
     * multi-hostname deployments or where the client `Host` differs from the advertised URL.
     * @param {Object} [aiConfig={}]
     * @param {String|null} [aiConfig.publicUrl]
     * @param {String|null} [aiConfig.allowedHosts] Comma-separated extra hostnames
     * @returns {String[]} De-duplicated allowlist (hostnames, port-agnostic; IPv6 in brackets)
     */
    computeAllowedHosts(aiConfig={}) {
        const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);

        if (aiConfig.publicUrl) {
            try {
                hosts.add(new URL(aiConfig.publicUrl).hostname)
            } catch {
                // Unparseable publicUrl is ignored here; an explicit NEO_MCP_ALLOWED_HOSTS entry can still cover it.
            }
        }

        if (aiConfig.allowedHosts) {
            for (const host of String(aiConfig.allowedHosts).split(',')) {
                const trimmed = host.trim();
                trimmed && hosts.add(trimmed)
            }
        }

        return [...hosts]
    }

    /**
     * @summary Computes the exact browser-Origin allowlist shared by KB, MC, and composed Fleet.
     *
     * The Fleet Manager cockpit origins are the declarative cross-origin authority. The resolved
     * service resource URL contributes its scheme/authority so same-deployment browser clients
     * remain admitted regardless of the service path. Every configured entry must already be one
     * canonical HTTP(S) origin: wildcards, opaque/null origins, credentials, and path-bearing URLs
     * fail boot instead of silently widening the CORS boundary.
     *
     * @param {Object} aiConfig Resolved AiConfig tree.
     * @param {Object} aiConfig.fleet Fleet Manager configuration branch.
     * @param {String[]} aiConfig.fleet.cockpitOrigins Exact configured cockpit origins.
     * @param {URL} resourceUrl Resolved canonical URL for the active protected resource.
     * @returns {Readonly<String[]>} Frozen, de-duplicated canonical origins.
     * @throws {TypeError} When a configured origin is not one exact HTTP(S) origin.
     */
    computeAllowedOrigins(aiConfig, resourceUrl) {
        const origins = new Set();

        if (!Array.isArray(aiConfig.fleet.cockpitOrigins)) {
            throw new TypeError('[TransportService] fleet.cockpitOrigins must be an array of exact origins')
        }

        const addOrigin = (candidate, source) => {
            let url;

            try {
                url = new URL(candidate)
            } catch {
                throw new TypeError(`[TransportService] ${source} must be one exact HTTP(S) origin`)
            }

            if (!['http:', 'https:'].includes(url.protocol) || candidate !== url.origin) {
                throw new TypeError(`[TransportService] ${source} must be one exact HTTP(S) origin`)
            }

            origins.add(url.origin)
        };

        for (const origin of aiConfig.fleet.cockpitOrigins) {
            addOrigin(origin, 'fleet.cockpitOrigins entry')
        }

        if (!(resourceUrl instanceof URL)) {
            throw new TypeError('[TransportService] resourceUrl must be a URL')
        }

        addOrigin(resourceUrl.origin, 'resourceUrl origin');

        return Object.freeze([...origins])
    }

    /**
     * @summary Installs one fail-closed exact-origin CORS boundary on an Express application.
     *
     * A present foreign or opaque Origin is refused before authentication or route dispatch and
     * receives no CORS grant. Origin-less healthchecks and non-browser clients continue. Allowed
     * preflights are completed by the canonical middleware before the authenticated routes.
     *
     * @param {Object} options
     * @param {Object} options.app Express application.
     * @param {Object} options.aiConfig Resolved AiConfig tree.
     * @param {Function} options.corsMiddleware CORS middleware factory.
     * @param {URL} options.resourceUrl Resolved protected-resource URL.
     * @param {Object} [options.errorBody] Stable 403 response envelope.
     * @returns {Readonly<String[]>} Installed exact-origin allowlist.
     */
    installCors({
        app,
        aiConfig,
        corsMiddleware,
        resourceUrl,
        errorBody={error: 'origin not admitted'}
    }) {
        const
            allowedOrigins = this.computeAllowedOrigins(aiConfig, resourceUrl),
            allowedSet     = new Set(allowedOrigins);

        app.use((req, res, next) => {
            const origin = req.get('Origin');

            if (origin !== undefined && !allowedSet.has(origin)) {
                res.status(403).json(errorBody);
                return
            }

            next()
        });

        app.use(corsMiddleware({
            origin        : allowedOrigins,
            exposedHeaders: ['Mcp-Session-Id']
        }));

        return allowedOrigins
    }

    /**
     * @summary Sets up the Streamable HTTP transport for an MCP server.
     * @param {Object} options
     * @param {Object} options.server The Neo MCP Server instance
     * @param {Object} options.aiConfig The server configuration object
     * @param {Object} options.logger The logger instance
     * @param {String} options.resourceName The name of the server resource
     * @returns {Promise<void>}
     */
    async setup(options) {
        const { server, aiConfig, logger, resourceName } = options;

        const { createMcpExpressApp }           = await import('@modelcontextprotocol/sdk/server/express.js');
        const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
        const crypto                            = await import('crypto');
        const cors                              = await import('cors');
        const getFullUrl                        = (host, port) => {
            if (host.includes('://')) {
                return new URL(host)
            }

            const protocol = (host === 'localhost' || host === '127.0.0.1') ? 'http' : 'https';

            return new URL(`${protocol}://${host}:${port}`)
        };
        // The config owns the advertised transport host (default + the platform-standard `HOST`
        // env binding on the `mcpHttpHost` leaf) — consumed at the use site, never re-derived
        // from env here.
        const mcpServerUrl = aiConfig.publicUrl
            ? new URL(aiConfig.publicUrl)
            : getFullUrl(aiConfig.mcpHttpHost, aiConfig.mcpHttpPort);
        // Host-allowlist for the SDK's DNS-rebinding protection. Always includes localhost (the
        // container healthcheck hits 127.0.0.1) plus the publicUrl hostname + NEO_MCP_ALLOWED_HOSTS,
        // so a cloud deployment behind a reverse proxy on a public hostname is not rejected with
        // `-32000 Invalid Host`.
        const app = createMcpExpressApp({allowedHosts: this.computeAllowedHosts(aiConfig)});

        this.app = app;

        // AuthService alone interprets authentication state. Its universal pre-CORS phase
        // installs any strategy guard whose order is security-significant; Transport merely
        // supplies the Express boundary.
        const { default: AuthService } = await import('./AuthService.mjs');
        AuthService.setupPreCors({app, aiConfig});

        this.installCors({app, aiConfig, corsMiddleware: cors.default, resourceUrl: mcpServerUrl});
        this.mcpServerUrl = mcpServerUrl;

        // AuthService owns the legal Streamable-HTTP state machine. Transport delegates every
        // boot instead of maintaining a built-in subset that drifts whenever a mode is added.
        await AuthService.setup({
            app,
            aiConfig,
            mcpServerUrl,
            logger,
            resourceName
        });

        app.all('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'];
            let transport;
            let mcpServerInstance;

            if (sessionId) {
                transport = this.transports.get(sessionId);
                if (!transport) {
                    res.status(404).json({ error: 'Session not found' });
                    return;
                }
            } else {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator  : () => crypto.randomUUID(),
                    onsessioninitialized: (id) => {
                        this.transports.set(id, transport);
                        if (mcpServerInstance) {
                            this.mcpServers.set(id, mcpServerInstance);
                        }
                    },
                    onsessionclosed: (id) => {
                        const closedServerInstance = this.mcpServers.get(id);
                        this.transports.delete(id);
                        this.mcpServers.delete(id);
                        if (typeof server.onSessionClosed === 'function') {
                            server.onSessionClosed(id, closedServerInstance);
                        }
                    }
                });

                if (typeof server.createMcpServer === 'function') {
                    mcpServerInstance = server.createMcpServer();
                } else {
                    mcpServerInstance = server.mcpServer;
                }

                await mcpServerInstance.connect(transport);
            }

            // Propagate the authenticated identity and sessionId into the async call chain so service methods
            // can tag ChromaDB writes and filter reads per tenant.
            //
            // Context-shape dispatch:
            // - If the concrete server (e.g. memory-core) implements `buildRequestContext()`,
            //   defer to it — the server may enrich the raw OIDC auth with server-specific
            //   bindings like AgentIdentity graph-node IDs from memory-core.
            // - Otherwise fall back to the minimal `{userId, username}` shape — sufficient for
            //   servers (knowledge-base, gh-workflow) that don't own an identity graph.
            // - Finally, the `sessionId` from the transport is appended to whichever context
            //   shape was resolved, making it available to downstream RequestContextService readers.
            //
            // `req.auth` is populated by whichever bearer installer AuthService selected.
            // Custom, proxy, and built-in strategies all bind the same consumed req.auth shape.
            // A truly unconfigured HTTP boot never reaches this path: AuthService rejects it
            // before the listener opens.
            const baseAuth = req.auth;

            let requestContext;

            if (typeof server.buildRequestContext === 'function') {
                requestContext = await server.buildRequestContext(baseAuth);
            } else {
                requestContext = {
                    userId  : baseAuth?.userId,
                    username: baseAuth?.username,
                    source  : baseAuth?.source
                };
            }

            if (sessionId) {
                requestContext.sessionId = sessionId;
            } else if (transport && transport.sessionId) {
                requestContext.sessionId = transport.sessionId;
            }

            await RequestContextService.run(requestContext, () => transport.handleRequest(req, res, req.body));
        });

        const port = aiConfig.mcpHttpPort;
        await new Promise((resolve, reject) => {
            const onListening = () => {
                const hostSuffix = aiConfig.mcpListenHost ? `, Host: ${aiConfig.mcpListenHost}` : '';

                logger.info(`[${resourceName}] Server started on Streamable HTTP transport (Port: ${port}${hostSuffix})`);
                logger.info(`[${resourceName}] Available tools loaded from OpenAPI spec`);
                resolve();
            };

            this.httpServer = aiConfig.mcpListenHost
                ? app.listen(port, aiConfig.mcpListenHost, onListening)
                : app.listen(port, onListening);
            this.httpServer.on('error', reject);
        });
    }

    /**
     * @param {Boolean} [updateParent=true]
     * @param {Boolean} [silent=false]
     */
    destroy(updateParent=true, silent=false) {
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        super.destroy(updateParent, silent);
    }
}

export default Neo.setupClass(TransportService);
