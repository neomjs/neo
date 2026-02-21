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
     * Executes a GraphQL query.
     * @param {String} query
     * @param {Object} [variables={}]
     * @param {Number} [retries=3]
     * @param {String} [logContext='']
     * @returns {Promise<Object>} The `data` property of the response.
     */
    async query(query, variables = {}, retries = 3, logContext = '') {
        const token = await this.#getAuthToken();
        const prefix = logContext ? `[GitHub] [${logContext}]` : '[GitHub]';

        try {
            const response = await fetch(this.graphqlUrl, {
                method: 'POST',
                headers: {
                    'Content-Type' : 'application/json',
                    'Authorization': `bearer ${token}`,
                    'User-Agent'   : 'Neo.mjs-DevIndex/1.0'
                },
                body: JSON.stringify({ query, variables })
            });

            this.#updateRateLimit(response);

            if (!response.ok) {
                // Retry on 5xx (Server Error) or 403 (Rate Limit/Abuse)
                if ((response.status >= 500 || response.status === 403) && retries > 0) {
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

                // Sometimes 502s come as 200 OK with errors body
                const isGatewayError = json.errors.some(e => e.message?.includes('502') || e.message?.includes('504'));

                if (isGatewayError && retries > 0) {
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

                throw new Error(`GraphQL Query Errors: ${messages}`);
            }

            return json.data;
        } catch (error) {
            // Fatal errors (Do not retry)
            if (error.message.includes('Could not resolve to a User') || error.message.includes('NOT_FOUND') || error.message.includes('GraphQL Fatal Error')) {
                throw error;
            }

            // Also catch network errors for retry
            // 'terminated' likely means connection closed by server/proxy
            if (retries > 0 && (
                error.message.includes('fetch') ||
                error.message.includes('network') ||
                error.message.includes('terminated')
            )) {
                console.log(`${prefix} Network/Terminated Error: ${error.message}. Retrying...`);
                await new Promise(r => setTimeout(r, 2000));
                return this.query(query, variables, retries - 1, logContext);
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
        const token = await this.#getAuthToken();
        const url = `${this.restUrl}/${endpoint.startsWith('/') ? endpoint.slice(1) : endpoint}`;
        const prefix = logContext ? `[GitHub] [${logContext}]` : '[GitHub]';

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept'       : 'application/vnd.github.v3+json',
                    'Authorization': `bearer ${token}`,
                    'User-Agent'   : 'Neo.mjs-DevIndex/1.0'
                }
            });

            this.#updateRateLimit(response);

            if (!response.ok) {
                if (response.status === 403) {
                    this.rateLimit.core.remaining = 0;
                }
                throw new Error(`REST Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
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
     *
     * @param {Number} dbId The integer user ID.
     * @returns {Promise<String|null>} The current login, or null if the ID is invalid/deleted.
     */
    async getLoginByDatabaseId(dbId) {
        const query = `
            query { 
                user(databaseId: ${dbId}) {
                    login
                } 
            }`;

        try {
            const data = await this.query(query, {}, 1, `DB_ID:${dbId}`);
            if (data?.user?.login) {
                return data.user.login;
            }
            return null;
        } catch (error) {
            if (error.message.includes('NOT_FOUND') || error.message.includes('Could not resolve')) {
                return null;
            }
            throw error;
        }
    }
}

export default Neo.setupClass(GitHub);
