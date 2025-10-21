import Base           from '../../../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig       from '../../config.mjs';
import logger         from '../../logger.mjs';

/**
 * Service for interacting with GitHub labels via the GraphQL API.
 * @class Neo.ai.mcp.server.github-workflow.LabelService
 * @extends Neo.core.Base
 * @singleton
 */
class LabelService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.LabelService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.LabelService',
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
        const query = `
            query ListLabels($owner: String!, $repo: String!) {
                repository(owner: $owner, name: $repo) {
                    labels(first: 100) { # Assuming max 100 labels, add pagination if more are needed
                        nodes {
                            name
                            description
                            color
                        }
                    }
                }
            }
        `;

        const variables = {
            owner: aiConfig.githubWorkflow.owner,
            repo : aiConfig.githubWorkflow.repo
        };

        try {
            const data   = await GraphqlService.query(query, variables);
            const labels = data.repository.labels.nodes;
            return {
                count : labels.length,
                labels: labels
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
