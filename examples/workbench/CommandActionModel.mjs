import Model from '../../src/data/Model.mjs';

/**
 * @summary Schema for one consumer-supplied action in {@link Neo.examples.workbench.CommandPalette}.
 *
 * Each consumer owns its action descriptors, contextual availability, and execution callbacks. Storing
 * actions in a `Neo.data.Store` of `CommandActionModel` records keeps filtering, Neural Link store
 * inspection, and keyboard selection aligned with standard Neo data primitives.
 *
 * @class Neo.examples.workbench.CommandActionModel
 * @extends Neo.data.Model
 */
class CommandActionModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.workbench.CommandActionModel'
         * @protected
         */
        className: 'Neo.examples.workbench.CommandActionModel',
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

export default Neo.setupClass(CommandActionModel);
