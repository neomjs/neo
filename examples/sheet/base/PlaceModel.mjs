import Model from '../../../src/data/Model.mjs';

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
         * `label` is the row text: the name, then what the place is and how far it is.
         * @member {Object[]} fields
         */
        fields: [
            {name: 'category', type: 'String'},
            {name: 'distance', type: 'Integer'},
            {name: 'id',       type: 'Integer'},
            {name: 'label',    type: 'String', calculate: data => `${data.name} · ${data.category} · ${data.distance} m`},
            {name: 'name',     type: 'String'}
        ]
    }
}

export default Neo.setupClass(PlaceModel);
