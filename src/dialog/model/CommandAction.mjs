import Model from '../../data/Model.mjs';

/**
 * @summary Record schema for a command entry in {@link Neo.dialog.CommandPalette}.
 *
 * Only `label` and `handler` (plus a stable `id`, defaulted from `label` when omitted) are required
 * for minimal consumers. Optional metadata (`group`, `description`, `shortcut`, `iconCls`, `keywords`,
 * `available`, `unavailableReason`, `managesFocus`) enriches filtering, accessibility announcements,
 * and post-execution focus handback without coupling the dialog to application state.
 *
 * @class Neo.dialog.model.CommandAction
 * @extends Neo.data.Model
 */
class CommandAction extends Model {
    static config = {
        /**
         * @member {String} className='Neo.dialog.model.CommandAction'
         * @protected
         */
        className: 'Neo.dialog.model.CommandAction',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            defaultValue: true,
            name        : 'available',
            type        : 'Boolean'
        }, {
            defaultValue: '',
            name        : 'description',
            type        : 'String'
        }, {
            defaultValue: '',
            name        : 'group',
            type        : 'String'
        }, {
            defaultValue: null,
            name        : 'handler',
            type        : 'auto'
        }, {
            defaultValue: '',
            name        : 'iconCls',
            type        : 'String'
        }, {
            defaultValue: [],
            name        : 'keywords',
            type        : 'Array'
        }, {
            defaultValue: '',
            name        : 'label',
            type        : 'String'
        }, {
            defaultValue: false,
            name        : 'managesFocus',
            type        : 'Boolean'
        }, {
            defaultValue: '',
            name        : 'shortcut',
            type        : 'String'
        }, {
            defaultValue: '',
            name        : 'unavailableReason',
            type        : 'String'
        }]
    }
}

export default Neo.setupClass(CommandAction);
