import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.table.container.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className: 'Neo.examples.table.container.MainModel',

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