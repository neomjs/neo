import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../../../src/core/Base.mjs';
import logger      from '../logger.mjs';

const execAsync = promisify(exec);

/**
 * A centralized, singleton service for interacting with the GitHub GraphQL API.
 *
 * This service encapsulates all the logic for making authenticated GraphQL queries and mutations.
 * It handles fetching the auth token from the `gh` CLI, caching it, and attaching it to
 * all outgoing requests. It also provides a generic `query` method for executing
 * GraphQL operations and basic error handling.
 * @class Neo.ai.mcp.server.github-workflow.services.GraphqlService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphqlService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.GraphqlService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.GraphqlService',
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
        apiUrl: 'https://api.github.com/graphql'
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
     * Executes a GraphQL query or mutation against the GitHub API.
     * @param {string} query The GraphQL query string.
     * @param {object} [variables={}] Optional variables for the query.
     * @param {boolean} [enableSubIssues=false] Whether to enable sub-issues feature header
     * @returns {Promise<object>} The `data` object from the GraphQL response.
     * @throws {Error} If the request fails or the API returns errors.
     */
    async query(query, variables={}, enableSubIssues=false) {
        const token = await this.#getAuthToken();

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `bearer ${token}`
        };

        // Sub-issues require a feature flag header
        if (enableSubIssues) {
            headers['GraphQL-Features'] = 'sub_issues';
        }

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers,
            body  : JSON.stringify({query, variables})
        });

        if (!response.ok) {
            throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();

        if (json.errors) {
            logger.error('GitHub API returned errors:', json.errors);
            throw new Error(`GitHub API error: ${json.errors.map(e => e.message).join(', ')}`);
        }

        return json.data;
    }
}

export default Neo.setupClass(GraphqlService);
