import CountryField      from '../../../../src/form/field/Country.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
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
                module        : CountryField,
                editable      : false,
                forceSelection: true,
                labelText     : 'Country',
                name          : 'page11.countryfield1',
                reference     : 'country1',
                value         : 'DE',

                store: {
                    data: [
                        {id: 'DE',     name: 'Germany'},
                        {id: 'Others', name: 'Others'}
                    ]
                }
            }, {
                module      : ZipCodeField,
                countryField: 'country1',
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
                reference: 'zipcodefield2',
                required : true,
                value    : '80796'
            }, {
                module        : CountryField,
                editable      : false,
                forceSelection: true,
                labelText     : 'Country',
                name          : 'page11.countryfield2',
                reference     : 'country2',
                style         : {marginLeft: '10px', maxWidth: '300px'},
                value         : 'DE',
                zipCodeField  : 'zipcodefield2',

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

export default Neo.setupClass(Page11);
