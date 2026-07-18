import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../src/core/Base.mjs';
import config      from './config.mjs';

const execAsync = promisify(exec);

/**
 * @summary GitHub API Client Wrapper (GraphQL & REST).
 *
 * This service abstracts the complexity of communicating with the GitHub API. It handles:
 * 1.  **Authentication:** Smart token resolution, prioritizing environment variables (`GH_TOKEN`, `GITHUB_TOKEN`)
 *     for CI/CD environments, and falling back to the `gh` CLI for local development.
 * 2.  **Protocol Abstraction:** Provides unified methods for both `query` (GraphQL) and `rest` (v3 API) requests.
 * 3.  **Error Handling:** Standardizes error reporting for API failures.
 *
 * **Key Concepts:**
 * - **Hybrid API Usage:** Uses GraphQL for efficient, deep data fetching (e.g., multi-year contribution graphs in one RTT)
 *   and REST for simpler endpoints or those with different scope requirements (e.g., public organization memberships).
 *
 * @class DevIndex.services.GitHub
 * @extends Neo.core.Base
 * @singleton
 */
class GitHub extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.GitHub'
         * @protected
         */
        className: 'DevIndex.services.GitHub',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * GraphQL API Endpoint
         * @member {String} graphqlUrl='https://api.github.com/graphql'
         */
        graphqlUrl: 'https://api.github.com/graphql',
        /**
         * REST API Base URL
         * @member {String} restUrl='https://api.github.com'
         */
        restUrl: 'https://api.github.com',
        /**
         * Maximum retry attempts for transient REST transport failures.
         * @member {Number} restMaxRetryAttempts=3
         */
        restMaxRetryAttempts: 3,
        /**
         * Initial retry delay in milliseconds (shared by the REST loop and the GraphQL transient retry).
         * The legacy `restRetry*` name is retained as the operator-facing compatibility contract.
         * @member {Number} restRetryBaseDelayMs=1000
         */
        restRetryBaseDelayMs: 1000,
        /**
         * Maximum exponential retry delay in milliseconds (shared REST + GraphQL).
         * The legacy `restRetry*` name is retained as the operator-facing compatibility contract.
         * @member {Number} restRetryMaxDelayMs=10000
         */
        restRetryMaxDelayMs: 10000,
        /**
         * Jitter ratio applied to exponential retry delays (shared REST + GraphQL).
         * The legacy `restRetry*` name is retained as the operator-facing compatibility contract.
         * @member {Number} restRetryJitterRatio=0.2
         */
        restRetryJitterRatio: 0.2,
        /**
         * HTTP statuses that represent transient REST edge or proxy failures.
         * @member {Number[]} restRetryableHttpStatuses=[429,502,503,504]
         */
        restRetryableHttpStatuses: [429, 502, 503, 504],
        /**
         * Lower-cased message substrings that mark a transport OR API-level failure as a retryable
         * transient condition — the single classification source of truth shared by the REST network
         * catch and the GraphQL body/transport paths, so the two transports never drift into separate
         * hand-maintained lists. GitHub's intermittent `Resource not accessible by integration`
         * (a 200-body GraphQL error, transient despite its permissions wording — proven by same-token
         * success four hours apart) sits here beside the transport failures; a genuine permission
         * misconfiguration still fails loudly, only after the bounded budget rather than on attempt 1.
         * @member {String[]} retryableTransientErrorPatterns
         */
        retryableTransientErrorPatterns: [
            'fetch failed',
            'network',
            'terminated',
            'timeout',
            'econnreset',
            'etimedout',
            'enotfound',
            'eai_again',
            'socket hang up',
            'resource not accessible by integration'
        ],
        /**
         * Current Rate Limit Status
         * @member {Object} rateLimit
         */
        rateLimit: {
            core                : {remaining: 5000, reset: null, limit: 5000},
            search              : {remaining:   30, reset: null, limit:   30},
            graphql             : {remaining: 5000, reset: null, limit: 5000},
            integration_manifest: {remaining: 5000, reset: null, limit: 5000}
        }
    }

    /**
     * Cached Auth Token
     * @member {String|null} #authToken=null
     * @private
     */
    #authToken = null;

    /**
     * Fetches the GitHub authentication token from the `gh` CLI.
     * @returns {Promise<string>}
     * @private
     */
    async #getAuthToken() {
        if (this.#authToken) return this.#authToken;

        const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

        if (envToken) {
            this.#authToken = envToken.trim();
            return this.#authToken;
        }

        try {
            const { stdout } = await execAsync('gh auth token');
            this.#authToken = stdout.trim();
            return this.#authToken;
        } catch (e) {
            console.error('[GitHub] Failed to get auth token from environment or `gh` CLI.');
            throw new Error('Authentication failed. Please set GH_TOKEN/GITHUB_TOKEN or run `gh auth login`.');
        }
    }

    /**
     * @summary Calculates the bounded, jittered backoff delay for a transient retry (shared REST + GraphQL).
     * @param {Number}        attempt       The 1-based retry attempt.
     * @param {Response|null} [response=null] The failed response, when available (honours `Retry-After`).
     * @returns {Number} Delay in milliseconds.
     * @private
     */
    #getRetryDelay(attempt, response=null) {
        const retryAfter = response?.headers?.get?.('retry-after');

        if (retryAfter) {
            const seconds = Number(retryAfter);

            if (Number.isFinite(seconds)) {
                return Math.max(0, seconds * 1000);
            }

            const retryAt = Date.parse(retryAfter);

            if (Number.isFinite(retryAt)) {
                return Math.max(0, retryAt - Date.now());
            }
        }

        const baseDelay = Math.min(
            this.restRetryMaxDelayMs,
            this.restRetryBaseDelayMs * 2 ** (attempt - 1)
        );
        const jitter = baseDelay * this.restRetryJitterRatio * Math.random();

        return Math.min(this.restRetryMaxDelayMs, Math.round(baseDelay + jitter));
    }

    /**
     * @summary Determines whether a failure — transport OR API-level — is a retryable transient
     * condition, classified from the shared `retryableTransientErrorPatterns` source of truth so the
     * REST and GraphQL transports never drift into separate hand-maintained lists.
     * @param {Error|String} error The thrown error, or a GraphQL body-error message string.
     * @returns {Boolean}
     * @private
     */
    #isRetryableTransientError(error) {
        const message = [
            error?.message,
            error?.cause?.message,
            error?.cause?.code,
            error?.code,
            String(error)
        ].filter(Boolean).join(' ').toLowerCase();

        return this.retryableTransientErrorPatterns.some(pattern => message.includes(pattern));
    }

    /**
     * @summary Whether a GraphQL operation document is a mutation. A `query` (or the anonymous
     * shorthand) is idempotent by the GraphQL spec and safe to replay after a transient failure; a
     * `mutation` is not — replaying it after an ambiguous outcome (a transport disconnect or a
     * partial-data error response) can duplicate an already-applied write. Leading whitespace and
     * `#` line comments are skipped before
     * the leading operation keyword is read, so a documented mutation is still recognised.
     * @param {String} query The GraphQL operation document.
     * @returns {Boolean}
     * @private
     */
    #isMutation(query) {
        return /^\s*(#[^\n]*\n\s*)*mutation\b/.test(query);
    }

    /**
     * @summary Determines whether a REST response status is configured as transient.
     * @param {Number} status The HTTP response status.
     * @returns {Boolean}
     * @private
     */
    #isRestRetryableHttpStatus(status) {
        return this.restRetryableHttpStatuses.includes(status);
    }

    /**
     * @summary Releases a failed REST response body before opening the next connection.
     * @param {Response} response The response whose body will no longer be consumed.
     * @returns {Promise<void>}
     * @private
     */
    async #releaseRestResponseBody(response) {
        const body = response?.body;

        if (!body || body.locked) {
            return;
        }

        try {
            await body.cancel();
        } catch {
            // The original request failure remains authoritative when body cleanup also fails.
        }
    }

    /**
     * @summary Waits for a bounded REST retry delay.
     * @param {Number} delay Delay in milliseconds.
     * @returns {Promise<void>}
     * @private
     */
    async #sleep(delay) {
        if (delay <= 0) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * @summary Logs and waits before retrying a transient REST failure.
     * @param {String}        prefix          Request-specific log prefix.
     * @param {String}        reason          Safe retry reason for logs.
     * @param {Number}        attempt         The 1-based retry attempt.
     * @param {Response|null} [response=null] The failed response, when available.
     * @returns {Promise<void>}
     * @private
     */
    async #waitForRestRetry(prefix, reason, attempt, response=null) {
        const delay = this.#getRetryDelay(attempt, response);

        console.warn(
            `${prefix} ${reason}; retrying in ${delay}ms ` +
            `(attempt ${attempt}/${this.restMaxRetryAttempts})`
        );
        await this.#sleep(delay);
    }

    /**
     * Updates the internal rate limit state from response headers.
     * @param {Response} response
     * @private
     */
    #updateRateLimit(response) {
        const headers  = response.headers;
        const resource = headers.get('x-ratelimit-resource');

        // If resource is unknown, fallback to core (safest assumption)
        const bucketName = (resource && this.rateLimit[resource]) ? resource : 'core';
        const bucket     = this.rateLimit[bucketName];

        // GitHub sends headers as `x-ratelimit-*` (standard)
        const remaining = headers.get('x-ratelimit-remaining');
        const reset     = headers.get('x-ratelimit-reset');
        const limit     = headers.get('x-ratelimit-limit');

        if (remaining !== null) bucket.remaining = parseInt(remaining, 10);
        if (reset !== null)     bucket.reset     = parseInt(reset, 10);
        if (limit !== null)     bucket.limit     = parseInt(limit, 10);

        // Debug: Warn if headers are missing but we are at default (implying no update ever happened)
        // Only warn on successful requests to avoid noise on 4xx/5xx errors (which might lack headers)
        if (response.ok && remaining === null && bucket.remaining === 5000) {
            // Only log once or sparsely to avoid spam
            if (!this._headerWarned) {
                console.warn('[GitHub] Warning: `x-ratelimit-*` headers not found. Falling back to body (if available).');
                this._headerWarned = true;
            }
        }
    }

    /**
     * Updates rate limit from GraphQL body.
     * @param {Object} rateLimit
     * @private
     */
    #updateFromBody(rateLimit) {
        if (!rateLimit) return;

        // GraphQL usually maps to 'graphql' resource (which shares quota with 'core')
        const bucket = this.rateLimit.graphql;

        if (rateLimit.remaining !== undefined) bucket.remaining = rateLimit.remaining;
        if (rateLimit.limit !== undefined)     bucket.limit     = rateLimit.limit;

        if (rateLimit.resetAt) {
            // GraphQL returns ISO string, we store epoch seconds
            bucket.reset = Math.floor(new Date(rateLimit.resetAt).getTime() / 1000);
        }
    }

    /**
     * Executes a GraphQL operation, retrying bounded transient failures (transport OR API-level, e.g.
     * GitHub's intermittent `Resource not accessible by integration`) from the shared classification
     * only when replay is safe for the operation.
     * @param {String} query
     * @param {Object} [variables={}]
     * @param {Number} [retries=3]
     * @param {String} [logContext='']
     * @param {Number} [attempt=1] 1-based retry attempt, threaded through transient retries for backoff.
     * @returns {Promise<Object>} The `data` property of the response.
     */
    async query(query, variables = {}, retries = 3, logContext = '', attempt = 1) {
        const token  = await this.#getAuthToken();
        const prefix = logContext ? `[GitHub] [${logContext}]` : '[GitHub]';

        try {
            const response = await fetch(this.graphqlUrl, {
                method : 'POST',
                headers: {
                    'Content-Type' : 'application/json',
                    'Authorization': `bearer ${token}`,
                    'User-Agent'   : 'Neo.mjs-DevIndex/1.0'
                },
                body: JSON.stringify({ query, variables })
            });

            this.#updateRateLimit(response);

            if (!response.ok) {
                // Retry on 5xx (Server Error) or 403 (Rate Limit/Abuse). A `>= 500` leaves a MUTATION's
                // server-side outcome AMBIGUOUS (the write may have applied before the error), so a mutation
                // is not replayed on it — a read still is. A `403` is a pre-execution rate-limit rejection,
                // so it is always safe to replay (the write never ran). Mirrors the transport-catch
                // retry-authorization gate.
                if (retries > 0 && (response.status === 403 || (response.status >= 500 && !this.#isMutation(query)))) {
                    let delay = (4 - retries) * 2000; // Default: 2s, 4s, 6s

                    // Special handling for 403 Secondary Rate Limit (Abuse Detection)
                    // If we have quota remaining but get a 403, it's an abuse trigger.
                    if (response.status === 403) {
                        const bucket = this.rateLimit.graphql;
                        if (bucket.remaining > 0) {
                            console.warn(`${prefix} ⚠️ Abuse Detection triggered (403 with quota). Backing off for 10s...`);
                            delay = 10000; // 10s penalty box
                        }
                    }

                    console.log(`${prefix} Error ${response.status}. Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    return this.query(query, variables, retries - 1, logContext);
                }
                throw new Error(`GraphQL Error: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();

            // Hook for body-based rate limit (more reliable for GraphQL)
            if (json.data?.rateLimit) {
                this.#updateFromBody(json.data.rateLimit);
            }

            if (json.errors) {
                // Check for "Not Found" or "Not a User" errors to abort retry immediately
                const messages = json.errors.map(e => e.message).join(', ');

                if (messages.includes('Could not resolve to a User') || messages.includes('NOT_FOUND')) {
                    throw new Error(`GraphQL Fatal Error: ${messages}`);
                }

                // Sometimes 502s come as 200 OK with errors body. Like a `>= 500`, a gateway error leaves a
                // MUTATION's outcome ambiguous, so it is not replayed for one — a read still is.
                const isGatewayError = json.errors.some(e => e.message?.includes('502') || e.message?.includes('504'));

                if (isGatewayError && retries > 0 && !this.#isMutation(query)) {
                    const delay = (4 - retries) * 2000;
                    console.log(`${prefix} Gateway Error in body. Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    return this.query(query, variables, retries - 1, logContext);
                }

                // IP Allow List restriction usually returns partial data (public contributions).
                // We log the warning but RETURN the data instead of throwing an error,
                // so the Updater can still process the public metrics.
                if (messages.includes('IP allow list enabled')) {
                    console.warn(`${prefix} Partial Data Warning: ${messages}`);
                    if (json.data) {
                        return json.data;
                    }
                }

                // A transient API failure can arrive as a 200-body error — GitHub intermittently returns
                // `Resource not accessible by integration` for a query it otherwise permits (proven by the
                // same token succeeding four hours apart). Classification comes from the SAME shared source
                // of truth the REST path uses, while authorization remains operation-aware: GraphQL may
                // return partial `data` beside `errors`, so a mutation might already have applied and must
                // fail loud rather than replay. Idempotent reads retain the bounded retry.
                const isTransientError = this.#isRetryableTransientError(messages);

                if (isTransientError && this.#isMutation(query)) {
                    throw new Error(`GraphQL Query Errors: ${messages}`);
                }

                if (retries > 0 && isTransientError) {
                    const delay = this.#getRetryDelay(attempt, response);
                    console.warn(`${prefix} Transient error: ${messages}; retrying in ${delay}ms (attempt ${attempt})`);
                    await this.#sleep(delay);
                    return this.query(query, variables, retries - 1, logContext, attempt + 1);
                }

                throw new Error(`GraphQL Query Errors: ${messages}`);
            }

            return json.data;
        } catch (error) {
            // Fatal errors (Do not retry)
            if (error.message.includes('Could not resolve to a User') || error.message.includes('NOT_FOUND') || error.message.includes('GraphQL Fatal Error')) {
                throw error;
            }

            // Transient failures retry from the SAME shared classification as the body-error path above
            // and the REST path — one source of truth, not a second inline token list that drifts — the
            // prior inline `fetch`/`network`/`terminated` list was exactly that drift.
            if (retries > 0 && this.#isRetryableTransientError(error)) {
                // Retry AUTHORIZATION is a separate decision from retry CLASSIFICATION: the failure is
                // transient, but a transport disconnect or a partial-data error response leaves a
                // mutation's server-side outcome ambiguous, so replaying it can duplicate an applied
                // write. A GraphQL `query` is idempotent and safe to replay; a `mutation` is not.
                if (this.#isMutation(query)) {
                    console.error(`${prefix} Transient error on a mutation — NOT replaying (ambiguous outcome may have already applied the write): ${error.message}`);
                    throw error;
                }
                const delay = this.#getRetryDelay(attempt);
                console.warn(`${prefix} Transient transport error: ${error.message}; retrying in ${delay}ms (attempt ${attempt})`);
                await this.#sleep(delay);
                return this.query(query, variables, retries - 1, logContext, attempt + 1);
            }
            console.error(`${prefix} GraphQL Query Failed:`, error.message);
            throw error;
        }
    }

    /**
     * Executes a REST API request.
     * @param {String} endpoint Relative path (e.g. 'search/repositories?q=...')
     * @param {String} [logContext='']
     * @returns {Promise<Object>} JSON response
     */
    async rest(endpoint, logContext = '') {
        const token  = await this.#getAuthToken();
        const url    = `${this.restUrl}/${endpoint.startsWith('/') ? endpoint.slice(1) : endpoint}`;
        const prefix = logContext ? `[GitHub] [${logContext}]` : '[GitHub]';

        try {
            for (let attempt = 0; attempt <= this.restMaxRetryAttempts; attempt++) {
                let response;

                try {
                    response = await fetch(url, {
                        method : 'GET',
                        headers: {
                            'Accept'       : 'application/vnd.github.v3+json',
                            'Authorization': `bearer ${token}`,
                            'User-Agent'   : 'Neo.mjs-DevIndex/1.0'
                        }
                    });
                } catch (error) {
                    if (attempt < this.restMaxRetryAttempts && this.#isRetryableTransientError(error)) {
                        await this.#waitForRestRetry(
                            prefix,
                            `Transient REST transport failure (${error.message})`,
                            attempt + 1
                        );
                        continue;
                    }

                    throw error;
                }

                this.#updateRateLimit(response);

                if (response.ok) {
                    try {
                        return await response.json();
                    } catch (error) {
                        if (attempt < this.restMaxRetryAttempts && this.#isRetryableTransientError(error)) {
                            await this.#releaseRestResponseBody(response);
                            await this.#waitForRestRetry(
                                prefix,
                                `Transient REST response-body failure (${error.message})`,
                                attempt + 1
                            );
                            continue;
                        }

                        throw error;
                    }
                }

                const error = new Error(`REST Error: ${response.status} ${response.statusText}`);

                await this.#releaseRestResponseBody(response);

                if (response.status === 403) {
                    this.rateLimit.core.remaining = 0;
                    throw error;
                }

                if (response.status === 404) {
                    throw error;
                }

                if (attempt < this.restMaxRetryAttempts && this.#isRestRetryableHttpStatus(response.status)) {
                    await this.#waitForRestRetry(prefix, error.message, attempt + 1, response);
                    continue;
                }

                throw error;
            }
        } catch (error) {
            console.error(`${prefix} REST Request Failed (${endpoint}):`, error.message);
            throw error;
        }
    }

    /**
     * Resolves a GitHub Node ID to the current login.
     * Used for tracking user renames.
     *
     * @param {String} nodeId The global node ID (Base64).
     * @returns {Promise<String|null>} The current login, or null if not found.
     */
    async getLoginById(nodeId) {
        // We use 'node' interface which is polymorphic.
        // If the ID belongs to a User, it will return the User object.
        const query = `
            query {
                node(id: "${nodeId}") {
                    ... on User {
                        login
                    }
                    ... on Organization {
                        login
                    }
                }
            }`;

        try {
            const data = await this.query(query, {}, 1, `ID:${nodeId}`);
            if (data?.node?.login) {
                return data.node.login;
            }
            return null;
        } catch (error) {
            // 404/Not Found on Node ID means hard deletion
            if (error.message.includes('NOT_FOUND') || error.message.includes('Could not resolve')) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Resolves a GitHub Database ID (Integer) to the current login.
     *
     * This method is critical for handling username changes (renames). When a stored login returns 404,
     * this method allows us to look up the new login associated with the immutable Database ID, preventing data loss.
     * Uses GitHub's REST account lookup (`/user/{account_id}`), since GraphQL's `user` field only accepts `login`.
     *
     * @param {Number} dbId The integer user ID.
     * @returns {Promise<String|null>} The current login, or null if the ID is invalid/deleted.
     */
    async getLoginByDatabaseId(dbId) {
        try {
            const data = await this.rest(`user/${dbId}`, `DB_ID:${dbId}`);
            return data?.login || null;
        } catch (error) {
            if (
                error.message.includes('404') ||
                error.message.includes('NOT_FOUND') ||
                error.message.includes('Could not resolve')
            ) {
                return null;
            }
            throw error;
        }
    }
}

export default Neo.setupClass(GitHub);
