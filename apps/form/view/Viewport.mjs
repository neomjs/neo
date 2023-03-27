import BaseViewport       from '../../../src/container/Viewport.mjs';
import FormContainer      from './FormContainer.mjs';
import SideNavList        from './SideNavList.mjs';
import ViewportController from './ViewportController.mjs';
import ViewportModel      from './ViewportModel.mjs';

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
                vdom: {tag: 'h1', innerHTML: 'Nested Forms'}
            }, {
                module   : SideNavList,
                reference: 'side-nav',

                bind: {
                    headerlessActiveIndex: data => data.activeIndex,
                    store                : 'stores.sideNav'
                }
            }]
        }, {
            module   : FormContainer,
            reference: 'main-form',
            style    : {margin: '20px'}
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Neo.model.Component} model=ViewportModel
         */
        model: ViewportModel
    }
}

Neo.applyClassConfig(Viewport);

export default Viewport;
