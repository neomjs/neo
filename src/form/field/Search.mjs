import Text from './Text.mjs';

/**
 * @class Neo.form.field.Search
 * @extends Neo.form.field.Text
 */
class Search extends Text {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Search'
         * @private
         */
        className: 'Neo.form.field.Search',
        /**
         * @member {String} ntype='searchfield'
         * @private
         */
        ntype: 'searchfield',
        /**
         * @member {Array} cls=['neo-searchfield', 'neo-textfield']
         */
        cls: ['neo-searchfield', 'neo-textfield'],
        /**
         * Value for the hideLabel_ textfield config
         * @member {Boolean} hideLabel=true
         */
        hideLabel: true,
        /**
         * Value for the placeholderText_ textfield config
         * @member {String} placeholderText='Search'
         */
        placeholderText: 'Search',
    }}
}

Neo.applyClassConfig(Search);

export {Search as default};