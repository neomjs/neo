import BaseViewport       from '../helix/Viewport.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.Viewport
 * @extends Neo.examples.component.helix.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowHelix.Viewport'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowHelix.Viewport',
        /**
         * @member {String[]} cls=['multi-window-helix-viewport']
         */
        cls: ['multi-window-helix-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.getItem('controls-panel').headers = [{
            dock     : 'top',
            reference: 'header-toolbar',

            items: [{
                ntype: 'label',
                cls  : ['neo-panel-header-text', 'neo-label'],
                text : 'Helix Controls'
            }, '->', {
                handler: 'onMaximiseButtonClick',
                iconCls: 'far fa-window-maximize'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
