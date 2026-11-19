import BaseViewport          from '../../../src/container/Viewport.mjs';
import FormContainer         from './FormContainer.mjs';
import SideNavList           from './SideNavList.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @summary The account form: its steps in a list beside the form. Below 600px the list folds away, the form's header
 * names the step, and its Steps button unfolds the list above the form.
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
         * @member {String[]} cls=['form-viewport']
         * @reactive
         */
        cls: ['form-viewport'],
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
            bind : {cls: data => data.stepsOpen ? ['form-step-nav', 'form-step-nav-open'] : ['form-step-nav']},
            cls  : ['form-step-nav'],
            flex : 'none',
            items: [{
                ntype: 'component',
                cls  : ['form-step-nav-title'],
                flex : 'none',
                tag  : 'h1',
                text : 'Open a team account'
            }, {
                ntype: 'component',
                cls  : ['form-step-nav-text'],
                flex : 'none',
                tag  : 'p',
                text : 'Next checks the step you are on, and Create account checks every step.'
            }, {
                module   : SideNavList,
                reference: 'side-nav',
                bind     : {
                    headerlessSelectedIndex: data => data.activeIndex,
                    store                  : 'stores.sideNav'
                }
            }]
        }, {
            module   : FormContainer,
            flex     : 1,
            reference: 'main-form'
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
