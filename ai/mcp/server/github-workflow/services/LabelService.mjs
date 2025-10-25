import Base           from '../../../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig       from '../config.mjs';
import logger         from '../logger.mjs';
import {FETCH_LABELS} from './queries/labelQueries.mjs';

/**
 * Service for interacting with GitHub labels via the GraphQL API.
 * @class Neo.ai.mcp.server.github-workflow.services.LabelService
 * @extends Neo.core.Base
 * @singleton
 */
class LabelService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.LabelService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.LabelService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Fetches a list of all labels in the repository.
     * @returns {Promise<object>} A promise that resolves to the list of labels.
     */
    async listLabels() {
        let allLabels   = [];
        let hasNextPage = true;
        let cursor      = null;

        try {
            while (hasNextPage) {
                const variables = {
                    owner : aiConfig.owner,
                    repo  : aiConfig.repo,
                    limit : 100,
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
        } catch (error) {
            logger.error('Error fetching labels via GraphQL:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(LabelService);
