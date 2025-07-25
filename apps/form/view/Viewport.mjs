import BaseViewport          from '../../../src/container/Viewport.mjs';
import FormContainer         from './FormContainer.mjs';
import SideNavList           from './SideNavList.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @class Form.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Form.view.Viewport'
         * @protected
         */
        className: 'Form.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            style: {margin: '0 1em'},
            width: '300',

            items: [{
                flex: 'none',
                vdom: {tag: 'h1', html: 'Nested Forms'}
            }, {
                module   : SideNavList,
                reference: 'side-nav',

                bind: {
                    headerlessSelectedIndex: data => data.activeIndex,
                    store                  : 'stores.sideNav'
                }
            }]
        }, {
            module   : FormContainer,
            reference: 'main-form',
            style    : {margin: '20px'}
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         * @reactive
         */
        stateProvider: ViewportStateProvider
    }
}

export default Neo.setupClass(Viewport);
