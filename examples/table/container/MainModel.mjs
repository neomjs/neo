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

export default MainModel;
