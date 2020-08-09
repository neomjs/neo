import Model  from '../../src/data/Model.mjs';

/**
 * @class TableFiltering.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static getConfig() {return {
        className: 'TableFiltering.MainModel',
        ntype    : 'main-model',

        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'firstname',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'isOnline',
            type: 'Boolean'
        }, {
            name: 'lastname',
            type: 'String'
        }, {
            name: 'specialDate',
            type: 'Date'
        }]
    }}
}

Neo.applyClassConfig(MainModel);

export {MainModel as default};