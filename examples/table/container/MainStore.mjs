import Store from '../../../src/data/Store.mjs';
import Model from './MainModel.mjs';

/**
 * @class Neo.examples.table.container.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.table.container.MainStore',
        keyProperty: 'githubId',
        model      : Model,

        data: [{
            country  : 'Germany',
            firstname: 'Tobias',
            githubId : 'tobiu',
            lastname : 'Uhlig'
        }, {
            country  : 'USA',
            firstname: 'Rich',
            githubId : 'rwaters',
            lastname : 'Waters'
        }, {
            country  : 'Germany',
            firstname: 'Nils',
            githubId : 'mrsunshine',
            lastname : 'Dehl'
        }, {
            country  : 'USA',
            firstname: 'Gerard',
            githubId : 'camtnbikerrwc',
            lastname : 'Horan'
        }, {
            country  : 'Slovakia',
            firstname: 'Jozef',
            githubId : 'jsakalos',
            lastname : 'Sakalos'
        }, {
            country  : 'Germany',
            firstname: 'Bastian',
            githubId : 'bhaustein',
            lastname : 'Haustein'
        }, {
            colspan  : {firstname: 3},
            country  : 'Germany',
            firstname: 'Colspan 3',
            githubId : 'random'
        }]
    }
}

Neo.applyClassConfig(MainStore);

export default MainStore;
