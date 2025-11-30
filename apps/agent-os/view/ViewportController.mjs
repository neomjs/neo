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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        })
    }

    /**
     * @param {Object} data
     */
    async onOpenSwarmClick(data) {
        // Path relative to the current index.html (apps/agent-os/index.html)
        const url = 'childapps/swarm/index.html';

        await Neo.Main.windowOpen({
            url,
            windowName    : 'AgentSwarm',
            windowFeatures: 'height=600,width=800,left=50,top=50'
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowConnect(data) {
        let {appName, windowId} = data;

        if (appName === 'AgentSwarm') {
            console.log('Swarm window opened');
        } else if (appName === 'AgentOS') {
            console.log('Main window opened');
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowDisconnect(data) {
        let {appName, windowId} = data;

        if (appName === 'AgentSwarm') {
            console.log('Swarm window closed');
        }
        // Close popup windows when closing or reloading the main window
        else if (appName === 'AgentOS') {
            Neo.Main.windowCloseAll({windowId})
        }
    }
}

export default Neo.setupClass(ViewportController);
