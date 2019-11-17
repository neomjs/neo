import Model  from '../../../src/data/Model.mjs';

/**
 * @class TestApp.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className: 'TestApp.MainModel',
        ntype    : 'main-model',

        keyProperty: 'githubId',

        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'firstname',
            type: 'String'
        }, {
            name: 'githubId',
            type: 'String'
        }, {
            name: 'lastname',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(MainModel);

export {MainModel as default};