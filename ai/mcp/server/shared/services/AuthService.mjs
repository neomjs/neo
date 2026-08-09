import Base                                          from '../../../../../src/core/Base.mjs';
import {createHash}                                  from 'crypto';
import {readFileSync, statSync}                      from 'fs';
import {isLocalBearerToken, matchesLocalBearerToken} from '../helpers/localBearer.mjs';
import {readSeatTokenRegistry, verifySeatToken}      from '../helpers/seatToken.mjs';

/**
 * @summary Installs the configured Streamable HTTP authentication strategy.
 *
 * This service acts as the **Authorization Anchor** for the MCP ecosystem. It dispatches the
 * declared OIDC, provider-PAT, seat-token, or disposable local-bearer strategy before Transport
 * opens the listener. OIDC implements the **Discovery-First Pattern**, dynamically resolving
 * security endpoints from the identity provider's `.well-known/openid-configuration`.
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

/**
 * @summary Whether a provider HTTP status is the provider ANSWERING "no", or failing to answer.
 *
 * **Only `401`.** Every other non-OK status — `5xx`, `429`, a proxy's `502` — is the provider unable
 * to answer, which is a transport condition wearing an HTTP status code. Treating those as
 * rejections made a third party's brief unavailability indistinguishable from a revoked token, on
 * the first call of every seat's turn.
 *
 * **`403` is deliberately NOT authoritative, and an earlier revision of this function had it wrong.**
 * GitHub answers a primary rate-limit breach with `403`, not `429`. Admitting it would evict a valid
 * identity and lock the seat out precisely when many agents share one source address — which is this
 * deployment's normal condition and the exact failure this whole path exists to prevent. A bare
 * status is only evidence in provider-specific context, and `403` carries at least two meanings.
 *
 * A closed positive list rather than a "not 5xx" test, for the same reason: an unrecognised status
 * must degrade toward "we could not ask", never toward "the answer was no". `403` is unrecognised in
 * the sense that matters — it does not, on its own, say the credential was refused.
 *
 * The cost is bounded and one-directional: a genuinely forbidden token survives until its stale
 * window expires, rather than a rate-limited fleet losing its identities immediately.
 *
 * @param {Number} status HTTP status from the provider identity endpoint.
 * @returns {Boolean} True only when the provider authoritatively rejected the credential.
 */
