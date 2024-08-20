import BaseViewport       from '../coronaGallery/MainContainer.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowCoronaGallery.Viewport
 * @extends Neo.examples.component.coronaGallery.MainContainer
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.multiWindowCoronaGallery.Viewport'
         * @protected
         */
        className: 'Neo.examples.component.multiWindowCoronaGallery.Viewport',
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
                text : 'Gallery Controls'
            }, '->', {
                handler: 'onMaximiseButtonClick',
                iconCls: 'far fa-window-maximize'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
