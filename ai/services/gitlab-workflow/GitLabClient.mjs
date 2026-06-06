import aiConfig from '../../mcp/server/gitlab-workflow/config.mjs';
import Base     from '../../../src/core/Base.mjs';
import logger   from '../../mcp/server/gitlab-workflow/logger.mjs';

/**
 * @summary Centralized singleton client for the GitLab GraphQL API.
 *
 * The GitLab analog of github-workflow's `GraphqlService`: it issues authenticated GraphQL
 * queries/mutations and centralizes auth, retry, and error handling so the gitlab-workflow
 * services never re-implement transport. Two deliberate divergences from the GitHub client:
 *
 * 1. **Endpoint is config-derived, not static** — GitLab is commonly self-hosted, so the API
 *    URL is built per call from `aiConfig.gitlab.hostUrl` (`NEO_GITLAB_HOST`), not a constant.
 * 2. **Auth is a config PAT, not a CLI token** — the token comes from `aiConfig.gitlab.token`
 *    (`NEO_GITLAB_PAT`); there is no `glab`-CLI dependency (the GitHub client shells
 *    `gh auth token`, but adding a second CLI install requirement for GitLab is avoided here).
 *
 * The retry/backoff machinery (transient HTTP 429/5xx + network errors, jittered exponential
 * delay honoring `retry-after`) and the partial-data GraphQL error handling mirror the GitHub
 * `GraphqlService` so behavior stays consistent across both workflow servers.
 *
 * @class Neo.ai.services.gitlab-workflow.GitLabClient
 * @extends Neo.core.Base
 * @singleton
 */
class GitLabClient extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.gitlab-workflow.GitLabClient'
         * @protected
         */
        className: 'Neo.ai.services.gitlab-workflow.GitLabClient',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Optional explicit token override for tests or controlled embedded callers.
         * Normal runtime auth uses `aiConfig.gitlab.token` (`NEO_GITLAB_PAT`).
         * @member {String|null} authTokenOverride=null
         * @protected
         */
        authTokenOverride: null,
        /**
         * Maximum retry attempts for transient GitLab transport/gateway failures.
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
         * HTTP statuses that represent transient GitLab/proxy failures.
         * @member {Number[]} retryableHttpStatuses=[429,502,503,504]
         * @protected
         */
        retryableHttpStatuses: [429, 502, 503, 504]
    }

    /**
     * Resolves the GitLab GraphQL endpoint from config. GitLab is frequently self-hosted,
     * so the endpoint is `${hostUrl}/api/graphql` rather than a constant.
     * @returns {String}
     * @throws {Error} If no host URL is configured.
     * @private
     */
    #getApiUrl() {
        const hostUrl = aiConfig.gitlab.hostUrl;

        if (!hostUrl) {
            throw new Error('Missing GitLab host URL. Set NEO_GITLAB_HOST (or config.gitlab.hostUrl).');
        }

        return `${String(hostUrl).replace(/\/+$/, '')}/api/graphql`;
    }

    /**
     * Resolves the GitLab Personal Access Token from config (or the test override). Unlike the
     * GitHub client, this reads a config PAT rather than shelling out to a CLI.
     * @returns {String}
     * @throws {Error} If no token is configured.
     * @private
     */
    #getAuthToken() {
        if (this.authTokenOverride) {
            return String(this.authTokenOverride).trim();
        }

        const token = aiConfig.gitlab.token;

        if (!token) {
            logger.error('Missing GitLab PAT; cannot authenticate.');
            throw new Error('Could not authenticate with GitLab. Set NEO_GITLAB_PAT (or config.gitlab.token).');
        }

        return String(token).trim();
    }

    /**
     * Calculates the retry delay for a transient GitLab failure (honors `retry-after`).
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

        logger.warn(`[GitLabClient] ${reason}; retrying in ${delay}ms (attempt ${attempt}/${this.maxRetryAttempts})`);
        await this.#sleep(delay);
    }

    /**
     * @summary Detects whether a GraphQL response contains usable partial data.
     *
     * GitLab can return `{data, errors}` when only one aliased field fails. A top-level `data`
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
     * Executes a GraphQL query or mutation against the GitLab API.
     * @param {String}  query                 The GraphQL query/mutation string.
     * @param {Object}  [variables={}]        Optional variables for the query.
     * @param {Object}  [options={}]          Behavior options.
     * @param {Boolean} [options.strict=true] Whether any GraphQL `errors` entry is a hard failure.
     * @returns {Promise<Object>} The `data` object, or `{data, errors}` for non-strict partial-data responses.
     * @throws {Error} If the request fails, config is missing, or strict GraphQL error handling rejects the response.
     */
    async query(query, variables={}, options={}) {
        const strict = options?.strict !== false;
        const apiUrl = this.#getApiUrl();
        const token  = this.#getAuthToken();

        const headers = {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${token}`
        };

        let response;

        for (let attempt = 0; attempt <= this.maxRetryAttempts; attempt++) {
            try {
                response = await fetch(apiUrl, {
                    method: 'POST',
                    headers,
                    body  : JSON.stringify({query, variables})
                });
            } catch (e) {
                if (attempt < this.maxRetryAttempts && this.#isRetryableNetworkError(e)) {
                    await this.#waitForRetry(`Transient GitLab GraphQL transport failure (${e.message})`, attempt + 1);
                    continue;
                }

                throw e;
            }

            if (response.ok) {
                break;
            }

            const errorMessage = `GitLab API request failed: ${response.status} ${response.statusText}`;

            if (attempt < this.maxRetryAttempts && this.#isRetryableHttpStatus(response.status)) {
                await this.#waitForRetry(errorMessage, attempt + 1, response);
                continue;
            }

            throw new Error(errorMessage);
        }

        const json = await response.json();

        if (json.errors) {
            if (!strict && this.#hasPartialData(json.data)) {
                logger.warn('GitLab API returned partial data with GraphQL errors:', json.errors);
                return {
                    data  : json.data,
                    errors: json.errors
                };
            }

            logger.error('GitLab API returned errors:', json.errors);
            throw new Error(`GitLab API error: ${json.errors.map(e => e.message).join(', ')}`);
        }

        return json.data;
    }
}

export default Neo.setupClass(GitLabClient);
