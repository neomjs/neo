import Model from '../../../src/data/Model.mjs';

const icons = {
    Bakery  : 'fa fa-bread-slice',
    Bookshop: 'fa fa-book',
    Café    : 'fa fa-mug-hot',
    Market: 'fa fa-store',
    Museum: 'fa fa-landmark',
    Park  : 'fa fa-tree'
};

/**
 * @class Neo.examples.sheet.base.PlaceModel
 * @extends Neo.data.Model
 */
class PlaceModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.sheet.base.PlaceModel'
         * @protected
         */
        className: 'Neo.examples.sheet.base.PlaceModel',
        /**
         * `distanceText` reads in metres below a kilometre and in kilometres beyond, `iconCls` follows the category.
         * @member {Object[]} fields
         */
        fields: [
            {name: 'category',     type: 'String'},
            {name: 'distance',     type: 'Integer'},
            {name: 'distanceText', type: 'String', calculate: data => data.distance < 1000 ? `${data.distance} m` : `${(data.distance / 1000).toFixed(1)} km`},
            {name: 'iconCls',      type: 'String', calculate: data => icons[data.category]},
            {name: 'id',           type: 'Integer'},
            {name: 'name',         type: 'String'}
        ]
    }
}

export default Neo.setupClass(PlaceModel);
