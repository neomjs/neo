import BaseViewport       from '../helix/Viewport.mjs';
import ThemeSwitcher      from '../../../src/button/ThemeSwitcher.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.Viewport
 * @extends Neo.examples.component.helix.Viewport
 * @summary Multi-window 3D helix viewport with detachable controls panel.
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
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            reference: 'header-toolbar',

            items: [{
                ntype: 'label',
                cls  : ['neo-panel-header-text', 'neo-label'],
                text : 'Helix Controls'
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
