import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.nestedRecordFields.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.grid.nestedRecordFields.MainStore',
        keyProperty: 'githubId',
        model      : Model,

        data: [{
            country : 'DE',
            githubId: 'tobiu',

            user: {
                firstname: 'Tobias',
                lastname : 'Uhlig'
            }
        }, {
            annotations: {
                selected: true
            },

            country : 'US',
            githubId: 'rwaters',

            user: {
                firstname: 'Rich',
                lastname : 'Waters'
            }
        }, {
            country : 'DE',
            githubId: 'mrsunshine',

            user: {
                firstname: 'Nils',
                lastname : 'Dehl'
            }
        }, {
            country : 'US',
            githubId: 'camtnbikerrwc',

            user: {
                firstname: 'Gerard',
                lastname : 'Horan'
            }
        }]
    }
}

export default Neo.setupClass(MainStore);
