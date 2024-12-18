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
            randomNumber: 100
        }, {
            country     : 'US',
            firstname   : 'Rich',
            githubId    : 'rwaters',
            randomNumber: 90
        }, {
            country     : 'DE',
            firstname   : 'Nils',
            githubId    : 'mrsunshine',
            randomNumber: 70
        }, {
            country     : 'US',
            firstname   : 'Gerard',
            githubId    : 'camtnbikerrwc',
            randomNumber: 80
        }, {
            country     : 'SK',
            firstname   : 'Jozef',
            githubId    : 'jsakalos',
            randomNumber: 60
        }, {
            country     : 'DE',
            firstname   : 'Bastian',
            githubId    : 'bhaustein',
            randomNumber: 50
        }]
    }
}

export default Neo.setupClass(MainStore);
