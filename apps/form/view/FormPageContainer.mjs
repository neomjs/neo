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
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            style: {maxWidth: '300px'}
        },
        /**
         * @member {Object} layout={ntype:'vbox'}
         */
        layout: {ntype: 'vbox'},
        /**
         * @member {Object} style={overflow:'auto'}
         */
        style: {overflow: 'auto'},
        /**
         * @member {Object} _vdom
         */
        vdom:
        {cn: []} // using a div instead of a form tag
    }
}

export default Neo.setupClass(FormPageContainer);
