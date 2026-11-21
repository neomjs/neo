import BaseViewport       from '../coronaGallery/Viewport.mjs';
import ThemeSwitcher      from '../../../src/button/ThemeSwitcher.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowCoronaGallery.Viewport
 * @extends Neo.examples.component.coronaGallery.Viewport
 * @summary Multi-window 3D country gallery viewport with detachable controls panel.
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
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            reference: 'header-toolbar',

            items: [{
                ntype: 'label',
                cls  : ['neo-panel-header-text', 'neo-label'],
                text : 'Gallery Controls'
            }, '->', {
                module  : ThemeSwitcher,
                showText: false
            }, {
                handler  : 'onMaximiseButtonClick',
                iconCls  : 'far fa-window-maximize',
                reference: 'maximise-button'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
