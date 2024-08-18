import Model from '../../../../src/data/Model.mjs';

/**
 * @class Neo.examples.form.field.combobox.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className  : 'Neo.examples.form.field.combobox.MainModel',
        keyProperty: 'abbreviation',

        fields: [{
            name: 'abbreviation',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
