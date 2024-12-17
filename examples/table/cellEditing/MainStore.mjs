import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.table.cellEditing.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.table.cellEditing.MainStore',
        keyProperty: 'githubId',
        model      : Model,

        data: [{
            country  : 'DE',
            firstname: 'Tobias',
            githubId : 'tobiu',
            lastname : 'Uhlig'
        }, {
            country  : 'US',
            firstname: 'Rich',
            githubId : 'rwaters',
            lastname : 'Waters'
        }, {
            country  : 'DE',
            firstname: 'Nils',
            githubId : 'mrsunshine',
            lastname : 'Dehl'
        }, {
            country  : 'US',
            firstname: 'Gerard',
            githubId : 'camtnbikerrwc',
            lastname : 'Horan'
        }, {
            country  : 'SK',
            firstname: 'Jozef',
            githubId : 'jsakalos',
            lastname : 'Sakalos'
        }, {
            country  : 'DE',
            firstname: 'Bastian',
            githubId : 'bhaustein',
            lastname : 'Haustein'
        }]
    }
}

export default Neo.setupClass(MainStore);
