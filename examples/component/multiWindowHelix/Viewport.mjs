import MainContainer      from '../helix/MainContainer.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.Viewport
 * @extends Neo.examples.component.helix.MainContainer
 */
class Viewport extends MainContainer {
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
        }];
    }
}

Neo.setupClass(Viewport);

export default Viewport;
