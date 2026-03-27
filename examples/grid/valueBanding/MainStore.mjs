import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.valueBanding.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.grid.valueBanding.MainStore',
        keyProperty: 'id',
        model      : Model,

        sorters: [{
            direction: 'ASC',
            property : 'country'
        }, {
            direction: 'ASC',
            property : 'department'
        }]
    }

    construct(config) {
        super.construct(config);

        const
            data        = [],
            departments = ['Engineering', 'Sales', 'Marketing', 'HR'],
            countries   = ['Germany', 'USA', 'UK', 'France'],
            roles       = ['Manager', 'Developer', 'Designer', 'Analyst'];

        for (let i = 0; i < 100; i++) {
            data.push({
                id        : i + 1,
                firstname : `First_${i}`,
                lastname  : `Last_${i}`,
                department: departments[i % departments.length],
                country   : countries[Math.floor(i / 10) % countries.length],
                role      : roles[Math.floor(i / 5) % roles.length]
            })
        }

        this.data = data
    }
}

export default Neo.setupClass(MainStore);
