import CountryStore from '../../store/Countries.mjs';
import Gallery      from '../../../../src/component/Gallery.mjs';
import Util         from '../../Util.mjs';

/**
 * @class Covid.view.country.Gallery
 * @extends Neo.component.Gallery
 */
class CountryGallery extends Gallery {
    static config = {
        /**
         * @member {String} className='Covid.view.country.Gallery'
         * @protected
         */
        className: 'Covid.view.country.Gallery',
        /**
         * @member {String[]} baseCls=['covid-country-gallery','neo-gallery','page','view']
         */
        baseCls: ['covid-country-gallery', 'neo-gallery', 'page', 'view'],
        /**
         * @member {Object} bind
         */
        bind: {
            country: {twoWay: true, value: data => data.country}
        },
        /**
         * @member {String|null} country_=null
         * @reactive
         */
        country_: null,
        /**
         * The item height of the gallery
         * @member {Number} itemHeight=240
         */
        itemHeight: 280,
        /**
         * @member {Object} itemTpl_
         * @reactive
         */
        itemTpl:
        {cls: ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'], tabIndex: '-1', cn: [
            {cls: ['neo-item-wrapper'], style: {}, cn: [
                {cls: ['neo-country-gallery-item'], style: {}, cn: [
                    {cls: ['neo-item-header'], cn: [
                        {tag: 'img', cls: ['neo-flag']},
                        {}
                    ]},
                    {tag: 'table', cls: ['neo-content-table'], cn: [
                        {tag: 'tr', cn: [
                            {tag: 'td', text: 'Cases'},
                            {tag: 'td', cls: ['neo-align-right']},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', text: 'Cases today'},
                            {tag: 'td', cls: ['neo-align-right']}
                        ]},
                        {tag: 'tr', cn: [
                            {tag: 'td', text: 'Deaths'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths']},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', text: 'Deaths today'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths']}
                        ]},
                        {tag: 'tr', cn: [
                            {tag: 'td', text: 'Recovered'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-recovered']},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', text: 'Critical'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-critical']}
                        ]}
                    ]}
                ]}
            ]}
        ]},
        /**
         * The item width of the gallery
         * @member {Number} itemWidth=320
         */
        itemWidth: 340,
        /**
         * The unique record field containing the id.
         * @member {String} keyProperty='id'
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
     * Triggered after the country config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCountry(value, oldValue) {
        if (oldValue !== undefined) {
            let selectionModel = this.selectionModel;

            if (value && !selectionModel.isSelected(value)) {
                selectionModel.select(value, false);
            }
        }
    }

    /**
     * Override this method to get different item-markups
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me         = this,
            firstChild = vdomItem.cn[0].cn[0],
            fN         = Util.formatNumber,
            table      = firstChild.cn[1];

        vdomItem.id = me.getItemVnodeId(record[me.keyProperty]);

        vdomItem.cn[0].style.height = me.itemHeight + 'px';

        firstChild.style.height = (me.itemHeight - 70) + 'px';
        firstChild.style.width  = me.itemWidth  + 'px';

        firstChild.cn[0].cn[0].src  = Util.getCountryFlagUrl(record.country);
        firstChild.cn[0].cn[1].text = record.country;

        table.cn[0].cn[1].text = fN({value: record.cases});
        table.cn[1].cn[1].text = fN({value: record.deaths});
        table.cn[2].cn[1].text = fN({value: record.recovered});

        table.cn[0].cn[4].text = fN({value: record.todayCases});
        table.cn[1].cn[4].text = fN({value: record.todayDeaths});
        table.cn[2].cn[4].text = fN({value: record.critical});

        return vdomItem;
    }

    /**
     * @param {String} vnodeId
     * @returns {String} itemId
     */
    getItemId(vnodeId) {
        return vnodeId.split('__')[1];
    }

    /**
     * Gets triggered from selection.Model: select()
     * @param {String[]} items
     */
    onSelect(items) {
        this.country = items[0] || null;
    }

    /**
     * @param {Array} items
     */
    onStoreLoad(items) {
        super.onStoreLoad(items);

        let me = this;

        me.timeout(400).then(() => {
            me.selectOnMount = true;
            me.afterSetMounted(true, false)
        })
    }
}

export default Neo.setupClass(CountryGallery);
