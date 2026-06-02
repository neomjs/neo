import Base         from '../../../../../src/core/Base.mjs';
import {createHash} from 'crypto';

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
 * - **Identity Propagation:** The `verifyAccessToken` verifier
 *   extracts `preferred_username` (or `sub` as fallback) from the introspection response and
 *   surfaces it as `userId` on the auth context. Downstream request handlers read this via
 *   `RequestContextService.getUserId()` to tag ChromaDB writes and filter reads per tenant,
 *   enabling multi-tenant Memory Core deployments without trusting reverse-proxy forwarded
 *   headers. The identity source of truth is the OIDC provider's validated introspection
 *   response — not an infrastructure-level HTTP header.
 *
 * This service is essential for enabling **Agent-Native Security** in distributed or
 * cloud-native environments using Infrastructure as Code (IaC).
 *
 * @class Neo.ai.mcp.server.shared.services.AuthService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.TransportService
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
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

        const {requireBearerAuth} = await import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
        const {InvalidTokenError} = await import('@modelcontextprotocol/sdk/server/auth/errors.js');

        // GitLab-PAT mode installs a naked-401 bearer path (no `aud`, no PRM advertisement) and
        // returns early — the OIDC discovery + introspection flow below does not apply.
        if (aiConfig.auth.mode === 'gitlab-pat') {
            this.setupGitlabPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        const {mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl} = await import('@modelcontextprotocol/sdk/server/auth/router.js');
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
                    token,
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

                // Extract identity claims from the introspection response for downstream
                // tenant isolation. `preferred_username` is Keycloak / GitLab /
                // many OIDC providers' convention for the human-readable login name; `sub` is the
                // OIDC-spec-mandated subject identifier and the reliable fallback. Providers may
                // omit `preferred_username` (e.g. machine-to-machine client credential flows),
                // so the `sub`-fallback guarantees a non-empty userId whenever the token is
                // active. `username` is retained separately for human-facing logging.
                const userId   = data.preferred_username || data.sub;
                const username = data.preferred_username || data.name || data.email || data.sub;

                return {
                    token,
                    clientId : data.client_id,
                    scopes   : data.scope ? data.scope.split(' ') : [],
                    expiresAt: data.exp,
                    userId,
                    username,
                    // Provenance tag consumed by `RequestContextService.getSource()`.
                    // Distinguishes OIDC-derived identity from stdio env-var / gh-CLI paths.
                    source   : 'oidc'
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

    /**
     * Installs the GitLab-PAT bearer auth path: a single `requireBearerAuth` middleware whose
     * verifier validates a GitLab Personal Access Token against the GitLab API. Deliberately
     * installs NO `mcpAuthMetadataRouter` and passes NO `resourceMetadataUrl`, so a missing/invalid
     * token yields a bare `WWW-Authenticate: Bearer` 401 with no `resource_metadata` breadcrumb —
     * OAuth-aware clients (e.g. MCP Inspector) therefore do not attempt Dynamic Client Registration
     * against an identity provider that has none. PATs carry no audience claim, so `aud` enforcement
     * is intentionally absent here (it is exactly what rejects raw PATs in OIDC mode).
     * @param {Object}   options
     * @param {Object}   options.app      The Express application instance
     * @param {Object}   options.aiConfig The server configuration object
     * @param {Object}   options.logger   The logger instance
     * @param {Object}   deps
     * @param {Function} deps.requireBearerAuth SDK bearer-auth middleware factory
     * @param {Function} deps.InvalidTokenError SDK error class for rejected tokens
     */
    setupGitlabPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError}) {
        const verifier = this.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError});

        app.use(requireBearerAuth({verifier, requiredScopes: []}));

        logger.info(`[AuthService] Authorization enabled (mode: gitlab-pat, GitLab API: ${aiConfig.auth.gitlabApiBaseUrl})`)
    }

    /**
     * Builds the `{verifyAccessToken}` verifier for GitLab-PAT mode. The verifier presents the
     * incoming bearer token to `GET {gitlabApiBaseUrl}/api/v4/user`; a `200` resolves the identity
     * (`userId` = GitLab `username`, `source` = `'gitlab-pat'`) in the same shape
     * `RequestContextService` already consumes from the OIDC path, while any non-OK response throws
     * `InvalidTokenError`. Successful validations are cached by SHA-256 token hash for
     * `auth.patCacheTtlSeconds` so a revoked PAT clears within that bounded window; failures are
     * never cached (a transient GitLab error must not lock a client out). The raw token is never
     * logged — only its resolved identity.
     * @param {Object}   options
     * @param {Object}   options.aiConfig
     * @param {Object}   options.logger
     * @param {Function} options.InvalidTokenError
     * @returns {{verifyAccessToken: Function}}
     */
    createGitlabPatVerifier({aiConfig, logger, InvalidTokenError}) {
        const
            apiBaseUrl = aiConfig.auth.gitlabApiBaseUrl.replace(/\/+$/, ''),
            ttlMs      = aiConfig.auth.patCacheTtlSeconds * 1000,
            cache      = new Map(); // tokenHash -> {info, expiresAt}

        return {
            verifyAccessToken: async (token) => {
                const
                    tokenHash = createHash('sha256').update(token).digest('hex'),
                    cached    = cache.get(tokenHash);

                if (cached && cached.expiresAt > Date.now()) {
                    return cached.info
                }

                const response = await fetch(`${apiBaseUrl}/api/v4/user`, {
                    headers: {Authorization: `Bearer ${token}`}
                });

                if (!response.ok) {
                    cache.delete(tokenHash);
                    throw new InvalidTokenError(`GitLab PAT validation failed (HTTP ${response.status})`)
                }

                const
                    data = await response.json(),
                    info = {
                        token,
                        clientId: data.username,
                        scopes  : [],
                        userId  : data.username,
                        username: data.name || data.username,
                        // Provenance tag read by RequestContextService.getSource(); distinguishes a
                        // GitLab-PAT identity from OIDC / stdio env-var / gh-CLI sources.
                        source  : 'gitlab-pat'
                    };

                cache.set(tokenHash, {info, expiresAt: Date.now() + ttlMs});
                logger.info(`[AuthService] GitLab PAT validated for user: ${info.username}`);

                return info
            }
        }
    }
}

export default Neo.setupClass(AuthService);
