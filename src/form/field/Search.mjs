import Text from './Text.mjs';

/**
 * @class Neo.form.field.Search
 * @extends Neo.form.field.Text
 */
class Search extends Text {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Search'
         * @protected
         */
        className: 'Neo.form.field.Search',
        /**
         * @member {String} ntype='searchfield'
         * @protected
         */
        ntype: 'searchfield',
        /**
         * @member {String[]} baseCls=['neo-searchfield','neo-textfield']
         */
        baseCls: ['neo-searchfield', 'neo-textfield'],
        /**
         * Value for the hideLabel_ textfield config
         * @member {Boolean} hideLabel=true
         */
        hideLabel: true,
        /**
         * Value for the placeholderText_ textfield config
         * @member {String} placeholderText='Search'
         */
        placeholderText: 'Search'
    }
}

export default Neo.setupClass(Search);
