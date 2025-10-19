import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../../../src/core/Base.mjs';

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub issues via the `gh` CLI.
 * This service will be expanded to handle more complex 2-way synchronization in the future.
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
     * Adds labels to an issue or pull request.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labels - An array of labels to add.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async addLabels(issueNumber, labels) {
        const labelString = labels.join(',');
        try {
            const {stdout} = await execAsync(`gh issue edit ${issueNumber} --add-label "${labelString}"`);
            return {message: `Successfully added labels to issue #${issueNumber}`, details: stdout.trim()};
        } catch (error) {
            console.error(`Error adding labels to issue #${issueNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh issue edit ${issueNumber} --add-label failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Removes labels from an issue or pull request.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labels - An array of labels to remove.
     * @returns {Promise<object>} A promise that resolves to a success or error object.
     */
    async removeLabels(issueNumber, labels) {
        const labelString = labels.join(',');
        try {
            const {stdout} = await execAsync(`gh issue edit ${issueNumber} --remove-label "${labelString}"`);
            return {message: `Successfully removed labels from issue #${issueNumber}`, details: stdout.trim()};
        } catch (error) {
            console.error(`Error removing labels from issue #${issueNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh issue edit ${issueNumber} --remove-label failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }
}

export default Neo.setupClass(IssueService);
