import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.base.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.list.base.MainStore',
        keyProperty: 'githubId',
        model      : MainModel,

        data: [{
            country  : 'Germany',
            disabled : false,
            firstname: 'Tobias',
            githubId : 'tobiu',
            lastname : 'Uhlig'
        }, {
            country  : 'USA',
            disabled : true,
            firstname: 'Rich',
            githubId : 'rwaters',
            lastname : 'Waters'
        }, {
            country  : 'Germany',
            disabled : false,
            firstname: 'Nils',
            githubId : 'mrsunshine',
            lastname : 'Dehl'
        }, {
            country  : 'USA',
            disabled : false,
            firstname: 'Gerard',
            githubId : 'camtnbikerrwc',
            lastname : 'Horan'
        }, {
            country  : 'Slovakia',
            disabled : false,
            firstname: 'Jozef',
            githubId : 'jsakalos',
            lastname : 'Sakalos'
        }, {
            country  : 'Germany',
            disabled : false,
            firstname: 'Bastian',
            githubId : 'bhaustein',
            lastname : 'Haustein'
        }],

        sorters: [{
            property : 'firstname',
            direction: 'ASC'
        }]
    }
}

Neo.applyClassConfig(MainStore);

export default MainStore;
