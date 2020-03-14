import CountryStore from './CountryStore.mjs';
import Helix        from '../../../src/component/Helix.mjs';

/**
 * @class Neo.examples.component.coronaHelix.CountryHelix
 * @extends Neo.component.Helix
 */
class CountryHelix extends Helix {
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
     * @param {String} vnodeId
     * @returns {String}
     */
    getItemId(vnodeId) {
        return vnodeId.split('__')[1];
    }
}

Neo.applyClassConfig(CountryHelix);

export {CountryHelix as default};