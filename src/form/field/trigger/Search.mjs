import Picker from './Picker.mjs';

/**
 * @class Neo.form.field.trigger.Search
 * @extends Neo.form.field.trigger.Picker
 */
class Search extends Picker {
    static config = {
        /**
         * @member {String} className='Neo.form.field.trigger.Search'
         * @protected
         */
        className: 'Neo.form.field.trigger.Search',
        /**
         * @member {String} ntype='trigger-search'
         * @protected
         */
        ntype: 'trigger-search',
        /**
         * @member {String|null} iconCls='fas fa-magnifying-glass'
         */
        iconCls: 'fas fa-magnifying-glass'
    }
}

export default Neo.setupClass(Search);
