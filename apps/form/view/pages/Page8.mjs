import FormPageContainer from '../FormPageContainer.mjs';
import NumberField       from '../../../../src/form/field/Number.mjs';

/**
 * @class Form.view.pages.Page8
 * @extends Form.view.FormPageContainer
 */
class Page8 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page8'
         * @protected
         */
        className: 'Form.view.pages.Page8',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : NumberField,
            labelText: 'Page 8 Field 1',
            name     : 'page8field1',
            required : true
        }, {
            module   : NumberField,
            labelText: 'Page 8 Field 2',
            name     : 'page8field2',
            required : true,
            stepSize : 0.01,
            value    : 0.02
        }, {
            module   : NumberField,
            labelText: 'Page 8 Field 3',
            name     : 'page8field3',
            stepSize : 0.01
        }]
    }
}

Neo.applyClassConfig(Page8);

export default Page8;
