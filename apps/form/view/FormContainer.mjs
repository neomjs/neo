import BaseFormContainer from '../../../src/form/Container.mjs';
import Container         from '../../../src/container/Base.mjs';
import Label             from '../../../src/component/Label.mjs';
import Toolbar           from '../../../src/toolbar/Base.mjs';

/**
 * @summary The account form: one nested form per step inside a card layout, which loads each step's module the first
 * time it opens. Back, Next and Create account sit below, a phone's Steps button in the header; the viewport's
 * controller handles them, and every edit.
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
            module: Toolbar,
            cls   : ['form-header'],
            flex  : 'none',
            items : [{
                module: Label,
                bind  : {text: data => `Step ${data.activeIndex + 1} of ${data.maxIndex + 1}`},
                cls   : ['form-header-step'],
                flex  : 'none'
            }, {
                module: Label,
                bind  : {text: data => data.activeTitle},
                cls   : ['form-header-label'],
                flex  : 'none'
            }, '->', {
                bind   : {pressed: data => data.stepsOpen},
                cls    : ['form-steps-button'],
                handler: 'onStepsButtonClick',
                iconCls: 'fas fa-list-ol',
                text   : 'Steps'
            }]
        }, {
            module   : Container,
            cls      : ['form-pages'],
            flex     : 1,
            reference: 'pages-container',
            layout   : {
                ntype: 'card',
                bind : {activeIndex: data => data.activeIndex}
            },
            items: [
                {module: () => import('./pages/AboutYouPage.mjs')},
                {module: () => import('./pages/AddressPage.mjs')},
                {module: () => import('./pages/TeamPage.mjs')},
                {module: () => import('./pages/PreferencesPage.mjs')},
                {module: () => import('./pages/ReviewPage.mjs'), reference: 'review'}
            ]
        }, {
            module: Toolbar,
            cls   : ['form-footer'],
            flex  : 'none',
            items : [{
                bind   : {disabled: data => data.activeIndex === 0},
                handler: 'onBackButtonClick',
                iconCls: 'fas fa-chevron-left',
                text   : 'Back'
            }, {
                module: Label,
                bind  : {text: data => data.stepMessage},
                cls   : ['form-step-message']
            }, '->', {
                bind        : {hidden: data => data.activeIndex === data.maxIndex},
                handler     : 'onNextButtonClick',
                iconCls     : 'fas fa-chevron-right',
                iconPosition: 'right',
                text        : 'Next'
            }, {
                bind   : {hidden: data => data.activeIndex !== data.maxIndex},
                handler: 'onCreateAccountButtonClick',
                iconCls: 'fas fa-check',
                text   : 'Create account'
            }]
        }],
        /**
         * An edit clears what the last check marked
         * @member {Object} listeners={fieldUserChange:'onFieldUserChange'}
         */
        listeners: {fieldUserChange: 'onFieldUserChange'}
    }
}

export default Neo.setupClass(FormContainer);
