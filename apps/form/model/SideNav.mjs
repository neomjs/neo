import Model from '../../../src/data/Model.mjs';

/**
 * @class Form.model.SideNav
 * @extends Neo.data.Model
 */
class SideNav extends Model {
    static config = {
        /**
         * @member {String} className='Form.model.SideNav'
         * @protected
         */
        className: 'Form.model.SideNav',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'cardIndex',
            type: 'Integer'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name: 'isHeader',
            type: 'Boolean'
        }, {
            name: 'isValid',
            type: 'Boolean'
        }, {
            name: 'name',
            type: 'String'
        }]
    }
}

Neo.applyClassConfig(SideNav);

export default SideNav;
