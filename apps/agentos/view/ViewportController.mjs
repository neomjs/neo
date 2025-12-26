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
        let name                    = 'swarm',
            {config, windowConfigs} = Neo,
            {environment}           = config,
            firstWindowId           = Object.keys(windowConfigs)[0],
            {basePath}              = windowConfigs[firstWindowId],
            url;

        if (environment !== 'development') {
            basePath = `${basePath + environment}/`
        }

        url = `${basePath}apps/agentos/childapps/swarm/index.html?name=${name}`;

        await Neo.Main.windowOpen({
            url,
            windowId      : this.windowId,
            windowName    : name,
            windowFeatures: 'height=600,width=800,left=50,top=50'
        });
    }
}

export default Neo.setupClass(ViewportController);
