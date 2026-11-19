import Model from '../../../src/data/Model.mjs';

/**
 * @summary A permission key the backend can grant, with the app it unlocks.
 * @class WebDesktop.model.Permission
 * @extends Neo.data.Model
 */
class Permission extends Model {
    static config = {
        /**
         * @member {String} className='WebDesktop.model.Permission'
         * @protected
         */
        className: 'WebDesktop.model.Permission',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'color',
            type: 'String'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Permission);
