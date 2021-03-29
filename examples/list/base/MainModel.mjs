import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.base.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className  : 'Neo.examples.list.base.MainModel',
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