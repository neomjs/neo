import CountryFlags   from '../../../src/util/CountryFlags.mjs';
import CountryGallery from '../coronaGallery/CountryGallery.mjs';
import CountryStore   from '../coronaGallery/CountryStore.mjs';
import Helix          from '../../../src/component/Helix.mjs';

/**
 * @summary The World Bank's economies on a helix, each item a flag, the country and six indicators. It shares the
 * country gallery's store and number formats.
 * @class Neo.examples.component.coronaHelix.CountryHelix
 * @extends Neo.component.Helix
 */
class CountryHelix extends Helix {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaHelix.CountryHelix'
         * @protected
         */
        className: 'Neo.examples.component.coronaHelix.CountryHelix',
        /**
         * @member {String[]} baseCls=['neo-country-helix','neo-helix']
         */
        baseCls: ['neo-country-helix', 'neo-helix'],
        /**
         * The vertical delta between each helix item (increasing this value will create a spiral)
         * @member {Number} deltaY=1.2
         * @reactive
         */
        deltaY: 1.2,
        /**
         * @member {Object} itemTpl_
         * @reactive
         */
        itemTpl:
        {cls: ['surface', 'neo-helix-item'], style: {}, tabIndex: '-1', cn: [
            {cls: ['neo-item-wrapper'], style: {}, cn: [
                {cls: ['neo-country-helix-item'], style: {}, cn: [
                    {cls: ['neo-item-header'], cn: [
                        {tag: 'img', alt: '', cls: ['neo-flag']},
                        {}
                    ]},
                    {tag: 'table', cls: ['neo-content-table'], cn: [
                        {tag: 'tr', cn: [
                            {tag: 'td', html: 'People'},
                            {tag: 'td', cls: ['neo-align-right']},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', html: 'Growth'},
                            {tag: 'td', cls: ['neo-align-right']}
                        ]},
                        {tag: 'tr', cn: [
                            {tag: 'td', html: 'GDP'},
                            {tag: 'td', cls: ['neo-align-right']},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', html: 'Per head'},
                            {tag: 'td', cls: ['neo-align-right']}
                        ]},
                        {tag: 'tr', cn: [
                            {tag: 'td', html: 'Life'},
                            {tag: 'td', cls: ['neo-align-right']},
                            {tag: 'td', style: {width: '100%'}},
                            {tag: 'td', html: 'Online'},
                            {tag: 'td', cls: ['neo-align-right']}
                        ]}
                    ]}
                ]}
            ]}
        ]},
        /**
         * The unique record field containing the id.
         * @member {String} keyProperty='country'
         */
        keyProperty: 'country',
        /**
         * The radius of the Helix in px
         * @member {Number} radius=2500
         * @reactive
         */
        radius: 2500,
        /**
         * The rotationAngle of the Helix in degrees
         * @member {Number} rotationAngle=720
         * @reactive
         */
        rotationAngle: 720,
        /**
         * True displays the first & last name record fields below an expanded item
         * @member {Boolean} showCloneInfo=false
         */
        showCloneInfo: false,
        /**
         * @member {Neo.data.Store} store=CountryStore
         * @reactive
         */
        store: CountryStore,
        /**
         * The translateX value gets included into each helix item
         * @member {Number} translateY=500
         * @reactive
         */
        translateY: 500,
        /**
         * The translateX value gets included into each helix item
         * @member {Number} translateZ_=-2300
         * @reactive
         */
        translateZ: -2300
    }

    /**
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me                = this,
            {compact, format} = CountryGallery,
            firstChild        = vdomItem.cn[0].cn[0],
            table             = firstChild.cn[1],
            growth            = record.populationGrowth,
            growthCell        = table.cn[0].cn[4];

        vdomItem.id = me.getItemVnodeId(me.store.getKey(record));

        firstChild.cn[0].cn[0].src  = CountryFlags.getFlagUrl(record.flag);
        firstChild.cn[0].cn[1].text = record.country;

        table.cn[0].cn[1].text = format(record.population, compact);
        table.cn[1].cn[1].text = format(record.gdp, v => '$' + compact(v));
        table.cn[2].cn[1].text = format(record.lifeExpectancy, v => `${v.toFixed(1)} yrs`);

        growthCell.text = format(growth, v => `${v > 0 ? '+' : ''}${v.toFixed(2)} %`);
        growthCell.cls  = ['neo-align-right', ...growth > 0 ? ['neo-content-up'] : growth < 0 ? ['neo-content-down'] : []];

        table.cn[1].cn[4].text = format(record.gdpPerCapita, v => `$${v.toLocaleString()}`);
        table.cn[2].cn[4].text = format(record.internet, v => `${v} %`);

        return vdomItem
    }

    /**
     * @returns {String}
     */
    getCloneTransform() {
        let me         = this,
            translateX = (me.offsetWidth  - 2800) / 6,
            translateY = (me.offsetHeight - 2700) / 6,
            translateZ = 100400 + me.perspective / 1.5;

        return 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,'+translateX+','+translateY+','+translateZ+',1)'
    }

    /**
     * @param {String} vnodeId
     * @returns {String}
     */
    getItemId(vnodeId) {
        let itemId = vnodeId.split('__')[1];

        if (this.store.getKeyType()?.includes('int')) {
            itemId = parseInt(itemId)
        }

        return itemId
    }
}

export default Neo.setupClass(CountryHelix);
