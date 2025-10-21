import Base           from '../../../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig       from '../../config.mjs';
import logger         from '../../logger.mjs';

/**
 * Service for interacting with GitHub issues via the GraphQL API.
 * @class Neo.ai.mcp.server.github-workflow.IssueService
 * @extends Neo.core.Base
 * @singleton
 */
class IssueService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.IssueService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.IssueService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Fetches the GraphQL node IDs for an issue and a set of labels.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labelNames - An array of label names.
     * @returns {Promise<{labelableId: string, labelIds: string[]}>} The node IDs.
     * @private
     */
    async #getIds(issueNumber, labelNames) {
        const query = `
            query GetIds($owner: String!, $repo: String!, $issueNumber: Int!) {
                repository(owner: $owner, name: $repo) {
                    issue(number: $issueNumber) {
                        id
                    }
                    labels(first: 100) { # Assuming max 100 labels
                        nodes {
                            id
                            name
                        }
                    }
                }
            }
        `;

        const variables = {
            owner: aiConfig.githubWorkflow.owner,
            repo: aiConfig.githubWorkflow.repo,
            issueNumber
        };

        const data = await GraphqlService.query(query, variables);

        const labelableId = data.repository.issue.id;
        const repoLabels = data.repository.labels.nodes;
        const labelIds = labelNames.map(name => {
            const label = repoLabels.find(l => l.name === name);
            return label ? label.id : null;
        }).filter(Boolean);

        if (!labelableId || labelIds.length !== labelNames.length) {
            throw new Error(`Could not find issue #${issueNumber} or one of the labels: ${labelNames.join(', ')}`);
        }

        return { labelableId, labelIds };
    }

    /**
     * Adds labels to an issue or pull request.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labels - An array of labels to add.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async addLabels(issueNumber, labels) {
        try {
            const { labelableId, labelIds } = await this.#getIds(issueNumber, labels);

            const mutation = `
                mutation AddLabels($labelableId: ID!, $labelIds: [ID!]!) {
                    addLabelsToLabelable(input: {labelableId: $labelableId, labelIds: $labelIds}) {
                        clientMutationId
                    }
                }
            `;

            await GraphqlService.query(mutation, { labelableId, labelIds });
            return { message: `Successfully added labels to issue #${issueNumber}` };
        } catch (error) {
            logger.error(`Error adding labels to issue #${issueNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Removes labels from an issue or pull request.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labels - An array of labels to remove.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async removeLabels(issueNumber, labels) {
        try {
            const { labelableId, labelIds } = await this.#getIds(issueNumber, labels);

            const mutation = `
                mutation RemoveLabels($labelableId: ID!, $labelIds: [ID!]!) {
                    removeLabelsFromLabelable(input: {labelableId: $labelableId, labelIds: $labelIds}) {
                        clientMutationId
                    }
                }
            `;

            await GraphqlService.query(mutation, { labelableId, labelIds });
            return { message: `Successfully removed labels from issue #${issueNumber}` };
        } catch (error) {
            logger.error(`Error removing labels from issue #${issueNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(IssueService);
