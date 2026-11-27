import PlaceModel from './PlaceModel.mjs';
import Store      from '../../../src/data/Store.mjs';

const
    categories = ['Café', 'Bakery', 'Bookshop', 'Museum', 'Park', 'Market'],
    names      = ['Harbour', 'Lantern', 'Old Mill', 'Quayside', 'Saltwater', 'Willow'];

/**
 * Thirty places by distance, enough to scroll the sheet at every snap point.
 * @class Neo.examples.sheet.base.PlaceStore
 * @extends Neo.data.Store
 */
class PlaceStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.sheet.base.PlaceStore'
         * @protected
         */
        className: 'Neo.examples.sheet.base.PlaceStore',
        /**
         * Each place pairs a name with a category, 60 m further away than the one before
         * @member {Object[]} data
         */
        data: Array.from({length: 30}, (item, index) => ({
            category: categories[index % categories.length],
            distance: 80 + index * 60,
            id      : index + 1,
            name    : `${names[index % names.length]} ${categories[index % categories.length]}`
        })),
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=PlaceModel
         */
        model: PlaceModel
    }
}

export default Neo.setupClass(PlaceStore);
