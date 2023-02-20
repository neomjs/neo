import BaseFormContainer from '../../../src/form/Container.mjs';
import Container         from '../../../src/container/Base.mjs';
import Label             from '../../../src/component/Label.mjs';
import Toolbar           from '../../../src/toolbar/Base.mjs';

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

            items: [

            ]
        }, {
            module: Toolbar,
            flex  : 'none',

            items: ['->', {
                bind   : {disabled: data => data.activeIndex === 0},
                iconCls: 'fas fa-chevron-left',
                text   : 'Back'
            }, {
                bind        : {disabled: data => data.activeIndex === data.maxIndex},
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
