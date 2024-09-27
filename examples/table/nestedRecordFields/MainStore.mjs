import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.table.container.MainStore',
        keyProperty: 'githubId',
        model      : Model,

        data: [{
            country : 'Germany',
            githubId: 'tobiu',

            user: {
                firstname: 'Tobias',
                lastname : 'Uhlig'
            }
        }, {
            annotations: {
                selected: true
            },

            country : 'USA',
            githubId: 'rwaters',

            user: {
                firstname: 'Rich',
                lastname : 'Waters'
            }
        }, {
            country : 'Germany',
            githubId: 'mrsunshine',

            user: {
                firstname: 'Nils',
                lastname : 'Dehl'
            }
        }, {
            country : 'USA',
            githubId: 'camtnbikerrwc',

            user: {
                firstname: 'Gerard',
                lastname : 'Horan'
            }
        }]
    }
}

export default Neo.setupClass(MainStore);
