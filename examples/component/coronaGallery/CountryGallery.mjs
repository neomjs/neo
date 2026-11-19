import CountryFlags from '../../../src/util/CountryFlags.mjs';
import CountryStore from './CountryStore.mjs';
import Gallery      from '../../../src/component/Gallery.mjs';

/**
 * @summary A gallery of the World Bank's economies: each item shows a flag, the country and six indicators.
 * @class Neo.examples.component.coronaGallery.CountryGallery
 * @extends Neo.component.Gallery
 */
class CountryGallery extends Gallery {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.CountryGallery'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.CountryGallery',
        /**
         * @member {String[]} cls=['neo-country-gallery']
         * @reactive
         */
        cls: ['neo-country-gallery'],
        /**
         * The item height of the gallery
         * @member {Number} itemHeight=280
         */
        itemHeight: 280,
        /**
         * The item width of the gallery
         * @member {Number} itemWidth=340
         */
        itemWidth: 340,
        /**
         * The unique record field containing the id.
         * @member {String} keyProperty='country'
         */
        keyProperty: 'country',
        /**
         * True to select the item inside the middle of the store items on mount
         * @member {Boolean} selectOnMount=false
         */
        selectOnMount: false,
        /**
         * @member {Neo.data.Store} store=CountryStore
         * @reactive
         */
        store: CountryStore
    }

    /**
     * Override this method to get different item-markups
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me     = this,
            cls    = ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            fmt    = CountryGallery.format,
            growth = record.populationGrowth,
            style  = {height: (me.itemHeight - 70) + 'px', width: me.itemWidth + 'px'},
            row    = (leftLabel, left, rightLabel, right, rightCls=[]) => ({tag: 'tr', cn: [
                {tag: 'td', html: leftLabel},
                {tag: 'td', cls: ['neo-align-right'], html: left},
                {tag: 'td', style: {width: '100%'}},
                {tag: 'td', html: rightLabel},
                {tag: 'td', cls: ['neo-align-right', ...rightCls], html: right}
            ]});

        return {cls, id: me.getItemVnodeId(me.getRecordId(record)), tabIndex: '-1', cn: [
            {cls: ['neo-item-wrapper'], style: {height: me.itemHeight + 'px'}, cn: [
                {cls: ['neo-country-gallery-item'], style, cn: [
                    {cls: ['neo-item-header'], cn: [
                        {tag: 'img', alt: '', cls: ['neo-flag'], src: CountryFlags.getFlagUrl(record.flag)},
                        {text: record.country}
                    ]},
                    {tag: 'table', cls: ['neo-content-table'], cn: [
                        row('People', fmt(record.population, CountryGallery.compact),
                            'Growth', fmt(growth, v => `${v > 0 ? '+' : ''}${v.toFixed(2)} %`),
                            growth > 0 ? ['neo-content-up'] : growth < 0 ? ['neo-content-down'] : []),
                        row('GDP', fmt(record.gdp, v => '$' + CountryGallery.compact(v)),
                            'Per head', fmt(record.gdpPerCapita, v => `$${v.toLocaleString()}`)),
                        row('Life', fmt(record.lifeExpectancy, v => `${v.toFixed(1)} yrs`),
                            'Online', fmt(record.internet, v => `${v} %`))
                    ]}
                ]}
            ]}
        ]}
    }

    /**
     * 1463865525 => '1.46B', so a population or a GDP fits the item beside its neighbour
     * @param {Number} value
     * @returns {String}
     */
    static compact(value) {
        return new Intl.NumberFormat('en', {maximumFractionDigits: 2, notation: 'compact'}).format(value)
    }

    /**
     * A figure the World Bank does not report shows a dash
     * @param {Number|null} value
     * @param {Function} [fn=v => v.toLocaleString()]
     * @returns {String}
     */
    static format(value, fn=v => v.toLocaleString()) {
        return value === null || value === undefined ? '–' : fn(value)
    }
}

export default Neo.setupClass(CountryGallery);
