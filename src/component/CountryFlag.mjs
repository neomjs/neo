import Component    from './Base.mjs';
import CountryFlags from '../util/CountryFlags.mjs';

/**
 * @class Neo.component.CountryFlag
 * @extends Neo.component.Base
 */
class CountryFlag extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.CountryFlag'
         * @protected
         */
        className: 'Neo.component.CountryFlag',
        /**
         * @member {String[]} baseCls=['neo-country-flag']
         */
        baseCls: ['neo-country-flag'],
        /**
         * @member {String|null} countryCode_=null
         */
        countryCode_: null,
        /**
         * @member {String|null} location_=null
         */
        location_: null,
        /**
         * @member {Boolean} resolveCountryCode_=false
         */
        resolveCountryCode_: false,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'img', cls: ['neo-country-flag']},
            {tag: 'span', cls: ['neo-location-text']}
        ]}
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetCountryCode(value, oldValue) {
        this.updateFlag()
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetLocation(value, oldValue) {
        let me = this;

        me.vdom.cn[1].text = value || '';

        if (me.resolveCountryCode) {
            me.updateFlag()
        } else {
            me.update()
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetResolveCountryCode(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateFlag()
        }
    }

    /**
     *
     */
    updateFlag() {
        let me              = this,
            {countryCode, location, resolveCountryCode, vdom} = me,
            flag            = vdom.cn[0],
            url;

        if (countryCode) {
            url = CountryFlags.getFlagUrl(countryCode)
        } else if (resolveCountryCode && location) {
            url = CountryFlags.getFlagUrl(location)
        }

        // Performance Optimization:
        // We maintain a persistent <img> tag in the VDOM structure to ensure a stable DOM.
        // Swapping tags (e.g. img <-> span) or removing nodes triggers layout thrashing
        // during rapid recycling (e.g. Grid scrolling).
        // We toggle visibility instead of structural changes.
        if (url) {
            flag.src   = url;
            flag.style = null; // Remove visibility: hidden
            flag.title = location || countryCode;
        } else {
            delete flag.src;
            delete flag.title;
            flag.style = {visibility: 'hidden'};
        }

        me.update()
    }
}

export default Neo.setupClass(CountryFlag);
