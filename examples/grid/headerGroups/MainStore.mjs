import Model, {months} from './MainModel.mjs';
import Store           from '../../../src/data/Store.mjs';

const regions = ['Alpine', 'Baltic', 'Celtic', 'Danube', 'Eifel', 'Fjord', 'Gironde', 'Highlands', 'Iberia', 'Jura',
                 'Karst', 'Lombardy', 'Moselle', 'Nordic', 'Oder', 'Provence', 'Quarnero', 'Rhine', 'Saxony', 'Tyrol'];

/**
 * @summary Twenty regions with deterministic monthly figures, so tests can rely on fixed values.
 * @class Neo.examples.grid.headerGroups.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.headerGroups.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.headerGroups.MainStore',
        /**
         * @member {Object[]} data
         */
        data: regions.map((region, index) => {
            let record = {id: index + 1, region, total: 0};

            months.forEach((month, monthIndex) => {
                record[month]  = 100 + (index * 37 + monthIndex * 53) % 400;
                record.total  += record[month]
            });

            return record
        }),
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model
    }
}

export default Neo.setupClass(MainStore);
