import Base from '../../../../../src/core/Base.mjs';

/**
 * @summary Orchestrates OIDC and OAuth 2.1 authorization for Neo.mjs MCP servers.
 *
 * This service acts as the **Authorization Anchor** for the MCP ecosystem. It implements
 * the **Discovery-First Pattern**, where it dynamically resolves security endpoints from the
 * identity provider's `.well-known/openid-configuration`. 
 *
 * Key Architectural Concepts:
 * - **Dynamic Resolution:** Autonomously fetches and parses OIDC discovery documents.
 * - **Token Introspection:** Implements RFC 7662 compliant token validation.
 * - **Protected Resource Metadata (PRM):** Serves the discovery router required for MCP clients
 *    to identify the required authorization server.
 * - **Audience Enforcement:** Strictly validates that the `aud` (Audience) claim in the
 *   Bearer token matches the MCP server's public URL to prevent passthrough attacks.
 *
 * This service is essential for enabling **Agent-Native Security** in distributed or 
 * cloud-native environments using Infrastructure as Code (IaC).
 *
 * @class Neo.ai.mcp.server.shared.services.AuthService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.TransportService
 */
class AuthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.AuthService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.AuthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Setups OIDC/OAuth authorization for an Express application.
     * @param {Object} options
     * @param {Object} options.app The Express application instance
     * @param {Object} options.aiConfig The server configuration object
     * @param {URL}    options.mcpServerUrl The public URL of the MCP server
     * @param {Object} options.logger The logger instance
     * @param {String} options.resourceName The name of the protected resource
     * @returns {Promise<void>}
     */
    async setup(options) {
        const {app, aiConfig, mcpServerUrl, logger, resourceName} = options;

        const {mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl} = await import('@modelcontextprotocol/sdk/server/auth/router.js');
        const {requireBearerAuth}                                           = await import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
        const {InvalidTokenError}                                           = await import('@modelcontextprotocol/sdk/server/auth/errors.js');
        const {checkResourceAllowed}                                        = await import('@modelcontextprotocol/sdk/shared/auth-utils.js');

        let oauthUrls;

        if (aiConfig.auth.issuerUrl) {
            let issuerUrl = aiConfig.auth.issuerUrl;

            if (!issuerUrl.endsWith('/')) {
                issuerUrl += '/';
            }

            const discoveryUrl = new URL('.well-known/openid-configuration', issuerUrl);
            const response     = await fetch(discoveryUrl);

            if (!response.ok) {
                throw new Error(`Failed to fetch OIDC discovery document from ${discoveryUrl}: ${response.statusText}`);
            }

            oauthUrls = await response.json();
            logger.info(`[AuthService] OIDC Discovery successful for issuer: ${oauthUrls.issuer}`);
        } else {
            const getFullUrl = (host, port) => {
                if (host.includes('://')) {
                    return new URL(host);
                }
                const protocol = (host === 'localhost' || host === '127.0.0.1') ? 'http' : 'https';
                return new URL(`${protocol}://${host}:${port}`);
            };

            const authBaseUrl = getFullUrl(aiConfig.auth.host, aiConfig.auth.port);

            // Append Keycloak realm path if not already present
            if (!authBaseUrl.pathname.includes('/realms/')) {
                authBaseUrl.pathname = `/realms/${aiConfig.auth.realm}/`;
            }

            oauthUrls = {
                issuer                : authBaseUrl.toString(),
                introspection_endpoint: new URL('protocol/openid-connect/token/introspect', authBaseUrl).toString(),
                authorization_endpoint: new URL('protocol/openid-connect/auth',             authBaseUrl).toString(),
                token_endpoint        : new URL('protocol/openid-connect/token',            authBaseUrl).toString(),
            };
        }

        const oauthMetadata = {
            ...oauthUrls,
            response_types_supported: oauthUrls.response_types_supported || ['code'],
        };

        const tokenVerifier = {
            verifyAccessToken: async (token) => {
                const introspectionEndpoint = oauthUrls.introspection_endpoint;

                if (!introspectionEndpoint) {
                    throw new Error('No introspection endpoint available in OIDC metadata');
                }

                const params = new URLSearchParams({
                    token    : token,
                    client_id: aiConfig.auth.clientId,
                });

                if (aiConfig.auth.clientSecret) {
                    params.set('client_secret', aiConfig.auth.clientSecret);
                }

                const response = await fetch(introspectionEndpoint, {
                    method : 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body   : params.toString(),
                });

                if (!response.ok) {
                    throw new InvalidTokenError(`Invalid or expired token: ${await response.text()}`);
                }

                const data = await response.json();

                if (data.active === false) {
                    throw new InvalidTokenError('Inactive token');
                }

                if (!data.aud) {
                    throw new InvalidTokenError('Resource indicator (aud) missing');
                }

                const audiences = Array.isArray(data.aud) ? data.aud : [data.aud];
                const allowed   = audiences.some(a => checkResourceAllowed({
                    requestedResource : a,
                    configuredResource: mcpServerUrl,
                }));

                if (!allowed) {
                    throw new InvalidTokenError(`None of the provided audiences are allowed. Expected ${mcpServerUrl}, got: ${audiences.join(', ')}`);
                }

                return {
                    token,
                    clientId : data.client_id,
                    scopes   : data.scope ? data.scope.split(' ') : [],
                    expiresAt: data.exp,
                };
            }
        };

        app.use(mcpAuthMetadataRouter({
            oauthMetadata,
            resourceServerUrl: mcpServerUrl,
            scopesSupported  : ['mcp:tools'],
            resourceName,
        }));

        const authMiddleware = requireBearerAuth({
            verifier           : tokenVerifier,
            requiredScopes     : [],
            resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
        });

        app.use(authMiddleware);

        logger.info(`[AuthService] Authorization enabled (Issuer: ${oauthUrls.issuer})`);
    }
}

export default Neo.setupClass(AuthService);
