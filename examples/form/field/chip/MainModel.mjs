import Model  from '../../../../src/data/Model.mjs';

/**
 * @class TestApp.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className: 'TestApp.MainModel',
        ntype    : 'main-model',

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