import Model               from './MainModel.mjs';
import SimulatedConnection from './SimulatedConnection.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @summary Holds one page; filtering and sorting belong to the example's simulated server.
 * @class Neo.examples.grid.serverSide.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className   : 'Neo.examples.grid.serverSide.MainStore',
        model       : Model,
        pageSize    : 50,
        remoteFilter: true,
        remoteSort  : true,
        sorters     : [{property: 'id', direction: 'ASC'}],
        pipeline    : {connection: {module: SimulatedConnection}}
    }
}

export default Neo.setupClass(MainStore);
