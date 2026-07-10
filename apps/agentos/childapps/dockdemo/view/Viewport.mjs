import BaseViewport   from '../../../../../src/container/Viewport.mjs';
import DemoAWorkspace from './DemoAWorkspace.mjs';

/**
 * @summary Viewport of the Demo-A dock-choreography childapp: hosts the showcase workspace
 * full-bleed. All behavior lives in {@link AgentOS.childapps.dockdemo.view.DemoAWorkspace};
 * this class only mounts it into the window.
 * @class AgentOS.childapps.dockdemo.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.Viewport'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.Viewport',
        /**
         * @member {String[]} cls=['agentos-dockdemo-viewport']
         */
        cls: ['agentos-dockdemo-viewport'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: DemoAWorkspace,
            flex  : 1
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(Viewport);
