import FormContainer from '../../../src/form/Container.mjs';

/**
 * @summary One step of the account form: a nested form, so a step validates and submits on its own or as part of the
 * whole form. It renders a div, since a form tag must not hold another one.
 * @class Form.view.FormPageContainer
 * @extends Neo.form.Container
 */
class FormPageContainer extends FormContainer {
    static config = {
        /**
         * @member {String} className='Form.view.FormPageContainer'
         * @protected
         */
        className: 'Form.view.FormPageContainer',
        /**
         * @member {String[]} cls=['form-page']
         * @reactive
         */
        cls: ['form-page'],
        /**
         * The rows keep their own height instead of sharing the step's
         * @member {Object} itemDefaults={flex:'none'}
         */
        itemDefaults: {
            flex: 'none'
        },
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String} tag='div'
         */
        tag: 'div' // using a div instead of a form tag
    }
}

export default Neo.setupClass(FormPageContainer);
