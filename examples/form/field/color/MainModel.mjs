import Model  from '../../../../src/data/Model.mjs';

/**
 * @class Neo.examples.form.field.color.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className  : 'Neo.examples.form.field.color.MainModel',
        keyProperty: 'abbreviation',

        fields: [{
            name: 'abbreviation',
            type: 'string'
        }, {
            name: 'name',
            type: 'string'
        }]
    }}
}

Neo.applyClassConfig(MainModel);

export {MainModel as default};
