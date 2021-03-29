import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.list.base.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        className  : 'Neo.examples.list.base.MainStore',
        keyProperty: 'githubId',
        model      : MainModel,

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
        }],

        sorters: [{
            property : 'firstname',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};