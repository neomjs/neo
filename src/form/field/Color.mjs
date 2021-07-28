import ColorList from '../../list/Color.mjs'
import Select    from './Select.mjs';

/**
 * @class Neo.form.field.Color
 * @extends Neo.form.field.Select
 */
class Color extends Select {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Color'
         * @protected
         */
        className: 'Neo.form.field.Color',
        /**
         * @member {String} ntype='colorfield'
         * @protected
         */
        ntype: 'colorfield',
        /**
         * @member {Object|null} listConfig={module:ColorList}
         */
        listConfig: {
            module: ColorList
        }
    }}
}

Neo.applyClassConfig(Color);

export {Color as default};
