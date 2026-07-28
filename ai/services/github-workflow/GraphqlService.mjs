import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../src/core/Base.mjs';
import logger      from '../../mcp/server/github-workflow/logger.mjs';

const execAsync = promisify(exec);

/**
 * @summary A centralized, singleton service for interacting with the GitHub GraphQL API.
 *
 * This service encapsulates all the logic for making authenticated GraphQL queries and mutations.
 * It resolves the credential (explicit override → `GH_TOKEN` → `GITHUB_TOKEN` → cached `gh auth
 * token`; see {@link #getAuthToken}), attaches it to all outgoing requests, and provides a generic
 * `query` method for executing GraphQL operations plus basic error handling.
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
         * The GitHub REST API base URL. REST requests share this service's resolved credential
         * and retry machinery (see {@link #rest}), so REST writes run through the same
         * authenticated, retry-equipped path as GraphQL instead of a fresh per-call `spawn('gh')`.
         * @member {String} restApiUrl='https://api.github.com'
         * @protected
         */
        restApiUrl: 'https://api.github.com',
        /**
         * Optional explicit token override for tests or controlled embedded callers. Outranks every
         * other source. Absent it, runtime auth reads `GH_TOKEN`/`GITHUB_TOKEN` and falls back to
         * `gh auth token` for interactive use.
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
     * @summary Resolves the GitHub credential, preferring the ambient environment over the `gh` CLI.
     *
     * Precedence: explicit override → `GH_TOKEN` → `GITHUB_TOKEN` → cached CLI token → `gh auth token`.
     * This is the only method in the service that interacts with the `gh` CLI.
     *
     * **Why the env vars come before the CLI.** The CLI shell-out is an interactive-developer
     * affordance, and it was once the *only* path here. CI runners have no `gh` login, so a missing
     * credential surfaced as `no oauth token found for github.com` plus advice to run `gh auth login`
     * — on a machine where that is meaningless, which turned a missing-credential condition into an
     * apparent tooling fault and hid it through repeated scheduled failures. Reading the environment
     * first makes that failure mode structurally impossible for every CI consumer of this service,
     * not just the caller that surfaced it.
     *
     * **Why the env value is deliberately NOT cached.** `process.env` is already the cache — re-reading
     * it costs nothing, so memoizing it buys no performance while adding a staleness window. The
     * asymmetry with the CLI branch is therefore about cost, not safety: shelling out is expensive, so
     * that result is cached; an env read is not, so it is not.
     *
     * The staleness window matters for **long-lived in-process consumers** whose credential can be
     * re-pointed between calls — an embedded caller swapping identity, or a rotated token in a
     * persistent server. A memoized env value would keep serving the pre-rotation credential for the
     * lifetime of the process. This is NOT justified by the per-stage scoping in
     * `buildScripts/dataSyncPipeline.mjs`: that pipeline spawns a **fresh child process per stage**
     * (`executeCommand()`), so a singleton cache cannot cross stages there and its isolation does not
     * depend on this choice.
     *
     * **Invariant:** the raw token is never logged. On failure the message names the env vars to set,
     * because the previous message sent CI operators down an interactive path that cannot exist there.
     *
     * @returns {Promise<String>} The authentication token.
     * @throws {Error} When no credential is available from the override, the environment, or the CLI.
     * @private
     */
    async #getAuthToken() {
        if (this.authTokenOverride) {
            return String(this.authTokenOverride).trim();
        }

        const envToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();

        if (envToken) {
            return envToken;
        }

        if (this.#authToken) {
            return this.#authToken;
        }

        try {
            const { stdout } = await execAsync('gh auth token');
            this.#authToken = stdout.trim();
            return this.#authToken;
        } catch (e) {
            logger.error('Failed to get a GitHub token: neither GH_TOKEN nor GITHUB_TOKEN is set, and the `gh` CLI holds no token.', e);
            throw new Error('Could not authenticate with GitHub. Set GH_TOKEN or GITHUB_TOKEN (CI), or run `gh auth login` (interactive).');
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
        const token           = await this.#getAuthToken();

        const headers = {
            'Content-Type' : 'application/json',
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
            const error = new Error(`GitHub API error: ${json.errors.map(e => e.message).join(', ')}`);

            // Preserve GitHub's typed error payload so bounded callers can react to a specific
            // provider condition without parsing human-readable messages. Strict mode still throws,
            // so partial response data never crosses this boundary.
            error.graphqlErrors = json.errors;

            throw error;
        }

        return json.data;
    }

    /**
     * @summary Executes an authenticated request against the GitHub REST API.
     *
     * Shares the cached `gh auth token` (`#getAuthToken`) and the transient-failure retry
     * machinery used by {@link #query}, so REST writes run through the same single,
     * cached-token, retry-equipped path as the GraphQL tools — instead of a fresh per-call
     * `spawn('gh')` that re-resolves gh-auth on every invocation.
     *
     * REST is preferred (over a GraphQL mutation) where the operation accepts human-facing
     * names/logins directly — e.g. issue labels and assignees — avoiding the extra node-ID
     * resolution a GraphQL mutation would require, and preserving the exact semantics of the
     * `gh` command it replaces.
     *
     * @param {String} method      HTTP method, e.g. 'GET', 'POST', 'PATCH', 'DELETE'.
     * @param {String} path        REST path beginning with '/', e.g. '/repos/owner/name/issues'.
     * @param {Object} [body=null] Optional JSON request body; omitted for bodyless methods.
     * @returns {Promise<Object|null>} The parsed JSON response, or `null` for an empty `204` response.
     * @throws {Error} If authentication fails, or the request fails after exhausting transient retries.
     */
    async rest(method, path, body=null) {
        const token = await this.#getAuthToken();

        const headers = {
            'Accept'              : 'application/vnd.github+json',
            'Authorization'       : `bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        };

        const init = {method, headers};

        if (body != null) {
            headers['Content-Type'] = 'application/json';
            init.body               = JSON.stringify(body);
        }

        const url = `${this.restApiUrl}${path}`;

        let response;

        for (let attempt = 0; attempt <= this.maxRetryAttempts; attempt++) {
            try {
                response = await fetch(url, init);
            } catch (e) {
                if (attempt < this.maxRetryAttempts && this.#isRetryableNetworkError(e)) {
                    await this.#waitForRetry(`Transient GitHub REST transport failure (${e.message})`, attempt + 1);
                    continue;
                }

                throw e;
            }

            if (response.ok) {
                break;
            }

            if (attempt < this.maxRetryAttempts && this.#isRetryableHttpStatus(response.status)) {
                await this.#waitForRetry(`GitHub REST ${method} ${path} -> ${response.status} ${response.statusText}`, attempt + 1, response);
                continue;
            }

            let detail = '';

            try {
                const errorBody = await response.json();
                detail = errorBody?.message ? ` - ${errorBody.message}` : '';
            } catch (ignore) {
                // Non-JSON error body; the status line is the best available detail.
            }

            throw new Error(`GitHub REST request failed: ${method} ${path} -> ${response.status} ${response.statusText}${detail}`);
        }

        if (response.status === 204) {
            return null;
        }

        return response.json();
    }
}

export default Neo.setupClass(GraphqlService);
