import Contributor from '../model/Contributor.mjs';
import Store       from '../../../src/data/Store.mjs';

class Contributors extends Store {
    static config = {
        className: 'DevRank.store.Contributors',
        model    : Contributor,
        keyProperty: 'login',
        autoLoad : true,
        url      : '../../apps/devrank/resources/users.json',
        sorters  : [
            {property: 'total_contributions', direction: 'DESC'}
        ]
    }
}

export default Neo.setupClass(Contributors);
