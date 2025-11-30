import Controller from '../../../src/controller/Component.mjs';

/**
 * @class AgentOS.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        className: 'AgentOS.view.ViewportController'
    }

    /**
     * @param {Object} data
     */
    async onOpenSwarmClick(data) {
        // Path relative to the current index.html (apps/agent-os/index.html)
        const url = 'childapps/swarm/index.html';
        
        await Neo.Main.windowOpen({
            url,
            windowName: 'AgentSwarm',
            windowFeatures: 'height=600,width=800,left=50,top=50'
        });
    }
}

export default Neo.setupClass(ViewportController);