export function isAuthoritativeRejection(status) {
    return status === 401
}

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
     * @summary Installs authentication guards that must execute before transport CORS.
     *
     * Transport calls this phase for every Streamable HTTP boot without interpreting the
     * configured strategy. Custom middleware owns its complete ingress contract and therefore
     * suppresses built-in guards. The local-bearer strategy is the sole built-in with a
     * pre-CORS concern: its listener must be literal IPv4 loopback, and any present Origin
     * header must be rejected before CORS, bearer verification, or MCP session creation.
     * @param {Object} options
     * @param {Object} options.app Express application instance
     * @param {Object} options.aiConfig Server configuration object
     * @returns {void}
     */
    setupPreCors({app, aiConfig}) {
        if (typeof aiConfig.authMiddleware === 'function' || aiConfig.auth.mode !== 'local-bearer') {
            return
        }

        if (aiConfig.mcpListenHost !== '127.0.0.1') {
            throw new Error("Local-bearer mode requires mcpListenHost to be the literal IPv4 loopback address '127.0.0.1'")
        }

        app.use((req, res, next) => {
            if (Object.hasOwn(req.headers, 'origin')) {
                res.status(403).json({
                    jsonrpc: '2.0',
                    error  : {code: -32000, message: 'Origin header is not allowed in local-bearer mode'},
                    id     : null
                });
                return
            }

            next()
        })
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
        const
            {auth}            = aiConfig,
            hasCustomAuth     = typeof aiConfig.authMiddleware === 'function',
            hasOidcEndpoint   = Boolean(auth.host || auth.issuerUrl),
            isProxyOnlyCompat = auth.mode === 'oidc' && !hasOidcEndpoint && auth.trustProxyIdentity;

        this.#validateFirstProviderSubjectPolicy(aiConfig);

        // Custom middleware owns the complete authentication boundary and takes precedence over
        // every built-in state. Mount it exactly once here; Transport never interprets the leaf.
        if (hasCustomAuth) {
            app.use(aiConfig.authMiddleware);
            logger.info('[AuthService] Custom authorization middleware selected');
            return
        }

        // Proxy-only is the explicit no-OIDC compatibility state. The middleware owns header
        // extraction, rejection, and req.auth creation before Transport can dispatch a session.
        if (isProxyOnlyCompat) {
            this.setupProxyIdentity({app, logger});
            return
        }

        if (auth.mode === 'oidc' && !hasOidcEndpoint) {
            throw new Error(
                'AuthService: no Streamable HTTP authentication installer is configured; ' +
                'configure an OIDC endpoint, a built-in auth.mode, custom authMiddleware, or trusted-proxy identity'
            )
        }

        const {requireBearerAuth} = await import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
        const {InvalidTokenError} = await import('@modelcontextprotocol/sdk/server/auth/errors.js');

        // Local-bearer mode is possession-only: no PRM, discovery, identity lookup, or provisioning.
        if (auth.mode === 'local-bearer') {
            this.setupLocalBearer({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        // Seat-token mode: request-time SUBJECT binding — a registry-verified token resolves to
        // its minted AgentIdentity, plane-scoped and generation-invalidated (never possession-only).
        if (auth.mode === 'seat-token') {
            this.setupSeatToken({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        // GitLab-PAT mode installs a naked-401 bearer path (no `aud`, no PRM advertisement) and
        // returns early — the OIDC discovery + introspection flow below does not apply.
        if (auth.mode === 'gitlab-pat') {
            this.setupGitlabPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        // GitHub-PAT mode installs the same naked-401 bearer path against the GitHub `/user`
        // endpoint and returns early — the OIDC flow below does not apply.
        if (auth.mode === 'github-pat') {
            await this.setupGithubPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});
            return
        }

        if (auth.mode !== 'oidc') {
            throw new Error(`AuthService: unsupported auth.mode "${auth.mode}"`)
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

        // In the explicit OIDC+proxy state, bearer PRESENCE is terminal. The proxy middleware
        // only runs its identity path when Authorization is absent; malformed or invalid
        // credentials continue into the SDK bearer challenge and can never downgrade.
        if (auth.trustProxyIdentity) {
            this.setupProxyIdentity({app, logger}, {fallbackOnly: true})
        }

        const authMiddleware = requireBearerAuth({
            verifier           : tokenVerifier,
            requiredScopes     : [],
            resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
        });

        app.use(auth.trustProxyIdentity
            ? this.wrapOidcBearerMiddleware(authMiddleware)
            : authMiddleware
        );

        logger.info(`[AuthService] Authorization enabled (Issuer: ${oauthUrls.issuer})`);
    }

    /**
     * @summary Installs trusted-proxy identity authentication.
     *
     * Proxy-only mode always requires a trusted identity header. OIDC composition passes
     * `fallbackOnly=true`: any present Authorization header bypasses proxy interpretation and is
     * left exclusively to the SDK bearer middleware, while true absence may bind the proxy
     * subject. This service trusts the header only after the deployment's documented
     * strip/authenticate/inject ingress boundary.
     * @param {Object} options
     * @param {Object} options.app Express application instance
     * @param {Object} options.logger Logger instance
     * @param {Object} [policy]
     * @param {Boolean} [policy.fallbackOnly=false] Defer every present Authorization header
     * @returns {void}
     */
    setupProxyIdentity({app, logger}, {fallbackOnly=false}={}) {
        app.use(this.createProxyIdentityMiddleware({logger, fallbackOnly}));
        logger.info(`[AuthService] Trusted-proxy authorization enabled (${fallbackOnly ? 'OIDC fallback' : 'proxy-only'})`)
    }

    /**
     * @summary Builds the trusted-proxy identity middleware.
     * @param {Object} options
     * @param {Object} options.logger Logger instance
     * @param {Boolean} [options.fallbackOnly=false] Defer every present Authorization header
     * @returns {Function} Express middleware
     */
    createProxyIdentityMiddleware({logger, fallbackOnly=false}) {
        return (req, res, next) => {
            if (fallbackOnly && Object.hasOwn(req.headers, 'authorization')) {
                next();
                return
            }

            const proxyUserId = req.headers['x-preferred-username'] || req.headers['x-auth-request-preferred-username'];

            if (!proxyUserId) {
                logger.warn('Unauthorized: trustProxyIdentity is enabled but X-PREFERRED-USERNAME header is missing');
                res.status(401).json({error: 'Unauthorized: Missing proxy identity header'});
                return
            }

            req.auth = {
                userId  : proxyUserId,
                username: proxyUserId,
                source  : 'proxy-header'
            };

            next()
        }
    }

    /**
     * @summary Wraps OIDC bearer authentication with the trusted-proxy absence fallback.
     *
     * The preceding proxy middleware can create req.auth only when Authorization is absent. A
     * proxy-bound request skips the SDK challenge; every request with Authorization still runs
     * the unmodified bearer middleware, preserving terminal invalid/malformed-token behavior.
     * @param {Function} authMiddleware SDK bearer middleware
     * @returns {Function} Express middleware
     */
    wrapOidcBearerMiddleware(authMiddleware) {
        return (req, res, next) => {
            if (!Object.hasOwn(req.headers, 'authorization') && req.auth?.source === 'proxy-header') {
                next();
                return
            }

            return authMiddleware(req, res, next)
        }
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
     * @summary Installs the seat-token bearer middleware — the request-time subject-binding mode.
     *
     * Same naked-401 contract as the PAT modes (no metadata router, no `resource_metadata`
     * breadcrumb). The verifier fails loud at SETUP when the registry is unreadable: a server
     * that requires seat tokens without a provisioned registry is a boot defect, not a 401.
     * @param {Object}   options
     * @param {Object}   options.app Express application instance
     * @param {Object}   options.aiConfig Server configuration object
     * @param {Object}   options.logger Logger instance
     * @param {Object}   deps
     * @param {Function} deps.requireBearerAuth SDK bearer-auth middleware factory
     * @param {Function} deps.InvalidTokenError SDK error class for rejected tokens
     * @returns {void}
     */
    setupSeatToken({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError}) {
        const verifier = this.createSeatTokenVerifier({aiConfig, logger, InvalidTokenError});

        app.use(requireBearerAuth({verifier, requiredScopes: []}));

        logger.info(`[AuthService] Authorization enabled (mode: seat-token, plane: ${aiConfig.plane.id})`)
    }

    /**
     * @summary Builds the `{verifyAccessToken}` verifier for seat-token mode.
     *
     * The registry (mint-side artifact of the seat-config generator) is read at setup and
     * re-read on mtime change, so regenerating seat configs invalidates prior generations on a
     * LIVE server — the identity-spine reload analog, no restart required. Verification is
     * plane-scoped against the server's RESOLVED `plane.id`; every rejection carries its named
     * classification (`wrong-plane` / `stale-generation` / `unknown-token` / `malformed-token`)
     * so a seat admitted to an overlay presenting against the durable plane fails closed and
     * honestly. A verified token resolves to its minted `AgentIdentity` subject: `userId` is
     * the identity login (the same shape the stdio env-var path resolves), and
     * `agentIdentityNodeId` rides the auth info for graph-edge consumers.
     * @param {Object}   options
     * @param {Object}   options.aiConfig
     * @param {Object}   options.logger
     * @param {Function} options.InvalidTokenError
     * @returns {{verifyAccessToken: Function}}
     */
    createSeatTokenVerifier({aiConfig, logger, InvalidTokenError}) {
        const
            registryPath = aiConfig.auth.seatTokenRegistryPath,
            planeId      = aiConfig.plane.id;

        let cachedRegistry = readSeatTokenRegistry(registryPath),
            cachedMtimeMs  = statSync(registryPath).mtimeMs;

        const loadRegistry = () => {
            const mtimeMs = statSync(registryPath).mtimeMs;

            if (mtimeMs !== cachedMtimeMs) {
                cachedRegistry = readSeatTokenRegistry(registryPath);
                cachedMtimeMs  = mtimeMs;
            }
            return cachedRegistry
        };

        logger.info(`[AuthService] Seat-token registry loaded (generation ${cachedRegistry.generation}, ${cachedRegistry.rows.length} seat(s))`);

        return {
            verifyAccessToken: async token => {
                const outcome = verifySeatToken({token, registry: loadRegistry(), planeId});

                if (!outcome.ok) {
                    throw new InvalidTokenError(`Seat token rejected (${outcome.reason})`)
                }

                // The registry mint validates canonical `AGENT_IDENTITY:@handle` node ids; the
                // login strip mirrors the stdio env-var resolution shape consumed by
                // `RequestContextService.getUserId()` tenant tagging.
                const login = outcome.row.agentIdentityNodeId.replace(/^AGENT_IDENTITY:/, '').replace(/^@/, '');

                return {
                    token,
                    clientId : 'neo-seat-token',
                    // Authorization stays a NAMED extension point: seat tokens authenticate a
                    // subject; per-subject capability scoping (auth ≠ admission ≠ authorization)
                    // is a later contract that would populate these scopes — deliberately not
                    // invented here.
                    scopes   : [],
                    expiresAt: Number.MAX_SAFE_INTEGER,
                    userId   : login,
                    username : login,
                    // Provenance tag read by RequestContextService.getSource().
                    source   : 'seat-token',
                    // Graph-edge consumers terminate AUTHORED_BY/OWNED_BY on the minted subject
                    // directly — no re-derivation from the login.
                    agentIdentityNodeId: outcome.row.agentIdentityNodeId
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
     * @summary Validates the explicit first-provider-subject admission policy.
     *
     * The baseline policy is deliberately scoped to the rosterless local GitHub profile. It must
     * not reinterpret empty PAT allowlists mode-generally or alter GitLab-PAT's shipped admit-any-
     * validated-user default. Custom/proxy combinations are ambiguous because they introduce a
     * second identity authority beside the provider subject.
     * @param {Object} aiConfig Resolved ConfigProvider tree
     * @returns {void}
     * @throws {Error} When the policy's legal state is not fully declared
     */
    #validateFirstProviderSubjectPolicy(aiConfig) {
        const {auth} = aiConfig;

        if (!auth.pinFirstProviderSubject) {
            return
        }

        if (auth.mode !== 'github-pat') {
            throw new Error('AuthService: first-provider-subject policy requires auth.mode "github-pat"')
        }

        if (this.#normalizePatAllowlist(auth.allowedUsers).length > 0) {
            throw new Error('AuthService: first-provider-subject policy cannot be combined with auth.allowedUsers')
        }

        const
            hasDirectBootstrapPat = typeof auth.providerBootstrapPat === 'string'
                && auth.providerBootstrapPat.trim().length > 0,
            hasBootstrapPatFile   = typeof auth.providerBootstrapPatFile === 'string'
                && auth.providerBootstrapPatFile.trim().length > 0;

        if (hasDirectBootstrapPat === hasBootstrapPatFile) {
            throw new Error(
                'AuthService: first-provider-subject policy requires exactly one of ' +
                'auth.providerBootstrapPat or auth.providerBootstrapPatFile'
            )
        }

        if (auth.trustProxyIdentity) {
            throw new Error('AuthService: first-provider-subject policy cannot be combined with trusted-proxy identity')
        }

        if (typeof aiConfig.authMiddleware === 'function') {
            throw new Error('AuthService: first-provider-subject policy cannot be combined with custom authMiddleware')
        }
    }

    /**
     * @summary Resolves the bootstrap PAT from the one validated direct-value or file carrier.
     *
     * Secret-file content is read once, before middleware installation and listener creation.
     * Errors name only the carrier; they never include the file contents or credential.
     * @param {Object} auth Resolved `AiConfig.auth` subtree
     * @returns {String} Bootstrap PAT
     * @throws {Error} When the configured file cannot be read or contains no credential
     */
    #resolveProviderBootstrapPat(auth) {
        if (typeof auth.providerBootstrapPat === 'string' && auth.providerBootstrapPat.trim().length > 0) {
            return auth.providerBootstrapPat.trim()
        }

        let value;

        try {
            value = readFileSync(auth.providerBootstrapPatFile.trim(), 'utf8').trim()
        } catch {
            throw new Error('AuthService: cannot read auth.providerBootstrapPatFile')
        }

        if (!value) {
            throw new Error('AuthService: auth.providerBootstrapPatFile contains no credential')
        }

        return value
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
            staleGraceMs        = Math.max(0, Number(aiConfig.auth.patStaleGraceSeconds) || 0) * 1000,
            cache               = new Map(); // tokenHash -> {user, tokenInfo, expiresAt} (cache-freshness, ms)

        /**
         * Identical contract to the GitHub verifier's: an UNREACHABLE provider may serve the last
         * affirmative answer within a bounded grace window; a REJECTING one never can. Duplicated
         * rather than shared because the two verifiers keep separate caches and entry shapes, and a
         * premature abstraction over an auth boundary hides which provider a decision belongs to.
         */
        const serveStaleGitlab = (entry, reason) => {
            if (!entry || staleGraceMs === 0 || Date.now() > entry.expiresAt + staleGraceMs) {
                return null
            }

            logger.warn(
                `[AuthService] GitLab provider unreachable (${reason}); serving previously-validated ` +
                `identity '${entry.user?.username}' from cache, ${Math.round((Date.now() - entry.expiresAt) / 1000)}s past TTL.`
            );

            return entry
        };

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
                        // Same split as the GitHub arm: only an authoritative rejection evicts. A
                        // 5xx, a 429 or a proxy's 502 is the provider failing to ANSWER, and a
                        // displaced identity must not be destroyed because a third party is down.
                        if (isAuthoritativeRejection(userResponse.status)) {
                            cache.delete(tokenHash);
                            throw new InvalidTokenError(`GitLab PAT validation failed (HTTP ${userResponse.status})`)
                        }

                        const stale = serveStaleGitlab(cached, `HTTP ${userResponse.status}`);

                        if (stale) {
                            return buildInfo(token, stale.user, stale.tokenInfo)
                        }

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
                    // An InvalidTokenError raised above already made its own eviction decision —
                    // authoritative rejections deleted the entry, transient ones deliberately kept
                    // it. Re-deleting unconditionally, as this used to, destroys the fallback.
                    if (error instanceof InvalidTokenError) {
                        throw error
                    }

                    const stale = serveStaleGitlab(cached, signal.aborted ? `timeout after ${validationTimeoutMs}ms` : 'network error');

                    if (stale) {
                        return buildInfo(token, stale.user, stale.tokenInfo)
                    }

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
     * @returns {Promise<void>}
     */
    async setupGithubPat({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError}) {
        const verifier = this.createGithubPatVerifier({aiConfig, logger, InvalidTokenError});

        if (aiConfig.auth.pinFirstProviderSubject) {
            await verifier.establishPinnedProviderSubject(this.#resolveProviderBootstrapPat(aiConfig.auth))
        }

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
     * @returns {{verifyAccessToken: Function, establishPinnedProviderSubject: Function}}
     */
    createGithubPatVerifier({aiConfig, logger, InvalidTokenError}) {
        const
            apiBaseUrl          = aiConfig.auth.githubApiBaseUrl.replace(/\/+$/, ''),
            ttlSeconds          = aiConfig.auth.patCacheTtlSeconds,
            ttlMs               = ttlSeconds * 1000,
            validationTimeoutMs = this.#validatePatValidationTimeoutMs(aiConfig.auth.patValidationTimeoutMs),
            allowedUsers        = this.#normalizePatAllowlist(aiConfig.auth.allowedUsers),
            requireUser         = allowedUsers.length > 0,
            pinSubject          = aiConfig.auth.pinFirstProviderSubject === true,
            staleGraceMs        = Math.max(0, Number(aiConfig.auth.patStaleGraceSeconds) || 0) * 1000,
            cache               = new Map(); // tokenHash -> {user, scopes, expiresAt} (cache-freshness, ms)

        let pinnedProviderSubject = null;

        /**
         * Decides whether an expired-but-known token may still be admitted because the PROVIDER —
         * not the credential — failed. Returns the entry to serve, or null to reject as before.
         *
         * The asymmetry is the design: successes are cached, failures are SURVIVED. Caching a
         * failure would be the symmetric-looking mistake, and it would lock out a user who had just
         * repaired their token. This instead keeps the last affirmative answer usable while nobody
         * can be asked, and only while nobody can be asked.
         *
         * The revocation guarantee weakens from `ttl` to `ttl + grace` EXCLUSIVELY in the window
         * where the provider is unreachable, and never in response to a real rejection. Setting
         * `patStaleGraceSeconds: 0` disables this entirely and restores the prior behaviour.
         */
        const serveStale = (entry, reason) => {
            if (!entry || staleGraceMs === 0 || Date.now() > entry.expiresAt + staleGraceMs) {
                return null
            }

            // Logged rather than silent: an operator must be able to tell a stale-served request
            // from a freshly validated one, or "auth is fine" becomes unfalsifiable during exactly
            // the outage this exists to survive.
            logger.warn(
                `[AuthService] GitHub provider unreachable (${reason}); serving previously-validated ` +
                `identity '${entry.user?.login}' from cache, ${Math.round((Date.now() - entry.expiresAt) / 1000)}s past TTL.`
            );

            return entry
        };

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

        /**
         * Applies the process-lifetime admission decision after provider validation but before
         * AuthInfo can reach Express. Bootstrap is the only call allowed to establish the pin.
         * @param {Object} info Provider-validated AuthInfo
         * @param {Boolean} establishPin True only for the pre-listen bootstrap call
         * @returns {Object} The admitted AuthInfo
         */
        const admitProviderSubject = (info, establishPin) => {
            if (!pinSubject) {
                return info
            }

            if (establishPin) {
                if (pinnedProviderSubject !== null) {
                    throw new InvalidTokenError('First provider subject is already established for this process')
                }

                pinnedProviderSubject = info.userId;
                return info
            }

            if (!pinnedProviderSubject) {
                throw new InvalidTokenError('First provider subject has not been established')
            }

            if (info.userId !== pinnedProviderSubject) {
                throw new InvalidTokenError('GitHub provider subject does not match the process pin')
            }

            return info
        };

        /**
         * Provider validation with an explicit bootstrap-only pin establishment branch.
         * @param {String} token Presented PAT
         * @param {Boolean} [establishPin=false] True only before middleware installation
         * @returns {Promise<Object>} Admitted AuthInfo
         */
        const verify = async (token, establishPin=false) => {
            const
                tokenHash = createHash('sha256').update(token).digest('hex'),
                cached    = cache.get(tokenHash);

            if (cached && cached.expiresAt > Date.now()) {
                return admitProviderSubject(buildInfo(token, cached.user, cached.scopes), establishPin)
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
                    // 401/403 is the provider ANSWERING "no" — authoritative, evict, never softened.
                    // Anything else (5xx, 429, a proxy's 502) is the provider failing to answer at
                    // all, which is a transport condition wearing an HTTP status. Collapsing the two
                    // is the defect: it made GitHub being briefly unavailable identical to a revoked
                    // credential, for every seat, on the first call of every turn.
                    if (isAuthoritativeRejection(userResponse.status)) {
                        cache.delete(tokenHash);
                        throw new InvalidTokenError(`GitHub PAT validation failed (HTTP ${userResponse.status})`)
                    }

                    const stale = serveStale(cached, `HTTP ${userResponse.status}`);

                    if (stale) {
                        return admitProviderSubject(buildInfo(token, stale.user, stale.scopes), establishPin)
                    }

                    throw new InvalidTokenError(`GitHub PAT validation failed (HTTP ${userResponse.status})`)
                }

                // Classic PATs advertise granted scopes here; fine-grained PATs omit the header.
                const
                    scopeHeader = userResponse.headers?.get?.('x-oauth-scopes') || '',
                    scopes      = scopeHeader.split(',').map(scope => scope.trim()).filter(Boolean),
                    user        = await userResponse.json();

                if (typeof user.login !== 'string' || user.login.trim().length === 0) {
                    cache.delete(tokenHash);
                    throw new InvalidTokenError('GitHub PAT validation returned no provider login')
                }

                if (requireUser && !allowedUsers.includes(user.login)) {
                    cache.delete(tokenHash);
                    throw new InvalidTokenError('GitHub user is not allowed')
                }

                signal.throwIfAborted();

                const info = admitProviderSubject(buildInfo(token, user, scopes), establishPin);

                cache.set(tokenHash, {user, scopes, expiresAt: Date.now() + ttlMs});

                logger.info(`[AuthService] GitHub PAT validated for user: ${user.name || user.login}`);

                return info
            } catch (error) {
                // An InvalidTokenError raised above already made its own eviction decision — an
                // authoritative rejection deleted the entry, a transient one deliberately kept it.
                // Re-deleting here unconditionally, as this used to, destroyed the stale entry that
                // is the whole fallback.
                if (error instanceof InvalidTokenError) {
                    throw error
                }

                // A timeout or a network error is the provider being UNREACHABLE. The entry survives
                // and is served if it is inside the grace window; the credential itself was never
                // questioned, so nothing about it has been softened.
                const stale = serveStale(cached, signal.aborted ? `timeout after ${validationTimeoutMs}ms` : 'network error');

                if (stale) {
                    return admitProviderSubject(buildInfo(token, stale.user, stale.scopes), establishPin)
                }

                cache.delete(tokenHash);

                if (signal.aborted) {
                    throw new InvalidTokenError(`GitHub PAT validation timed out after ${validationTimeoutMs}ms`)
                }

                // Fetch/header/JSON implementations may echo credential-bearing request data in
                // their native error messages. Collapse every unexpected provider failure to one
                // redacted auth error before it can reach startup logs or an HTTP response.
                throw new InvalidTokenError('GitHub PAT validation failed before provider identity was established')
            }
        };

        return {
            verifyAccessToken             : token => verify(token),
            establishPinnedProviderSubject: token => verify(token, true)
        }
    }
}

export default Neo.setupClass(AuthService);
