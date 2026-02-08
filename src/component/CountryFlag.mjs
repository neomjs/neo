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
         * @member {String|null} location_=null
         */
        location_: null,
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
    afterSetLocation(value, oldValue) {
        let me = this;

        if (value) {
            let url  = CountryFlags.getFlagUrl(value),
                vdom = me.vdom,
                [flag, text] = vdom.cn;

            // Performance Optimization:
            // We maintain a persistent <img> tag in the VDOM structure to ensure a stable DOM.
            // Swapping tags (e.g. img <-> span) or removing nodes triggers layout thrashing
            // during rapid recycling (e.g. Grid scrolling).
            // We toggle visibility instead of structural changes.
            if (url) {
                flag.src   = url;
                flag.style = null; // Remove visibility: hidden
                flag.title = value;
            } else {
                delete flag.src;
                delete flag.title;
                flag.style = {visibility: 'hidden'};
            }

            text.text = value || '';

            me.update()
        }
    }
}

export default Neo.setupClass(CountryFlag);
