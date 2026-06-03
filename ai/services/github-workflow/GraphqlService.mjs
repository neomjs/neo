import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../src/core/Base.mjs';
import logger      from '../../mcp/server/github-workflow/logger.mjs';

const execAsync = promisify(exec);

/**
 * @summary A centralized, singleton service for interacting with the GitHub GraphQL API.
 *
 * This service encapsulates all the logic for making authenticated GraphQL queries and mutations.
 * It handles fetching the auth token from the `gh` CLI, caching it, and attaching it to
 * all outgoing requests. It also provides a generic `query` method for executing
 * GraphQL operations and basic error handling.
 *
 * @class Neo.ai.services.github-workflow.GraphqlService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphqlService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.GraphqlService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.GraphqlService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * The GitHub GraphQL API endpoint.
         * @member {String} apiUrl='https://api.github.com/graphql'
         * @protected
         */
        apiUrl: 'https://api.github.com/graphql',
        /**
         * Optional explicit token override for tests or controlled embedded callers.
         * Normal runtime auth continues to use `gh auth token`.
         * @member {String|null} authTokenOverride=null
         * @protected
         */
        authTokenOverride: null,
        /**
         * Maximum retry attempts for transient GitHub transport/gateway failures.
         * @member {Number} maxRetryAttempts=3
         * @protected
         */
        maxRetryAttempts: 3,
        /**
         * Initial retry delay in milliseconds.
         * @member {Number} retryBaseDelayMs=1000
         * @protected
         */
        retryBaseDelayMs: 1000,
        /**
         * Maximum retry delay in milliseconds.
         * @member {Number} retryMaxDelayMs=10000
         * @protected
         */
        retryMaxDelayMs: 10000,
        /**
         * Jitter ratio applied to exponential retry delays.
         * @member {Number} retryJitterRatio=0.2
         * @protected
         */
        retryJitterRatio: 0.2,
        /**
         * HTTP statuses that represent transient GitHub/proxy failures.
         * @member {Number[]} retryableHttpStatuses=[429,502,503,504]
         * @protected
         */
        retryableHttpStatuses: [429, 502, 503, 504]
    }

    /**
     * The cached GitHub authentication token.
     * @member {String|null} #authToken=null
     * @private
     */
    #authToken = null;

    /**
     * Fetches the GitHub authentication token from the `gh` CLI and caches it.
     * This is the only method in the service that should interact with the `gh` CLI.
     * @returns {Promise<string>} The authentication token.
     * @throws {Error} If the token cannot be fetched.
     * @private
     */
    async #getAuthToken() {
        if (this.authTokenOverride) {
            return String(this.authTokenOverride).trim();
        }

        if (this.#authToken) {
            return this.#authToken;
        }

        try {
            const { stdout } = await execAsync('gh auth token');
            this.#authToken = stdout.trim();
            return this.#authToken;
        } catch (e) {
            logger.error('Failed to get GitHub auth token from `gh` CLI.', e);
            throw new Error('Could not authenticate with GitHub. Please ensure you have run `gh auth login`.');
        }
    }

    /**
     * Calculates the retry delay for a transient GitHub failure.
     * @param {Number} attempt The 1-based retry attempt.
     * @param {Response|null} response The failed response, if one exists.
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

        const baseDelay = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** (attempt - 1));
        const jitter    = baseDelay * this.retryJitterRatio * Math.random();

        return Math.round(baseDelay + jitter);
    }

    /**
     * Determines whether a transport error is likely transient.
     * @param {Error|*} error The thrown fetch error.
     * @returns {Boolean}
     * @private
     */
    #isRetryableNetworkError(error) {
        const message = [
            error?.message,
            error?.cause?.message,
            error?.cause?.code,
            error?.code,
            String(error)
        ].filter(Boolean).join(' ').toLowerCase();

        return [
            'fetch failed',
            'network',
            'terminated',
            'timeout',
            'econnreset',
            'etimedout',
            'enotfound',
            'eai_again',
            'socket hang up'
        ].some(pattern => message.includes(pattern));
    }

    /**
     * @param {Number} status The HTTP response status.
     * @returns {Boolean}
     * @private
     */
    #isRetryableHttpStatus(status) {
        return this.retryableHttpStatuses.includes(status);
    }

    /**
     * Waits before a retry attempt.
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
     * Logs and waits for a transient retry.
     * @param {String} reason Safe retry reason for logs.
     * @param {Number} attempt The 1-based retry attempt.
     * @param {Response|null} response The failed response, if one exists.
     * @returns {Promise<void>}
     * @private
     */
    async #waitForRetry(reason, attempt, response=null) {
        const delay = this.#getRetryDelay(attempt, response);

        logger.warn(`[GraphqlService] ${reason}; retrying in ${delay}ms (attempt ${attempt}/${this.maxRetryAttempts})`);
        await this.#sleep(delay);
    }

    /**
     * @summary Detects whether a GraphQL response contains usable partial data.
     *
     * GitHub can return `{data, errors}` when only one aliased field fails. A top-level `data`
     * object with at least one non-null field is useful partial data; `null`/empty/all-null data
     * still represents a hard semantic failure.
     *
     * @param {*} data The GraphQL `data` payload.
     * @returns {Boolean}
     * @private
     */
    #hasPartialData(data) {
        if (data == null) {
            return false;
        }

        if (Array.isArray(data)) {
            return data.some(item => item != null);
        }

        if (typeof data === 'object') {
            return Object.values(data).some(value => value != null);
        }

        return true;
    }

    /**
     * Executes a GraphQL query or mutation against the GitHub API.
     * @param {string}         query                         The GraphQL query string.
     * @param {object}         [variables={}]                Optional variables for the query.
     * @param {boolean|object} [options=false]               Legacy boolean enables sub-issues; object form configures behavior.
     * @param {boolean}        [options.enableSubIssues=false] Whether to enable sub-issues feature header.
     * @param {boolean}        [options.strict=true]         Whether any GraphQL `errors` entry is a hard failure.
     * @returns {Promise<object>} The `data` object, or `{data, errors}` for non-strict partial-data responses.
     * @throws {Error} If the request fails, or if strict GraphQL error handling rejects the response.
     */
    async query(query, variables={}, options=false) {
        const enableSubIssues = typeof options === 'boolean' ? options : Boolean(options?.enableSubIssues);
        const strict          = typeof options === 'object' ? options?.strict !== false : true;
        const token = await this.#getAuthToken();

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `bearer ${token}`
        };

        // Sub-issues require a feature flag header
        if (enableSubIssues) {
            headers['GraphQL-Features'] = 'sub_issues';
        }

        let response;

        for (let attempt = 0; attempt <= this.maxRetryAttempts; attempt++) {
            try {
                response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers,
                    body  : JSON.stringify({query, variables})
                });
            } catch (e) {
                if (attempt < this.maxRetryAttempts && this.#isRetryableNetworkError(e)) {
                    await this.#waitForRetry(`Transient GitHub GraphQL transport failure (${e.message})`, attempt + 1);
                    continue;
                }

                throw e;
            }

            if (response.ok) {
                break;
            }

            const errorMessage = `GitHub API request failed: ${response.status} ${response.statusText}`;

            if (attempt < this.maxRetryAttempts && this.#isRetryableHttpStatus(response.status)) {
                await this.#waitForRetry(errorMessage, attempt + 1, response);
                continue;
            }

            throw new Error(errorMessage);
        }

        const json = await response.json();

        if (json.errors) {
            if (!strict && this.#hasPartialData(json.data)) {
                logger.warn('GitHub API returned partial data with GraphQL errors:', json.errors);
                return {
                    data  : json.data,
                    errors: json.errors
                };
            }

            logger.error('GitHub API returned errors:', json.errors);
            throw new Error(`GitHub API error: ${json.errors.map(e => e.message).join(', ')}`);
        }

        return json.data;
    }
}

export default Neo.setupClass(GraphqlService);
