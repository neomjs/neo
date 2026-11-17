import Model, {months} from './MainModel.mjs';
import Store           from '../../../src/data/Store.mjs';

const
    products = ['Aurora Desk', 'Birch Shelf', 'Cedar Stool', 'Delta Lamp', 'Ember Rug', 'Fjord Sofa', 'Grove Table',
                'Harbor Chair', 'Iris Vase', 'Juniper Bed', 'Kestrel Desk', 'Linden Bench', 'Maple Cart', 'Nimbus Pouf',
                'Onyx Mirror', 'Pine Rack'],
    regions  = [{name: 'Americas', share: 1}, {name: 'Europe', share: .8}, {name: 'Asia', share: .65}, {name: 'Africa', share: .35}];

/**
 * @summary A three-year plan: 16 products in 4 regions, 64 rows of planned units per month.
 *
 * The units follow a formula instead of a random draw: a product's base volume, its region's share, a season that peaks
 * in early summer and 6 % growth a year. So every load shows the same plan, and so do the cover and the specs.
 * @class Neo.examples.grid.pinnedColumns.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.pinnedColumns.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.pinnedColumns.MainStore',
        /**
         * @member {Object[]} data
         */
        data: products.flatMap((product, productIndex) => regions.map(({name, share}, regionIndex) => {
            let base   = 120 + (productIndex * 37) % 180,
                record = {id: productIndex * regions.length + regionIndex + 1, product, region: name, total: 0};

            months.forEach(({field}, index) => {
                let season = 1 + .2 * Math.sin((index % 12 - 2) / 6 * Math.PI),
                    growth = 1 + .06 * Math.floor(index / 12);

                record[field]  = Math.round(base * share * season * growth) + (productIndex * 7 + regionIndex * 13 + index * 5) % 9 - 4;
                record.total  += record[field]
            });

            return record
        })),
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
