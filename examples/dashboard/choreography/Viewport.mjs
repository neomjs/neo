import BaseViewport   from '../../../src/container/Viewport.mjs';
import DemoAWorkspace from './DemoAWorkspace.mjs';

/**
 * @summary Viewport of the dock-choreography example.
 *
 * It exists for the DOM shape, not for logic. `DemoAWorkspace.scss` establishes the flex context,
 * sizing and stage geometry on `.agentos-dockdemo-viewport`; mounting the workspace as the app's
 * mainView directly leaves that class on no element, so the stage collapses and the tour's own
 * controls stop being clickable. The wrapper is what the stylesheet addresses.
 *
 * @class Neo.examples.dashboard.choreography.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.choreography.Viewport'
         * @protected
         */
        className: 'Neo.examples.dashboard.choreography.Viewport',
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
