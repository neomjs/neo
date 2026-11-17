import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @summary Generates the same fictional directory on every load, with visibly unequal country runs.
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

    /**
     * @summary Creates the fixed 100-row directory; country counts must fit the 10-by-10 name table.
     * @param {Object} config Store configuration.
     */
    construct(config) {
        super.construct(config);

        const
            data        = [],
            departments = [
                {name: 'Engineering', roles: ['Backend engineer', 'Frontend engineer', 'QA engineer']},
                {name: 'Operations', roles: ['Operations analyst', 'Office coordinator', 'People partner']},
                {name: 'Sales', roles: ['Account manager', 'Sales associate', 'Sales analyst']}
            ],
            countries = [
                ['Canada', 4], ['Denmark', 7], ['Finland', 10], ['France', 9], ['Germany', 12],
                ['Ireland', 8], ['Netherlands', 15], ['Spain', 11], ['Sweden', 13], ['United Kingdom', 11]
            ],
            firstNames = ['Alex', 'Sam', 'Robin', 'Jamie', 'Morgan', 'Taylor', 'Casey', 'Jordan', 'Avery', 'Riley'],
            lastNames  = ['Bennett', 'Chen', 'Diaz', 'Evans', 'Fischer', 'Gupta', 'Hansen', 'Ito', 'Khan', 'Laurent'];

        for (const [country, count] of countries) {
            for (let i = 0; i < count; i++) {
                const index    = data.length,
                    department = departments[Math.min(2, Math.floor(i * 3 / count))];

                data.push({
                    id        : index + 1,
                    name      : `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length)]}`,
                    department: department.name,
                    country,
                    role      : department.roles[i % department.roles.length]
                })
            }
        }

        this.data = data
    }
}

export default Neo.setupClass(MainStore);
