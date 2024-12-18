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
            country     : 'DE',
            firstname   : 'Tobias',
            githubId    : 'tobiu',
            randomDate  : '2024-12-20',
            randomNumber: 100
        }, {
            country     : 'US',
            firstname   : 'Rich',
            githubId    : 'rwaters',
            randomDate  : '2024-12-18',
            randomNumber: 90
        }, {
            country     : 'DE',
            firstname   : 'Nils',
            githubId    : 'mrsunshine',
            randomDate  : '2024-12-19',
            randomNumber: 70
        }, {
            country     : 'US',
            firstname   : 'Gerard',
            githubId    : 'camtnbikerrwc',
            randomDate  : '2024-12-17',
            randomNumber: 80
        }, {
            country     : 'SK',
            firstname   : 'Jozef',
            githubId    : 'jsakalos',
            randomDate  : '2024-12-16',
            randomNumber: 60
        }, {
            country     : 'DE',
            firstname   : 'Bastian',
            githubId    : 'bhaustein',
            randomDate  : '2024-12-15',
            randomNumber: 50
        }]
    }
}

export default Neo.setupClass(MainStore);
