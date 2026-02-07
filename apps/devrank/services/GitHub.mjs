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
 * @class DevRank.services.GitHub
 * @extends Neo.core.Base
 * @singleton
 */
class GitHub extends Base {
    static config = {
        /**
         * @member {String} className='DevRank.services.GitHub'
         * @protected
         */
        className: 'DevRank.services.GitHub',
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
        restUrl: 'https://api.github.com'
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
     * Executes a GraphQL query.
     * @param {String} query
     * @param {Object} [variables={}]
     * @returns {Promise<Object>} The `data` property of the response.
     */
    async query(query, variables = {}) {
        const token = await this.#getAuthToken();

        try {
            const response = await fetch(this.graphqlUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `bearer ${token}`,
                    'User-Agent': 'Neo.mjs-DevRank/1.0'
                },
                body: JSON.stringify({ query, variables })
            });

            if (!response.ok) {
                throw new Error(`GraphQL Error: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();

            if (json.errors) {
                // Log but don't throw immediately if partial data exists?
                // For now, throw to be safe.
                const messages = json.errors.map(e => e.message).join(', ');
                throw new Error(`GraphQL Query Errors: ${messages}`);
            }

            return json.data;
        } catch (error) {
            console.error('[GitHub] GraphQL Query Failed:', error.message);
            throw error;
        }
    }

    /**
     * Executes a REST API request.
     * @param {String} endpoint Relative path (e.g. 'search/repositories?q=...')
     * @returns {Promise<Object>} JSON response
     */
    async rest(endpoint) {
        const token = await this.#getAuthToken();
        const url = `${this.restUrl}/${endpoint.startsWith('/') ? endpoint.slice(1) : endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `bearer ${token}`,
                    'User-Agent': 'Neo.mjs-DevRank/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`REST Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`[GitHub] REST Request Failed (${endpoint}):`, error.message);
            throw error;
        }
    }
}

export default Neo.setupClass(GitHub);
