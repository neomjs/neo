import BaseViewport from '../../../../../src/container/Viewport.mjs';
import Blackboard from '../../../view/Blackboard.mjs';

/**
 * @class AgentOS.swarm.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'AgentOS.swarm.view.Viewport'
    }
}

export default Neo.setupClass(Viewport);
