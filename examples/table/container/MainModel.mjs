import Model  from '../../../src/data/Model.mjs';

/**
 * @class TestApp.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className: 'TestApp.MainModel',
        ntype    : 'main-model',

        fields: [{
            name: 'country',
            type: 'string'
        }, {
            name: 'firstname',
            type: 'string'
        }, {
            name: 'githubId',
            type: 'string'
        }, {
            name: 'lastname',
            type: 'string'
        }]
    }}
}

Neo.applyClassConfig(MainModel);

export {MainModel as default};