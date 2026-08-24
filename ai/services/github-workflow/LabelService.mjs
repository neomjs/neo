import Base           from '../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig       from '../../mcp/server/github-workflow/config.mjs';
import {FETCH_LABELS} from './queries/labelQueries.mjs';
import {resolveRepositoryTarget} from './shared/repositoryTarget.mjs';

/**
 * @summary Service for interacting with GitHub labels via the GraphQL API.
 *
 * This service manages the retrieval of repository labels. It handles pagination
 * to ensure all labels are fetched, providing a complete list for validation
 * and autocompletion purposes in other parts of the workflow.
 *
 * @class Neo.ai.services.github-workflow.LabelService
 * @extends Neo.core.Base
 * @singleton
 */
class LabelService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.LabelService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.LabelService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Fetches a list of all labels in the repository via paginated GraphQL queries.
     *
     * GraphQL exceptions from `GraphqlService.query` (rate-limit 429, 5xx, network failures,
     * malformed responses) propagate unmodified to the caller — they are NOT swallowed into
     * an error-object wrapper. This preserves the original HTTP status, GraphQL error body,
     * and stack trace for diagnosis. The MCP tool boundary at `Server.mjs:150-222` catches
     * and converts thrown exceptions into structured MCP error payloads for protocol
     * responses; non-MCP callers (build scripts, CLI) receive normal exception semantics.
     *
     * @param {Object} [options]
     * @param {String} [options.repo] Optional bare name or owner/name repository target.
     * @returns {Promise<{count: number, labels: object[]}>} Resolves to the aggregated label set.
     * @throws {Error} If the underlying GraphQL call fails. See `GraphqlService.query` for error shapes.
     * @see https://github.com/neomjs/neo/issues/10112
     */
    async listLabels({repo} = {}) {
        const target = resolveRepositoryTarget(repo, {owner: aiConfig.owner, repo: aiConfig.repo});

        if (target.error) return target;

        let allLabels   = [];
        let hasNextPage = true;
        let cursor      = null;

        while (hasNextPage) {
            const variables = {
                owner: target.owner,
                repo : target.repo,
                limit: 100,
                cursor
            };

            const data   = await GraphqlService.query(FETCH_LABELS, variables);
            const labels = data.repository.labels;

            allLabels.push(...labels.nodes);
            hasNextPage = labels.pageInfo.hasNextPage;
            cursor      = labels.pageInfo.endCursor;
        }

        return {
            count : allLabels.length,
            labels: allLabels
        };
    }
}

export default Neo.setupClass(LabelService);
