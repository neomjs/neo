import CountryStore from './CountryStore.mjs';
import Gallery      from '../../../src/component/Gallery.mjs';

/**
 * @class Neo.examples.component.coronaGallery.CountryGallery
 * @extends Neo.component.Gallery
 */
class CountryGallery extends Gallery {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.CountryGallery'
         * @private
         */
        className: 'Neo.examples.component.coronaGallery.CountryGallery',
        /**
         * @member {String[]} cls=['rw2-article-gallery', 'neo-gallery', 'page', 'view']
         */
        cls: ['rw2-article-gallery', 'neo-gallery', 'page', 'view'],
        /**
         * The image height of the gallery
         * @member {Number} imageHeight=240
         */
        imageHeight: 240,
        /**
         * The image width of the gallery
         * @member {Number} imageWidth=320
         */
        imageWidth: 320,
        /**
         * @member {Object} itemTpl_
         */
        itemTpl: {
            cls     : ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            tabIndex: '-1',
            cn: [{
                tag  : 'div',
                cls  : ['neo-country-gallery-item'],
                style: {},

                cn: [{
                    cls: ['neo-item-header']
                }, {
                    tag: 'table',
                    cn : [{
                        tag: 'tr',
                        cn : [
                            {tag: 'td', html: 'Cases'},
                            {tag: 'td'}
                        ]
                    }, {
                        tag: 'tr',
                        cn : [
                            {tag: 'td', html: 'Deaths'},
                            {tag: 'td'}
                        ]
                    }, {
                        tag: 'tr',
                        cn : [
                            {tag: 'td', html: 'Recovered'},
                            {tag: 'td'}
                        ]
                    }]
                }]
            }]
        },
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
    }}

    /**
     * Override this method to get different item-markups
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me         = this,
            firstChild = vdomItem.cn[0];

        vdomItem.id = me.getItemVnodeId(record[me.keyProperty]);

        firstChild.style.height = me.imageHeight + 'px';
        firstChild.style.width  = me.imageWidth  + 'px';

        firstChild.cn[0].html = record.country;

        firstChild.cn[1].cn[0].cn[1].html = record.cases;
        firstChild.cn[1].cn[1].cn[1].html = record.deaths;
        firstChild.cn[1].cn[2].cn[1].html = record.recovered;

        return vdomItem;
    }
}

Neo.applyClassConfig(CountryGallery);

export {CountryGallery as default};