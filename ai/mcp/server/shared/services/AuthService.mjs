import Base                                          from '../../../../../src/core/Base.mjs';
import {createHash}                                  from 'crypto';
import {isLocalBearerToken, matchesLocalBearerToken} from '../helpers/localBearer.mjs';

/**
 * @summary Orchestrates OIDC, GitLab-PAT, and disposable local-bearer authorization.
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
     * @summary Sets up the configured authorization strategy for an Express application.
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

        // Local-bearer mode is possession-only: no PRM, discovery, identity lookup, or provisioning.
        if (aiConfig.auth.mode === 'local-bearer') {
            this.setupLocalBearer({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        // GitLab-PAT mode installs a naked-401 bearer path (no `aud`, no PRM advertisement) and
        // returns early — the OIDC discovery + introspection flow below does not apply.
        if (aiConfig.auth.mode === 'gitlab-pat') {
            this.setupGitlabPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        // GitHub-PAT mode installs the same naked-401 bearer path against the GitHub `/user`
        // endpoint and returns early — the OIDC flow below does not apply.
        if (aiConfig.auth.mode === 'github-pat') {
            this.setupGithubPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
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
     * @summary Installs the process-lifetime local-bearer middleware.
     *
     * The SDK middleware owns Authorization-header parsing and request `AuthInfo` propagation.
     * This strategy adds only strict canonical-token validation and possession comparison; it
     * deliberately installs no metadata router and never logs the configured credential.
     * @param {Object}   options
     * @param {Object}   options.app Express application instance
     * @param {Object}   options.aiConfig Server configuration object
     * @param {Object}   options.logger Logger instance
     * @param {Object}   deps
     * @param {Function} deps.requireBearerAuth SDK bearer-auth middleware factory
     * @param {Function} deps.InvalidTokenError SDK error class for rejected tokens
     * @returns {void}
     */
    setupLocalBearer({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError}) {
        const verifier = this.createLocalBearerVerifier({aiConfig, InvalidTokenError});

        app.use(requireBearerAuth({verifier, requiredScopes: []}));

        logger.info('[AuthService] Authorization enabled (mode: local-bearer, possession-only)')
    }

    /**
     * @summary Builds the strict verifier for one disposable local bearer credential.
     *
     * The configured token must be canonical unpadded base64url for exactly 32 bytes. Successful
     * verification returns the minimum SDK `AuthInfo` shape with no `userId` or `username`: the
     * credential proves possession, not identity. `Number.MAX_SAFE_INTEGER` is the SDK-required
     * numeric expiry sentinel; process exit is the actual revocation boundary, so no arbitrary
     * wall-clock TTL is invented.
     * @param {Object}   options
     * @param {Object}   options.aiConfig Server configuration object
     * @param {Function} options.InvalidTokenError SDK error class for rejected tokens
     * @returns {{verifyAccessToken: Function}}
     */
    createLocalBearerVerifier({aiConfig, InvalidTokenError}) {
        const configuredToken = aiConfig.auth.localBearerToken;

        if (!isLocalBearerToken(configuredToken)) {
            throw new Error('Local-bearer mode requires a canonical 32-byte unpadded-base64url token')
        }

        return {
            verifyAccessToken: async token => {
                if (!matchesLocalBearerToken(token, configuredToken)) {
                    throw new InvalidTokenError('Invalid local bearer token')
                }

                return {
                    token,
                    clientId : 'neo-local-bearer',
                    scopes   : [],
                    expiresAt: Number.MAX_SAFE_INTEGER,
                    source   : 'local-bearer'
                }
            }
        }
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
     * @summary Normalizes a PAT allowlist config leaf.
     *
     * Config templates resolve CSV env vars to arrays; the string branch is a compatibility guard
     * for stale gitignored overlays copied into worktrees before the `csv` type existed.
     * @param {String[]|String|null|undefined} value
     * @returns {String[]}
     */
    #normalizePatAllowlist(value) {
        if (Array.isArray(value)) {
            return value.map(item => String(item).trim()).filter(Boolean)
        }

        if (typeof value === 'string') {
            return value.split(',').map(item => item.trim()).filter(Boolean)
        }

        return []
    }

    /**
     * @summary Validates the one-budget deadline used by PAT verifier cache misses.
     *
     * Node accepts unsigned 32-bit delays in `AbortSignal.timeout()`, but its timer layer warns
     * and collapses values above the signed 32-bit ceiling to one millisecond. Rejecting that
     * range here prevents a configured long deadline from silently becoming an immediate abort.
     * The default remains owned exclusively by the declarative AiConfig leaf.
     * @param {Number} value Resolved `auth.patValidationTimeoutMs` value
     * @returns {Number}
     * @throws {RangeError} When the resolved value cannot represent a safe timer deadline
     */
    #validatePatValidationTimeoutMs(value) {
        if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
            throw new RangeError('AuthService: auth.patValidationTimeoutMs must be an integer from 1 to 2147483647')
        }

        return value
    }

    /**
     * Extracts the GitLab OAuth application client id from `/oauth/token/info`.
     * GitLab documents this as `application.uid`; the fallbacks keep the verifier tolerant of
     * self-managed version drift without weakening the default-off path.
     * @param {Object|null} tokenInfo
     * @returns {String|null}
     */
    #getGitlabTokenInfoClientId(tokenInfo) {
        return tokenInfo?.application?.uid || tokenInfo?.application_uid || tokenInfo?.client_id || null
    }

    /**
     * Extracts scopes from GitLab `/oauth/token/info` into the SDK AuthInfo shape.
     * @param {Object|null} tokenInfo
     * @returns {String[]}
     */
    #getGitlabTokenInfoScopes(tokenInfo) {
        const scope = tokenInfo?.scope ?? tokenInfo?.scopes;

        if (!scope) {
            return []
        }

        if (Array.isArray(scope)) {
            return scope
        }

        return String(scope).split(/\s+/).filter(Boolean)
    }

    /**
     * Builds the `{verifyAccessToken}` verifier for GitLab-PAT mode. The verifier presents the
     * incoming bearer token to `GET {gitlabApiBaseUrl}/api/v4/user`; a `200` resolves the identity
     * (`userId` = GitLab `username`, `source` = `'gitlab-pat'`) in the same shape
     * `RequestContextService` already consumes from the OIDC path. Optional allowlists can then
     * gate the resolved GitLab username and/or the GitLab OAuth app client id returned by
     * `/oauth/token/info`; both gates are default-off so the shipped PAT behavior remains unchanged
     * unless the deployment opts in. Successful validations are cached by SHA-256 token hash for
     * `auth.patCacheTtlSeconds` so a revoked PAT clears within that bounded window; failures are
     * never cached (a transient GitLab error must not lock a client out). Each cache miss uses one
     * `auth.patValidationTimeoutMs` deadline shared by `/api/v4/user` and the conditional
     * `/oauth/token/info` call, bounding the complete upstream sequence rather than each fetch.
     * The raw token is never logged — only its resolved identity and, when checked, the resolved
     * OAuth client id.
     * @param {Object}   options
     * @param {Object}   options.aiConfig
     * @param {Object}   options.logger
     * @param {Function} options.InvalidTokenError
     * @returns {{verifyAccessToken: Function}}
     */
    createGitlabPatVerifier({aiConfig, logger, InvalidTokenError}) {
        const
            apiBaseUrl          = aiConfig.auth.gitlabApiBaseUrl.replace(/\/+$/, ''),
            ttlSeconds          = aiConfig.auth.patCacheTtlSeconds,
            ttlMs               = ttlSeconds * 1000,
            validationTimeoutMs = this.#validatePatValidationTimeoutMs(aiConfig.auth.patValidationTimeoutMs),
            allowedClientIds    = this.#normalizePatAllowlist(aiConfig.auth.allowedClientIds),
            allowedUsers        = this.#normalizePatAllowlist(aiConfig.auth.allowedUsers),
            requireClientId     = allowedClientIds.length > 0,
            requireUser         = allowedUsers.length > 0,
            cache               = new Map(); // tokenHash -> {user, tokenInfo, expiresAt} (cache-freshness, ms)

        // Builds the AuthInfo shape consumed by the SDK `requireBearerAuth` middleware AND
        // `RequestContextService`. `expiresAt` is REQUIRED by `requireBearerAuth` — it rejects auth
        // info lacking a numeric expiry with `Token has no expiration time` BEFORE `req.auth` is set,
        // so omitting it silently breaks the valid-PAT path. GitLab `/api/v4/user` does not return the
        // PAT's own expiry, so we use the re-validation horizon: one cache window from now (Unix
        // seconds). The cache re-validates against GitLab after that, so a revoked PAT still clears
        // within `patCacheTtlSeconds`. Built per-call so `expiresAt` stays request-fresh on cache hits.
        const buildInfo = (token, user, tokenInfo = null) => {
            const tokenInfoClientId = this.#getGitlabTokenInfoClientId(tokenInfo);

            return {
                token,
                clientId : tokenInfoClientId || user.username,
                scopes   : this.#getGitlabTokenInfoScopes(tokenInfo),
                expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
                userId   : user.username,
                username : user.name || user.username,
                // Provenance tag read by RequestContextService.getSource(); distinguishes a GitLab-PAT
                // identity from OIDC / stdio env-var / gh-CLI sources.
                source   : 'gitlab-pat',
                // Provider-neutral identity metadata consumed by Memory Core's request-time
                // AgentIdentity auto-provisioner. The raw bearer token remains in AuthInfo only for
                // the SDK middleware boundary and is never copied into graph identity properties.
                authProvider       : 'gitlab',
                authSource         : 'gitlab-pat',
                providerBaseUrl    : apiBaseUrl,
                providerUserId     : user.id == null ? undefined : String(user.id),
                providerUsername   : user.username,
                providerDisplayName: user.name || user.username
            }
        };

        return {
            verifyAccessToken: async (token) => {
                const
                    tokenHash = createHash('sha256').update(token).digest('hex'),
                    cached    = cache.get(tokenHash);

                if (cached && cached.expiresAt > Date.now()) {
                    return buildInfo(token, cached.user, cached.tokenInfo)
                }

                const signal = AbortSignal.timeout(validationTimeoutMs);

                try {
                    const userResponse = await fetch(`${apiBaseUrl}/api/v4/user`, {
                        headers: {Authorization: `Bearer ${token}`},
                        signal
                    });

                    if (!userResponse.ok) {
                        cache.delete(tokenHash);
                        throw new InvalidTokenError(`GitLab PAT validation failed (HTTP ${userResponse.status})`)
                    }

                    const user = await userResponse.json();

                    if (requireUser && !allowedUsers.includes(user.username)) {
                        cache.delete(tokenHash);
                        throw new InvalidTokenError('GitLab user is not allowed')
                    }

                    let tokenInfo = null;

                    if (requireClientId) {
                        const tokenInfoResponse = await fetch(`${apiBaseUrl}/oauth/token/info`, {
                            headers: {Authorization: `Bearer ${token}`},
                            signal
                        });

                        if (!tokenInfoResponse.ok) {
                            cache.delete(tokenHash);
                            throw new InvalidTokenError(`GitLab token info validation failed (HTTP ${tokenInfoResponse.status})`)
                        }

                        tokenInfo = await tokenInfoResponse.json();

                        const tokenInfoClientId = this.#getGitlabTokenInfoClientId(tokenInfo);

                        if (!tokenInfoClientId || !allowedClientIds.includes(tokenInfoClientId)) {
                            cache.delete(tokenHash);
                            throw new InvalidTokenError('GitLab OAuth application is not allowed')
                        }
                    }

                    signal.throwIfAborted();
                    cache.set(tokenHash, {user, tokenInfo, expiresAt: Date.now() + ttlMs});

                    const tokenInfoClientId = this.#getGitlabTokenInfoClientId(tokenInfo),
                          appSuffix         = tokenInfoClientId ? `, client: ${tokenInfoClientId}` : '';

                    logger.info(`[AuthService] GitLab PAT validated for user: ${user.name || user.username}${appSuffix}`);

                    return buildInfo(token, user, tokenInfo)
                } catch (error) {
                    cache.delete(tokenHash);

                    if (signal.aborted) {
                        throw new InvalidTokenError(`GitLab PAT validation timed out after ${validationTimeoutMs}ms`)
                    }

                    throw error
                }
            }
        }
    }

    /**
     * @summary Installs the GitHub-PAT bearer middleware.
     *
     * Same naked-401 contract as `setupGitlabPat`: NO `mcpAuthMetadataRouter`, NO
     * `resourceMetadataUrl` — a missing/invalid token yields a bare `WWW-Authenticate: Bearer`
     * 401 with no `resource_metadata` breadcrumb, so OAuth-aware clients do not attempt Dynamic
     * Client Registration against an identity provider that has none. PATs carry no audience
     * claim, so `aud` enforcement is intentionally absent.
     * @param {Object}   options
     * @param {Object}   options.app      The Express application instance
     * @param {Object}   options.aiConfig The server configuration object
     * @param {Object}   options.logger   The logger instance
     * @param {Object}   deps
     * @param {Function} deps.requireBearerAuth SDK bearer-auth middleware factory
     * @param {Function} deps.InvalidTokenError SDK error class for rejected tokens
     */
    setupGithubPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError}) {
        const verifier = this.createGithubPatVerifier({aiConfig, logger, InvalidTokenError});

        app.use(requireBearerAuth({verifier, requiredScopes: []}));

        logger.info(`[AuthService] Authorization enabled (mode: github-pat, GitHub API: ${aiConfig.auth.githubApiBaseUrl})`)
    }

    /**
     * Builds the `{verifyAccessToken}` verifier for GitHub-PAT mode. The verifier presents the
     * incoming bearer token to `GET {githubApiBaseUrl}/user`; a `200` resolves the identity
     * (`userId` = GitHub `login`, `source` = `'github-pat'`) in the same AuthInfo shape the
     * GitLab-PAT verifier produces and `RequestContextService` already consumes. An optional
     * `auth.allowedUsers` allowlist can gate the resolved GitHub login (default-off). There is
     * deliberately no client-id gate: GitHub PATs expose no OAuth-app identity comparable to
     * GitLab's `/oauth/token/info`. Successful validations are cached by SHA-256 token hash for
     * `auth.patCacheTtlSeconds` so a revoked PAT clears within that bounded window; failures are
     * never cached (a transient GitHub error must not lock a client out). Each cache miss gives the
     * `/user` fetch one `auth.patValidationTimeoutMs` deadline. The raw token is never logged — only
     * its resolved identity.
     *
     * GitHub request-contract notes: a `User-Agent` header is REQUIRED (GitHub rejects UA-less
     * requests with 403), and `X-GitHub-Api-Version` pins the REST contract. Classic PATs echo
     * their granted scopes in the `x-oauth-scopes` response header; fine-grained PATs omit it
     * (scopes resolve to `[]` — identity, not permission introspection, is the contract here).
     * @param {Object}   options
     * @param {Object}   options.aiConfig
     * @param {Object}   options.logger
     * @param {Function} options.InvalidTokenError
     * @returns {{verifyAccessToken: Function}}
     */
    createGithubPatVerifier({aiConfig, logger, InvalidTokenError}) {
        const
            apiBaseUrl          = aiConfig.auth.githubApiBaseUrl.replace(/\/+$/, ''),
            ttlSeconds          = aiConfig.auth.patCacheTtlSeconds,
            ttlMs               = ttlSeconds * 1000,
            validationTimeoutMs = this.#validatePatValidationTimeoutMs(aiConfig.auth.patValidationTimeoutMs),
            allowedUsers        = this.#normalizePatAllowlist(aiConfig.auth.allowedUsers),
            requireUser         = allowedUsers.length > 0,
            cache               = new Map(); // tokenHash -> {user, scopes, expiresAt} (cache-freshness, ms)

        // AuthInfo shape mirrors the GitLab-PAT verifier: `expiresAt` is REQUIRED by the SDK
        // `requireBearerAuth` (it rejects expiry-less auth info before `req.auth` is set), and
        // GitHub `/user` does not return the PAT's own expiry, so we use the re-validation
        // horizon: one cache window from now (Unix seconds). Built per-call so `expiresAt`
        // stays request-fresh on cache hits.
        const buildInfo = (token, user, scopes) => ({
            token,
            clientId : user.login,
            scopes,
            expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
            userId   : user.login,
            username : user.name || user.login,
            // Provenance tag read by RequestContextService.getSource(); distinguishes a GitHub-PAT
            // identity from OIDC / gitlab-pat / stdio env-var / gh-CLI sources.
            source   : 'github-pat',
            // Provider-neutral identity metadata consumed by Memory Core's request-time
            // AgentIdentity auto-provisioner. The raw bearer token remains in AuthInfo only for
            // the SDK middleware boundary and is never copied into graph identity properties.
            authProvider       : 'github',
            authSource         : 'github-pat',
            providerBaseUrl    : apiBaseUrl,
            providerUserId     : user.id == null ? undefined : String(user.id),
            providerUsername   : user.login,
            providerDisplayName: user.name || user.login
        });

        return {
            verifyAccessToken: async (token) => {
                const
                    tokenHash = createHash('sha256').update(token).digest('hex'),
                    cached    = cache.get(tokenHash);

                if (cached && cached.expiresAt > Date.now()) {
                    return buildInfo(token, cached.user, cached.scopes)
                }

                const signal = AbortSignal.timeout(validationTimeoutMs);

                try {
                    const userResponse = await fetch(`${apiBaseUrl}/user`, {
                        headers: {
                            'Accept'              : 'application/vnd.github+json',
                            'Authorization'       : `Bearer ${token}`,
                            'User-Agent'          : 'neo-agent-os',
                            'X-GitHub-Api-Version': '2022-11-28'
                        },
                        signal
                    });

                    if (!userResponse.ok) {
                        cache.delete(tokenHash);
                        throw new InvalidTokenError(`GitHub PAT validation failed (HTTP ${userResponse.status})`)
                    }

                    // Classic PATs advertise granted scopes here; fine-grained PATs omit the header.
                    const
                        scopeHeader = userResponse.headers?.get?.('x-oauth-scopes') || '',
                        scopes      = scopeHeader.split(',').map(scope => scope.trim()).filter(Boolean),
                        user        = await userResponse.json();

                    if (requireUser && !allowedUsers.includes(user.login)) {
                        cache.delete(tokenHash);
                        throw new InvalidTokenError('GitHub user is not allowed')
                    }

                    signal.throwIfAborted();
                    cache.set(tokenHash, {user, scopes, expiresAt: Date.now() + ttlMs});

                    logger.info(`[AuthService] GitHub PAT validated for user: ${user.name || user.login}`);

                    return buildInfo(token, user, scopes)
                } catch (error) {
                    cache.delete(tokenHash);

                    if (signal.aborted) {
                        throw new InvalidTokenError(`GitHub PAT validation timed out after ${validationTimeoutMs}ms`)
                    }

                    throw error
                }
            }
        }
    }
}

export default Neo.setupClass(AuthService);
