import FormContainer from '../../../src/form/Container.mjs';

/**
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
         * @member {Object} _vdom
         */
        _vdom:
        {cn: []} // using a div  instead of a form tag
    }
}

Neo.applyClassConfig(FormPageContainer);

export default FormPageContainer;
