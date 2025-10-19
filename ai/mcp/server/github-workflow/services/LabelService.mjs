import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../../../src/core/Base.mjs';

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub labels via the `gh` CLI.
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
     * @returns {Promise<object>} A promise that resolves to the list of labels or a structured error.
     */
    async listLabels() {
        try {
            const {stdout} = await execAsync('gh label list --json name,description,color');
            const labels   = JSON.parse(stdout);
            return {
                count : labels.length,
                labels: labels
            };
        } catch (error) {
            console.error('Error fetching labels:', error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh label list failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }
}

export default Neo.setupClass(LabelService);
