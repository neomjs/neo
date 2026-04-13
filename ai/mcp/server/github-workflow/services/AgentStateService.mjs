import Base         from '../../../../../src/core/Base.mjs';
import IssueService from './IssueService.mjs';
import logger       from '../logger.mjs';

/**
 * @summary Service for handling autonomous subagent state transitions.
 *
 * This service provides a deterministic state-trap mechanism for headless orchestrators
 * to signal execution states, allowing for robust lifecycle management and self-healing.
 *
 * @class Neo.ai.mcp.server.github-workflow.services.AgentStateService
 * @extends Neo.core.Base
 * @singleton
 */
class AgentStateService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.AgentStateService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.AgentStateService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Handles state transition signals from autonomous agents.
     * @param {Object} options                The options object
     * @param {String} options.state          The execution state to signal (PR_OPENED, BLOCKED, HANDOFF)
     * @param {Number} [options.target_id]    The target Issue or PR number associated with this state
     * @param {String} [options.artifact_path] Optional file path to a localized artifact mapping the problem
     * @returns {Promise<Object>} A promise resolving to the transition outcome.
     */
    async signalStateTransition({state, target_id, artifact_path}) {
        const validStates = ['PR_OPENED', 'BLOCKED', 'HANDOFF'];
        
        if (!validStates.includes(state)) {
            return {
                error: 'Invalid state',
                message: `State must be one of: ${validStates.join(', ')}`,
                code: 'INVALID_STATE'
            };
        }

        logger.info(`Received state transition signal: ${state} (Target ID: ${target_id || 'None'})`);

        if (state === 'BLOCKED' && target_id) {
            try {
                logger.info(`Agent reported BLOCKED state. Attempting to add 'agent-task:blocked' label to issue #${target_id}`);
                const result = await IssueService.manageIssueLabels({
                    issue_number: target_id,
                    labels: ['agent-task:blocked'],
                    action: 'add'
                });

                if (result.error) {
                    logger.warn(`Failed to apply blocked label to issue #${target_id}: ${result.message}`);
                } else {
                    logger.info(`Successfully labeled issue #${target_id} as blocked.`);
                }
            } catch (error) {
                logger.error(`Exception while applying blocked label to issue #${target_id}:`, error);
            }
        }

        let message = `State ${state} processed. Orchestrator turn completed.`;
        if (artifact_path) {
            message += ` Referenced artifact: ${artifact_path}`;
        }

        return {
            success: true,
            message
        };
    }
}

export default Neo.setupClass(AgentStateService);
