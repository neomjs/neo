import Model  from '../../../../src/data/Model.mjs';

/**
 * @class Neo.examples.form.field.chip.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className  : 'Neo.examples.form.field.chip.MainModel',
        keyProperty: 'abbreviation',

        fields: [{
            name: 'abbreviation',
            type: 'string'
        }, {
            name: 'name',
            type: 'string'
        }]
    }
}

Neo.setupClass(MainModel);

export default MainModel;
