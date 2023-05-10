import FormPageContainer from '../FormPageContainer.mjs';
import SelectField       from '../../../../src/form/field/Select.mjs';
import ZipCodeField      from '../../../../src/form/field/ZipCode.mjs';

/**
 * @class Form.view.pages.Page11
 * @extends Form.view.FormPageContainer
 */
class Page11 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page11'
         * @protected
         */
        className: 'Form.view.pages.Page11',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            itemDefaults: {
                flex : 1,
                style: {maxWidth: '300px'}
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            layout: {ntype: 'hbox'},

            items : [{
                module        : SelectField,
                editable      : false,
                forceSelection: true,
                labelText     : 'Country',
                name          : 'page11.countryfield1',
                reference     : 'country',
                value         : 'DE',

                store: {
                    data: [
                        {id: 'DE',     name: 'Germany'},
                        {id: 'Others', name: 'Others'}
                    ]
                }
            }, {
                module      : ZipCodeField,
                countryField: 'country',
                labelText   : 'Munich',
                name        : 'page11.zipcodefield1',
                required    : true,
                style       : {marginLeft: '10px', maxWidth: '300px'},
                value       : '80796'
            }]
        }, {
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module   : ZipCodeField,
                labelText: 'Munich',
                name     : 'page11.zipcodefield2',
                required : true,
                value    : '80796'
            }, {
                module        : SelectField,
                editable      : false,
                forceSelection: true,
                labelText     : 'Country',
                name          : 'page11.countryfield2',
                reference     : 'country',
                style         : {marginLeft: '10px', maxWidth: '300px'},
                value         : 'DE',
                zipCodeField  : 'page11.zipcodefield2',

                store: {
                    data: [
                        {id: 'DE',     name: 'Germany'},
                        {id: 'Others', name: 'Others'}
                    ]
                }
            }]
        }]
    }
}

Neo.applyClassConfig(Page11);

export default Page11;
