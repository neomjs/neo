import CountryFlags from '../util/CountryFlags.mjs';
import List         from './Base.mjs';

/**
 * @class Neo.list.Country
 * @extends Neo.list.Base
 */
class Country extends List {
    static config = {
        /**
         * @member {String} className='Neo.list.Country'
         * @protected
         */
        className: 'Neo.list.Country',
        /**
         * @member {String} ntype='countrylist'
         * @protected
         */
        ntype: 'countrylist',
        /**
         * @member {String[]} baseCls=['neo-country-list','neo-list']
         */
        baseCls: ['neo-country-list', 'neo-list']
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me         = this,
            itemText   = record[me.displayField],
            filter     = me.highlightFilterValue ? me.store.getFilter(me.displayField) : null,
            flagUrl    = CountryFlags.getFlagUrl(record[me.displayField] || record.code),
            flagNode   = null;

        if (flagUrl) {
            flagNode = {
                tag: 'img',
                cls: ['neo-country-flag'],
                src: flagUrl
            }
        }

        if (filter && filter.value !== null && filter.value !== '') {
            itemText = itemText.replace(new RegExp(filter.value, 'gi'), function(match) {
                return '<span class="neo-highlight-search">' + match + '</span>'
            })
        }

        return [
            flagNode,
            {tag: 'span', cls: ['neo-country-text'], html: itemText}
        ]
    }
}

export default Neo.setupClass(Country);
