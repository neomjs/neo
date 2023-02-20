import BaseFormContainer       from '../../../src/form/Container.mjs';
import Container               from '../../../src/container/Base.mjs';
import FormContainerController from './FormContainerController.mjs';
import Label                   from '../../../src/component/Label.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';

/**
 * @class Form.view.FormContainer
 * @extends Neo.form.Container
 */
class FormContainer extends BaseFormContainer {
    static config = {
        /**
         * @member {String} className='Form.view.FormContainer'
         * @protected
         */
        className: 'Form.view.FormContainer',
        /**
         * @member {String[]} baseCls=['form-form-container','neo-container'],
         * @protected
         */
        baseCls: ['form-form-container', 'neo-container'],
        /**
         * @member {Neo.controller.Component} controller=FormContainerController
         */
        controller: FormContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            bind  : {text: data => data.activeTitle},
            cls   : ['form-header'],
            flex  : 'none'
        }, {
            module   : Container,
            reference: 'pages-container',

            layout: {
                ntype: 'card',
                bind : {activeIndex: data => data.activeIndex}
            },

            items: [{
                module: () => import('./pages/Page1.mjs')
            }, {
                module: () => import('./pages/Page2.mjs')
            }, {
                module: () => import('./pages/Page3.mjs')
            }, {
                module: () => import('./pages/Page4.mjs')
            }, {
                module: () => import('./pages/Page5.mjs')
            }, {
                module: () => import('./pages/Page6.mjs')
            }, {
                module: () => import('./pages/Page7.mjs')
            }, {
                module: () => import('./pages/Page8.mjs')
            }, {
                module: () => import('./pages/Page9.mjs')
            }, {
                module: () => import('./pages/Page10.mjs')
            }]
        }, {
            module: Toolbar,
            cls   : ['form-footer'],
            flex  : 'none',

            items: ['->', {
                bind   : {disabled: data => data.activeIndex === 0},
                handler: 'onPrevPageButtonClick',
                iconCls: 'fas fa-chevron-left',
                text   : 'Back'
            }, {
                bind        : {disabled: data => data.activeIndex === data.maxIndex},
                handler     : 'onNextPageButtonClick',
                iconCls     : 'fas fa-chevron-right',
                iconPosition: 'right',
                style       : {marginLeft: '1em'},
                text        : 'Next page'
            }]
        }]
    }
}

Neo.applyClassConfig(FormContainer);

export default FormContainer;
