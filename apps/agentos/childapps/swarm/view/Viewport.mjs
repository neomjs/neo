import BaseViewport from '../../../../../src/container/Viewport.mjs';
import Blackboard from '../../../view/Blackboard.mjs';

/**
 * @class AgentOS.swarm.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOS.swarm.view.Viewport'
         * @protected
         */
        className: 'AgentOS.swarm.view.Viewport',
        /**
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport'],
        /**
         * @member {String[]} cls=['agent-os-viewport']
         * @reactive
         */
        cls: ['agent-os-viewport']
    }
}

export default Neo.setupClass(Viewport);
