import Model from '../../../src/data/Model.mjs';

/**
 * @summary One fictional order received from the simulated server.
 * @class Neo.examples.grid.serverSide.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.grid.serverSide.MainModel',
        fields   : [
            {name: 'id', type: 'Integer'},
            {name: 'customer', type: 'String'},
            {name: 'country', type: 'String'},
            {name: 'amount', type: 'Integer'}
        ]
    }
}

export default Neo.setupClass(MainModel);
