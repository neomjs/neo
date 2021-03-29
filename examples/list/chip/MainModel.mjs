import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.chip.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className  : 'Neo.examples.list.chip.MainModel',
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