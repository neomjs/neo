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
        let imageName = name.toLowerCase();

        imageName = imageName.replace(CountryHelix.flagRegEx, '-');

        switch(imageName) {
            case 'channel-islands':
                imageName = 'jersey';
                break;
            case 'curaçao':
                imageName = 'curacao';
                break;
            case 'czechia':
                imageName = 'czech-republic';
                break;
            case 'diamond-princess':
                imageName = 'japan'; // cruise ship?
                break;
            case 'drc':
                imageName = 'democratic-republic-of-congo';
                break;
            case 'eswatini':
                imageName = 'swaziland';
                break;
            case 'faeroe-islands':
                imageName = 'faroe-islands';
                break;
            case 'french-guiana':
                imageName = 'france'; // ?
                break;
            case 'guadeloupe':
                imageName = 'france'; // ?
                break;
            case 'mayotte':
                imageName = 'france'; // ?
                break;
            case 'north-macedonia':
                imageName = 'republic-of-macedonia';
                break;
            case 'poland':
                imageName = 'republic-of-poland';
                break;
            case 'réunion':
                imageName = 'france';
                break;
            case 'saint-lucia':
                imageName = 'st-lucia';
                break;
            case 's.-korea':
                imageName = 'south-korea';
                break;
            case 'st.-barth':
                imageName = 'st-barts';
                break;
            case 'saint-martin':
                imageName = 'sint-maarten';
                break;
            case 'st.-vincent-grenadines':
                imageName = 'st-vincent-and-the-grenadines';
                break;
            case 'u.s.-virgin-islands':
                imageName = 'virgin-islands';
                break;
            case 'uae':
                imageName = 'united-arab-emirates';
                break;
            case 'uk':
                imageName = 'united-kingdom';
                break;
            case 'usa':
                imageName = 'united-states-of-america';
                break;
        }

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