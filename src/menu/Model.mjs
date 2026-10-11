import BaseModel from '../../src/data/Model.mjs';

/**
 * @class Neo.menu.Model
 * @extends Neo.data.Model
 */
class Model extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.menu.Model'
         * @protected
         */
        className: 'Neo.menu.Model',
        /**
         * @member {String} keyProperty='id'
         * @reactive
         */
        keyProperty: 'id',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'cls',
            type: 'Array'
        }, {
            /**
             * Declaring this field is the entire fix: the behaviour already exists one class up and was
             * simply unreachable from a menu. `Neo.list.Base` reads it via `disabledField`, `createItem`
             * pushes `neo-disabled`, and both the click delegate and the arrow-key navigator exclude that
             * class. A record may only carry fields its model declares, so before this existed
             * `disabled: true` was accepted by the object literal and dropped before it reached the row —
             * leaving an entry that looked and behaved enabled.
             */
            name: 'disabled',
            type: 'Boolean'
        }, {
            name: 'handler',
            type: 'Function'
        }, {
            name: 'hidden',
            type: 'Boolean'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id' // untyped: menus key by strings (`file-open`); a typed conversion would rewrite the key
        }, {
            name: 'items', // optional
            type: 'Array'
        }, {
            name: 'route',
            type: 'String'
        }, {
            /**
             * Marks the record as a rule between groups rather than a command: no text, no icon, not
             * focusable, not selectable, and never the target of a click or an arrow key.
             *
             * It is deliberately not expressed through `isHeader`, which `Neo.list.Base` already owns:
             * a header is a labelled `dt` that names the group below it, while a separator carries no
             * text at all. They are two members of the same non-interactive family, not one concept.
             */
            name: 'separator',
            type: 'Boolean'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Model);
