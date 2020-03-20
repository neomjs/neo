import CountryStore from './CountryStore.mjs';
import Helix        from '../../../src/component/Helix.mjs';

/**
 * @class Neo.examples.component.coronaHelix.CountryHelix
 * @extends Neo.component.Helix
 */
class CountryHelix extends Helix {
    static getStaticConfig() {return {
        /**
         * A regex to replace blank chars
         * @member {RegExp} flagRegEx=/ /gi
         * @private
         * @static
         */
        flagRegEx: / /gi
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.coronaHelix.CountryHelix'
         * @private
         */
        className: 'Neo.examples.component.coronaHelix.CountryHelix',
        /**
         * @member {String[]} cls=['neo-country-helix', 'neo-helix']
         */
        cls: ['neo-country-helix', 'neo-helix'],
        /**
         * @member {Object} itemTpl_
         */
        itemTpl: {
            cls     : ['surface', 'neo-helix-item'],
            style   : {},
            tabIndex: '-1',
            cn: [{
                cls  : ['neo-item-wrapper'],
                style: {},
                cn: [{
                    tag  : 'div',
                    cls  : ['neo-country-helix-item'],
                    style: {},

                    cn: [{
                        cls: ['neo-item-header'],
                        cn: [{
                            tag: 'img',
                            cls: ['neo-flag']
                        }, {

                        }]
                    }, {
                        tag: 'table',
                        cls: ['neo-content-table'],
                        cn : [{
                            tag: 'tr',
                            cn : [
                                {tag: 'td', html: 'Cases'},
                                {tag: 'td', cls: ['neo-align-right']},
                                {tag: 'td', style: {width: '100%'}},
                                {tag: 'td', html: 'Cases today'},
                                {tag: 'td', cls: ['neo-align-right']}
                            ]
                        }, {
                            tag: 'tr',
                            cn : [
                                {tag: 'td', html: 'Deaths'},
                                {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths']},
                                {tag: 'td', style: {width: '100%'}},
                                {tag: 'td', html: 'Deaths today'},
                                {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths']}
                            ]
                        }, {
                            tag: 'tr',
                            cn : [
                                {tag: 'td', html: 'Recovered'},
                                {tag: 'td', cls: ['neo-align-right', 'neo-content-recovered']},
                                {tag: 'td', style: {width: '100%'}},
                                {tag: 'td', html: 'Critical'},
                                {tag: 'td', cls: ['neo-align-right', 'neo-content-critical']}
                            ]
                        }]
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
         * The radius of the Helix in px
         * @member {Number} radius=2500
         */
        radius: 2500,
        /**
         * True displays the first & last name record fields below an expanded item
         * @member {Boolean} showCloneInfo=false
         */
        showCloneInfo: false,
        /**
         * @member {Neo.data.Store} store=CountryStore
         */
        store: CountryStore
    }}

    /**
     *
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me         = this,
            firstChild = vdomItem.cn[0].cn[0],
            table      = firstChild.cn[1];

        vdomItem.id = me.getItemVnodeId(record[me.keyProperty]);

        firstChild.cn[0].cn[0].src  = me.getCountryFlagUrl(record.country);
        firstChild.cn[0].cn[1].html = record.country;

        table.cn[0].cn[1].html = record.cases;
        table.cn[1].cn[1].html = record.deaths;
        table.cn[2].cn[1].html = record.recovered;

        table.cn[0].cn[4].html = record.todayCases;
        table.cn[1].cn[4].html = record.todayDeaths;
        table.cn[2].cn[4].html = record.critical;

        return vdomItem;
    }

    /**
     *
     * @param {String} name
     * @return {String} url
     */
    getCountryFlagUrl(name) {
        const map = {
            'cabo-verde'            : 'cape-verde',
            'car'                   : 'central-african-republic',
            'channel-islands'       : 'jersey',
            'congo'                 : 'democratic-republic-of-congo',
            'curaçao'               : 'curacao',
            'czechia'               : 'czech-republic',
            'diamond-princess'      : 'japan', // cruise ship?
            'drc'                   : 'democratic-republic-of-congo',
            'el-salvador'           : 'salvador',
            'eswatini'              : 'swaziland',
            'faeroe-islands'        : 'faroe-islands',
            'french-guiana'         : 'france', // ?
            'guadeloupe'            : 'france', // ?
            'mayotte'               : 'france', // ?
            'new-caledonia'         : 'france',
            'north-macedonia'       : 'republic-of-macedonia',
            'poland'                : 'republic-of-poland',
            'réunion'               : 'france',
            'saint-lucia'           : 'st-lucia',
            's.-korea'              : 'south-korea',
            'st.-barth'             : 'st-barts',
            'saint-martin'          : 'sint-maarten',
            'st.-vincent-grenadines': 'st-vincent-and-the-grenadines',
            'u.s.-virgin-islands'   : 'virgin-islands',
            'uae'                   : 'united-arab-emirates',
            'uk'                    : 'united-kingdom',
            'usa'                   : 'united-states-of-america',
            'uzbekistan'            : 'uzbekistn'
        };

        let imageName = name.toLowerCase().replace(CountryHelix.flagRegEx, '-');

        imageName = map[imageName] || imageName;

        return 'https://raw.githubusercontent.com/neomjs/pages/master/resources/images/flaticon/country_flags/png/' + imageName + '.png'
    }

    /**
     *
     * @param {String} vnodeId
     * @returns {String}
     */
    getItemId(vnodeId) {
        return vnodeId.split('__')[1];
    }
}

Neo.applyClassConfig(CountryHelix);

export {CountryHelix as default};