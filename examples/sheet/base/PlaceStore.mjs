import PlaceModel from './PlaceModel.mjs';
import Store      from '../../../src/data/Store.mjs';

const places = [
    ['Tidewater Coffee',        'Café',       90], ['Anchor & Crumb',          'Bakery',    140],
    ['The Lantern Bookshop',    'Bookshop',  210], ["Harbour Master's House",  'Museum',    260],
    ['Quayside Gardens',        'Park',      340], ['Fish Market Hall',        'Market',    410],
    ['Saltwater Roasters',      'Café',      450], ['Mill Lane Bakehouse',     'Bakery',    520],
    ['Chart & Compass Books',   'Bookshop',  600], ['Lighthouse Gallery',      'Museum',    640],
    ['Willow Green',            'Park',      730], ['Pier Street Market',      'Market',    790],
    ['The Rope Walk',           'Café',      860], ['Driftwood Bakery',        'Bakery',    950],
    ['Second Tide Books',       'Bookshop', 1020], ['Shipwright Museum',       'Museum',   1100],
    ['Old Dock Park',           'Park',     1180], ['Night Ferry Market',      'Market',   1250],
    ["Gull's Rest",             'Café',     1340], ['Breakwater Bread',        'Bakery',   1420],
    ['Ink & Oar',               'Bookshop', 1500], ['Customs House Museum',    'Museum',   1610],
    ['Seawall Meadow',          'Park',     1700], ["Net Loft Makers' Market", 'Market',   1780],
    ['Beacon Espresso',         'Café',     1870], ['Copper Kettle Bakery',    'Bakery',   1960],
    ['Tideline Comics',         'Bookshop', 2050], ['Lifeboat Station Museum', 'Museum',   2140],
    ['Cliff Path Viewpoint',    'Park',     2260], ['Harbour Night Market',    'Market',   2380]
];

/**
 * Thirty places along a harbour walk, nearest first: enough to scroll the sheet at every snap point.
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
         * @member {Object[]} data
         */
        data: places.map(([name, category, distance], index) => ({category, distance, id: index + 1, name})),
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
