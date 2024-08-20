import CountryStore from './CountryStore.mjs';
import Gallery      from '../../../src/component/Gallery.mjs';

/**
 * @class Neo.examples.component.coronaGallery.CountryGallery
 * @extends Neo.component.Gallery
 */
class CountryGallery extends Gallery {
    /**
     * A regex to replace blank chars
     * @member {RegExp} flagRegEx=/ /gi
     * @protected
     * @static
     */
    static flagRegEx = / /gi

    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.CountryGallery'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.CountryGallery',
        /**
         * @member {String[]} cls=['neo-country-gallery']
         */
        cls: ['neo-country-gallery'],
        /**
         * The item height of the gallery
         * @member {Number} itemHeight=240
         */
        itemHeight: 280,
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
        let me    = this,
            cls   = ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            fn    = CountryGallery.formatNumber,
            style = {height: (me.itemHeight - 70) + 'px', width: me.itemWidth  + 'px'};

        return {cls, id: me.getItemVnodeId(record[me.keyProperty]), tabIndex: '-1', cn: [
            {cls: ['neo-item-wrapper'], style: {height: me.itemHeight + 'px'}, cn: [
                {cls: ['neo-country-gallery-item'], style, cn: [
                    {cls: ['neo-item-header'], cn: [
                        {tag: 'img', cls: ['neo-flag'], src: me.getCountryFlagUrl(record.country)},
                        {html: record.country}
                    ]},
                    {tag: 'table', cls: ['neo-content-table'], cn: [
                        {tag: 'tr', cn: [
                            {tag: 'td', html: 'Cases'},
                            {tag: 'td', cls: ['neo-align-right'], html: fn(record.cases)},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', html: 'Cases today'},
                            {tag: 'td', cls: ['neo-align-right'], html: fn(record.todayCases)}
                        ]},
                        {tag: 'tr', cn: [
                            {tag: 'td', html: 'Deaths'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths'], html: fn(record.deaths)},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', html: 'Deaths today'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths'], html: fn(record.todayDeaths)}
                        ]},
                        {tag: 'tr', cn: [
                            {tag: 'td', html: 'Recovered'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-recovered'], html: fn(record.recovered)},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', html: 'Critical'},
                            {tag: 'td', cls: ['neo-align-right', 'neo-content-critical'], html: fn(record.critical)}
                        ]}
                    ]}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Number} value
     * @returns {String}
     */
    static formatNumber(value) {
        return value.toLocaleString()
    }

    /**
     * @param {String} name
     * @returns {String} url
     */
    getCountryFlagUrl(name) {
        const map = {
            'bosnia'                               : 'bosnia-and-herzegovina',
            'cabo-verde'                           : 'cape-verde',
            'car'                                  : 'central-african-republic',
            'caribbean-netherlands'                : 'netherlands',
            'channel-islands'                      : 'jersey',
            'côte-d\'ivoire'                       : 'ivory-coast',
            'congo'                                : 'republic-of-the-congo',
            'congo,-the-democratic-republic-of-the': 'democratic-republic-of-congo',
            'curaçao'                              : 'curacao',
            'czechia'                              : 'czech-republic',
            'diamond-princess'                     : 'japan', // cruise ship
            'drc'                                  : 'democratic-republic-of-congo',
            'el-salvador'                          : 'salvador',
            'eswatini'                             : 'swaziland',
            'faeroe-islands'                       : 'faroe-islands',
            'falkland-islands-(malvinas)'          : 'falkland-islands',
            'french-guiana'                        : 'france', // ?
            'guadeloupe'                           : 'france', // ?
            'holy-see-(vatican-city-state)'        : 'vatican-city',
            'iran,-islamic-republic-of'            : 'iran',
            'lao-people\'s-democratic-republic'    : 'laos',
            'libyan-arab-jamahiriya'               : 'libya',
            'macedonia'                            : 'republic-of-macedonia',
            'marshall-islands'                     : 'marshall-island',
            'mayotte'                              : 'france', // ?
            'moldova,-republic-of'                 : 'moldova',
            'ms-zaandam'                           : 'netherlands', // cruise ship
            'new-caledonia'                        : 'france',
            'palestinian-territory,-occupied'      : 'palestine',
            'poland'                               : 'republic-of-poland',
            'réunion'                              : 'france',
            's.-korea'                             : 'south-korea',
            'st.-barth'                            : 'st-barts',
            'saint-helena'                         : 'united-kingdom', // sorry, icon not included
            'saint-lucia'                          : 'st-lucia',
            'saint-martin'                         : 'sint-maarten',
            'saint-pierre-miquelon'                : 'france',
            'saint-vincent-and-the-grenadines'     : 'st-vincent-and-the-grenadines',
            'syrian-arab-republic'                 : 'syria',
            'tanzania,-united-republic-of'         : 'tanzania',
            'timor-leste'                          : 'east-timor',
            'turks-and-caicos-islands'             : 'turks-and-caicos',
            'u.s.-virgin-islands'                  : 'virgin-islands',
            'uae'                                  : 'united-arab-emirates',
            'uk'                                   : 'united-kingdom',
            'usa'                                  : 'united-states-of-america',
            'uzbekistan'                           : 'uzbekistn',
            'venezuela,-bolivarian-republic-of'    : 'venezuela',
            'viet-nam'                             : 'vietnam',
            'wallis-and-futuna'                    : 'france'
        };

        let imageName = name.toLowerCase().replace(CountryGallery.flagRegEx, '-');

        imageName = map[imageName] || imageName;

        return `https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/flaticon/country_flags/png/${imageName}.png`
    }

    /**
     * @param {String} vnodeId
     * @returns {String} itemId
     */
    getItemId(vnodeId) {
        return vnodeId.split('__')[1]
    }

    /**
     * @param {Array} items
     */
    onStoreLoad(items) {
        super.onStoreLoad(items);

        let me = this;

        me.timeout(Neo.config.environment === 'development' ? 200 : 500).then(() => {
            me.selectOnMount = true;
            me.afterSetMounted(true, false)
        })
    }
}

export default Neo.setupClass(CountryGallery);
