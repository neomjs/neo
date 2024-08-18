import Model from '../../src/data/Model.mjs';

/**
 * @class Neo.examples.tableFiltering.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.tableFiltering.MainModel',

        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'firstname',
            type: 'String'
        }, {
            name: 'id',
            type: 'Int'
        }, {
            name: 'isOnline',
            type: 'Boolean'
        }, {
            name: 'lastname',
            type: 'String'
        }, {
            name: 'luckyNumber',
            type: 'Int'
        }, {
            name: 'specialDate',
            type: 'Date'
        }]
    }
}

export default Neo.setupClass(MainModel);
