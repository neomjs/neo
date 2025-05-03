import FormPageContainer from '../FormPageContainer.mjs';
import HiddenField       from '../../../../src/form/field/Hidden.mjs';
import Label             from '../../../../src/component/Label.mjs';

/**
 * @class Form.view.pages.Page9
 * @extends Form.view.FormPageContainer
 */
class Page9 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page9'
         * @protected
         */
        className: 'Form.view.pages.Page9',
        /**
         * @member {String} formGroup='page9'
         */
        formGroup: 'page9',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            text  : 'Hidden fields will not get mounted. Inspect the DOM.'
        }, {
            module: HiddenField,
            name  : 'field1',
            value : 'foo'
        }, {
            module: HiddenField,
            name  : 'field2',
            value : 'bar'
        }]
    }
}

export default Neo.setupClass(Page9);
